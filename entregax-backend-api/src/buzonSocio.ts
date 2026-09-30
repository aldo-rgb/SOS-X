// ============================================================
// BUZÓN DE SOCIO — un hilo de mensajes entre EntregaX y una empresa de fuera,
// para coordinar el desarrollo de una integración.
//
// No es el espejo de tareas de Grupo Rino ni el canal de consulta de ZAIA:
// aquí no viaja nada de operación. Es un lugar donde los dos equipos se dejan
// recados mientras construyen —"ya quedó el endpoint de X", "nos está
// regresando 500 en Y", "¿el campo Z va en centavos?"— sin que nadie tenga que
// abrir una cuenta en el sistema del otro ni perseguir un correo.
//
// Se hizo genérico por `socio` desde el principio. El módulo de tareas nació
// clavado a un solo socio y hoy abrir el segundo pide tocar código; este no
// repite ese error: un socio nuevo es un renglón de variables, no un commit.
//
// Autenticación, igual que el resto de las integraciones:
//   · escribir  → API key + firma HMAC del cuerpo crudo
//   · leer      → solo API key (un GET no tiene cuerpo que firmar)
//
// Variables por socio (ENTANGLED, RINO, …):
//   BUZON_<SOCIO>_API_KEY      llave con la que nos escriben
//   BUZON_<SOCIO>_SECRET       secreto HMAC del cuerpo
//   BUZON_<SOCIO>_WEBHOOK_URL  opcional: adónde avisarles que hay recado nuevo
// ============================================================
import crypto from 'crypto';
import { Request, Response } from 'express';
import { pool } from './db';

/** Socios con buzón. Se agregan aquí y se cargan sus variables en Railway. */
const SOCIOS = ['entangled'] as const;

const norm = (s: any): string => String(s || '').trim().toLowerCase();
const envDe = (socio: string, sufijo: string): string =>
  (process.env[`BUZON_${socio.toUpperCase()}_${sufijo}`] || '').trim();

const API_KEY  = (socio: string) => envDe(socio, 'API_KEY');
const SECRETO  = (socio: string) => envDe(socio, 'SECRET');
const WEBHOOK  = (socio: string) => envDe(socio, 'WEBHOOK_URL');

let esquemaListo = false;
async function ensureSchema(): Promise<void> {
  if (esquemaListo) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS buzon_mensajes (
      id           SERIAL PRIMARY KEY,
      socio        TEXT NOT NULL,
      de           TEXT NOT NULL,            -- 'entregax' | 'socio'
      autor        TEXT,                     -- quién lo escribe, en texto
      asunto       TEXT,
      cuerpo       TEXT NOT NULL,
      responde_a   INTEGER,                  -- id del mensaje que contesta
      -- Dos marcas distintas a propósito. recogido_at es que el SISTEMA del
      -- destinatario se lo bajó; leido_at es que una PERSONA lo vio. Con una
      -- sola, un agente que consulta cada pocos minutos deja todo en "leído"
      -- aunque sea de madrugada y nadie lo haya abierto, y la señal deja de
      -- servir para lo único que servía: saber si hay que insistir.
      recogido_at  TIMESTAMPTZ,              -- se lo bajó el sistema del otro lado
      leido_at     TIMESTAMPTZ,              -- lo abrió una persona
      entregado_at TIMESTAMPTZ,              -- cuándo se avisó por webhook
      intentos     INTEGER NOT NULL DEFAULT 0,
      ultimo_error TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_buzon_socio ON buzon_mensajes(socio, id)`);
  // La columna nació después que la tabla: al principio solo había `leido_at`.
  await pool.query(`ALTER TABLE buzon_mensajes ADD COLUMN IF NOT EXISTS recogido_at TIMESTAMPTZ`);
  esquemaListo = true;
}

// ---- Autenticación ------------------------------------------------------
// Se devuelve el motivo exacto del rechazo porque el que está del otro lado no
// puede ver nuestros logs: un 401 sin explicación lo deja adivinando entre una
// llave mal pegada y una firma mal calculada, que se arreglan distinto.
type Diag = 'ok' | 'socio_desconocido' | 'sin_config' | 'falta_llave'
          | 'llave_no_coincide' | 'falta_firma' | 'firma_no_coincide';

const MOTIVO: Record<Diag, string> = {
  ok: 'ok',
  socio_desconocido: 'Ese socio no tiene buzón.',
  sin_config: 'El buzón de ese socio todavía no tiene credenciales cargadas de nuestro lado.',
  falta_llave: 'Falta el header X-EntregaX-Key.',
  llave_no_coincide: 'La API key no coincide con la registrada.',
  falta_firma: 'Falta el header X-Signature.',
  firma_no_coincide: 'La firma no corresponde al cuerpo recibido. Es HMAC-SHA256 del cuerpo CRUDO, formato "sha256=<hex>".',
};

const llaveDe = (req: Request): string =>
  (req.header('X-EntregaX-Key')
    || String(req.header('Authorization') || '').replace(/^Bearer\s+/i, '')
    || String(req.query.key || '')).trim();

export function firmar(socio: string, cuerpo: string): string {
  return 'sha256=' + crypto.createHmac('sha256', SECRETO(socio)).update(cuerpo, 'utf8').digest('hex');
}

function firmaOk(socio: string, raw: Buffer | string | undefined, firma: string | undefined): boolean {
  const secreto = SECRETO(socio);
  if (!secreto || !firma || raw == null) return false;
  const cuerpo = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('hex').toLowerCase();
  const recibida = String(firma).trim().replace(/^sha256=/i, '').toLowerCase();
  try {
    const a = Buffer.from(esperada), b = Buffer.from(recibida);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

function revisar(req: Request, socio: string, conFirma: boolean): Diag {
  if (!(SOCIOS as readonly string[]).includes(socio)) return 'socio_desconocido';
  if (!API_KEY(socio)) return 'sin_config';
  const k = llaveDe(req);
  if (!k) return 'falta_llave';
  // Comparación de tiempo constante también en la llave: es un secreto igual
  // que la firma, y compararla con === filtra su longitud y su prefijo.
  const esperada = Buffer.from(API_KEY(socio));
  const recibida = Buffer.from(k);
  const igual = esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
  if (!igual) return 'llave_no_coincide';
  if (!conFirma) return 'ok';
  if (!SECRETO(socio)) return 'sin_config';
  const f = req.header('X-Signature');
  if (!f) return 'falta_firma';
  if (!firmaOk(socio, (req as any).rawBody, f)) return 'firma_no_coincide';
  return 'ok';
}

const rechazar = (res: Response, d: Diag): void => {
  res.status(d === 'socio_desconocido' ? 404 : d === 'sin_config' ? 503 : 401)
     .json({ ok: false, reason: d, message: MOTIVO[d] });
};

// ---- Aviso al socio -----------------------------------------------------
/**
 * Le toca la puerta al socio cuando le dejamos un recado. Nunca lanza: un
 * mensaje ya guardado no se pierde porque su servidor esté caído; lo pueden
 * recoger con el GET cuando quieran. El webhook es una cortesía, no el canal.
 */
async function avisar(socio: string, mensaje: any): Promise<void> {
  const url = WEBHOOK(socio);
  if (!url || !SECRETO(socio)) return;
  const cuerpo = JSON.stringify({ evento: 'buzon.mensaje', socio, mensaje });
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': firmar(socio, cuerpo),
        'X-EntregaX-Mensaje': String(mensaje.id),
      },
      body: cuerpo,
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (r.ok) {
      await pool.query(`UPDATE buzon_mensajes SET intentos = intentos + 1, entregado_at = NOW(), ultimo_error = NULL WHERE id = $1`, [mensaje.id]);
    } else {
      const txt = (await r.text().catch(() => '')).slice(0, 300);
      await pool.query(`UPDATE buzon_mensajes SET intentos = intentos + 1, ultimo_error = $2 WHERE id = $1`, [mensaje.id, `HTTP ${r.status} ${txt}`]);
    }
  } catch (e: any) {
    await pool.query(`UPDATE buzon_mensajes SET intentos = intentos + 1, ultimo_error = $2 WHERE id = $1`,
      [mensaje.id, String(e?.message || e).slice(0, 300)]).catch(() => {});
  }
}

const aSalida = (m: any) => ({
  id: Number(m.id),
  de: m.de,
  autor: m.autor || null,
  asunto: m.asunto || null,
  cuerpo: m.cuerpo,
  responde_a: m.responde_a ? Number(m.responde_a) : null,
  recogido: !!m.recogido_at,
  leido: !!m.leido_at,
  fecha: new Date(m.created_at).toISOString(),
});

// ============================================================
// Lo que usa el socio
// ============================================================

/** POST /api/buzon/:socio/verify — dice si su llave y su firma quedaron bien. */
export const buzonVerify = async (req: Request, res: Response): Promise<any> => {
  const socio = norm(req.params.socio);
  const d = revisar(req, socio, true);
  res.json({ ok: d === 'ok', reason: d, message: MOTIVO[d] });
};

/** POST /api/buzon/:socio/mensajes — el socio nos deja un recado. */
export const buzonEscribir = async (req: Request, res: Response): Promise<any> => {
  const socio = norm(req.params.socio);
  const d = revisar(req, socio, true);
  if (d !== 'ok') return rechazar(res, d);
  try {
    await ensureSchema();
    const b = (req as any).rawBody
      ? JSON.parse((req as any).rawBody.toString('utf8'))
      : (req.body || {});
    const cuerpo = String(b.cuerpo ?? b.mensaje ?? b.body ?? '').trim();
    if (!cuerpo) {
      return res.status(400).json({ ok: false, error: 'El mensaje viene vacío. El texto va en "cuerpo".' });
    }
    const r = await pool.query(
      `INSERT INTO buzon_mensajes (socio, de, autor, asunto, cuerpo, responde_a)
       VALUES ($1, 'socio', $2, $3, $4, $5) RETURNING *`,
      [socio,
       String(b.autor ?? b.author ?? '').trim().slice(0, 120) || null,
       String(b.asunto ?? b.subject ?? '').trim().slice(0, 200) || null,
       cuerpo.slice(0, 20000),
       Number(b.responde_a) || null]);
    const m = r.rows[0];
    console.log(`[buzon] ${socio} escribió #${m.id}${m.asunto ? ` · ${m.asunto}` : ''}`);
    res.json({ ok: true, mensaje: aSalida(m) });
  } catch (e: any) {
    console.error('[buzon] escribir:', e?.message);
    res.status(500).json({ ok: false, error: 'No se pudo guardar el mensaje.' });
  }
};

/**
 * GET /api/buzon/:socio/mensajes?desde=<id> — el socio lee el hilo.
 *
 * Devuelve TODO el hilo, no solo lo nuestro: que cada quien vea lo que escribió
 * el otro y lo propio en el mismo orden es lo que lo hace una conversación y no
 * dos monólogos. `desde` sirve para ponerse al día sin volver a bajar todo.
 */
export const buzonLeer = async (req: Request, res: Response): Promise<any> => {
  const socio = norm(req.params.socio);
  const d = revisar(req, socio, false);
  if (d !== 'ok') return rechazar(res, d);
  try {
    await ensureSchema();
    const desde = Math.max(0, parseInt(String(req.query.desde || '0'), 10) || 0);
    const r = await pool.query(
      `SELECT * FROM buzon_mensajes WHERE socio = $1 AND id > $2 ORDER BY id LIMIT 200`,
      [socio, desde]);
    // Bajarlo NO es leerlo. Esto solo marca que su sistema ya lo tiene; que una
    // persona lo haya abierto se marca aparte, con POST /leidos.
    const nuestros = r.rows.filter((m: any) => m.de === 'entregax' && !m.recogido_at).map((m: any) => m.id);
    if (nuestros.length) {
      await pool.query(`UPDATE buzon_mensajes SET recogido_at = NOW() WHERE id = ANY($1::int[])`, [nuestros]);
    }
    res.json({
      ok: true,
      mensajes: r.rows.map(aSalida),
      siguiente_desde: r.rows.length ? Number(r.rows[r.rows.length - 1].id) : desde,
    });
  } catch (e: any) {
    console.error('[buzon] leer:', e?.message);
    res.status(500).json({ ok: false, error: 'No se pudo leer el buzón.' });
  }
};

/**
 * POST /api/buzon/:socio/leidos — "una persona de aquí ya lo vio".
 *
 * Lo llama SU interfaz cuando alguien abre el recado, no su agente al
 * consultarlo. Es opcional: si nunca lo llaman, de este lado los mensajes se
 * quedan en "lo recogió su sistema", que es la verdad y no una verdad a medias.
 *
 * Body: { ids: [3, 7] }  ·  sin ids, marca todos los nuestros ya recogidos.
 */
export const buzonMarcarLeidos = async (req: Request, res: Response): Promise<any> => {
  const socio = norm(req.params.socio);
  const d = revisar(req, socio, true);
  if (d !== 'ok') return rechazar(res, d);
  try {
    await ensureSchema();
    const b = (req as any).rawBody
      ? JSON.parse((req as any).rawBody.toString('utf8'))
      : (req.body || {});
    const ids = Array.isArray(b.ids)
      ? b.ids.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0)
      : [];
    const r = ids.length
      ? await pool.query(
          `UPDATE buzon_mensajes SET leido_at = COALESCE(leido_at, NOW())
            WHERE socio = $1 AND de = 'entregax' AND id = ANY($2::int[]) RETURNING id`,
          [socio, ids])
      : await pool.query(
          `UPDATE buzon_mensajes SET leido_at = COALESCE(leido_at, NOW())
            WHERE socio = $1 AND de = 'entregax' AND recogido_at IS NOT NULL AND leido_at IS NULL
            RETURNING id`,
          [socio]);
    res.json({ ok: true, marcados: r.rows.map((x: any) => Number(x.id)) });
  } catch (e: any) {
    console.error('[buzon] marcar leidos:', e?.message);
    res.status(500).json({ ok: false, error: 'No se pudieron marcar los mensajes.' });
  }
};

// ============================================================
// Lo que usamos nosotros (detrás de la sesión normal de EntregaX)
// ============================================================

/** GET /api/admin/buzon/:socio — el hilo completo, para la pantalla interna. */
export const buzonAdminLeer = async (req: Request, res: Response): Promise<any> => {
  const socio = norm(req.params.socio);
  if (!(SOCIOS as readonly string[]).includes(socio)) return rechazar(res, 'socio_desconocido');
  try {
    await ensureSchema();
    const r = await pool.query(`SELECT * FROM buzon_mensajes WHERE socio = $1 ORDER BY id`, [socio]);
    // Esta pantalla solo la abre una persona, así que abrirla ES leerlos. Se
    // marcan los de ellos para que del otro lado sepan que alguien los vio y no
    // solo que el servidor los tiene.
    const suyos = r.rows.filter((m: any) => m.de === 'socio' && !m.leido_at).map((m: any) => m.id);
    if (suyos.length) {
      await pool.query(`UPDATE buzon_mensajes SET leido_at = NOW(), recogido_at = COALESCE(recogido_at, NOW()) WHERE id = ANY($1::int[])`, [suyos]);
    }
    res.json({
      ok: true,
      socio,
      configurado: !!API_KEY(socio) && !!SECRETO(socio),
      les_avisamos: !!WEBHOOK(socio),
      mensajes: r.rows.map((m: any) => ({ ...aSalida(m), entregado: !!m.entregado_at, ultimo_error: m.ultimo_error || null })),
    });
  } catch (e: any) {
    console.error('[buzon] admin leer:', e?.message);
    res.status(500).json({ ok: false, error: 'No se pudo leer el buzón.' });
  }
};

/** POST /api/admin/buzon/:socio — dejamos un recado y les tocamos la puerta. */
export const buzonAdminEscribir = async (req: Request, res: Response): Promise<any> => {
  const socio = norm(req.params.socio);
  if (!(SOCIOS as readonly string[]).includes(socio)) return rechazar(res, 'socio_desconocido');
  try {
    await ensureSchema();
    const cuerpo = String(req.body?.cuerpo ?? '').trim();
    if (!cuerpo) return res.status(400).json({ ok: false, error: 'Escribe el mensaje antes de mandarlo.' });
    const autor = (await pool.query(`SELECT full_name FROM users WHERE id = $1`,
      [(req as any).user?.userId || (req as any).user?.id || null])).rows[0]?.full_name || 'EntregaX';
    const r = await pool.query(
      `INSERT INTO buzon_mensajes (socio, de, autor, asunto, cuerpo, responde_a)
       VALUES ($1, 'entregax', $2, $3, $4, $5) RETURNING *`,
      [socio, autor,
       String(req.body?.asunto ?? '').trim().slice(0, 200) || null,
       cuerpo.slice(0, 20000),
       Number(req.body?.responde_a) || null]);
    const m = r.rows[0];
    // El aviso va por detrás: el mensaje ya está guardado y el que lo escribió
    // no tiene por qué esperar a que el servidor del socio conteste.
    avisar(socio, aSalida(m)).catch(() => {});
    res.json({ ok: true, mensaje: aSalida(m) });
  } catch (e: any) {
    console.error('[buzon] admin escribir:', e?.message);
    res.status(500).json({ ok: false, error: 'No se pudo guardar el mensaje.' });
  }
};
