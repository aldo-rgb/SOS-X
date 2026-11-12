// ============================================================================
// X-PAY — ÓRDENES EN CORRECCIÓN (tarea 874)
// ============================================================================
// Una orden X-Pay nace con los datos bancarios del beneficiario que capturó el
// asesor. Si esos datos vienen mal y el cliente YA depositó, hasta hoy la única
// salida era cancelar la orden y levantarla de nuevo: el cliente volvía a
// depositar, la referencia cambiaba y el dinero del primer depósito quedaba
// colgando. En lo que va del mes pasó tres veces; en una el wire salió a una
// cuenta equivocada y el banco lo devolvió.
//
// Este módulo abre el carril que faltaba:
//
//   1. Servicio a Cliente marca la orden EN CORRECCIÓN (solo si el cliente ya
//      pagó: antes de eso la orden se cancela y se levanta otra).
//   2. Con la marca puesta, al asesor dueño se le habilita editar ESA orden —
//      solo los datos del beneficiario, nunca montos, tipo de cambio ni
//      comisiones.
//   3. Al guardar se manda el aviso al proveedor con QUÉ CAMBIÓ: campo, valor
//      anterior y valor nuevo. Quien revisa del otro lado necesita los dos;
//      con solo la versión nueva aprueba a ciegas.
//   4. Cada corrección lleva número consecutivo, para que si llegan dos
//      seguidas se sepa cuál es la buena.
//
// Por qué NO se toca estatus_global
// ---------------------------------
// "EN CORRECCIÓN" es una marca, no una etapa. estatus_global lo leen 111
// lugares —crons de auto-cancelación, comisiones, cortes, el historial de
// órdenes— y meterle un valor nuevo los hace tropezar a todos: una orden en
// corrección dejaría de contar como completada y la comisión ya pagada se
// recalcularía. La marca vive en su propia columna y la pantalla la muestra
// como estatus, que es lo que la gente necesita ver.
//
// El beneficiario guardado también se corrige
// -------------------------------------------
// Si la cuenta mala está guardada en la libreta del cliente, corregir solo la
// orden deja la trampa puesta: la siguiente solicitud vuelve a nacer con el
// dato malo. Por eso la corrección persigue al beneficiario guardado — por
// supplier_id cuando la orden lo trae, y si no, buscando en la libreta del
// cliente la cuenta que coincide con la que se está corrigiendo.
// ============================================================================

import { Request, Response } from 'express';
import { pool } from './db';
import { notifyCorreccionToEntangled } from './entangledServiceV2';
import { clabeValida } from './entangledController';

// ---------------------------------------------------------------------------
// Campos corregibles. Esta lista es el contrato: lo que no está aquí no se
// toca por esta vía. Montos, tipo de cambio y comisiones quedan fuera a
// propósito — cambiarlos sería otra operación, no una corrección.
// ---------------------------------------------------------------------------
export interface CampoCorregible {
  key: string;        // nombre en la petición y en el aviso al proveedor
  col: string;        // columna en entangled_payment_requests
  supCol: string;     // columna en entangled_suppliers (la libreta del cliente)
  label: string;      // como lo lee una persona
  max?: number;       // largo que el banco acepta
}

export const CAMPOS_CORREGIBLES: CampoCorregible[] = [
  { key: 'nombre_beneficiario',    col: 'sup_nombre_beneficiario', supCol: 'nombre_beneficiario',    label: 'Nombre del beneficiario' },
  { key: 'direccion_beneficiario', col: 'sup_direccion',           supCol: 'direccion_beneficiario', label: 'Dirección del beneficiario' },
  { key: 'banco_nombre',           col: 'sup_banco_nombre',        supCol: 'banco_nombre',           label: 'Banco' },
  { key: 'banco_direccion',        col: 'sup_banco_direccion',     supCol: 'banco_direccion',        label: 'Dirección del banco' },
  { key: 'banco_pais',             col: 'sup_banco_pais',          supCol: 'banco_pais',             label: 'País del banco' },
  { key: 'numero_cuenta',          col: 'sup_numero_cuenta',       supCol: 'numero_cuenta',          label: 'Número de cuenta', max: 20 },
  { key: 'clabe',                  col: 'sup_clabe',               supCol: 'clabe',                  label: 'CLABE', max: 18 },
  { key: 'iban',                   col: 'sup_iban',                supCol: 'iban',                   label: 'IBAN', max: 20 },
  { key: 'swift_bic',              col: 'sup_swift_bic',           supCol: 'swift_bic',              label: 'SWIFT / BIC', max: 11 },
  { key: 'aba_routing',            col: 'sup_aba_routing',         supCol: 'aba_routing',            label: 'ABA / Routing', max: 20 },
];

const porKey = new Map(CAMPOS_CORREGIBLES.map((c) => [c.key, c]));

// ---------------------------------------------------------------------------
// Esquema. Se asegura antes de cada operación: las columnas nuevas tienen que
// existir aunque nadie haya corregido nada todavía.
// ---------------------------------------------------------------------------
let esquemaListo: Promise<void> | null = null;

export const asegurarEsquemaCorrecciones = async (): Promise<void> => {
  if (!esquemaListo) {
    esquemaListo = (async () => {
      await pool.query(
        'ALTER TABLE entangled_payment_requests'
        + ' ADD COLUMN IF NOT EXISTS correccion_abierta boolean NOT NULL DEFAULT false,'
        + ' ADD COLUMN IF NOT EXISTS correccion_numero integer NOT NULL DEFAULT 0,'
        + ' ADD COLUMN IF NOT EXISTS correccion_motivo text,'
        + ' ADD COLUMN IF NOT EXISTS correccion_abierta_at timestamptz,'
        + ' ADD COLUMN IF NOT EXISTS correccion_abierta_por integer,'
        + ' ADD COLUMN IF NOT EXISTS sup_banco_pais varchar(120),'
        + ' ADD COLUMN IF NOT EXISTS sup_clabe varchar(40)'
      );
      await pool.query(
        'CREATE TABLE IF NOT EXISTS entangled_correcciones ('
        + ' id serial PRIMARY KEY,'
        + ' request_id integer NOT NULL REFERENCES entangled_payment_requests(id) ON DELETE CASCADE,'
        + ' numero integer NOT NULL,'
        + ' motivo text,'
        + " cambios jsonb NOT NULL DEFAULT '[]'::jsonb,"
        + ' abierta_por integer,'
        + ' abierta_at timestamptz,'
        + ' corregida_por integer,'
        + ' corregida_at timestamptz NOT NULL DEFAULT NOW(),'
        + ' proveedor_ya_pagado boolean NOT NULL DEFAULT false,'
        + ' supplier_id integer,'
        + ' supplier_actualizado boolean NOT NULL DEFAULT false,'
        + ' notificado_at timestamptz,'
        + ' notificacion_error text,'
        + ' notificacion_respuesta jsonb)'
      );
      await pool.query(
        'CREATE INDEX IF NOT EXISTS entangled_correcciones_request_idx'
        + ' ON entangled_correcciones (request_id, numero DESC)'
      );
    })().catch((e) => {
      esquemaListo = null;
      throw e;
    });
  }
  return esquemaListo;
};

const limpiar = (v: any): string => String(v ?? '').trim();
const normCuenta = (v: any): string => String(v ?? '').replace(/[\s-]/g, '').toUpperCase();

const quienEs = (req: Request): number | null => {
  const u = (req as any).user;
  const id = Number(u?.userId ?? u?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const ROLES_MANDO = ['super_admin', 'admin', 'director'];
const esMando = (req: Request): boolean =>
  ROLES_MANDO.includes(String((req as any).user?.role || '').toLowerCase());

const referencia = (row: any): string =>
  row?.referencia_pago || 'XP' + String(row?.id ?? '').padStart(6, '0');

// ---------------------------------------------------------------------------
// POST /api/admin/xpay/payment-requests/:id/correccion
// Servicio a Cliente marca la orden EN CORRECCIÓN.
// ---------------------------------------------------------------------------
export const abrirCorreccion = async (req: Request, res: Response): Promise<any> => {
  const actorId = quienEs(req);
  if (!actorId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Orden inválida' });

  try {
    await asegurarEsquemaCorrecciones();
    const motivo = limpiar((req.body || {}).motivo).slice(0, 500);
    if (!motivo) {
      return res.status(400).json({ error: 'Escribe qué hay que corregir: es lo que el asesor va a leer.' });
    }

    const r = await pool.query(
      `SELECT id, referencia_pago, advisor_id, user_id, estatus_global,
              comprobante_subido_at, proveedor_pagado_at, correccion_abierta, correccion_numero
         FROM entangled_payment_requests WHERE id = $1`,
      [id]
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Esa orden no existe' });

    // Antes del depósito la orden todavía se puede cancelar y levantar de
    // nuevo; la corrección existe justamente para cuando eso ya no aplica.
    if (!row.comprobante_subido_at) {
      return res.status(409).json({
        error: 'El cliente todavía no sube su comprobante. Mientras no pague, la orden se cancela y se levanta de nuevo.',
      });
    }
    if (String(row.estatus_global) === 'cancelado') {
      return res.status(409).json({ error: 'La orden está cancelada: no hay nada que corregir.' });
    }
    if (row.correccion_abierta) {
      return res.status(409).json({ error: 'Esa orden ya está en corrección.' });
    }

    await pool.query(
      `UPDATE entangled_payment_requests
          SET correccion_abierta = true,
              correccion_motivo = $2,
              correccion_abierta_at = NOW(),
              correccion_abierta_por = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [id, motivo, actorId]
    );

    // El asesor es quien corrige: si no se entera, la marca no sirve de nada.
    if (row.advisor_id) {
      await pool
        .query(
          `INSERT INTO notifications (user_id, title, message, type, icon, data)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            row.advisor_id,
            'X-Pay: orden en corrección',
            'La orden ' + referencia(row) + ' quedó en corrección. Revisa los datos del beneficiario: ' + motivo,
            'xpay_orden_en_correccion',
            '✏️',
            JSON.stringify({ request_id: id, motivo }),
          ]
        )
        .catch((e) => console.warn('[XPAY-CORRECCION] notif asesor:', (e as Error).message));
    }

    return res.json({
      success: true,
      // El dinero ya salió: la corrección no es un ajuste de papel, es pedir
      // que lo manden otra vez. Quien marca tiene que saberlo en ese momento.
      proveedor_ya_pagado: !!row.proveedor_pagado_at,
      aviso: row.proveedor_pagado_at
        ? 'Ojo: el pago al proveedor ya salió. La corrección le va a pedir al proveedor que lo mande de nuevo.'
        : null,
    });
  } catch (err: any) {
    console.error('[XPAY-CORRECCION] abrir:', err.message);
    return res.status(500).json({ error: 'No se pudo marcar la orden en corrección' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/admin/xpay/payment-requests/:id/correccion
// Quitar la marca sin corregir (se puso por error o se resolvió por fuera).
// ---------------------------------------------------------------------------
export const cerrarCorreccion = async (req: Request, res: Response): Promise<any> => {
  const actorId = quienEs(req);
  if (!actorId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Orden inválida' });
  try {
    await asegurarEsquemaCorrecciones();
    const r = await pool.query(
      `UPDATE entangled_payment_requests
          SET correccion_abierta = false, correccion_motivo = NULL, updated_at = NOW()
        WHERE id = $1 AND correccion_abierta = true
        RETURNING id`,
      [id]
    );
    if (!r.rows[0]) return res.status(409).json({ error: 'Esa orden no está en corrección.' });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[XPAY-CORRECCION] cerrar:', err.message);
    return res.status(500).json({ error: 'No se pudo quitar la marca' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/xpay/payment-requests/:id/correccion
// Lo que el asesor necesita para corregir: el estado de la marca, los valores
// de hoy y el historial de correcciones anteriores.
// ---------------------------------------------------------------------------
export const detalleCorreccion = async (req: Request, res: Response): Promise<any> => {
  const actorId = quienEs(req);
  if (!actorId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Orden inválida' });
  try {
    await asegurarEsquemaCorrecciones();
    const cols = CAMPOS_CORREGIBLES.map((c) => 'r.' + c.col).join(', ');
    const r = await pool.query(
      `SELECT r.id, r.referencia_pago, r.advisor_id, r.user_id, r.supplier_id,
              r.estatus_global, r.op_divisa_destino, r.es_pesos,
              r.comprobante_subido_at, r.proveedor_pagado_at,
              r.correccion_abierta, r.correccion_numero, r.correccion_motivo,
              r.correccion_abierta_at, ${cols},
              a.full_name AS marcada_por_nombre
         FROM entangled_payment_requests r
         LEFT JOIN users a ON a.id = r.correccion_abierta_por
        WHERE r.id = $1`,
      [id]
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Esa orden no existe' });
    if (!esMando(req) && Number(row.advisor_id) !== actorId && Number(row.user_id) !== actorId) {
      return res.status(403).json({ error: 'Esa orden no es tuya' });
    }

    const supplierId = await buscarSupplier(row);
    const valores = await valoresActuales(row, supplierId);

    const h = await pool.query(
      `SELECT c.id, c.numero, c.motivo, c.cambios, c.corregida_at, c.proveedor_ya_pagado,
              c.supplier_actualizado, c.notificado_at, c.notificacion_error,
              u.full_name AS corregida_por_nombre
         FROM entangled_correcciones c
         LEFT JOIN users u ON u.id = c.corregida_por
        WHERE c.request_id = $1
        ORDER BY c.numero DESC`,
      [id]
    );

    return res.json({
      success: true,
      orden: {
        id: row.id,
        referencia: referencia(row),
        estatus_global: row.estatus_global,
        divisa: row.op_divisa_destino,
        es_pesos: row.es_pesos === true || String(row.op_divisa_destino).toUpperCase() === 'MXN',
        correccion_abierta: row.correccion_abierta === true,
        correccion_numero: Number(row.correccion_numero) || 0,
        motivo: row.correccion_motivo || null,
        marcada_at: row.correccion_abierta_at,
        marcada_por: row.marcada_por_nombre || null,
        proveedor_ya_pagado: !!row.proveedor_pagado_at,
        tiene_beneficiario_guardado: supplierId != null,
      },
      campos: CAMPOS_CORREGIBLES.map((c) => ({ key: c.key, label: c.label, max: c.max || null })),
      valores,
      historial: h.rows,
    });
  } catch (err: any) {
    console.error('[XPAY-CORRECCION] detalle:', err.message);
    return res.status(500).json({ error: 'No se pudo leer la corrección' });
  }
};

// ---------------------------------------------------------------------------
// Qué beneficiario guardado le toca a esta orden.
// supplier_id es el camino bueno, pero lo escribimos apenas desde noviembre:
// las órdenes anteriores no lo traen. Para esas se busca en la libreta DEL
// CLIENTE la cuenta que coincide con la que se está corrigiendo, que es
// exactamente lo que haría una persona.
// ---------------------------------------------------------------------------
const buscarSupplier = async (row: any): Promise<number | null> => {
  if (row.supplier_id) return Number(row.supplier_id);
  const cuenta = normCuenta(row.sup_numero_cuenta);
  const iban = normCuenta(row.sup_iban);
  if (!cuenta && !iban) return null;
  const r = await pool.query(
    `SELECT id FROM entangled_suppliers
      WHERE user_id = $1
        AND ( ($2 <> '' AND UPPER(REPLACE(REPLACE(COALESCE(numero_cuenta,''), ' ', ''), '-', '')) = $2)
           OR ($2 <> '' AND UPPER(REPLACE(REPLACE(COALESCE(clabe,''), ' ', ''), '-', '')) = $2)
           OR ($3 <> '' AND UPPER(REPLACE(REPLACE(COALESCE(iban,''), ' ', ''), '-', '')) = $3) )
      ORDER BY id DESC LIMIT 1`,
    [row.user_id, cuenta, iban]
  );
  return r.rows[0]?.id ? Number(r.rows[0].id) : null;
};

// ---------------------------------------------------------------------------
// Los valores que hoy están EN USO para esta orden.
//
// Dos de los campos corregibles —la CLABE y el país del banco— nunca se
// copiaron a la orden: viven en el beneficiario guardado del cliente, que es
// de donde salieron. Si aquí se mostraran vacíos, el asesor creería que se
// perdieron y la bitácora diría "(vacío) → 0123…" en cada corrección, aunque
// el dato llevara ahí desde el principio. Así que para los campos que la orden
// no carga se lee el beneficiario guardado, que es lo que de verdad se usó.
// ---------------------------------------------------------------------------
const valoresActuales = async (
  row: any,
  supplierId: number | null
): Promise<Record<string, string>> => {
  const v: Record<string, string> = {};
  for (const c of CAMPOS_CORREGIBLES) v[c.key] = limpiar(row[c.col]);
  const faltantes = CAMPOS_CORREGIBLES.filter((c) => !v[c.key]);
  if (supplierId && faltantes.length > 0) {
    const s = await pool.query(
      'SELECT ' + faltantes.map((c) => c.supCol).join(', ') + ' FROM entangled_suppliers WHERE id = $1',
      [supplierId]
    );
    const sup = s.rows[0];
    if (sup) for (const c of faltantes) v[c.key] = limpiar(sup[c.supCol]);
  }
  return v;
};

// ---------------------------------------------------------------------------
// PUT /api/xpay/payment-requests/:id/correccion
// El asesor guarda los datos corregidos.
// ---------------------------------------------------------------------------
export const guardarCorreccion = async (req: Request, res: Response): Promise<any> => {
  const actorId = quienEs(req);
  if (!actorId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Orden inválida' });

  try {
    await asegurarEsquemaCorrecciones();
    const cols = CAMPOS_CORREGIBLES.map((c) => 'r.' + c.col).join(', ');
    const r = await pool.query(
      `SELECT r.id, r.referencia_pago, r.advisor_id, r.user_id, r.supplier_id,
              r.entangled_transaccion_id, r.estatus_global, r.op_divisa_destino, r.es_pesos,
              r.proveedor_pagado_at, r.correccion_abierta, r.correccion_numero,
              r.correccion_motivo, r.correccion_abierta_por, r.correccion_abierta_at, ${cols}
         FROM entangled_payment_requests r
        WHERE r.id = $1`,
      [id]
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Esa orden no existe' });
    if (!esMando(req) && Number(row.advisor_id) !== actorId) {
      return res.status(403).json({ error: 'Esa orden no es tuya' });
    }
    // La puerta la abre Servicio a Cliente. Sin la marca, los datos bancarios
    // de una orden ya pagada no se tocan.
    if (!row.correccion_abierta) {
      return res.status(409).json({
        error: 'Esa orden no está en corrección. Pídele a Servicio a Cliente que la marque.',
      });
    }

    const body = (req.body || {}) as Record<string, any>;
    const esPesos = row.es_pesos === true || String(row.op_divisa_destino).toUpperCase() === 'MXN';
    const supplierId = await buscarSupplier(row);
    // Contra qué se compara: lo que hoy está en uso, que para la CLABE y el
    // país del banco vive en el beneficiario guardado, no en la orden.
    const actuales = await valoresActuales(row, supplierId);

    // Qué cambió. Solo los campos que vienen en la petición y de verdad son
    // distintos; lo demás se queda como está.
    const cambios: Array<{ campo: string; etiqueta: string; anterior: string; nuevo: string }> = [];
    const nuevos: Record<string, string> = {};
    for (const [key, valor] of Object.entries(body)) {
      const campo = porKey.get(key);
      if (!campo) continue;              // lo que no es corregible se ignora
      const nuevo = limpiar(valor);
      const anterior = actuales[campo.key] ?? '';
      if (nuevo === anterior) continue;
      if (campo.max && normCuenta(nuevo).length > campo.max) {
        return res.status(400).json({
          error: 'El ' + campo.label + ' no es válido: tiene ' + normCuenta(nuevo).length
            + ' caracteres y el banco acepta ' + campo.max + '.',
          campo: campo.key,
        });
      }
      nuevos[campo.col] = nuevo;
      cambios.push({ campo: campo.key, etiqueta: campo.label, anterior, nuevo });
    }

    if (cambios.length === 0) {
      return res.status(400).json({ error: 'No cambiaste nada. Corrige el dato o quita la marca de corrección.' });
    }
    // La CLABE es el número con el que se hace el SPEI: si va mal, el pago en
    // pesos se cae igual que iba.
    const clabeNueva = nuevos['sup_clabe'];
    if (esPesos && clabeNueva && !clabeValida(clabeNueva)) {
      return res.status(400).json({ error: 'La CLABE debe tener 18 dígitos y pasar su dígito verificador.', campo: 'clabe' });
    }

    const numero = (Number(row.correccion_numero) || 0) + 1;
    const proveedorYaPagado = !!row.proveedor_pagado_at;

    // Orden, beneficiario guardado y bitácora, todo o nada: si la libreta del
    // cliente se queda con la cuenta vieja, la siguiente solicitud vuelve a
    // nacer mal y nadie se entera.
    const cx = await pool.connect();
    let correccionId: number;
    let supplierActualizado = false;
    try {
      await cx.query('BEGIN');
      const colsNuevas = Object.keys(nuevos);
      const sets = colsNuevas.map((c, i) => c + ' = $' + (i + 2));
      await cx.query(
        'UPDATE entangled_payment_requests SET ' + sets.join(', ')
        + ', correccion_abierta = false, correccion_motivo = NULL'
        + ', correccion_numero = $' + (colsNuevas.length + 2)
        + ', updated_at = NOW() WHERE id = $1',
        [id, ...colsNuevas.map((c) => nuevos[c]), numero]
      );

      if (supplierId) {
        const supSets: string[] = [];
        const supVals: any[] = [supplierId];
        for (const c of cambios) {
          const campo = porKey.get(c.campo)!;
          supVals.push(c.nuevo);
          supSets.push(campo.supCol + ' = $' + supVals.length);
        }
        const up = await cx.query(
          'UPDATE entangled_suppliers SET ' + supSets.join(', ')
          + ', updated_at = NOW() WHERE id = $1 RETURNING id',
          supVals
        );
        supplierActualizado = up.rows.length > 0;
      }

      const ins = await cx.query(
        `INSERT INTO entangled_correcciones
           (request_id, numero, motivo, cambios, abierta_por, abierta_at,
            corregida_por, proveedor_ya_pagado, supplier_id, supplier_actualizado)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          id, numero, row.correccion_motivo || null, JSON.stringify(cambios),
          row.correccion_abierta_por || null, row.correccion_abierta_at || null,
          actorId, proveedorYaPagado, supplierId, supplierActualizado,
        ]
      );
      correccionId = Number(ins.rows[0].id);
      await cx.query('COMMIT');
    } catch (e) {
      await cx.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cx.release();
    }

    // El aviso al proveedor va después de guardar y no bloquea: si su endpoint
    // está caído, la corrección ya quedó y el aviso se reintenta.
    const aviso = await avisarCorreccion(correccionId);

    return res.json({
      success: true,
      correccion_id: correccionId,
      numero,
      cambios,
      supplier_actualizado: supplierActualizado,
      proveedor_ya_pagado: proveedorYaPagado,
      notificado: aviso.ok,
      notificacion_error: aviso.ok ? null : aviso.error,
    });
  } catch (err: any) {
    console.error('[XPAY-CORRECCION] guardar:', err.message);
    return res.status(500).json({ error: 'No se pudo guardar la corrección' });
  }
};

// ---------------------------------------------------------------------------
// El aviso al proveedor. Lleva el diff completo —campo, valor anterior, valor
// nuevo— porque sin el anterior quien revisa del otro lado aprueba a ciegas, y
// el número consecutivo para que dos correcciones seguidas no se confundan.
// ---------------------------------------------------------------------------
export const avisarCorreccion = async (
  correccionId: number
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const cols = CAMPOS_CORREGIBLES.map((c) => 'r.' + c.col).join(', ');
    const q = await pool.query(
      `SELECT c.id, c.numero, c.motivo, c.cambios, c.proveedor_ya_pagado,
              r.id AS request_id, r.referencia_pago, r.entangled_transaccion_id,
              r.op_divisa_destino, r.user_id, r.supplier_id, ${cols},
              u.full_name AS corregida_por_nombre
         FROM entangled_correcciones c
         JOIN entangled_payment_requests r ON r.id = c.request_id
         LEFT JOIN users u ON u.id = c.corregida_por
        WHERE c.id = $1`,
      [correccionId]
    );
    const row = q.rows[0];
    if (!row) return { ok: false, error: 'Corrección no encontrada' };
    if (!row.entangled_transaccion_id) {
      const err = 'La orden nunca se envió al proveedor: no hay a quién avisarle.';
      await pool.query('UPDATE entangled_correcciones SET notificacion_error = $2 WHERE id = $1', [correccionId, err]);
      return { ok: false, error: err };
    }

    // El beneficiario completo, ya corregido: el proveedor tiene que poder
    // reenviar los datos buenos a la comercializadora sin armarlos él.
    const beneficiario = await valoresActuales(row, await buscarSupplier(row));

    const res = await notifyCorreccionToEntangled(String(row.entangled_transaccion_id), {
      correccion_numero: Number(row.numero),
      referencia_xpay: referencia(row),
      motivo: row.motivo || null,
      proveedor_ya_pagado: row.proveedor_ya_pagado === true,
      corregido_por: row.corregida_por_nombre || null,
      divisa: row.op_divisa_destino || null,
      cambios: Array.isArray(row.cambios) ? row.cambios : [],
      beneficiario,
    });

    if (res.ok) {
      await pool.query(
        `UPDATE entangled_correcciones
            SET notificado_at = NOW(), notificacion_error = NULL,
                notificacion_respuesta = $2::jsonb
          WHERE id = $1`,
        [correccionId, JSON.stringify(res.data || {})]
      );
      return { ok: true };
    }
    await pool.query(
      'UPDATE entangled_correcciones SET notificacion_error = $2 WHERE id = $1',
      [correccionId, String(res.error || 'Error desconocido').slice(0, 1000)]
    );
    return { ok: false, error: res.error || 'Error desconocido' };
  } catch (err: any) {
    console.error('[XPAY-CORRECCION] avisar:', err.message);
    return { ok: false, error: err.message };
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/xpay/correcciones/:correccionId/reenviar
// Reintentar el aviso cuando el primero no salió.
// ---------------------------------------------------------------------------
export const reenviarAvisoCorreccion = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.correccionId);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Corrección inválida' });
  try {
    await asegurarEsquemaCorrecciones();
    const r = await avisarCorreccion(id);
    if (!r.ok) return res.status(502).json({ error: r.error || 'No se pudo avisar' });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[XPAY-CORRECCION] reenviar:', err.message);
    return res.status(500).json({ error: 'No se pudo reenviar el aviso' });
  }
};
