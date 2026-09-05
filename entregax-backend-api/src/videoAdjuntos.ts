/**
 * Videos adjuntos en tickets y tareas.
 *
 * El problema que resuelve: el CEDIS graba con el celular (una caja rota, un
 * sello violado, una tarima mal estibada) y hoy manda esos videos por WhatsApp,
 * fuera del sistema. Cuando alguien quiere revisar qué pasó, la evidencia ya no
 * está en el ticket ni en la tarea.
 *
 * Dos cosas que NO son obvias y que definen todo el diseño:
 *
 * 1. Un video no se puede leer. Ni Cajito ni una IA "ven" un MP4: leen
 *    imágenes. Por eso al subirlo se le sacan cuadros con ffmpeg y se guardan
 *    como fotos hijas del video. Los cuadros son lo que se lee después.
 *
 * 2. Los videos se depuran a los 30 días (regla de Aldo). Como los cuadros
 *    pesan ~200KB contra los 80MB del video, se borra el MP4 de S3 y los
 *    cuadros se quedan: la evidencia legible sobrevive a la depuración.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME, uploadToS3, deleteFromS3 } from './s3Service';

// Un video de celular de 30s a 1080p pesa 60-90MB. 200MB deja margen para uno
// de dos minutos sin abrir la puerta a que alguien suba una película.
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

// Lo que graba un celular. HEVC (.mov de iPhone) incluido: el navegador a veces
// no lo reproduce, pero los cuadros salen igual y eso es lo que importa.
export const MIMES_VIDEO = [
  'video/mp4', 'video/quicktime', 'video/x-m4v',
  'video/webm', 'video/3gpp', 'video/x-matroska',
];
const EXTS_VIDEO = ['mp4', 'mov', 'm4v', 'webm', '3gp', 'mkv'];

export function esVideo(mime?: string | null, nombre?: string | null): boolean {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('video/')) return true;
  const ext = String(nombre || '').toLowerCase().split('.').pop() || '';
  return EXTS_VIDEO.includes(ext);
}

/** Cuántos cuadros vale la pena sacar según lo que dure. */
function cuantosCuadros(segundos: number): number {
  if (!Number.isFinite(segundos) || segundos <= 0) return 3;
  if (segundos <= 6) return 3;
  if (segundos <= 20) return 6;
  if (segundos <= 60) return 9;
  return 12;
}

function correr(cmd: string, args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} tardó demasiado`)); }, timeoutMs);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.on('close', code => {
      clearTimeout(t);
      code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} salió ${code}: ${err.slice(-400)}`));
    });
  });
}

/** ¿Está ffmpeg en la imagen? Si no, no se truena nada: se guarda sin cuadros. */
export async function hayFfmpeg(): Promise<boolean> {
  try { await correr('ffmpeg', ['-version'], 10_000); return true; } catch { return false; }
}

/** Baja el objeto de S3 a un archivo temporal, sin cargarlo en memoria. */
async function bajarAArchivo(key: string, destino: string): Promise<void> {
  const r = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  const cuerpo: any = r.Body;
  if (!cuerpo) throw new Error('S3 devolvió un cuerpo vacío');
  await new Promise<void>((resolve, reject) => {
    const w = fs.createWriteStream(destino);
    cuerpo.pipe(w);
    cuerpo.on('error', reject);
    w.on('error', reject);
    w.on('finish', () => resolve());
  });
}

export type CuadroExtraido = { key: string; segundo: number; nombre: string };

/**
 * Saca cuadros de un video que ya está en S3 y los sube junto a él.
 * Nunca lanza: si algo falla devuelve la lista vacía y el motivo. Un video sin
 * cuadros sigue siendo un video que se puede ver a mano; tumbar la subida
 * entera por eso sería peor.
 */
export async function extraerCuadros(
  videoKey: string,
  nombreBase: string
): Promise<{ cuadros: CuadroExtraido[]; duracion: number | null; error?: string }> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exvid-'));
  const local = path.join(tmp, 'v' + (path.extname(videoKey) || '.mp4'));
  const limpiar = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* da igual */ } };

  try {
    if (!(await hayFfmpeg())) { limpiar(); return { cuadros: [], duracion: null, error: 'ffmpeg no disponible' }; }
    await bajarAArchivo(videoKey, local);

    let duracion: number | null = null;
    try {
      const d = await correr('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=nw=1:nk=1', local], 30_000);
      const n = parseFloat(d);
      if (Number.isFinite(n) && n > 0) duracion = n;
    } catch { /* sin duración se sacan 3 cuadros del arranque */ }

    const n = cuantosCuadros(duracion || 0);
    // Repartidos parejo, evitando el primer y último instante: el primer cuadro
    // suele ser negro y el último suele ser el celular bajando.
    const momentos: number[] = duracion
      ? Array.from({ length: n }, (_, i) => +(duracion * ((i + 0.5) / n)).toFixed(2))
      : [0.5, 1.5, 3];

    const base = nombreBase.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 40);
    const cuadros: CuadroExtraido[] = [];

    for (let i = 0; i < momentos.length; i++) {
      const seg = momentos[i]!;
      const jpg = path.join(tmp, `c${i + 1}.jpg`);
      try {
        // -ss ANTES de -i hace búsqueda rápida por keyframe: sacar 12 cuadros
        // de un video de 2 minutos tarda segundos, no minutos.
        await correr('ffmpeg', ['-nostdin', '-ss', String(seg), '-i', local,
          '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '4',
          '-y', jpg], 60_000);
        if (!fs.existsSync(jpg) || fs.statSync(jpg).size === 0) continue;
        const nombre = `${base}-cuadro-${i + 1}-${etiquetaTiempo(seg)}.jpg`;
        const key = `${videoKey.replace(/\.[^.]+$/, '')}-cuadros/${nombre}`;
        await uploadToS3(fs.readFileSync(jpg), key, 'image/jpeg');
        cuadros.push({ key, segundo: seg, nombre });
      } catch (e: any) {
        console.warn(`[video] no salió el cuadro en ${seg}s de ${videoKey}: ${e?.message}`);
      }
    }

    limpiar();
    if (cuadros.length === 0) return { cuadros: [], duracion, error: 'ffmpeg no pudo sacar ningún cuadro' };
    console.log(`[video] ${videoKey}: ${cuadros.length} cuadros, ${duracion ?? '?'}s`);
    return { cuadros, duracion };
  } catch (e: any) {
    limpiar();
    console.error(`[video] falló la extracción de ${videoKey}:`, e?.message);
    return { cuadros: [], duracion: null, error: e?.message || 'error desconocido' };
  }
}

/** "0:07", "1:23" — para que el nombre del cuadro diga en qué momento va. */
export function etiquetaTiempo(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

/** Borra el objeto pesado. Se usa en la depuración de 30 días. */
export async function borrarVideoDeS3(key: string): Promise<boolean> {
  try { await deleteFromS3(key); return true; }
  catch (e: any) { console.warn(`[video] no se pudo borrar ${key}: ${e?.message}`); return false; }
}
