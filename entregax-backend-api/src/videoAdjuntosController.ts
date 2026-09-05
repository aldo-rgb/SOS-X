/**
 * Subida de videos a tickets y tareas.
 *
 * Flujo, y por qué es en tres pasos y no en uno:
 *
 *   1. El cliente pide una URL firmada  → POST /api/uploads/video-url
 *   2. Sube el archivo DIRECTO a S3     → PUT a esa URL (no pasa por la API)
 *   3. Avisa que ya quedó               → POST /api/uploads/video-registrar
 *
 * El paso 2 no pasa por la API a propósito: un video de celular pesa 60-90MB y
 * mandarlo por Railway significa cargarlo entero en memoria y que viaje dos
 * veces (celular → API → S3). Con la URL firmada va directo, y si se corta la
 * señal no se cae nada del lado del servidor.
 *
 * Al registrar, la extracción de cuadros arranca EN SEGUNDO PLANO: quien sube
 * no espera. Los cuadros aparecen solos unos segundos después.
 */

import { Request, Response } from 'express';
import { pool } from './db';
import { getSignedUploadUrl, getSignedUrlForKey, headS3Object } from './s3Service';
import { esVideo, extraerCuadros, MAX_VIDEO_BYTES, MIMES_VIDEO, borrarVideoDeS3 } from './videoAdjuntos';

interface AuthRequest extends Request {
  user?: { userId: number; role: string };
}

const DIAS_RETENCION = 30;

function limpiarNombre(n: string): string {
  return String(n || 'video').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 60) || 'video';
}

/** ¿Esta persona puede adjuntar en este ticket / esta tarea? */
async function puedeAdjuntar(scope: string, refId: number, userId: number, role: string): Promise<boolean> {
  if (['super_admin', 'admin', 'customer_service', 'soporte_tecnico', 'director'].includes(role)) {
    // Personal interno: basta con que exista.
    const t = scope === 'ticket'
      ? await pool.query(`SELECT 1 FROM support_tickets WHERE id = $1`, [refId])
      : await pool.query(`SELECT 1 FROM tasks WHERE id = $1`, [refId]);
    return t.rows.length > 0;
  }
  if (scope === 'ticket') {
    const t = await pool.query(
      `SELECT 1 FROM support_tickets
        WHERE id = $1 AND (user_id = $2 OR assigned_to = $2 OR assigned_agent_id = $2)`,
      [refId, userId]);
    return t.rows.length > 0;
  }
  const t = await pool.query(
    `SELECT 1 FROM tasks WHERE id = $1 AND (created_by = $2 OR assignee_id = $2)`, [refId, userId]);
  return t.rows.length > 0;
}

// ── 1. URL firmada para subir ───────────────────────────────────────────────
export const crearUrlDeSubida = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = Number(req.user?.userId || 0);
    const role = String(req.user?.role || '');
    const { scope, ref_id, file_name, mime, size } = req.body || {};

    if (scope !== 'ticket' && scope !== 'task') { res.status(400).json({ error: 'scope debe ser ticket o task' }); return; }
    const refId = Number(ref_id);
    if (!Number.isFinite(refId) || refId <= 0) { res.status(400).json({ error: 'ref_id inválido' }); return; }

    const nombre = limpiarNombre(String(file_name || ''));
    const tipo = String(mime || '').toLowerCase();
    if (!esVideo(tipo, nombre)) { res.status(400).json({ error: 'Ese archivo no es un video' }); return; }

    const bytes = Number(size || 0);
    if (bytes > MAX_VIDEO_BYTES) {
      res.status(413).json({
        error: `El video pesa ${(bytes / 1024 / 1024).toFixed(0)} MB y el máximo son ${MAX_VIDEO_BYTES / 1024 / 1024} MB. Recórtalo y vuelve a subirlo.`,
      });
      return;
    }
    if (!(await puedeAdjuntar(scope, refId, userId, role))) {
      res.status(403).json({ error: 'No puedes adjuntar en este ' + (scope === 'ticket' ? 'ticket' : 'tarea') });
      return;
    }

    // El contentType queda firmado: con esta URL no se puede subir otra cosa.
    const tipoFirmado = MIMES_VIDEO.includes(tipo) ? tipo : 'video/mp4';
    const key = `videos/${scope}-${refId}/${Date.now()}-${nombre}`;
    const uploadUrl = await getSignedUploadUrl(key, tipoFirmado, 900);
    res.json({ key, uploadUrl, contentType: tipoFirmado, expiraEnSegundos: 900 });
  } catch (e: any) {
    console.error('[video] crearUrlDeSubida:', e);
    res.status(500).json({ error: 'No se pudo preparar la subida' });
  }
};

// ── 2. Registrar el video ya subido ─────────────────────────────────────────
export const registrarVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = Number(req.user?.userId || 0);
    const role = String(req.user?.role || '');
    const { scope, ref_id, key, file_name, mime } = req.body || {};
    const refId = Number(ref_id);

    if (scope !== 'ticket' && scope !== 'task') { res.status(400).json({ error: 'scope inválido' }); return; }
    if (!key || typeof key !== 'string') { res.status(400).json({ error: 'Falta la llave del archivo' }); return; }
    if (!(await puedeAdjuntar(scope, refId, userId, role))) { res.status(403).json({ error: 'Sin permiso' }); return; }

    // Que de verdad esté en S3: si no, alguien está registrando algo que nunca
    // subió y el ticket quedaría con un video roto.
    const info = await headS3Object(key);
    if (!info.exists) { res.status(400).json({ error: 'El video no llegó completo. Vuelve a intentarlo.' }); return; }

    const nombre = limpiarNombre(String(file_name || key.split('/').pop() || 'video.mp4'));
    const ya = await pool.query(`SELECT id FROM video_adjuntos WHERE s3_key = $1`, [key]);
    let registroId: number;
    if (ya.rows.length > 0) {
      registroId = ya.rows[0].id;
    } else {
      const r = await pool.query(
        `INSERT INTO video_adjuntos (scope, ref_id, s3_key, file_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [scope, refId, key, nombre, String(mime || 'video/mp4'), info.size || null, userId]);
      registroId = r.rows[0].id;
    }

    // En una tarea el video es un adjunto más, para que salga en la lista junto
    // a las fotos sin tocar la pantalla.
    if (scope === 'task' && ya.rows.length === 0) {
      await pool.query(
        `INSERT INTO task_attachments (task_id, file_key, file_name, uploaded_by, mime_type, size_bytes, frames_status)
         VALUES ($1,$2,$3,$4,$5,$6,'pendiente')`,
        [refId, key, nombre, userId, String(mime || 'video/mp4'), info.size || null]);
    }

    const url = await getSignedUrlForKey(key, 6 * 3600).catch(() => null);
    // Se responde YA. Los cuadros salen solos en segundo plano.
    res.json({ registro_id: registroId, key, url, file_name: nombre, frames_status: 'pendiente' });

    procesarCuadros(registroId, key, nombre, scope, refId).catch(e =>
      console.error('[video] procesarCuadros:', e?.message));
  } catch (e: any) {
    console.error('[video] registrarVideo:', e);
    if (!res.headersSent) res.status(500).json({ error: 'No se pudo registrar el video' });
  }
};

/** Saca los cuadros y los deja guardados. Corre solo, después de responder. */
async function procesarCuadros(registroId: number, key: string, nombre: string, scope: string, refId: number): Promise<void> {
  const { cuadros, duracion, error } = await extraerCuadros(key, nombre);
  if (cuadros.length === 0) {
    await pool.query(
      `UPDATE video_adjuntos SET frames_status = 'fallo', frames_error = $2, duration_seconds = $3 WHERE id = $1`,
      [registroId, error || 'sin cuadros', duracion]);
    if (scope === 'task') {
      await pool.query(`UPDATE task_attachments SET frames_status = 'fallo', duration_seconds = $2 WHERE file_key = $1`, [key, duracion]);
    }
    return;
  }
  await pool.query(
    `UPDATE video_adjuntos SET frames = $2::jsonb, frames_status = 'listo', duration_seconds = $3 WHERE id = $1`,
    [registroId, JSON.stringify(cuadros.map(c => ({ key: c.key, segundo: c.segundo }))), duracion]);

  if (scope === 'task') {
    const padre = await pool.query(`SELECT id FROM task_attachments WHERE file_key = $1 LIMIT 1`, [key]);
    const padreId = padre.rows[0]?.id || null;
    await pool.query(
      `UPDATE task_attachments SET frames_status = 'listo', duration_seconds = $2 WHERE file_key = $1`, [key, duracion]);
    // Cada cuadro entra como adjunto hijo: así se ve en la tarea como una foto
    // más y así se puede leer, que es el punto de todo esto.
    for (const c of cuadros) {
      await pool.query(
        `INSERT INTO task_attachments (task_id, file_key, file_name, uploaded_by, mime_type, parent_id, frame_second, frames_status)
         VALUES ($1,$2,$3,(SELECT uploaded_by FROM task_attachments WHERE id = $4),'image/jpeg',$4,$5,'n/a')
         ON CONFLICT DO NOTHING`,
        [refId, c.key, c.nombre, padreId, c.segundo]);
    }
  }
}

// ── 3. Consultar un video (duración, cuadros, si ya se depuró) ──────────────
export const infoDeVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const key = String(req.query.key || '');
    if (!key) { res.status(400).json({ error: 'Falta key' }); return; }
    const r = await pool.query(
      `SELECT id, scope, ref_id, file_name, mime_type, size_bytes, duration_seconds,
              frames, frames_status, frames_error, created_at, purged_at
         FROM video_adjuntos WHERE s3_key = $1`, [key]);
    const v = r.rows[0];
    if (!v) { res.status(404).json({ error: 'Video no registrado' }); return; }

    const cuadros = await Promise.all((Array.isArray(v.frames) ? v.frames : []).map(async (f: any) => ({
      segundo: Number(f.segundo) || 0,
      url: await getSignedUrlForKey(f.key, 6 * 3600).catch(() => null),
    })));
    const url = v.purged_at ? null : await getSignedUrlForKey(key, 6 * 3600).catch(() => null);
    const vence = new Date(new Date(v.created_at).getTime() + DIAS_RETENCION * 86400000);

    res.json({
      key, url, purgado: !!v.purged_at,
      file_name: v.file_name, duracion: v.duration_seconds ? Number(v.duration_seconds) : null,
      size_bytes: v.size_bytes ? Number(v.size_bytes) : null,
      cuadros, frames_status: v.frames_status, frames_error: v.frames_error,
      se_borra_el: vence.toISOString(),
      dias_restantes: Math.max(0, Math.ceil((vence.getTime() - Date.now()) / 86400000)),
    });
  } catch (e: any) {
    console.error('[video] infoDeVideo:', e);
    res.status(500).json({ error: 'No se pudo consultar el video' });
  }
};

// ── Listar los videos de un ticket o una tarea ──────────────────────────────
/**
 * El video se cuelga del ticket/la tarea, no de un mensaje suelto. Es más
 * simple y es como la gente lo busca: "el video de ese ticket", no "el video
 * del tercer mensaje".
 */
export const listarVideos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = String(req.query.scope || '');
    const refId = Number(req.query.ref_id || 0);
    if (scope !== 'ticket' && scope !== 'task') { res.status(400).json({ error: 'scope inválido' }); return; }
    if (!Number.isFinite(refId) || refId <= 0) { res.status(400).json({ error: 'ref_id inválido' }); return; }

    const userId = Number(req.user?.userId || 0);
    const role = String(req.user?.role || '');
    if (!(await puedeAdjuntar(scope, refId, userId, role))) { res.status(403).json({ error: 'Sin permiso' }); return; }

    const r = await pool.query(
      `SELECT v.id, v.s3_key, v.file_name, v.size_bytes, v.duration_seconds, v.frames,
              v.frames_status, v.frames_error, v.created_at, v.purged_at,
              u.full_name AS subio
         FROM video_adjuntos v LEFT JOIN users u ON u.id = v.uploaded_by
        WHERE v.scope = $1 AND v.ref_id = $2 ORDER BY v.created_at ASC`, [scope, refId]);

    const videos = await Promise.all(r.rows.map(async (v: any) => {
      const cuadros = await Promise.all((Array.isArray(v.frames) ? v.frames : []).map(async (f: any) => ({
        segundo: Number(f.segundo) || 0,
        url: await getSignedUrlForKey(f.key, 6 * 3600).catch(() => null),
      })));
      const vence = new Date(new Date(v.created_at).getTime() + DIAS_RETENCION * 86400000);
      return {
        id: v.id, key: v.s3_key, file_name: v.file_name,
        url: v.purged_at ? null : await getSignedUrlForKey(v.s3_key, 6 * 3600).catch(() => null),
        purgado: !!v.purged_at,
        size_bytes: v.size_bytes ? Number(v.size_bytes) : null,
        duracion: v.duration_seconds ? Number(v.duration_seconds) : null,
        cuadros, frames_status: v.frames_status, frames_error: v.frames_error,
        subio: v.subio || null, created_at: v.created_at,
        dias_restantes: Math.max(0, Math.ceil((vence.getTime() - Date.now()) / 86400000)),
      };
    }));
    res.json({ videos });
  } catch (e: any) {
    console.error('[video] listarVideos:', e);
    res.status(500).json({ error: 'No se pudieron cargar los videos' });
  }
};

// ── Depuración a los 30 días ────────────────────────────────────────────────
/**
 * Borra de S3 los videos con más de 30 días. NO borra los cuadros ni la fila:
 * un cuadro pesa ~200KB contra los 80MB del video, así que la evidencia
 * legible se queda y lo único que se va es el peso.
 */
export async function purgarVideosVencidos(): Promise<{ borrados: number; liberadoMb: number }> {
  const r = await pool.query(
    `SELECT id, s3_key, size_bytes FROM video_adjuntos
      WHERE purged_at IS NULL AND created_at < NOW() - INTERVAL '${DIAS_RETENCION} days'
      ORDER BY created_at ASC LIMIT 200`);
  let borrados = 0, bytes = 0;
  for (const v of r.rows) {
    const ok = await borrarVideoDeS3(v.s3_key);
    if (!ok) continue;
    await pool.query(`UPDATE video_adjuntos SET purged_at = NOW() WHERE id = $1`, [v.id]);
    await pool.query(`UPDATE task_attachments SET video_purged_at = NOW() WHERE file_key = $1`, [v.s3_key]);
    borrados++; bytes += Number(v.size_bytes || 0);
  }
  if (borrados > 0) {
    console.log(`🧹 [video] depurados ${borrados} videos de más de ${DIAS_RETENCION} días (${(bytes / 1024 / 1024).toFixed(0)} MB liberados). Los cuadros se conservan.`);
  }
  return { borrados, liberadoMb: Math.round(bytes / 1024 / 1024) };
}
