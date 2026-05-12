// ============================================
// BRAND ASSETS CONTROLLER
// Gestión centralizada de logos corporativos
// (EntregaX completo blanco/negro, X solo, X-Pay completo blanco/negro, X-Pay solo)
// ============================================

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { pool } from './db';
import { uploadToS3, isS3Configured, getSignedUrlForKey } from './s3Service';

// ============================================
// Helper: si la URL apunta a S3 (bucket privado), generar URL firmada
// ============================================
const SIGNED_URL_TTL = 60 * 60 * 6; // 6 horas
const resolveAssetUrl = async (row: { url?: string | null; storage_key?: string | null }) => {
  const url = row?.url || '';
  // Solo firmamos si tenemos storage_key (key dentro del bucket) y la URL apunta a S3
  if (row?.storage_key && /amazonaws\.com/.test(url)) {
    try {
      // storage_key local es '/uploads/...' — descartamos esos casos
      if (row.storage_key.startsWith('/uploads/')) return url;
      return await getSignedUrlForKey(row.storage_key, SIGNED_URL_TTL);
    } catch (e) {
      console.warn('⚠️ resolveAssetUrl: no se pudo firmar', row.storage_key, e);
      return url;
    }
  }
  return url;
};

// ============================================
// Slots permitidos (categorías de logo)
// ============================================
export const BRAND_SLOTS = [
  'entregax_full_white',  // EntregaX completo en blanco
  'entregax_full_black',  // EntregaX completo en negro
  'entregax_x_only',      // Solo la "X" de EntregaX
  'xpay_full_white',      // X-Pay completo en blanco
  'xpay_full_black',      // X-Pay completo en negro
  'xpay_only',            // Solo el icono X-Pay
] as const;

export type BrandSlot = (typeof BRAND_SLOTS)[number];

const SLOT_LABELS: Record<BrandSlot, string> = {
  entregax_full_white: 'EntregaX · Logo completo (Blanco)',
  entregax_full_black: 'EntregaX · Logo completo (Negro)',
  entregax_x_only:     'EntregaX · Solo la X',
  xpay_full_white:     'X-Pay · Logo completo (Blanco)',
  xpay_full_black:     'X-Pay · Logo completo (Negro)',
  xpay_only:           'X-Pay · Solo icono',
};

// ============================================
// Asegurar tabla (auto-create idempotente)
// ============================================
let tableReady = false;
const ensureTable = async () => {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brand_assets (
      id           SERIAL PRIMARY KEY,
      slot         VARCHAR(64) NOT NULL,
      filename     VARCHAR(255) NOT NULL,
      url          TEXT NOT NULL,
      storage_key  TEXT,
      mime_type    VARCHAR(64),
      size_bytes   BIGINT,
      is_active    BOOLEAN DEFAULT FALSE,
      uploaded_by  INTEGER,
      notes        TEXT,
      created_at   TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_brand_assets_slot ON brand_assets(slot);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_brand_assets_active ON brand_assets(slot, is_active);`);
  tableReady = true;
};

// ============================================
// GET /api/admin/brand-assets
// Lista todos los logos agrupados por slot
// ============================================
export const listBrandAssets = async (_req: Request, res: Response) => {
  try {
    await ensureTable();
    const result = await pool.query(
      `SELECT id, slot, filename, url, storage_key, mime_type, size_bytes,
              is_active, uploaded_by, notes, created_at
         FROM brand_assets
         ORDER BY slot ASC, created_at DESC`
    );

    // Agrupar por slot, incluyendo slots vacíos
    const grouped: Record<string, any> = {};
    for (const slot of BRAND_SLOTS) {
      grouped[slot] = {
        slot,
        label: SLOT_LABELS[slot],
        active: null as any,
        history: [] as any[],
      };
    }
    for (const row of result.rows) {
      if (!grouped[row.slot]) {
        grouped[row.slot] = { slot: row.slot, label: row.slot, active: null, history: [] };
      }
      // Reemplazar url por una versión firmada si está en S3
      const signed = await resolveAssetUrl(row);
      const enriched = { ...row, url: signed };
      grouped[row.slot].history.push(enriched);
      if (row.is_active && !grouped[row.slot].active) {
        grouped[row.slot].active = enriched;
      }
    }

    return res.json({
      success: true,
      slots: Object.values(grouped),
      allowed_slots: BRAND_SLOTS,
      slot_labels: SLOT_LABELS,
    });
  } catch (err: any) {
    console.error('❌ listBrandAssets:', err);
    return res.status(500).json({ success: false, message: 'Error al listar logos', error: err.message });
  }
};

// ============================================
// GET /api/brand-assets/active
// Endpoint público — devuelve el logo activo de cada slot
// ============================================
export const getActiveBrandAssets = async (_req: Request, res: Response) => {
  try {
    await ensureTable();
    const result = await pool.query(
      `SELECT DISTINCT ON (slot) id, slot, url, storage_key, filename, created_at
         FROM brand_assets
         WHERE is_active = TRUE
         ORDER BY slot ASC, created_at DESC`
    );
    const assets: Record<string, any> = {};
    for (const row of result.rows) {
      const signed = await resolveAssetUrl(row);
      assets[row.slot] = { id: row.id, url: signed, filename: row.filename, updated_at: row.created_at };
    }
    return res.json({ success: true, assets });
  } catch (err: any) {
    console.error('❌ getActiveBrandAssets:', err);
    return res.status(500).json({ success: false, message: 'Error', error: err.message });
  }
};

// ============================================
// POST /api/admin/brand-assets/upload
// Body multipart: field "file" + field "slot"
// ============================================
export const uploadBrandAsset = async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const file = (req as any).file as Express.Multer.File | undefined;
    const slot = String((req.body?.slot || '') as string).trim();
    const notes = (req.body?.notes ? String(req.body.notes) : null) as string | null;
    const setActive = String(req.body?.set_active ?? 'true') !== 'false';

    if (!file) {
      return res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });
    }
    if (!BRAND_SLOTS.includes(slot as BrandSlot)) {
      return res.status(400).json({
        success: false,
        message: `Slot inválido. Permitidos: ${BRAND_SLOTS.join(', ')}`,
      });
    }

    const userId = (req as any).user?.userId || (req as any).user?.id || null;
    const ext = (path.extname(file.originalname) || '.png').toLowerCase();
    const ts = Date.now();
    const filename = `${slot}-${ts}${ext}`;

    let publicUrl: string;
    let storageKey: string | null = null;

    if (isS3Configured() && file.buffer) {
      storageKey = `brand-assets/${slot}/${filename}`;
      publicUrl = await uploadToS3(file.buffer, storageKey, file.mimetype || 'image/png');
    } else {
      // Fallback a almacenamiento local en /uploads/brand-assets
      const dir = path.join(process.cwd(), 'uploads', 'brand-assets');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const destPath = path.join(dir, filename);
      if (file.buffer) {
        fs.writeFileSync(destPath, file.buffer);
      } else if ((file as any).path) {
        fs.copyFileSync((file as any).path, destPath);
      }
      publicUrl = `/uploads/brand-assets/${filename}`;
      storageKey = publicUrl;
    }

    // Si se marca como activo, desactivar otros del mismo slot
    if (setActive) {
      await pool.query(`UPDATE brand_assets SET is_active = FALSE WHERE slot = $1`, [slot]);
    }

    const inserted = await pool.query(
      `INSERT INTO brand_assets
         (slot, filename, url, storage_key, mime_type, size_bytes, is_active, uploaded_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        slot,
        file.originalname,
        publicUrl,
        storageKey,
        file.mimetype || null,
        file.size || null,
        setActive,
        userId,
        notes,
      ]
    );

    return res.json({
      success: true,
      message: 'Logo subido correctamente',
      asset: inserted.rows[0],
    });
  } catch (err: any) {
    console.error('❌ uploadBrandAsset:', err);
    return res.status(500).json({ success: false, message: 'Error al subir logo', error: err.message });
  }
};

// ============================================
// POST /api/admin/brand-assets/:id/activate
// Marca un logo del historial como activo para su slot
// ============================================
export const activateBrandAsset = async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const id = parseInt(String(req.params.id || ''), 10);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido' });

    const existing = await pool.query(`SELECT slot FROM brand_assets WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Logo no encontrado' });
    }
    const slot = existing.rows[0].slot;
    await pool.query(`UPDATE brand_assets SET is_active = FALSE WHERE slot = $1`, [slot]);
    const updated = await pool.query(
      `UPDATE brand_assets SET is_active = TRUE WHERE id = $1 RETURNING *`,
      [id]
    );

    return res.json({ success: true, message: 'Logo activado', asset: updated.rows[0] });
  } catch (err: any) {
    console.error('❌ activateBrandAsset:', err);
    return res.status(500).json({ success: false, message: 'Error al activar logo', error: err.message });
  }
};

// ============================================
// DELETE /api/admin/brand-assets/:id
// Elimina del historial (no borra del storage)
// ============================================
export const deleteBrandAsset = async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const id = parseInt(String(req.params.id || ''), 10);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido' });
    await pool.query(`DELETE FROM brand_assets WHERE id = $1`, [id]);
    return res.json({ success: true, message: 'Logo eliminado del historial' });
  } catch (err: any) {
    console.error('❌ deleteBrandAsset:', err);
    return res.status(500).json({ success: false, message: 'Error al eliminar logo', error: err.message });
  }
};
