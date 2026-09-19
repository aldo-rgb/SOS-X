// ============================================
// LÍNEA DE TIEMPO DE CONTENEDORES MARÍTIMOS
//
// Los 12 pasos por los que pasa un contenedor desde que se manda la
// documentación hasta que llega al almacén de destino (tarea 478). Cada paso se
// guarda con su fecha y de dónde salió, y con eso se calculan los días que
// tardó cada tramo.
//
// Alcance por ahora: SOLO los contenedores que van por ELP (`elp_notified_at`).
// Son 46 al 18-sep-2026. Es lo que decidió Aldo hasta que ELP mande todos sus
// pulsos y se conecten las demás fuentes.
//
// DE DÓNDE SALE CADA PASO HOY:
//   · Pasos 1, 2, 4 y 7  → pulsos que ELP ya manda (ver elpController).
//   · Pasos 5 y 6        → los correos del almacén de El Paso que llegan al
//                          buzón de Cajito (redquadrat). No hay API todavía.
//   · Paso 3             → el ETD/ETA que ya está capturado en el contenedor.
//   · Pasos 8, 9, 11, 12 → a mano: patio de Juárez (sistema TCG, de un tercero)
//                          y llegada al almacén.
//
// LO QUE FALTA, PARA RETOMARLO DESPUÉS:
//   · Que ELP mande los pulsos que hoy no manda. Aldo quedó de empujarlo.
//     Al llegar, no hay que tocar nada aquí: entran por el mismo camino.
//   · La API del almacén de El Paso ("API RED" en el documento de Juan).
//     Cuando exista, sustituye la lectura de correos sin cambiar los pasos.
//   · El rastreo de naviera (vizionController existe pero nunca se encendió:
//     0 de 391 contenedores tienen referencia). Al encenderlo, el paso 3 deja
//     de depender de la captura manual del ETD.
//   · Los pasos 8 y 9 necesitan usuario del sistema TCG, que es de un tercero.
// ============================================

import { Request, Response } from 'express';
import { pool, asegurarColumna } from './db';
import { AuthRequest } from './authController';

let listo = false;

export const ensureLineaTiempo = async (): Promise<void> => {
  if (listo) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS container_timeline_events (
      id            SERIAL PRIMARY KEY,
      container_id  INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
      paso          SMALLINT NOT NULL,
      ocurrio_at    TIMESTAMPTZ NOT NULL,
      origen        VARCHAR(20) NOT NULL DEFAULT 'manual',
      detalle       TEXT,
      fotos         JSONB NOT NULL DEFAULT '[]'::jsonb,
      correo_folio  VARCHAR(30),
      creado_por    INTEGER,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Un paso por contenedor: si vuelve a llegar el mismo aviso, se actualiza.
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ctl_contenedor_paso
       ON container_timeline_events (container_id, paso)`).catch(() => {});
  await asegurarColumna('container_timeline_events', 'fotos', `JSONB NOT NULL DEFAULT '[]'::jsonb`);
  listo = true;
};

/**
 * Los 12 pasos del documento "ESTATUS DE CONTENEDORES — TRACKING" (Juan Segura).
 *
 * `hito` es cuál de los 6 pasos que ve el CLIENTE prende este evento. Los que
 * van en null solo se ven en el detalle: son trámite o movimiento interno y no
 * cambian la respuesta a "¿dónde va mi carga?".
 */
export type PasoLinea = {
  paso: number;
  clave: string;
  etiqueta: string;
  hito: string | null;
  fuente: string;
};

export const PASOS: PasoLinea[] = [
  { paso: 1,  clave: 'isf_enviado',      etiqueta: 'Documentación enviada para ISF', hito: 'En Bodega',         fuente: 'ELP / manual' },
  { paso: 2,  clave: 'isf_confirmado',   etiqueta: 'Confirmación de ISF',            hito: null,                fuente: 'ELP' },
  { paso: 3,  clave: 'zarpo',            etiqueta: 'Zarpó — ETD / ETA naviera',      hito: 'Ya Zarpó',          fuente: 'Naviera / captura' },
  { paso: 4,  clave: 'pickup_terminal',  etiqueta: 'Solicitud de pick up en terminal', hito: null,              fuente: 'ELP' },
  { paso: 5,  clave: 'elpaso_entrada',   etiqueta: 'Entrada a almacén El Paso',      hito: null,                fuente: 'Correo del almacén' },
  { paso: 6,  clave: 'elpaso_salida',    etiqueta: 'Salida de almacén El Paso',      hito: 'En Tránsito MX',    fuente: 'Correo del almacén' },
  { paso: 7,  clave: 'cruce',            etiqueta: 'Cruce internacional',            hito: 'Arribo a Puerto',   fuente: 'ELP' },
  { paso: 8,  clave: 'juarez_entrada',   etiqueta: 'Llegada a patio Ciudad Juárez',  hito: null,                fuente: 'Manual (TCG)' },
  { paso: 9,  clave: 'juarez_salida',    etiqueta: 'Salida de patio Ciudad Juárez',  hito: null,                fuente: 'Manual (TCG)' },
  { paso: 11, clave: 'transito_cdmx',    etiqueta: 'Tránsito Ciudad Juárez → CDMX',  hito: 'En ruta a destino', fuente: 'Manual' },
  { paso: 12, clave: 'llegada_almacen',  etiqueta: 'Llegada a almacén de destino',   hito: 'Entregado',         fuente: 'Manual (EntregaX)' },
];
// El paso 10 viene vacío en el documento de Juan; se deja libre a propósito por
// si más adelante se define, para no renumerar lo que ya se haya registrado.

const porPaso = new Map(PASOS.map(p => [p.paso, p]));

/** Los 6 que ve el cliente, en orden. Es la línea que ya existe en su portal. */
export const HITOS_CLIENTE = ['En Bodega', 'Ya Zarpó', 'Arribo a Puerto', 'En Tránsito MX', 'En ruta a destino', 'Entregado'];

/**
 * Registra un paso. Es idempotente: si el mismo aviso vuelve a llegar, se
 * queda la fecha del primero — es la que de verdad ocurrió — y se completa lo
 * que faltara (fotos, detalle).
 */
export const registrarPaso = async (opts: {
  containerId: number; paso: number; ocurrioAt: Date | string; origen: string;
  detalle?: string | null; fotos?: any[]; correoFolio?: string | null; creadoPor?: number | null;
}): Promise<'nuevo' | 'ya_estaba'> => {
  await ensureLineaTiempo();
  const r = await pool.query(
    `INSERT INTO container_timeline_events
       (container_id, paso, ocurrio_at, origen, detalle, fotos, correo_folio, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
     ON CONFLICT (container_id, paso) DO UPDATE SET
       detalle = COALESCE(container_timeline_events.detalle, EXCLUDED.detalle),
       fotos = CASE WHEN jsonb_array_length(container_timeline_events.fotos) = 0
                    THEN EXCLUDED.fotos ELSE container_timeline_events.fotos END
     RETURNING (xmax = 0) AS inserto`,
    [opts.containerId, opts.paso, opts.ocurrioAt, opts.origen, opts.detalle || null,
     JSON.stringify(opts.fotos || []), opts.correoFolio || null, opts.creadoPor || null]);
  return r.rows[0]?.inserto ? 'nuevo' : 'ya_estaba';
};

/**
 * Pasos que NO hace falta registrar porque su fecha ya vive en el contenedor.
 *
 * El paso 1 es la fecha de ALTA del contenedor: así arranca el proceso en el
 * sistema, es cuando se manda la documentación para el ISF. Salía vacío aunque
 * el dato estuviera ahí desde el principio.
 *
 * El paso 3 sale de la salida real del barco y, si no está, del ETD planeado.
 *
 * Lo registrado SIEMPRE gana sobre lo derivado: si alguien puso la fecha a
 * mano o llegó un pulso, esa es la buena.
 */
const derivados = (c: any): Map<number, any> => {
  const m = new Map<number, any>();
  if (c?.created_at) m.set(1, { ocurrio_at: c.created_at, origen: 'alta del contenedor', fotos: [] });
  const zarpo = c?.actual_departure || c?.planned_departure;
  if (zarpo) m.set(3, { ocurrio_at: zarpo, origen: c?.actual_departure ? 'salida real' : 'ETD planeado', fotos: [] });
  return m;
};

/** Une lo registrado con lo derivado. Lo registrado manda. */
const mapaDePasos = (c: any, filas: any[]): Map<number, any> => {
  const m = derivados(c);
  for (const e of filas) m.set(e.paso, e);
  return m;
};

const dias = (desde: any, hasta: any): number | null => {
  if (!desde || !hasta) return null;
  const a = new Date(desde).getTime(), b = new Date(hasta).getTime();
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
};

// ============================================
// GET /api/containers/:id/linea-tiempo
// ============================================
export const lineaDeTiempo = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureLineaTiempo();
    const id = parseInt(String(req.params.id || ''), 10);
    const c = (await pool.query(
      `SELECT id, container_number, status, eta, elp_notified_at, created_at, planned_departure, actual_departure FROM containers WHERE id = $1`, [id])).rows[0];
    if (!c) return res.status(404).json({ error: 'Contenedor no encontrado' });

    const ev = await pool.query(
      `SELECT paso, ocurrio_at, origen, detalle, fotos, correo_folio FROM container_timeline_events
        WHERE container_id = $1 ORDER BY paso`, [id]);
    const registrados = mapaDePasos(c, ev.rows);

    const ahora = new Date();
    let anterior: any = null;
    const pasos = PASOS.map(p => {
      const e = registrados.get(p.paso);
      const fila = {
        ...p,
        ocurrio_at: e?.ocurrio_at || null,
        origen: e?.origen || null,
        detalle: e?.detalle || null,
        fotos: e?.fotos || [],
        correo_folio: e?.correo_folio || null,
        // Días desde el paso anterior que SÍ ocurrió. Si este no ha pasado, los
        // días corren hasta hoy: es lo que dice cuánto lleva atorado.
        dias_desde_anterior: e ? dias(anterior, e.ocurrio_at) : null,
        dias_esperando: !e && anterior ? dias(anterior, ahora) : null,
      };
      if (e) anterior = e.ocurrio_at;
      return fila;
    });

    // Los 6 del cliente: cada uno se prende con el paso que lo alimenta.
    const hitos = HITOS_CLIENTE.map(nombre => {
      const alimenta = pasos.filter(p => p.hito === nombre && p.ocurrio_at);
      const fecha = alimenta.length ? alimenta[0]!.ocurrio_at : null;
      return { hito: nombre, cumplido: !!fecha, fecha };
    });

    const primero = pasos.find(p => p.ocurrio_at)?.ocurrio_at || null;
    const ultimo = [...pasos].reverse().find(p => p.ocurrio_at)?.ocurrio_at || null;

    res.json({
      contenedor: {
        id: c.id, numero: c.container_number, estado: c.status, eta: c.eta,
        por_elp: !!c.elp_notified_at,
      },
      pasos,
      hitos_cliente: hitos,
      dias_totales: dias(primero, ultimo),
      dias_desde_el_primer_paso: dias(primero, ahora),
      // Para no confundir un hueco de proceso con un hueco de dato.
      nota: 'Los pasos sin fecha no se registraron; no quiere decir que no hayan ocurrido.',
    });
  } catch (e: any) {
    console.error('[linea-tiempo] leer:', e?.message);
    res.status(500).json({ error: 'No se pudo cargar la línea de tiempo' });
  }
};

// ============================================
// POST /api/containers/:id/linea-tiempo — registrar un paso a mano
// ============================================
export const registrarPasoManual = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureLineaTiempo();
    const id = parseInt(String(req.params.id || ''), 10);
    const paso = parseInt(String(req.body?.paso || ''), 10);
    const def = porPaso.get(paso);
    if (!def) return res.status(400).json({ error: 'Ese paso no existe' });
    const fecha = req.body?.fecha ? new Date(req.body.fecha) : new Date();
    if (isNaN(fecha.getTime())) return res.status(400).json({ error: 'La fecha no es válida' });
    if (fecha.getTime() > Date.now() + 86400000) {
      return res.status(400).json({ error: 'No se puede registrar un paso con fecha futura.' });
    }
    const existe = await pool.query(`SELECT 1 FROM containers WHERE id = $1`, [id]);
    if (!existe.rowCount) return res.status(404).json({ error: 'Contenedor no encontrado' });

    const r = await registrarPaso({
      containerId: id, paso, ocurrioAt: fecha, origen: 'manual',
      detalle: String(req.body?.detalle || '').trim() || null,
      creadoPor: req.user?.userId || null,
    });
    res.json({ ok: true, resultado: r, paso: def.etiqueta });
  } catch (e: any) {
    console.error('[linea-tiempo] registrar:', e?.message);
    res.status(500).json({ error: 'No se pudo registrar el paso' });
  }
};

// ============================================
// CORREOS DEL ALMACÉN DE EL PASO → PASOS 5 Y 6
//
// El almacén (redquadrat) manda dos avisos por contenedor:
//   · "NEW RECEIVING HAS BEEN CREATED" → entró al almacén  (paso 5)
//   · "NEW SHIPPING HAS BEEN CREATED"  → salió del almacén (paso 6)
//
// Llegan al buzón de Cajito y hasta ahora sólo se leían a mano. Aquí se
// convierten en pasos de la línea de tiempo.
//
// OJO con el número de contenedor: en el correo de SALIDA el campo
// "Container #" NO es el contenedor marítimo, es el del camión que lo saca
// (ej. "Container #: 539005"). El marítimo va en el texto del mensaje. Por eso
// se busca el patrón ISO —4 letras y 7 dígitos— en todo el cuerpo y no se lee
// ese campo: leerlo fallaría en todas las salidas.
// ============================================

const REMITENTE_ALMACEN = /redquadrat/i;
const PATRON_CONTENEDOR = /\b[A-Z]{4}\d{7}\b/g;

/** Qué paso es el correo, por su asunto. */
const pasoDelCorreo = (asunto: string): number | null => {
  const a = String(asunto || '').toUpperCase();
  if (a.includes('RECEIVING')) return 5;
  if (a.includes('SHIPPING')) return 6;
  return null;
};

/**
 * Revisa los correos del almacén que todavía no se hayan convertido en paso y
 * los registra. Corre con el mismo cron que sincroniza el buzón.
 */
export const procesarCorreosDeAlmacen = async (): Promise<{ registrados: number; sin_contenedor: number }> => {
  await ensureLineaTiempo();
  const { extraerEnlaces } = await import('./cajitoCorreosController');
  const correos = await pool.query(
    `SELECT folio, asunto, cuerpo, cuerpo_html, recibido_at
       FROM cajito_correos
      WHERE de_email ~* $1
        AND folio NOT IN (SELECT correo_folio FROM container_timeline_events WHERE correo_folio IS NOT NULL)
      ORDER BY id`,
    [REMITENTE_ALMACEN.source]);

  let registrados = 0, sinContenedor = 0;
  for (const c of correos.rows) {
    const paso = pasoDelCorreo(c.asunto);
    if (!paso) continue;
    const encontrados = [...new Set(String(c.cuerpo || '').match(PATRON_CONTENEDOR) || [])];
    if (!encontrados.length) { sinContenedor++; continue; }

    // Las fotos del almacén viajan como ligas dentro del HTML.
    const fotos = extraerEnlaces(String(c.cuerpo_html || ''), '')
      .filter(e => /\.(jpe?g|png|webp|pdf)(\?|$)/i.test(e.url))
      .map(e => ({ nombre: e.texto, url: e.url }));

    for (const numero of encontrados) {
      const cont = await pool.query(
        `SELECT id FROM containers WHERE UPPER(TRIM(container_number)) = $1 LIMIT 1`, [numero]);
      if (!cont.rowCount) { sinContenedor++; continue; }
      const r = await registrarPaso({
        containerId: cont.rows[0].id,
        paso,
        ocurrioAt: c.recibido_at,
        origen: 'correo_almacen',
        detalle: c.asunto,
        fotos,
        correoFolio: c.folio,
      });
      if (r === 'nuevo') {
        registrados++;
        // El correo no solo deja el evento: mueve el estatus del contenedor.
        await aplicarEstatusDelPaso(cont.rows[0].id, paso, `${c.asunto} (${c.folio})`)
          .catch((e: any) => console.warn('[linea-tiempo] estatus:', e?.message));
      }
    }
  }
  if (registrados || sinContenedor) {
    console.log(`📦 [linea-tiempo] correos del almacén: ${registrados} paso(s) nuevo(s), ${sinContenedor} sin contenedor que empate`);
  }
  return { registrados, sin_contenedor: sinContenedor };
};

/** POST /api/containers/linea-tiempo/procesar-correos — para correrlo a mano. */
export const procesarCorreosHandler = async (_req: Request, res: Response): Promise<any> => {
  try {
    res.json(await procesarCorreosDeAlmacen());
  } catch (e: any) {
    console.error('[linea-tiempo] correos:', e?.message);
    res.status(500).json({ error: 'No se pudieron procesar los correos' });
  }
};

// ============================================
// EL CORREO TAMBIÉN MUEVE EL ESTATUS DEL CONTENEDOR
//
// No basta con dejar el evento en la línea de tiempo: el contenedor tiene que
// avanzar de estatus para que se vea en los tableros y en el portal del cliente
// (indicación de Aldo, 18-sep-2026).
//
// REGLA: el estatus solo AVANZA. Si el contenedor ya va más adelante —porque
// alguien lo movió a mano o llegó un pulso posterior— el correo no lo regresa.
// Un aviso que llega tarde no debe echar atrás lo que ya se sabe.
// ============================================

/** Orden real del recorrido. Sirve para no retroceder. */
const ORDEN_ESTATUS = [
  'received_origin', 'consolidated', 'arrived_port', 'customs_cleared',
  'in_transit', 'in_transit_clientfinal', 'delivered',
];

const ESTATUS_POR_PASO: Record<number, string> = {
  5: 'customs_cleared',  // entró al almacén de El Paso: ya libró la aduana de USA
  6: 'in_transit',       // salió de El Paso: va en camino a México
};

const avanza = (actual: string, nuevo: string): boolean => {
  const a = ORDEN_ESTATUS.indexOf(actual);
  const b = ORDEN_ESTATUS.indexOf(nuevo);
  if (b < 0) return false;          // estatus desconocido: no se toca
  if (a < 0) return true;           // el actual no está en el recorrido: se pone
  return b > a;
};

/**
 * Mueve el estatus del contenedor si el paso lo amerita. Devuelve el estatus
 * nuevo, o null si no se movió.
 */
export const aplicarEstatusDelPaso = async (
  containerId: number, paso: number, motivo: string
): Promise<string | null> => {
  const nuevo = ESTATUS_POR_PASO[paso];
  if (!nuevo) return null;
  const c = (await pool.query(`SELECT status FROM containers WHERE id = $1`, [containerId])).rows[0];
  if (!c) return null;
  const actual = String(c.status || '');
  if (!avanza(actual, nuevo)) return null;

  await pool.query(`UPDATE containers SET status = $2, updated_at = NOW() WHERE id = $1`, [containerId, nuevo]);
  // Queda en la bitácora que ya existe, con quién lo movió, igual que los
  // pulsos de ELP. Así se puede auditar de dónde salió el cambio.
  await pool.query(
    `INSERT INTO container_status_history (container_id, previous_status, new_status, changed_by_name, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [containerId, actual || null, nuevo, 'Correo almacén El Paso', motivo]
  ).catch(() => {});
  console.log(`📦 [linea-tiempo] contenedor ${containerId}: ${actual || '(sin estatus)'} → ${nuevo} por ${motivo}`);
  return nuevo;
};

// ============================================
// GET /api/client/containers/:numero/linea-tiempo
//
// La misma línea, pero para el cliente: entra por el NÚMERO de contenedor y
// solo si trae carga suya. Se usa desde "Ver Detalles" de su portal.
// ============================================
export const lineaDeTiempoCliente = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureLineaTiempo();
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const numero = String(req.params.numero || '').trim().toUpperCase();
    if (!numero) return res.status(400).json({ error: 'Falta el número de contenedor' });

    // Que el contenedor de verdad lleve carga de este cliente.
    const c = (await pool.query(
      `SELECT c.id, c.container_number, c.eta, c.created_at, c.planned_departure, c.actual_departure
         FROM containers c
        WHERE UPPER(TRIM(c.container_number)) = $1
          AND EXISTS (SELECT 1 FROM maritime_orders mo WHERE mo.container_id = c.id AND mo.user_id = $2)
        LIMIT 1`, [numero, userId])).rows[0];
    if (!c) return res.status(404).json({ error: 'No encontramos ese contenedor entre tus embarques.' });

    const ev = await pool.query(
      `SELECT paso, ocurrio_at, detalle, fotos FROM container_timeline_events
        WHERE container_id = $1 ORDER BY paso`, [c.id]);
    const reg = mapaDePasos(c, ev.rows);

    const ahora = new Date();
    let anterior: any = null;
    const pasos = PASOS.map(p => {
      const e = reg.get(p.paso);
      const fila = {
        paso: p.paso,
        etiqueta: p.etiqueta,
        hito: p.hito,
        fecha: e?.ocurrio_at || null,
        // Al cliente se le muestran las fotos del almacén: es la prueba de que
        // su carga existe y está bien.
        fotos: e?.fotos || [],
        dias_desde_anterior: e ? dias(anterior, e.ocurrio_at) : null,
        dias_esperando: !e && anterior ? dias(anterior, ahora) : null,
      };
      if (e) anterior = e.ocurrio_at;
      return fila;
    });

    res.json({
      contenedor: c.container_number,
      eta: c.eta,
      pasos,
      // Para que la pantalla sepa si vale la pena pintar la sección.
      con_registro: pasos.some(p => p.fecha),
    });
  } catch (e: any) {
    console.error('[linea-tiempo cliente]:', e?.message);
    res.status(500).json({ error: 'No se pudo cargar el seguimiento' });
  }
};

// ============================================
// GET /api/containers/lookup?q=  — buscar por contenedor, BL o referencia
//
// Lo usa el buscador de Cajito ("Rastrear guía"): antes escribir un número de
// contenedor devolvía "no se encontró cliente ni guía", porque solo buscaba
// entre clientes y guías (tarea 478).
// ============================================
export const buscarContenedor = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureLineaTiempo();
    const q = String(req.query?.q || '').trim();
    if (q.length < 3) return res.status(400).json({ error: 'Escribe al menos 3 caracteres.' });

    const c = (await pool.query(
      `SELECT id, container_number, bl_number, reference_code, status, eta, elp_notified_at,
              created_at, planned_departure, actual_departure
         FROM containers
        WHERE UPPER(TRIM(container_number)) = UPPER($1)
           OR UPPER(TRIM(COALESCE(bl_number, ''))) = UPPER($1)
           OR UPPER(TRIM(COALESCE(reference_code, ''))) = UPPER($1)
        ORDER BY id DESC LIMIT 1`, [q])).rows[0];
    if (!c) return res.status(404).json({ error: `No encontré ningún contenedor con "${q}".` });

    const ev = await pool.query(
      `SELECT paso, ocurrio_at, origen, detalle, fotos FROM container_timeline_events
        WHERE container_id = $1 ORDER BY paso`, [c.id]);
    const reg = mapaDePasos(c, ev.rows);

    const ahora = new Date();
    let anterior: any = null;
    const pasos = PASOS.map(p => {
      const e = reg.get(p.paso);
      const fila = {
        paso: p.paso, etiqueta: p.etiqueta, fuente: p.fuente,
        ocurrio_at: e?.ocurrio_at || null, origen: e?.origen || null, fotos: e?.fotos || [],
        dias_desde_anterior: e ? dias(anterior, e.ocurrio_at) : null,
        dias_esperando: !e && anterior ? dias(anterior, ahora) : null,
      };
      if (e) anterior = e.ocurrio_at;
      return fila;
    });

    // Los clientes que llevan carga en ese contenedor: casi siempre es
    // consolidado y esa es la pregunta que sigue ("¿de quién es?").
    const clientes = await pool.query(
      `SELECT DISTINCT u.full_name, u.box_id FROM maritime_orders mo
         JOIN users u ON u.id = mo.user_id
        WHERE mo.container_id = $1 ORDER BY u.full_name LIMIT 20`, [c.id]);

    const alta = c.created_at;
    res.json({
      // Días desde que se dio de alta: es la pregunta de fondo de la tarea
      // ("¿cuánto lleva esto?") y se responde sin tener que sumar a mano.
      dias_desde_alta: dias(alta, new Date()),
      alta: alta,
      contenedor: {
        id: c.id, numero: c.container_number, bl: c.bl_number,
        referencia: c.reference_code, estado: c.status, eta: c.eta, por_elp: !!c.elp_notified_at,
      },
      pasos,
      clientes: clientes.rows,
      con_registro: pasos.some(p => p.ocurrio_at),
    });
  } catch (e: any) {
    console.error('[contenedor lookup]:', e?.message);
    res.status(500).json({ error: 'No se pudo buscar el contenedor' });
  }
};
