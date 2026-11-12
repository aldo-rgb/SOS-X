// ============================================================================
// 📣 RECORDATORIO PARA ACTIVAR CUENTA (tarea 869)
// ============================================================================
// 425 de los 1,109 clientes se registraron, nunca terminaron de verificarse y
// nunca hicieron una sola operación. Ya dieron el primer paso y ahí se
// quedaron; hoy nadie les da seguimiento porque no aparecen en ninguna lista.
//
// Esto le da al asesor, desde "Mis Clientes", un mensaje listo para esa
// persona: recordarle que le falta verificar y empujarla a su primera
// importación.
//
// La promoción va APAGADA hasta que Dirección/Comercial defina qué se ofrece.
// Mientras tanto el recordatorio sale sin promesa de descuento: prometer un
// beneficio que nadie autorizó es peor que no mandar nada. Cuando la enciendan,
// el texto que escriban se pega al mensaje tal cual, sin tocar la app.
// ============================================================================

import { Request, Response } from 'express';
import { pool } from './db';

export const CONFIG_KEY = 'promo_activacion_cuenta';

export interface PromoActivacion {
  activa: boolean;
  texto: string;      // el beneficio, en palabras de Comercial
  vigencia: string;   // "hasta el 31 de diciembre", "los primeros 30 días"…
}

const VACIA: PromoActivacion = { activa: false, texto: '', vigencia: '' };

export async function leerPromo(): Promise<PromoActivacion> {
  try {
    const r = await pool.query(
      `SELECT config_value FROM system_configurations WHERE config_key = $1 LIMIT 1`, [CONFIG_KEY]);
    const v = r.rows[0]?.config_value;
    if (!v) return { ...VACIA };
    const obj = typeof v === 'string' ? JSON.parse(v) : v;
    return {
      activa: obj?.activa === true,
      texto: String(obj?.texto || ''),
      vigencia: String(obj?.vigencia || ''),
    };
  } catch {
    return { ...VACIA };
  }
}

async function guardarPromo(p: PromoActivacion, userId: number | null): Promise<void> {
  await pool.query(
    `INSERT INTO system_configurations (config_key, config_value, description, is_active, updated_at, updated_by)
     VALUES ($1, $2::jsonb, 'Promoción del recordatorio de activación (tarea 869). La define Comercial/Dirección.', TRUE, NOW(), $3)
     ON CONFLICT (config_key) DO UPDATE SET
       config_value = EXCLUDED.config_value,
       is_active = TRUE,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [CONFIG_KEY, JSON.stringify(p), userId]
  );
}

// El primer nombre, que es como se habla por WhatsApp.
const primerNombre = (s: string): string => String(s || '').trim().split(/\s+/)[0] || '';

// ─── El mensaje ──────────────────────────────────────────────────────────────
// Sale de aquí y no de la app para que cambiarlo no dependa de publicar una
// versión: web y móvil piden el texto ya armado.
export function armarMensaje(opts: {
  cliente: string; boxId: string | null; asesor: string; promo: PromoActivacion;
}): string {
  const nombre = primerNombre(opts.cliente);
  const asesor = primerNombre(opts.asesor);
  const casillero = opts.boxId ? ` Tu casillero es *${opts.boxId}*.` : '';

  let msg = `Hola ${nombre}, soy ${asesor} de EntregaX.${casillero}\n\n`
    + `Vi que ya hiciste tu registro, pero te falta terminar la verificación de tu cuenta `
    + `y por eso todavía no puedes mover tu primer envío. Es rápido: desde la app subes tu `
    + `identificación y queda lista.`;

  if (opts.promo.activa && opts.promo.texto.trim()) {
    msg += `\n\n🎁 ${opts.promo.texto.trim()}`;
    if (opts.promo.vigencia.trim()) msg += ` (${opts.promo.vigencia.trim()})`;
  }

  msg += `\n\n¿Te ayudo a terminarla hoy?`;
  return msg;
}

// ============================================================================
// GET /api/admin/promo-activacion
// ============================================================================
export const obtenerPromoActivacion = async (_req: Request, res: Response): Promise<any> => {
  try {
    res.json({ success: true, data: await leerPromo() });
  } catch (error: any) {
    console.error('Error obtenerPromoActivacion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// PUT /api/admin/promo-activacion
// ============================================================================
export const guardarPromoActivacion = async (req: Request, res: Response): Promise<any> => {
  try {
    const b = req.body || {};
    const promo: PromoActivacion = {
      activa: b.activa === true,
      texto: String(b.texto || '').trim(),
      vigencia: String(b.vigencia || '').trim(),
    };
    // Encender la promoción sin decir qué se ofrece dejaría el mensaje con un
    // regalo vacío.
    if (promo.activa && !promo.texto) {
      return res.status(400).json({ success: false, error: 'Para encender la promoción hay que escribir qué se ofrece' });
    }
    await guardarPromo(promo, (req as any).user?.userId || (req as any).user?.id || null);
    res.json({ success: true, data: promo });
  } catch (error: any) {
    console.error('Error guardarPromoActivacion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// GET /api/advisor/clients/:clientId/mensaje-activacion
// El asesor pide el mensaje ya armado para ESE cliente.
// ============================================================================
export const mensajeActivacionCliente = async (req: Request, res: Response): Promise<any> => {
  try {
    // El token solo trae userId/email/role: el nombre del asesor se consulta.
    const advisorId = (req as any).user?.userId || (req as any).user?.id || null;
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });
    const clientId = Number(req.params.clientId);
    const asesorRow = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [advisorId]);
    const asesorNombre = asesorRow.rows[0]?.full_name || '';

    // El mismo alcance que el resto del panel: sus clientes y los de su equipo.
    const r = await pool.query(
      `SELECT c.id, c.full_name, c.box_id, c.phone,
              (c.is_verified = true OR LOWER(COALESCE(c.verification_status,'')) IN ('verified','approved')) AS verificado,
              ((SELECT COUNT(*) FROM packages p WHERE p.user_id = c.id) +
               (SELECT COUNT(*) FROM maritime_orders mo WHERE mo.user_id = c.id) +
               (SELECT COUNT(*) FROM dhl_shipments ds WHERE ds.user_id = c.id))::int AS operaciones
         FROM users c
        WHERE c.id = $1 AND c.role = 'client'
          AND ( c.advisor_id = $2 OR c.referred_by_id = $2
                OR EXISTS (SELECT 1 FROM users s
                            WHERE s.id = COALESCE(c.advisor_id, c.referred_by_id)
                              AND (s.advisor_id = $2 OR s.referred_by_id = $2)))`,
      [clientId, advisorId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Ese cliente no está en tu cartera' });
    const c = r.rows[0];

    const promo = await leerPromo();
    const mensaje = armarMensaje({
      cliente: c.full_name,
      boxId: c.box_id,
      asesor: asesorNombre,
      promo,
    });

    res.json({
      success: true,
      mensaje,
      telefono: c.phone || null,
      // Para que la pantalla avise si ya no hace falta mandarlo: el cliente
      // pudo verificarse o mover su primer envío entre la carga y el clic.
      aplica: !c.verificado && Number(c.operaciones) === 0,
      verificado: !!c.verificado,
      operaciones: Number(c.operaciones),
      promo_activa: promo.activa && !!promo.texto,
    });
  } catch (error: any) {
    console.error('Error mensajeActivacionCliente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
