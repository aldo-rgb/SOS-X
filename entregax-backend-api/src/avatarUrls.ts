/**
 * Firma perezosa de URLs de avatar (fotos de perfil) en las respuestas JSON.
 *
 * Contexto: las fotos de perfil vivían como data-URI base64 dentro de
 * `users.profile_photo_url` (hasta 8 MB por usuario). Como las listas de tareas
 * reincrustan la foto de cada involucrado en cada tarea, `/api/tasks/mine`
 * llegó a pesar 34 MB por carga. Ahora las fotos se guardan en S3 y la columna
 * solo trae una URL corta.
 *
 * El bucket es privado, así que la URL estática de S3 no carga en el navegador:
 * hay que firmarla. En vez de tocar los ~49 puntos que devuelven
 * `profile_photo_url`, firmamos de forma centralizada al serializar la
 * respuesta (ver el middleware de `res.json` en index.ts).
 *
 * La firma se cachea en memoria por URL: así el navegador recibe SIEMPRE la
 * misma URL para la misma foto y puede cachear la imagen (si firmáramos en
 * cada request, la URL cambiaría siempre y se re-descargaría todo).
 */
import { getSignedUrlForKey, s3KeyFromUrl } from './s3Service';

// Campos cuyo valor es una foto de perfil. Se firman donde aparezcan.
const AVATAR_FIELDS = new Set([
  'profile_photo_url',
  'assignee_photo',
  'photo',          // dentro de participant_avatars: { name, photo }
  'author_photo',
  'created_by_photo',
]);

// TTL de la firma y del caché. La firma dura más que la entrada del caché para
// que nunca entreguemos una URL a punto de expirar.
const SIGN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 días
const CACHE_TTL_MS = 6 * 24 * 60 * 60 * 1000; // 6 días

const cache = new Map<string, { url: string; expiresAt: number }>();

// Techo de seguridad: evita que el recorrido se dispare en respuestas enormes.
const MAX_NODES = 50_000;

async function signOne(raw: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(raw);
  if (hit && hit.expiresAt > now) return hit.url;
  const key = s3KeyFromUrl(raw);
  if (!key) return raw; // no es de nuestro bucket (data:, ruta local, externa)
  try {
    const signed = await getSignedUrlForKey(key, SIGN_TTL_SECONDS);
    cache.set(raw, { url: signed, expiresAt: now + CACHE_TTL_MS });
    return signed;
  } catch {
    return raw; // ante cualquier fallo, no rompemos la respuesta
  }
}

type Slot = { holder: any; field: string };

/**
 * Recorre el payload (SÍNCRONO) y devuelve dónde hay URLs de avatar por firmar.
 * Se separa de la firma para que `res.json` siga siendo síncrono en la inmensa
 * mayoría de las respuestas, que no traen ninguna foto.
 * Tolerante a ciclos y con techo de nodos.
 */
export function collectAvatarSlots(payload: any): { slots: Slot[]; urls: Set<string> } {
  const slots: Slot[] = [];
  const urls = new Set<string>();
  if (!payload || typeof payload !== 'object') return { slots, urls };

  const seen = new WeakSet<object>();
  let nodes = 0;

  const walk = (node: any): void => {
    if (nodes++ > MAX_NODES || !node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const v of node) if (v && typeof v === 'object') walk(v);
      return;
    }
    for (const field of Object.keys(node)) {
      const v = node[field];
      if (typeof v === 'string') {
        // Solo URLs http de nuestro bucket: los data-URI y las rutas externas
        // se quedan como están.
        if (AVATAR_FIELDS.has(field) && v.startsWith('http') && s3KeyFromUrl(v)) {
          slots.push({ holder: node, field });
          urls.add(v);
        }
      } else if (v && typeof v === 'object') {
        walk(v);
      }
    }
  };

  try { walk(payload); } catch { return { slots: [], urls: new Set() }; }
  return { slots, urls };
}

/**
 * Firma las URLs recolectadas y las sustituye in-place. Se firma cada URL
 * distinta UNA vez, aunque aparezca en cientos de tareas.
 */
export async function applyAvatarSignatures(slots: Slot[], urls: Set<string>): Promise<void> {
  try {
    const signedByUrl = new Map<string, string>();
    await Promise.all(Array.from(urls).map(async (u) => { signedByUrl.set(u, await signOne(u)); }));
    for (const s of slots) {
      const next = signedByUrl.get(s.holder[s.field]);
      if (next) s.holder[s.field] = next;
    }
  } catch { /* respuesta intacta si algo sale mal */ }
}
