// ============================================================================
// 🎁 CONTROL DE KIT DE BIENVENIDA
// ============================================================================
// Gestiona los kits de bienvenida (báscula digital + PO Box) que se envían a
// prospectos/clientes. Aquí se ve quién lo solicitó y a dónde enviarlo.
//
// Visión del proceso (se irá completando):
//  - El usuario ve en su app un "regalo pendiente" y captura instrucciones de envío.
//  - Se simula una guía desde USA (tracking simulado) para la experiencia del cliente.
//  - El envío REAL sale desde CEDIS MTY ~2 días después, con guía de Estafeta por cobrar.
//
// Estados: solicitado → instrucciones → por_enviar → enviado → entregado (o cancelado)
// ============================================================================

import { Request, Response } from 'express';
import { pool } from './db';
import { uploadToS3, isS3Configured, getSignedUrlForKey } from './s3Service';

// ============================================================================
// 🛍️ CATÁLOGO DE REGALOS (mini-tienda con inventario)
// ============================================================================
let productsReady = false;
async function ensureProductsSchema(): Promise<void> {
  if (productsReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS welcome_kit_products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      video_url TEXT,
      stock INTEGER DEFAULT 0,
      photos JSONB DEFAULT '[]'::jsonb,   -- array de keys de S3 (máx. 5)
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  productsReady = true;
}

// Firma cada key de S3 → URL visible. Acepta keys o {key,url}.
async function signPhotos(photos: any): Promise<Array<{ key: string; url: string | null }>> {
  const arr: any[] = Array.isArray(photos) ? photos : [];
  const out: Array<{ key: string; url: string | null }> = [];
  for (const p of arr) {
    const key = typeof p === 'string' ? p : (p?.key || '');
    if (!key) continue;
    let url: string | null = null;
    try { url = await getSignedUrlForKey(key, 6 * 3600); } catch { /* ignore */ }
    out.push({ key, url });
  }
  return out;
}

// GET /api/admin/welcome-kit/products
export const getKitProducts = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureProductsSchema();
    const onlyActive = String(req.query.active || '') === '1';
    const r = await pool.query(
      `SELECT * FROM welcome_kit_products ${onlyActive ? 'WHERE is_active = true' : ''} ORDER BY sort_order ASC, id DESC`
    );
    const data = await Promise.all(r.rows.map(async (p: any) => ({ ...p, photos: await signPhotos(p.photos) })));
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error getKitProducts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/admin/welcome-kit/products/upload-photo (multipart "file")
export const uploadKitProductPhoto = async (req: Request, res: Response): Promise<any> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !file.buffer) return res.status(400).json({ success: false, error: 'No se recibió imagen' });
    const mime = (file.mimetype || '').toLowerCase();
    if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
      return res.status(400).json({ success: false, error: 'La imagen debe ser JPG, PNG o WEBP' });
    }
    if (!isS3Configured()) return res.status(500).json({ success: false, error: 'Almacenamiento no configurado (S3)' });
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const key = `kit-products/foto-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    await uploadToS3(file.buffer, key, mime);
    let url: string | null = null;
    try { url = await getSignedUrlForKey(key, 6 * 3600); } catch { /* ignore */ }
    res.json({ success: true, key, url });
  } catch (error: any) {
    console.error('Error uploadKitProductPhoto:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const cleanPhotos = (photos: any): string[] => {
  const arr = Array.isArray(photos) ? photos : [];
  return arr.map((p: any) => (typeof p === 'string' ? p : p?.key)).filter(Boolean).slice(0, 5);
};

// POST /api/admin/welcome-kit/products
export const createKitProduct = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureProductsSchema();
    const b = req.body || {};
    if (!String(b.name || '').trim()) return res.status(400).json({ success: false, error: 'Falta el nombre del producto' });
    const r = await pool.query(
      `INSERT INTO welcome_kit_products (name, description, video_url, stock, photos, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id`,
      [String(b.name).trim(), b.description || null, b.video_url || null, parseInt(String(b.stock), 10) || 0,
       JSON.stringify(cleanPhotos(b.photos)), b.is_active !== false, parseInt(String(b.sort_order), 10) || 0]
    );
    res.json({ success: true, id: r.rows[0].id });
  } catch (error: any) {
    console.error('Error createKitProduct:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/admin/welcome-kit/products/:id
export const updateKitProduct = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureProductsSchema();
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
    const b = req.body || {};
    if (!String(b.name || '').trim()) return res.status(400).json({ success: false, error: 'Falta el nombre del producto' });
    await pool.query(
      `UPDATE welcome_kit_products
          SET name=$1, description=$2, video_url=$3, stock=$4, photos=$5::jsonb, is_active=$6, sort_order=$7, updated_at=NOW()
        WHERE id=$8`,
      [String(b.name).trim(), b.description || null, b.video_url || null, parseInt(String(b.stock), 10) || 0,
       JSON.stringify(cleanPhotos(b.photos)), b.is_active !== false, parseInt(String(b.sort_order), 10) || 0, id]
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updateKitProduct:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /api/admin/welcome-kit/products/:id
export const deleteKitProduct = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureProductsSchema();
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
    await pool.query(`DELETE FROM welcome_kit_products WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleteKitProduct:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

let schemaReady = false;
export async function ensureWelcomeKitSchema(): Promise<void> { return ensureSchema(); }
// Crea una solicitud de kit desde un clic en "Reclamar Regalo" (idempotente por lead_key).
export async function createKitRequestFromClick(leadKey: string, name: string | null, phone: string | null): Promise<void> {
  try {
    await ensureSchema();
    await pool.query(
      `INSERT INTO welcome_kit_requests (lead_key, full_name, phone, status)
       SELECT $1, $2, $3, 'solicitado'
        WHERE NOT EXISTS (SELECT 1 FROM welcome_kit_requests WHERE lead_key = $1)`,
      [leadKey, name || 'Cliente', phone]
    );
  } catch (e) { console.warn('[KIT] createKitRequestFromClick:', (e as Error).message); }
}
async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS welcome_kit_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      lead_key TEXT,
      full_name TEXT,
      phone TEXT,
      email TEXT,
      box_id TEXT,
      -- Instrucciones de envío (las captura el cliente o el agente)
      ship_name TEXT,
      ship_phone TEXT,
      ship_address TEXT,
      ship_city TEXT,
      ship_state TEXT,
      ship_zip TEXT,
      ship_references TEXT,
      -- Logística
      status TEXT DEFAULT 'solicitado',
      usa_tracking TEXT,        -- guía simulada "desde USA"
      estafeta_tracking TEXT,   -- guía real Estafeta (por cobrar) desde CEDIS MTY
      notes TEXT,
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wkr_status ON welcome_kit_requests(status);`).catch(() => {});
  schemaReady = true;
}

const VALID_STATUSES = ['solicitado', 'instrucciones', 'por_enviar', 'enviado', 'entregado', 'cancelado'];

// GET /api/admin/welcome-kit → lista + stats
export const getWelcomeKits = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const { status, search } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (status && status !== 'all') { conditions.push(`k.status = $${i++}`); params.push(status); }
    if (search) {
      conditions.push(`(k.full_name ILIKE $${i} OR k.phone ILIKE $${i} OR k.email ILIKE $${i} OR k.box_id ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const list = await pool.query(
      `SELECT k.*, adv.full_name AS advisor_name
         FROM welcome_kit_requests k
         LEFT JOIN users adv ON k.user_id = adv.id
         ${where}
        ORDER BY k.requested_at DESC`,
      params
    );
    const statsRes = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'solicitado')   AS solicitado,
        COUNT(*) FILTER (WHERE status = 'instrucciones') AS instrucciones,
        COUNT(*) FILTER (WHERE status = 'por_enviar')    AS por_enviar,
        COUNT(*) FILTER (WHERE status = 'enviado')       AS enviado,
        COUNT(*) FILTER (WHERE status = 'entregado')     AS entregado,
        COUNT(*) FILTER (WHERE status = 'cancelado')     AS cancelado,
        COUNT(*) AS total
      FROM welcome_kit_requests
    `);
    const s = statsRes.rows[0];
    const stats = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)]));
    res.json({ success: true, data: list.rows, stats });
  } catch (error: any) {
    console.error('Error getWelcomeKits:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/admin/welcome-kit → crear (agregar manualmente a alguien)
export const createWelcomeKit = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const b = req.body || {};
    if (!String(b.full_name || '').trim()) {
      return res.status(400).json({ success: false, error: 'Falta el nombre' });
    }
    const r = await pool.query(
      `INSERT INTO welcome_kit_requests
         (user_id, lead_key, full_name, phone, email, box_id, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        b.user_id || null, b.lead_key || null, String(b.full_name).trim(),
        b.phone || null, b.email || null, b.box_id || null,
        VALID_STATUSES.includes(b.status) ? b.status : 'solicitado', b.notes || null,
      ]
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (error: any) {
    console.error('Error createWelcomeKit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/admin/welcome-kit/:id → actualizar (estado, instrucciones de envío, guías)
export const updateWelcomeKit = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
    const b = req.body || {};
    // Solo se actualizan los campos presentes (COALESCE con el valor actual).
    const fields: Record<string, any> = {
      full_name: b.full_name, phone: b.phone, email: b.email, box_id: b.box_id,
      ship_name: b.ship_name, ship_phone: b.ship_phone, ship_address: b.ship_address,
      ship_city: b.ship_city, ship_state: b.ship_state, ship_zip: b.ship_zip,
      ship_references: b.ship_references, usa_tracking: b.usa_tracking,
      estafeta_tracking: b.estafeta_tracking, notes: b.notes,
    };
    if (b.status !== undefined) {
      if (!VALID_STATUSES.includes(b.status)) return res.status(400).json({ success: false, error: 'estado inválido' });
      fields.status = b.status;
    }
    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { sets.push(`${k} = $${i++}`); params.push(v); }
    }
    if (sets.length === 0) return res.json({ success: true });
    sets.push(`updated_at = NOW()`);
    params.push(id);
    const r = await pool.query(
      `UPDATE welcome_kit_requests SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (error: any) {
    console.error('Error updateWelcomeKit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /api/admin/welcome-kit/:id
export const deleteWelcomeKit = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
    await pool.query(`DELETE FROM welcome_kit_requests WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleteWelcomeKit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
