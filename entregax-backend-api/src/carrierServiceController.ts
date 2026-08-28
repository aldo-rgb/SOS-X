// ============================================
// CONTROLADOR DE OPCIONES DE PAQUETERÍA 📦
// CRUD para carrier_service_options y mapeo a tipos de servicio
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import { isMtyMetroZip } from './mtyMetroController';
import { getExcludedCarriersForZip } from './coverageController';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Tipos de servicio válidos
const VALID_SERVICE_TYPES = ['china_air', 'china_sea', 'usa_pobox', 'dhl', 'mx_national', 'tdi_express'];

// =========================================
// MULTER CONFIG PARA ICONOS DE PAQUETERÍA
// =========================================
const carriersDir = path.join(__dirname, '..', 'uploads', 'carriers');
if (!fs.existsSync(carriersDir)) {
  fs.mkdirSync(carriersDir, { recursive: true });
}

const carrierIconStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, carriersDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const uniqueName = `carrier_${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

export const carrierIconUpload = multer({
  storage: carrierIconStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (png, jpg, gif, webp, svg)'));
    }
  },
});

// =========================================
// POST /api/admin/carrier-options/upload-icon
// Subir imagen de icono para paquetería
// =========================================
export const uploadCarrierIcon = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No se proporcionó imagen' });
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const iconUrl = `${baseUrl}/uploads/carriers/${file.filename}`;
    res.json({ success: true, iconUrl });
  } catch (error: any) {
    console.error('Error uploading carrier icon:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// =========================================
// GET /api/admin/carrier-options
// Lista todas las opciones de paquetería con sus servicios asociados
// =========================================
export const getCarrierOptions = async (req: Request, res: Response) => {
  try {
    // "Por cobrar" se marcó de dos formas distintas y quedaron desalineadas: la
    // pestaña del panel filtra por carrier_type, pero las 8 paqueterías de por
    // cobrar reales (EVISA, PITIC, Tres Guerras, Sendex, Fedex, Estafeta, DHL
    // Express, PQTX Por Cobrar) tienen carrier_type='standard' y allows_collect
    // = TRUE, que es lo que mira la pantalla del cliente. Resultado: la pestaña
    // "Por cobrar" salía vacía y esas paqueterías aparecían en la de estándar.
    // Se filtra por la regla efectiva, la misma que agrupa al cliente.
    const { carrier_type } = req.query;
    const typeFilter = carrier_type
      ? (carrier_type === 'collect'
          ? `WHERE (co.carrier_type = 'collect' OR co.allows_collect = TRUE)`
          : `WHERE (co.carrier_type IS DISTINCT FROM 'collect' AND COALESCE(co.allows_collect, FALSE) = FALSE)`)
      : '';
    const result = await pool.query(`
      SELECT co.*,
        COALESCE(
          (SELECT json_agg(cm.service_type ORDER BY cm.service_type)
           FROM carrier_service_type_map cm
           WHERE cm.carrier_option_id = co.id), '[]'
        ) as service_types
      FROM carrier_service_options co
      ${typeFilter}
      ORDER BY co.priority ASC, co.id ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching carrier options:', error);
    res.status(500).json({ success: false, error: 'Error al obtener opciones de paquetería' });
  }
};

// =========================================
// GET /api/carrier-options/by-service/:serviceType
// Lista opciones de paquetería activas para un tipo de servicio (para clientes)
// =========================================
export const getCarrierOptionsByService = async (req: Request, res: Response) => {
  try {
    const { serviceType } = req.params;
    const zip = (req.query.zip ? String(req.query.zip).trim() : '') || '';
    // Peso del paquete (kg). Si viene, se ocultan las paqueterías con límite de
    // peso menor (ej. Estafeta "Guía de 1 Kilo" con max_weight_kg=1 no debe
    // ofrecerse en paquetes de más de 1 kg).
    const weightRaw = req.query.weight != null ? Number(req.query.weight) : NaN;
    const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : null;

    const result = await pool.query(`
      SELECT co.carrier_key, co.name, co.description, co.price_label, co.subtext, co.icon, co.priority, co.allows_collect, co.max_weight_kg,
             co.price_per_package, co.free_from_qty
      FROM carrier_service_options co
      INNER JOIN carrier_service_type_map cm ON co.id = cm.carrier_option_id
      WHERE cm.service_type = $1
        AND co.is_active = true
        AND ($2::numeric IS NULL OR co.max_weight_kg IS NULL OR co.max_weight_kg >= $2::numeric)
      ORDER BY co.priority ASC
    `, [serviceType, weight]);

    // 🚚 Regla TDX en zona metropolitana de MTY: solo aplica entrega local EntregaX.
    // Se ocultan Paquete Express, Paquete Express Por Cobrar y todas las "por cobrar".
    // TDX se identifica por el serviceType tdi_express O por la bandera ?tdx=1 (el
    // flujo real usa el servicio 'dhl', compartido con AA_DHL, así que el front debe
    // marcar explícitamente cuando el envío es TDX para no afectar a AA_DHL).
    const isTdx = ['tdi_express', 'TDI_EXPRESS', 'tdx'].includes(String(serviceType))
      || ['1', 'true'].includes(String(req.query.tdx || ''));
    if (isTdx && zip && await isMtyMetroZip(zip)) {
      result.rows = result.rows.filter((r: any) =>
        r.allows_collect !== true &&
        (r.carrier_key === 'local' || String(r.carrier_key || '').startsWith('entregax_'))
      );
    }

    // 🚫 Exclusiones por paquetería: ocultar las paqueterías que NO entregan en
    // este CP (configurado en el panel Cobertura → exclusiones por servicio).
    if (zip) {
      const excludedCarriers = await getExcludedCarriersForZip(zip);
      if (excludedCarriers.length) {
        result.rows = result.rows.filter((r: any) => !excludedCarriers.includes(String(r.carrier_key || '')));
      }
    }

    // 🎨 Sobreescribir icon de paqueterías EntregaX con el brand asset activo
    // del slot 'entregax_x_only' (logo X configurado en Settings → Brand Assets).
    let entregaxLogoUrl: string | null = null;
    try {
      const brandRes = await pool.query(
        `SELECT url FROM brand_assets WHERE slot = 'entregax_x_only' AND is_active = TRUE
         ORDER BY created_at DESC LIMIT 1`
      );
      if (brandRes.rows.length > 0) entregaxLogoUrl = brandRes.rows[0].url;
    } catch { /* tabla puede no existir todavía */ }

    const rows = result.rows.map((r: any) => {
      if (entregaxLogoUrl && typeof r.carrier_key === 'string' && r.carrier_key.startsWith('entregax_')) {
        return { ...r, icon: entregaxLogoUrl };
      }
      return r;
    });

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching carrier options by service:', error);
    res.status(500).json({ success: false, error: 'Error al obtener paqueterías' });
  }
};

// =========================================
// POST /api/admin/carrier-options
// Crear nueva opción de paquetería
// =========================================
export const createCarrierOption = async (req: Request, res: Response) => {
  try {
    const { carrier_key, name, description, price_label, subtext, icon, priority, service_types, allows_collect, carrier_type, max_weight_kg, price_per_package, free_from_qty } = req.body;

    if (!carrier_key || !name) {
      return res.status(400).json({ success: false, error: 'carrier_key y name son requeridos' });
    }

    // Verificar que no exista ya
    const existing = await pool.query('SELECT id FROM carrier_service_options WHERE carrier_key = $1', [carrier_key]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Ya existe una paquetería con esa clave' });
    }

    // Las dos banderas se guardan de acuerdo entre sí para que no vuelvan a
    // desalinearse: una paquetería de por cobrar lo es en las dos columnas.
    const esPorCobrar = carrier_type === 'collect' || allows_collect === true;
    const cType = esPorCobrar ? 'collect' : 'standard';
    // max_weight_kg: null / undefined / '' / valores no numéricos = sin límite (NULL).
    const maxWeightNormalized =
      max_weight_kg == null || max_weight_kg === '' || !Number.isFinite(Number(max_weight_kg))
        ? null
        : Number(max_weight_kg);
    // price_per_package: idem, null si no viene número válido.
    const pricePerPackageNormalized =
      price_per_package == null || price_per_package === '' || !Number.isFinite(Number(price_per_package))
        ? null
        : Number(price_per_package);
    // free_from_qty: entero >= 1 o null.
    const freeFromQtyNormalized =
      free_from_qty == null || free_from_qty === '' || !Number.isFinite(Number(free_from_qty)) || Number(free_from_qty) < 1
        ? null
        : Math.floor(Number(free_from_qty));
    const result = await pool.query(`
      INSERT INTO carrier_service_options (carrier_key, name, description, price_label, subtext, icon, priority, allows_collect, carrier_type, max_weight_kg, price_per_package, free_from_qty)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [carrier_key, name, description || null, price_label || null, subtext || null, icon || '🚛', priority || 0, esPorCobrar, cType, maxWeightNormalized, pricePerPackageNormalized, freeFromQtyNormalized]);

    const carrierId = result.rows[0].id;

    // Insertar mapeo de servicios
    if (service_types && Array.isArray(service_types)) {
      for (const svc of service_types) {
        if (VALID_SERVICE_TYPES.includes(svc)) {
          await pool.query(
            'INSERT INTO carrier_service_type_map (carrier_option_id, service_type) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [carrierId, svc]
          );
        }
      }
    }

    // Retornar con service_types
    const full = await pool.query(`
      SELECT co.*,
        COALESCE(
          (SELECT json_agg(cm.service_type ORDER BY cm.service_type)
           FROM carrier_service_type_map cm
           WHERE cm.carrier_option_id = co.id), '[]'
        ) as service_types
      FROM carrier_service_options co
      WHERE co.id = $1
    `, [carrierId]);

    res.json({ success: true, data: full.rows[0] });
  } catch (error) {
    console.error('Error creating carrier option:', error);
    res.status(500).json({ success: false, error: 'Error al crear opción de paquetería' });
  }
};

// =========================================
// PUT /api/admin/carrier-options/:id
// Actualizar opción de paquetería
// =========================================
export const updateCarrierOption = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { carrier_key, name, description, price_label, subtext, icon, is_active, priority, service_types, allows_collect, carrier_type, max_weight_kg, price_per_package, free_from_qty } = req.body;
    // Mismo criterio que al crear: las dos banderas de "por cobrar" van juntas.
    const esPorCobrarUpd = carrier_type === 'collect' || allows_collect === true;

    // Verificar que exista
    const existing = await pool.query('SELECT id FROM carrier_service_options WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Opción de paquetería no encontrada' });
    }

    // Si cambia carrier_key, verificar que no colisione
    if (carrier_key) {
      const collision = await pool.query(
        'SELECT id FROM carrier_service_options WHERE carrier_key = $1 AND id != $2',
        [carrier_key, id]
      );
      if (collision.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Ya existe otra paquetería con esa clave' });
      }
    }

    const cType = carrier_type === 'collect' ? 'collect' : carrier_type === 'standard' ? 'standard' : undefined;
    // max_weight_kg: si viene explícitamente en el body lo usamos (null = sin límite,
    // número = tope). Si el key NO viene, no tocamos la columna (COALESCE).
    let maxWeightForUpdate: number | null | undefined;
    if (Object.prototype.hasOwnProperty.call(req.body, 'max_weight_kg')) {
      if (max_weight_kg == null || max_weight_kg === '' || !Number.isFinite(Number(max_weight_kg))) {
        maxWeightForUpdate = null; // borrar límite explícitamente
      } else {
        maxWeightForUpdate = Number(max_weight_kg);
      }
    } else {
      maxWeightForUpdate = undefined; // no tocar
    }

    // price_per_package y free_from_qty: mismo patrón — solo tocar si el field vino
    // en el body. null = borrar, número = actualizar, undefined = no tocar.
    let pricePerPackageForUpdate: number | null | undefined;
    if (Object.prototype.hasOwnProperty.call(req.body, 'price_per_package')) {
      if (price_per_package == null || price_per_package === '' || !Number.isFinite(Number(price_per_package))) {
        pricePerPackageForUpdate = null;
      } else {
        pricePerPackageForUpdate = Number(price_per_package);
      }
    } else {
      pricePerPackageForUpdate = undefined;
    }
    let freeFromQtyForUpdate: number | null | undefined;
    if (Object.prototype.hasOwnProperty.call(req.body, 'free_from_qty')) {
      if (free_from_qty == null || free_from_qty === '' || !Number.isFinite(Number(free_from_qty)) || Number(free_from_qty) < 1) {
        freeFromQtyForUpdate = null;
      } else {
        freeFromQtyForUpdate = Math.floor(Number(free_from_qty));
      }
    } else {
      freeFromQtyForUpdate = undefined;
    }

    await pool.query(`
      UPDATE carrier_service_options SET
        carrier_key = COALESCE($1, carrier_key),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        price_label = COALESCE($4, price_label),
        subtext = $5,
        icon = COALESCE($6, icon),
        is_active = COALESCE($7, is_active),
        priority = COALESCE($8, priority),
        allows_collect = COALESCE($9, allows_collect),
        carrier_type = COALESCE($10, carrier_type),
        max_weight_kg = CASE WHEN $12::boolean THEN $11::numeric ELSE max_weight_kg END,
        price_per_package = CASE WHEN $14::boolean THEN $13::numeric ELSE price_per_package END,
        free_from_qty = CASE WHEN $16::boolean THEN $15::integer ELSE free_from_qty END,
        updated_at = NOW()
      WHERE id = $17
    `, [
      carrier_key, name, description, price_label,
      subtext !== undefined ? subtext : null, icon, is_active, priority,
      // Ambas banderas se mandan juntas: si viene una, la otra la acompaña.
      (allows_collect === undefined && carrier_type === undefined) ? null : esPorCobrarUpd,
      (allows_collect === undefined && carrier_type === undefined) ? null : (esPorCobrarUpd ? 'collect' : 'standard'),
      maxWeightForUpdate === undefined ? null : maxWeightForUpdate,
      maxWeightForUpdate !== undefined,
      pricePerPackageForUpdate === undefined ? null : pricePerPackageForUpdate,
      pricePerPackageForUpdate !== undefined,
      freeFromQtyForUpdate === undefined ? null : freeFromQtyForUpdate,
      freeFromQtyForUpdate !== undefined,
      id,
    ]);

    // Actualizar mapeo de servicios si se proporcionan
    if (service_types && Array.isArray(service_types)) {
      await pool.query('DELETE FROM carrier_service_type_map WHERE carrier_option_id = $1', [id]);
      for (const svc of service_types) {
        if (VALID_SERVICE_TYPES.includes(svc)) {
          await pool.query(
            'INSERT INTO carrier_service_type_map (carrier_option_id, service_type) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [id, svc]
          );
        }
      }
    }

    // Retornar actualizado
    const full = await pool.query(`
      SELECT co.*,
        COALESCE(
          (SELECT json_agg(cm.service_type ORDER BY cm.service_type)
           FROM carrier_service_type_map cm
           WHERE cm.carrier_option_id = co.id), '[]'
        ) as service_types
      FROM carrier_service_options co
      WHERE co.id = $1
    `, [id]);

    res.json({ success: true, data: full.rows[0] });
  } catch (error) {
    console.error('Error updating carrier option:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar opción de paquetería' });
  }
};

// =========================================
// DELETE /api/admin/carrier-options/:id
// Eliminar opción de paquetería
// =========================================
export const deleteCarrierOption = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM carrier_service_options WHERE id = $1 RETURNING carrier_key', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Opción de paquetería no encontrada' });
    }

    res.json({ success: true, message: `Paquetería '${result.rows[0].carrier_key}' eliminada` });
  } catch (error) {
    console.error('Error deleting carrier option:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar opción de paquetería' });
  }
};

// =========================================
// PATCH /api/admin/carrier-options/:id/toggle
// Activar/desactivar opción de paquetería
// =========================================
export const toggleCarrierOption = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE carrier_service_options 
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1
      RETURNING id, carrier_key, is_active
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Opción de paquetería no encontrada' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error toggling carrier option:', error);
    res.status(500).json({ success: false, error: 'Error al cambiar estado de paquetería' });
  }
};
