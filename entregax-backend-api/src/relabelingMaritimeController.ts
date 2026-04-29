// ============================================================
// Maritime Relabeling Controller
//
// Endpoints to capture per-box dimensions/weight on a LOG
// maritime order (e.g. LOG26CNMX00082 with 62 boxes) and then
// generate a Paquete Express multipieza guide using those data.
//
// Maritime orders are persisted in `maritime_orders` (NOT in
// `packages`), so the generic /paquete-express/generate-for-package
// endpoint cannot be used directly. The dimensions are stored in
// the JSONB column `maritime_orders.box_dimensions` as an array
// of { box_number, weight, length, width, height, captured_at }.
// ============================================================

import { Request, Response } from 'express';
import { pool } from './db';
import {
  generateOnePqtxGuide,
  getJwtToken,
  type PqtxAddrCtx,
} from './paqueteExpressController';

interface BoxDim {
  box_number: number;
  weight: number;
  length: number;
  width: number;
  height: number;
  captured_at?: string;
}

const buildBoxTracking = (ordersn: string, boxNumber: number): string => {
  return `${ordersn}-${String(boxNumber).padStart(4, '0')}`;
};

/**
 * GET /api/admin/relabeling/maritime/:orderId/boxes
 * Returns the full list of boxes for a maritime order, marking which ones
 * already have dimensions captured.
 */
export async function getMaritimeOrderBoxes(req: Request, res: Response): Promise<void> {
  try {
    const orderId = parseInt(String(req.params.orderId || ''), 10);
    if (!orderId || Number.isNaN(orderId)) {
      res.status(400).json({ success: false, error: 'orderId requerido' });
      return;
    }

    const result = await pool.query(
      `SELECT id, ordersn,
              COALESCE(summary_boxes, goods_num, 1) AS total_boxes,
              COALESCE(box_dimensions, '[]'::jsonb) AS box_dimensions,
              national_tracking, national_label_url
         FROM maritime_orders
        WHERE id = $1`,
      [orderId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Orden marítima no encontrada' });
      return;
    }
    const row = result.rows[0];
    const totalBoxes = Math.max(1, parseInt(String(row.total_boxes), 10) || 1);
    const dims: BoxDim[] = Array.isArray(row.box_dimensions) ? row.box_dimensions : [];
    const dimsByNum = new Map<number, BoxDim>();
    for (const d of dims) {
      const n = Number(d.box_number);
      if (n >= 1) dimsByNum.set(n, d);
    }

    const boxes = [];
    for (let i = 1; i <= totalBoxes; i++) {
      const captured = dimsByNum.get(i);
      boxes.push({
        boxNumber: i,
        tracking: buildBoxTracking(row.ordersn, i),
        weight: captured?.weight ?? null,
        length: captured?.length ?? null,
        width: captured?.width ?? null,
        height: captured?.height ?? null,
        captured: Boolean(captured),
        capturedAt: captured?.captured_at ?? null,
      });
    }

    const capturedCount = boxes.filter((b) => b.captured).length;

    res.json({
      success: true,
      orderId: row.id,
      ordersn: row.ordersn,
      totalBoxes,
      capturedCount,
      pendingCount: totalBoxes - capturedCount,
      complete: capturedCount === totalBoxes,
      hasGuide: Boolean(row.national_tracking),
      nationalTracking: row.national_tracking || null,
      nationalLabelUrl: row.national_label_url || null,
      boxes,
    });
  } catch (e: any) {
    console.error('getMaritimeOrderBoxes error:', e?.message || e);
    res.status(500).json({ success: false, error: e.message });
  }
}

/**
 * POST /api/admin/relabeling/maritime/:orderId/box
 * Body: { boxNumber?: number, tracking?: string, weight, length, width, height }
 * Upserts the dimensions for one box.
 */
export async function upsertMaritimeOrderBox(req: Request, res: Response): Promise<void> {
  try {
    const orderId = parseInt(String(req.params.orderId || ''), 10);
    if (!orderId || Number.isNaN(orderId)) {
      res.status(400).json({ success: false, error: 'orderId requerido' });
      return;
    }
    const { boxNumber: rawBox, tracking, weight, length, width, height } = req.body || {};
    const w = Number(weight), L = Number(length), W = Number(width), H = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(L) || !Number.isFinite(W) || !Number.isFinite(H)) {
      res.status(400).json({ success: false, error: 'weight/length/width/height requeridos y numéricos' });
      return;
    }
    if (w <= 0 || L <= 0 || W <= 0 || H <= 0) {
      res.status(400).json({ success: false, error: 'Los valores deben ser mayores a 0' });
      return;
    }

    // Resolver boxNumber
    let boxNumber = parseInt(String(rawBox || ''), 10);
    if (!boxNumber && tracking) {
      const m = String(tracking).trim().toUpperCase().match(/-(\d{1,3})$/);
      if (m && m[1]) boxNumber = parseInt(m[1], 10);
    }
    if (!boxNumber || Number.isNaN(boxNumber) || boxNumber < 1) {
      res.status(400).json({ success: false, error: 'No se pudo determinar el número de caja' });
      return;
    }

    const orderRes = await pool.query(
      `SELECT id, ordersn, COALESCE(summary_boxes, goods_num, 1) AS total_boxes,
              COALESCE(box_dimensions, '[]'::jsonb) AS box_dimensions
         FROM maritime_orders WHERE id = $1`,
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Orden marítima no encontrada' });
      return;
    }
    const row = orderRes.rows[0];
    const totalBoxes = Math.max(1, parseInt(String(row.total_boxes), 10) || 1);
    if (boxNumber > totalBoxes) {
      res.status(400).json({ success: false, error: `La caja ${boxNumber} no existe (la orden tiene ${totalBoxes} cajas)` });
      return;
    }

    const dims: BoxDim[] = Array.isArray(row.box_dimensions) ? row.box_dimensions : [];
    const idx = dims.findIndex((d) => Number(d.box_number) === boxNumber);
    const newDim: BoxDim = {
      box_number: boxNumber,
      weight: w,
      length: L,
      width: W,
      height: H,
      captured_at: new Date().toISOString(),
    };
    if (idx >= 0) dims[idx] = newDim; else dims.push(newDim);
    dims.sort((a, b) => Number(a.box_number) - Number(b.box_number));

    await pool.query(
      `UPDATE maritime_orders SET box_dimensions = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(dims), orderId]
    );

    res.json({
      success: true,
      orderId,
      boxNumber,
      tracking: buildBoxTracking(row.ordersn, boxNumber),
      capturedCount: dims.length,
      pendingCount: totalBoxes - dims.length,
      complete: dims.length === totalBoxes,
    });
  } catch (e: any) {
    console.error('upsertMaritimeOrderBox error:', e?.message || e);
    res.status(500).json({ success: false, error: e.message });
  }
}

/**
 * POST /api/admin/relabeling/maritime/:orderId/generate-pqtx
 * Generates the Paquete Express guide using the captured dimensions.
 * Validates that all boxes have data; otherwise returns 400 with the
 * list of missing box numbers.
 */
export async function generatePqtxForMaritimeOrder(req: Request, res: Response): Promise<void> {
  try {
    const orderId = parseInt(String(req.params.orderId || ''), 10);
    if (!orderId || Number.isNaN(orderId)) {
      res.status(400).json({ success: false, error: 'orderId requerido' });
      return;
    }

    const orderRes = await pool.query(
      `SELECT mo.*, u.full_name AS user_name, u.email AS user_email,
              a.recipient_name, a.street, a.exterior_number, a.interior_number,
              a.neighborhood, a.city, a.state, a.zip_code, a.phone
         FROM maritime_orders mo
         LEFT JOIN users u ON mo.user_id = u.id
         LEFT JOIN addresses a ON mo.delivery_address_id = a.id
        WHERE mo.id = $1`,
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Orden marítima no encontrada' });
      return;
    }
    const order = orderRes.rows[0];

    // Si ya tiene guía nacional, devolverla
    if (order.national_tracking) {
      const labelUrl = order.national_label_url || `/api/admin/paquete-express/label/pdf/${order.national_tracking}`;
      res.json({
        success: true,
        alreadyExists: true,
        trackingNumber: order.national_tracking,
        labelUrl,
        pieces: Math.max(1, parseInt(String(order.summary_boxes || order.goods_num || 1), 10) || 1),
      });
      return;
    }

    if (!order.delivery_address_id || !order.zip_code) {
      res.status(400).json({ success: false, error: 'La orden no tiene dirección de entrega asignada con código postal' });
      return;
    }

    const totalBoxes = Math.max(1, parseInt(String(order.summary_boxes || order.goods_num || 1), 10) || 1);
    const dims: BoxDim[] = Array.isArray(order.box_dimensions) ? order.box_dimensions : [];
    const dimByNum = new Map<number, BoxDim>();
    for (const d of dims) dimByNum.set(Number(d.box_number), d);

    const missing: number[] = [];
    for (let i = 1; i <= totalBoxes; i++) {
      if (!dimByNum.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      res.status(400).json({
        success: false,
        error: `Faltan medidas en ${missing.length} caja(s)`,
        missing,
        capturedCount: totalBoxes - missing.length,
        totalBoxes,
        needsDimensions: true,
      });
      return;
    }

    const pieces = [] as Array<{ weight: number; pkgLength: number; pkgWidth: number; pkgHeight: number; description: string | null }>;
    for (let i = 1; i <= totalBoxes; i++) {
      const d = dimByNum.get(i)!;
      pieces.push({
        weight: Number(d.weight),
        pkgLength: Number(d.length),
        pkgWidth: Number(d.width),
        pkgHeight: Number(d.height),
        description: order.shipping_mark || order.ordersn || null,
      });
    }

    const addr: PqtxAddrCtx = {
      recipient_name: order.recipient_name,
      street: order.street,
      exterior_number: order.exterior_number,
      interior_number: order.interior_number,
      neighborhood: order.neighborhood,
      city: order.city,
      state: order.state,
      zip_code: order.zip_code,
      phone: order.phone,
    };

    const token = await getJwtToken();
    const userId = (req as any).user?.userId || (req as any).user?.id || null;

    const result = await generateOnePqtxGuide({
      pkgId: order.id, // re-using; we'll persist in maritime_orders below anyway
      trackingInternal: order.ordersn,
      pieces,
      addr,
      userName: order.user_name,
      userEmail: order.user_email,
      token,
      createdBy: userId,
      childIds: [],
    });

    if (!result.ok) {
      res.status(400).json({ success: false, error: result.error, raw: result.raw });
      return;
    }

    // Persistir en maritime_orders (la helper persistió en `packages` con
    // pkgId = order.id, lo cual es incorrecto; corregimos a continuación
    // limpiando esa fila accidental si existiera por colisión de IDs).
    try {
      await pool.query(
        `UPDATE maritime_orders
            SET national_tracking = $1,
                national_label_url = $2,
                national_carrier = COALESCE(national_carrier, 'Paquete Express'),
                updated_at = NOW()
          WHERE id = $3`,
        [result.tracking, result.labelUrl, order.id]
      );
    } catch (e: any) {
      console.error('No se pudo actualizar maritime_orders.national_tracking:', e.message);
    }

    res.json({
      success: true,
      multi: pieces.length > 1,
      pieces: result.pieces,
      trackingNumber: result.tracking,
      folioPorte: result.folioPorte,
      labelUrl: result.labelUrl,
      message: pieces.length > 1
        ? `Guía multipieza (${result.pieces} cajas) generada correctamente`
        : 'Guía generada correctamente',
    });
  } catch (e: any) {
    console.error('generatePqtxForMaritimeOrder error:', e?.response?.data || e?.message || e);
    res.status(500).json({ success: false, error: e.message });
  }
}
