// ============================================================
// Buzón de Cajito — cajito@entregax.app
//
// Todo lo que llegue a esa dirección entra aquí por el webhook de Mailgun, se
// guarda completo (texto, HTML y adjuntos en S3) y queda con estado 'nuevo'.
// Cajito lo consulta con sus herramientas; qué hacer con cada tipo de correo se
// irá definiendo después, por eso aquí NO se decide nada: solo se recibe, se
// guarda y se deja a la mano.
//
// A diferencia de los buzones de marítimo y aéreo, este NO filtra por lista de
// remitentes: si filtrara, Cajito no se enteraría de lo que le escriben y la
// idea es justamente que reciba todo. Lo que sí hace es marcar como
// 'sospechoso' lo que Mailgun no pudo verificar, para que se lea con cuidado.
// ============================================================
import { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { pool } from './db';
import { uploadToS3, signS3UrlIfNeeded } from './s3Service';

const SIGNING_KEY = () => (process.env.MAILGUN_SIGNING_KEY || '').trim();
const MAILGUN_API_KEY = () => (process.env.MAILGUN_API_KEY || '').trim();
const BUZON = 'cajito@entregax.app';

export type CorreoAdjunto = { nombre: string; tipo: string; tamano: number; url: string | null };

let esquemaListo = false;
export const ensureSchemaCorreos = async (): Promise<void> => {
  if (esquemaListo) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cajito_correos (
      id            SERIAL PRIMARY KEY,
      folio         TEXT UNIQUE,
      de_email      TEXT NOT NULL,
      de_nombre     TEXT,
      para_email    TEXT,
      asunto        TEXT,
      cuerpo        TEXT,
      cuerpo_html   TEXT,
      adjuntos      JSONB NOT NULL DEFAULT '[]'::jsonb,
      message_id    TEXT,
      estado        TEXT NOT NULL DEFAULT 'nuevo',   -- nuevo | leido | atendido | ignorado
      sospechoso    BOOLEAN NOT NULL DEFAULT FALSE,
      nota          TEXT,
      task_id       INTEGER,
      ticket_id     INTEGER,
      recibido_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atendido_at   TIMESTAMPTZ,
      atendido_por  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_cajito_correos_estado ON cajito_correos(estado, recibido_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cajito_correos_de ON cajito_correos(LOWER(de_email));`);
  esquemaListo = true;
};

const firmaValida = (timestamp?: string, token?: string, signature?: string): boolean => {
  const key = SIGNING_KEY();
  if (!key) return true;                       // sin llave configurada no se puede verificar
  if (!timestamp || !token || !signature) return false;
  const esperada = crypto.createHmac('sha256', key).update(String(timestamp) + String(token)).digest('hex');
  return esperada === signature;
};

const partirRemitente = (from: string): { email: string; nombre: string } => {
  const m = String(from || '').match(/<([^>]+)>/);
  const email = String(m?.[1] || from || '').trim().toLowerCase();
  const nombre = String(from || '').replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  return { email, nombre: nombre || email };
};

const nombreLimpio = (n: string): string =>
  String(n || 'adjunto').replace(/[^a-zA-Z0-9_.\- ]/g, '_').replace(/\s+/g, '_').slice(0, 80);

/** Guarda en S3 los adjuntos, vengan como archivo (forward) o como URL (store). */
const guardarAdjuntos = async (correoId: number, req: Request): Promise<CorreoAdjunto[]> => {
  const out: CorreoAdjunto[] = [];
  const archivos = (req as any).files as Array<any> | undefined;
  for (const f of archivos || []) {
    try {
      const nombre = nombreLimpio(f.originalname);
      const url = await uploadToS3(f.buffer, `cajito-correos/${correoId}/${Date.now()}-${nombre}`, f.mimetype || 'application/octet-stream');
      out.push({ nombre: f.originalname, tipo: f.mimetype || '', tamano: f.size || 0, url });
    } catch (e: any) {
      console.warn('[cajito-correo] adjunto no guardado:', e?.message);
      out.push({ nombre: f.originalname, tipo: f.mimetype || '', tamano: f.size || 0, url: null });
    }
  }
  let porUrl: any[] = [];
  try { porUrl = req.body?.attachments ? JSON.parse(req.body.attachments) : []; } catch { porUrl = []; }
  for (const a of porUrl) {
    try {
      const r = await axios.get(a.url, {
        responseType: 'arraybuffer',
        timeout: 30_000,
        // Las URLs de Mailgun (modo "store") piden la llave de la API.
        ...(MAILGUN_API_KEY() ? { auth: { username: 'api', password: MAILGUN_API_KEY() } } : {}),
      });
      const nombre = nombreLimpio(a.name);
      const url = await uploadToS3(Buffer.from(r.data), `cajito-correos/${correoId}/${Date.now()}-${nombre}`, a['content-type'] || 'application/octet-stream');
      out.push({ nombre: a.name, tipo: a['content-type'] || '', tamano: Number(a.size) || 0, url });
    } catch (e: any) {
      console.warn('[cajito-correo] no se pudo bajar el adjunto de Mailgun:', e?.message);
      out.push({ nombre: a?.name || 'adjunto', tipo: a?.['content-type'] || '', tamano: Number(a?.size) || 0, url: null });
    }
  }
  return out;
};

/**
 * POST /api/webhooks/email/cajito-inbound — lo que le escriben a Cajito.
 * Siempre contesta 200: si devolviera error, Mailgun reintentaría el mismo
 * correo durante horas y se duplicaría en el buzón.
 */
export const handleCajitoInboundEmail = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchemaCorreos();
    const b = req.body || {};
    const { email: deEmail, nombre: deNombre } = partirRemitente(b.from || b.sender || '');
    const asunto = String(b.subject || '(sin asunto)').slice(0, 500);
    const verificado = firmaValida(b.timestamp, b.token, b.signature);
    if (!verificado) console.warn('[cajito-correo] firma de Mailgun inválida, se guarda como sospechoso:', deEmail);

    const messageId = String(b['Message-Id'] || b['message-id'] || '').slice(0, 300) || null;
    if (messageId) {
      const ya = await pool.query(`SELECT id, folio FROM cajito_correos WHERE message_id = $1 LIMIT 1`, [messageId]);
      if (ya.rows[0]) return res.status(200).json({ status: 'duplicado', folio: ya.rows[0].folio });
    }

    const ins = await pool.query(
      `INSERT INTO cajito_correos (de_email, de_nombre, para_email, asunto, cuerpo, cuerpo_html, message_id, sospechoso)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [deEmail || 'desconocido', deNombre, String(b.recipient || BUZON).toLowerCase(), asunto,
       String(b['body-plain'] || b['stripped-text'] || '').slice(0, 100000),
       String(b['body-html'] || '').slice(0, 200000) || null, messageId, !verificado]);
    const id = Number(ins.rows[0].id);

    const folio = (await pool.query(
      `UPDATE cajito_correos SET folio = 'CJM-' || to_char(recibido_at, 'YYYY') || '-' || LPAD(id::text, 4, '0')
        WHERE id = $1 RETURNING folio`, [id])).rows[0]?.folio || `CJM-${id}`;

    const adjuntos = await guardarAdjuntos(id, req);
    if (adjuntos.length) {
      await pool.query(`UPDATE cajito_correos SET adjuntos = $2::jsonb WHERE id = $1`, [id, JSON.stringify(adjuntos)]);
    }
    console.log(`📧 [cajito-correo] ${folio} de ${deEmail} — "${asunto}" (${adjuntos.length} adjunto(s))`);
    res.status(200).json({ status: 'recibido', folio, adjuntos: adjuntos.length });
  } catch (e: any) {
    console.error('[cajito-correo] error recibiendo:', e?.message);
    res.status(200).json({ status: 'error', message: e?.message });
  }
};

/** Últimos correos del buzón, para las herramientas de Cajito. */
export const listarCorreos = async (opts: {
  estado?: string | undefined; de?: string | undefined; buscar?: string | undefined; limite?: number | undefined;
}): Promise<any> => {
  await ensureSchemaCorreos();
  const where: string[] = [];
  const params: any[] = [];
  if (opts.estado && opts.estado !== 'todos') { params.push(opts.estado); where.push(`estado = $${params.length}`); }
  if (opts.de) { params.push(`%${opts.de.toLowerCase()}%`); where.push(`LOWER(de_email) LIKE $${params.length}`); }
  if (opts.buscar) { params.push(`%${opts.buscar}%`); where.push(`(asunto ILIKE $${params.length} OR cuerpo ILIKE $${params.length})`); }
  params.push(Math.min(Math.max(Number(opts.limite) || 15, 1), 50));
  const r = await pool.query(
    `SELECT folio, de_email, de_nombre, asunto, estado, sospechoso,
            COALESCE(jsonb_array_length(adjuntos), 0) AS adjuntos,
            LEFT(REGEXP_REPLACE(COALESCE(cuerpo, ''), '\\s+', ' ', 'g'), 220) AS avance,
            recibido_at, nota, task_id, ticket_id
       FROM cajito_correos
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY recibido_at DESC
      LIMIT $${params.length}`, params);
  const pend = await pool.query(`SELECT COUNT(*)::int AS n FROM cajito_correos WHERE estado = 'nuevo'`);
  return { buzon: BUZON, sin_revisar: Number(pend.rows[0]?.n || 0), correos: r.rows };
};

/** Un correo completo, con los adjuntos firmados para poder abrirlos. */
export const leerCorreo = async (folioOId: string): Promise<any> => {
  await ensureSchemaCorreos();
  const esId = /^\d+$/.test(String(folioOId || '').trim());
  const r = await pool.query(
    `SELECT * FROM cajito_correos WHERE ${esId ? 'id = $1::int' : 'UPPER(folio) = UPPER($1)'} LIMIT 1`,
    [String(folioOId).trim()]);
  const c = r.rows[0];
  if (!c) return { error: 'No encontré ese correo en el buzón de Cajito.' };
  const adjuntos: CorreoAdjunto[] = Array.isArray(c.adjuntos) ? c.adjuntos : [];
  const conLink = await Promise.all(adjuntos.map(async (a) => ({
    ...a, url: a.url ? await signS3UrlIfNeeded(a.url, 3600) : null,
  })));
  if (c.estado === 'nuevo') {
    await pool.query(`UPDATE cajito_correos SET estado = 'leido' WHERE id = $1`, [c.id]).catch(() => {});
  }
  return {
    folio: c.folio, de: c.de_email, de_nombre: c.de_nombre, para: c.para_email,
    asunto: c.asunto, recibido: c.recibido_at, estado: c.estado === 'nuevo' ? 'leido' : c.estado,
    sospechoso: c.sospechoso, cuerpo: String(c.cuerpo || '').slice(0, 20000),
    adjuntos: conLink, nota: c.nota, task_id: c.task_id, ticket_id: c.ticket_id,
  };
};

/** Marca en qué quedó un correo, para no volver a revisarlo. */
export const marcarCorreo = async (folioOId: string, estado: string, nota: string | null, userId: number | null): Promise<any> => {
  await ensureSchemaCorreos();
  const validos = ['nuevo', 'leido', 'atendido', 'ignorado'];
  if (!validos.includes(estado)) return { error: `Estado no válido. Usa: ${validos.join(', ')}.` };
  const esId = /^\d+$/.test(String(folioOId || '').trim());
  const r = await pool.query(
    `UPDATE cajito_correos
        SET estado = $2, nota = COALESCE($3, nota),
            atendido_at = CASE WHEN $2 IN ('atendido', 'ignorado') THEN NOW() ELSE atendido_at END,
            atendido_por = CASE WHEN $2 IN ('atendido', 'ignorado') THEN $4 ELSE atendido_por END
      WHERE ${esId ? 'id = $1::int' : 'UPPER(folio) = UPPER($1)'}
      RETURNING folio, estado, nota`,
    [String(folioOId).trim(), estado, nota || null, userId]);
  return r.rows[0] || { error: 'No encontré ese correo en el buzón de Cajito.' };
};

// ---- Pantalla (web-admin) ------------------------------------------------
/** GET /api/cajito/correos — lista para el buzón que ve el super admin. */
export const cajitoListCorreos = async (req: Request, res: Response): Promise<any> => {
  try {
    const d = await listarCorreos({
      estado: String(req.query.estado || 'todos'),
      de: req.query.de ? String(req.query.de) : undefined,
      buscar: req.query.buscar ? String(req.query.buscar) : undefined,
      limite: Number(req.query.limite) || 30,
    });
    res.json({ success: true, ...d });
  } catch (e: any) {
    console.error('[cajito-correos] listar:', e?.message);
    res.status(500).json({ error: 'No se pudo leer el buzón.' });
  }
};

/** GET /api/cajito/correos/:folio — el correo completo, con adjuntos firmados. */
export const cajitoGetCorreo = async (req: Request, res: Response): Promise<any> => {
  try {
    const c = await leerCorreo(String(req.params.folio));
    if ((c as any).error) return res.status(404).json(c);
    res.json({ success: true, correo: c });
  } catch (e: any) {
    console.error('[cajito-correos] leer:', e?.message);
    res.status(500).json({ error: 'No se pudo abrir el correo.' });
  }
};

/** PATCH /api/cajito/correos/:folio — marcar en qué quedó. */
export const cajitoUpdateCorreo = async (req: Request, res: Response): Promise<any> => {
  try {
    const r = await marcarCorreo(String(req.params.folio), String(req.body?.estado || ''),
      req.body?.nota ? String(req.body.nota) : null, Number((req as any).user?.userId) || null);
    if ((r as any).error) return res.status(400).json(r);
    res.json({ success: true, correo: r });
  } catch (e: any) {
    console.error('[cajito-correos] marcar:', e?.message);
    res.status(500).json({ error: 'No se pudo actualizar el correo.' });
  }
};
