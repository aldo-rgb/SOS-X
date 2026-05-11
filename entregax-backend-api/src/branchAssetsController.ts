/**
 * branchAssetsController.ts
 *
 * Inventario Global de Activos por Sucursal.
 *
 * Cada artículo (laptop, escáner, mobiliario, etc.) se registra con:
 *   - SKU único (ej. MTY-SC-001)
 *   - categoría (Equipo de Cómputo, Mobiliario, Periféricos, Telefonía)
 *   - sucursal asignada (FK branches.id)
 *   - marca / modelo / S/N
 *   - status (Nuevo, Excelente, Desgastado, En Reparación, De Baja)
 *   - responsable (FK users.id, nullable — laptops/celulares asignados a alguien)
 *   - fecha de adquisición + costo (para depreciación)
 *   - foto del equipo + PDF de factura
 *
 * El endpoint GET /:id es PÚBLICO (sin auth) porque alimenta el QR
 * pegado al equipo — cualquier supervisor escanea y ve la ficha
 * técnica al instante.
 */

import { Request, Response } from 'express';
import { pool } from './db';
import { uploadToS3 } from './s3Service';

// ============================================
// Migración lazy: corre la primera vez que el
// controller atiende un request.
// ============================================
let migrationDone = false;
const ensureTable = async (): Promise<void> => {
    if (migrationDone) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS branch_assets (
                id              SERIAL PRIMARY KEY,
                sku             VARCHAR(64) UNIQUE NOT NULL,
                category        VARCHAR(64) NOT NULL,
                branch_id       INTEGER REFERENCES branches(id) ON DELETE SET NULL,
                brand           VARCHAR(120),
                model           VARCHAR(120),
                serial_number   VARCHAR(120),
                status          VARCHAR(32) NOT NULL DEFAULT 'nuevo',
                assigned_to_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                acquisition_date DATE,
                acquisition_cost NUMERIC(12,2),
                photo_url       TEXT,
                invoice_url     TEXT,
                notes           TEXT,
                created_at      TIMESTAMPTZ DEFAULT NOW(),
                updated_at      TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_branch_assets_branch ON branch_assets(branch_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_branch_assets_category ON branch_assets(category)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_branch_assets_status ON branch_assets(status)`);
        migrationDone = true;
    } catch (err) {
        console.error('[branchAssets] migration error:', err);
    }
};

// ============================================
// GET /api/admin/branch-assets
// Filtros opcionales: ?branch_id=X&category=Y&status=Z&q=texto
// ============================================
export const listAssets = async (req: Request, res: Response): Promise<any> => {
    try {
        await ensureTable();
        const branchId = req.query.branch_id ? parseInt(String(req.query.branch_id)) : null;
        const category = req.query.category ? String(req.query.category) : null;
        const status = req.query.status ? String(req.query.status) : null;
        const q = req.query.q ? String(req.query.q).trim() : null;

        const params: any[] = [];
        const where: string[] = [];
        if (branchId) {
            params.push(branchId);
            where.push(`a.branch_id = $${params.length}`);
        }
        if (category) {
            params.push(category);
            where.push(`LOWER(a.category) = LOWER($${params.length})`);
        }
        if (status) {
            params.push(status);
            where.push(`LOWER(a.status) = LOWER($${params.length})`);
        }
        if (q) {
            params.push(`%${q.toLowerCase()}%`);
            const idx = params.length;
            where.push(`(LOWER(a.sku) LIKE $${idx} OR LOWER(a.brand) LIKE $${idx} OR LOWER(a.model) LIKE $${idx} OR LOWER(a.serial_number) LIKE $${idx})`);
        }

        const result = await pool.query(`
            SELECT a.*,
                   b.name AS branch_name, b.code AS branch_code,
                   u.full_name AS assigned_to_name, u.email AS assigned_to_email
            FROM branch_assets a
            LEFT JOIN branches b ON a.branch_id = b.id
            LEFT JOIN users u ON a.assigned_to_user_id = u.id
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY a.created_at DESC
            LIMIT 500
        `, params);

        return res.json(result.rows);
    } catch (err: any) {
        console.error('[branchAssets] list error:', err);
        return res.status(500).json({ error: err.message || 'Error al listar activos' });
    }
};

// ============================================
// GET /api/branch-assets/:id (público — para QR landing)
// ============================================
export const getAssetById = async (req: Request, res: Response): Promise<any> => {
    try {
        await ensureTable();
        const id = parseInt(String(req.params.id || ''));
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const r = await pool.query(`
            SELECT a.*,
                   b.name AS branch_name, b.code AS branch_code, b.city AS branch_city,
                   u.full_name AS assigned_to_name, u.email AS assigned_to_email
            FROM branch_assets a
            LEFT JOIN branches b ON a.branch_id = b.id
            LEFT JOIN users u ON a.assigned_to_user_id = u.id
            WHERE a.id = $1
            LIMIT 1
        `, [id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Activo no encontrado' });
        return res.json(r.rows[0]);
    } catch (err: any) {
        console.error('[branchAssets] getById error:', err);
        return res.status(500).json({ error: err.message || 'Error' });
    }
};

// ============================================
// POST /api/admin/branch-assets
// ============================================
export const createAsset = async (req: Request, res: Response): Promise<any> => {
    try {
        await ensureTable();
        const {
            sku, category, branch_id,
            brand, model, serial_number,
            status, assigned_to_user_id,
            acquisition_date, acquisition_cost,
            photo_url, invoice_url, notes,
        } = req.body || {};

        if (!sku || !category) {
            return res.status(400).json({ error: 'SKU y categoría son requeridos' });
        }

        const r = await pool.query(`
            INSERT INTO branch_assets
                (sku, category, branch_id, brand, model, serial_number,
                 status, assigned_to_user_id, acquisition_date, acquisition_cost,
                 photo_url, invoice_url, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            String(sku).trim().toUpperCase(),
            category,
            branch_id || null,
            brand || null,
            model || null,
            serial_number || null,
            status || 'nuevo',
            assigned_to_user_id || null,
            acquisition_date || null,
            acquisition_cost != null ? Number(acquisition_cost) : null,
            photo_url || null,
            invoice_url || null,
            notes || null,
        ]);

        return res.status(201).json(r.rows[0]);
    } catch (err: any) {
        console.error('[branchAssets] create error:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Ese SKU ya está registrado' });
        }
        return res.status(500).json({ error: err.message || 'Error al crear activo' });
    }
};

// ============================================
// PUT /api/admin/branch-assets/:id
// ============================================
export const updateAsset = async (req: Request, res: Response): Promise<any> => {
    try {
        await ensureTable();
        const id = parseInt(String(req.params.id || ''));
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const {
            sku, category, branch_id,
            brand, model, serial_number,
            status, assigned_to_user_id,
            acquisition_date, acquisition_cost,
            photo_url, invoice_url, notes,
        } = req.body || {};

        const r = await pool.query(`
            UPDATE branch_assets SET
                sku = COALESCE($1, sku),
                category = COALESCE($2, category),
                branch_id = $3,
                brand = $4,
                model = $5,
                serial_number = $6,
                status = COALESCE($7, status),
                assigned_to_user_id = $8,
                acquisition_date = $9,
                acquisition_cost = $10,
                photo_url = COALESCE($11, photo_url),
                invoice_url = COALESCE($12, invoice_url),
                notes = $13,
                updated_at = NOW()
            WHERE id = $14
            RETURNING *
        `, [
            sku ? String(sku).trim().toUpperCase() : null,
            category || null,
            branch_id || null,
            brand || null,
            model || null,
            serial_number || null,
            status || null,
            assigned_to_user_id || null,
            acquisition_date || null,
            acquisition_cost != null ? Number(acquisition_cost) : null,
            photo_url || null,
            invoice_url || null,
            notes || null,
            id,
        ]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Activo no encontrado' });
        return res.json(r.rows[0]);
    } catch (err: any) {
        console.error('[branchAssets] update error:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Ese SKU ya está registrado en otro activo' });
        }
        return res.status(500).json({ error: err.message || 'Error al actualizar activo' });
    }
};

// ============================================
// DELETE /api/admin/branch-assets/:id
// ============================================
export const deleteAsset = async (req: Request, res: Response): Promise<any> => {
    try {
        await ensureTable();
        const id = parseInt(String(req.params.id || ''));
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const r = await pool.query(`DELETE FROM branch_assets WHERE id = $1 RETURNING id`, [id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Activo no encontrado' });
        return res.json({ ok: true });
    } catch (err: any) {
        console.error('[branchAssets] delete error:', err);
        return res.status(500).json({ error: err.message || 'Error al eliminar activo' });
    }
};

// ============================================
// POST /api/admin/branch-assets/upload
// Body: { dataUrl: "data:image/png;base64,..." , kind: "photo" | "invoice" }
// Devuelve { url } pública S3
// ============================================
export const uploadAssetFile = async (req: Request, res: Response): Promise<any> => {
    try {
        const { dataUrl, kind } = req.body || {};
        if (!dataUrl || typeof dataUrl !== 'string') {
            return res.status(400).json({ error: 'dataUrl es requerido' });
        }
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match || !match[1] || !match[2]) {
            return res.status(400).json({ error: 'dataUrl debe ser base64' });
        }
        const contentType = match[1];
        const buffer = Buffer.from(match[2], 'base64');
        const ext = contentType.split('/')[1] || 'bin';
        const safeKind = kind === 'invoice' ? 'invoice' : 'photo';
        const key = `branch-assets/${safeKind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const url = await uploadToS3(buffer, key, contentType);
        return res.json({ url });
    } catch (err: any) {
        console.error('[branchAssets] upload error:', err);
        return res.status(500).json({ error: err.message || 'Error al subir archivo' });
    }
};
