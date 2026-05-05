/**
 * 📦 packageCosts.ts — Fuente única de verdad para mostrar costos PO Box.
 *
 * REGLA: Toda pantalla que muestre "Servicio PO Box", "Envío Nacional",
 * "Total", "Saldo Pendiente" o "Desglose de Costos" DEBE usar este helper.
 *
 * Prioridad de campos (de mayor a menor confianza):
 *   1) pobox_service_cost (MXN ya cobrado y guardado)        ← canónico
 *   2) pobox_venta_usd × registered_exchange_rate            ← derivado al recibir
 *   3) Σ children pobox_venta_mxn / pobox_venta_usd × tc     ← master sin valor propio
 *
 * NO se debe recalcular con tipo de cambio actual ni con tarifas dinámicas.
 */

const num = (v: any): number => {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export interface CostBreakdown {
  /** Servicio PO Box en MXN (lo que cobra EntregaX por almacén/recepción) */
  poboxServiceMxn: number;
  /** Envío nacional (paquetería) en MXN */
  nationalShippingMxn: number;
  /** Garantía Extendida en MXN */
  gexMxn: number;
  /** Total a pagar (suma de los 3) */
  totalMxn: number;
  /** Monto ya pagado (de monto_pagado) */
  paidMxn: number;
  /** Saldo pendiente = max(0, total − pagado) */
  pendingMxn: number;
  /** Tipo de cambio registrado al momento de recibir */
  exchangeRate: number;
  /** Nivel de tarifa PO Box (1, 2, 3) si está guardado */
  tarifaNivel: number | null;
  /** Venta unitaria USD (ej: $39) si está guardada */
  poboxVentaUsd: number;
  /** Costo PO Box por caja (solo aplica a hijas / scanner multisucursal) */
  poboxPerBoxMxn: number;
  /** Paquetería por caja (solo aplica a hijas / scanner multisucursal) */
  nationalPerBoxMxn: number;
  /** Número de cajas / piezas (de boxes JSON o total_boxes) */
  boxCount: number;
}

const sumChildren = (children: any[] | undefined, picker: (c: any) => number): number => {
  if (!Array.isArray(children) || children.length === 0) return 0;
  return children.reduce((s, c) => s + picker(c), 0);
};

const getBoxCount = (pkg: any): number => {
  if (Array.isArray(pkg?.boxes) && pkg.boxes.length > 0) return pkg.boxes.length;
  const tb = num(pkg?.total_boxes ?? pkg?.totalBoxes);
  if (tb > 0) return tb;
  if (Array.isArray(pkg?.child_packages)) return pkg.child_packages.length || 1;
  return 1;
};

/**
 * Calcula el desglose canónico para mostrar en cualquier pantalla.
 * @param pkg paquete (puede ser master, hijo o standalone)
 * @param opts.children paquetes hijos si pkg es master (sólo necesario si master no tiene valores propios)
 */
export function getPackageCostBreakdown(pkg: any, opts: { children?: any[] } = {}): CostBreakdown {
  const children = opts.children ?? pkg?.child_packages ?? pkg?.included_guides ?? [];
  const tc = num(pkg?.registered_exchange_rate);

  // 1) PO Box service (MXN)
  let poboxServiceMxn = num(pkg?.pobox_service_cost);
  if (poboxServiceMxn === 0) {
    const ventaUsd = num(pkg?.pobox_venta_usd);
    if (ventaUsd > 0 && tc > 0) {
      poboxServiceMxn = ventaUsd * tc;
    } else {
      // Master sin valor propio → sumar hijas
      poboxServiceMxn = sumChildren(children, (c) => {
        const cServ = num(c.pobox_service_cost);
        if (cServ > 0) return cServ;
        const cVentaMxn = num(c.pobox_venta_mxn);
        if (cVentaMxn > 0) return cVentaMxn;
        const cVentaUsd = num(c.pobox_venta_usd);
        const cTc = num(c.registered_exchange_rate);
        if (cVentaUsd > 0 && cTc > 0) return cVentaUsd * cTc;
        return 0;
      });
    }
  }

  // 2) Envío nacional (MXN)
  let nationalShippingMxn = num(pkg?.national_shipping_cost);
  if (nationalShippingMxn === 0) {
    nationalShippingMxn = sumChildren(children, (c) => num(c.national_shipping_cost));
  }

  // 3) GEX (MXN)
  let gexMxn = num(pkg?.gex_total_cost);
  if (gexMxn === 0) {
    gexMxn = sumChildren(children, (c) => num(c.gex_total_cost));
  }

  const totalMxn = poboxServiceMxn + nationalShippingMxn + gexMxn;
  const paidMxn = num(pkg?.monto_pagado);
  const pendingMxn = Math.max(0, totalMxn - paidMxn);

  const boxCount = getBoxCount(pkg);
  const poboxPerBoxMxn = boxCount > 0 ? poboxServiceMxn / boxCount : poboxServiceMxn;
  const nationalPerBoxMxn = boxCount > 0 ? nationalShippingMxn / boxCount : nationalShippingMxn;

  return {
    poboxServiceMxn,
    nationalShippingMxn,
    gexMxn,
    totalMxn,
    paidMxn,
    pendingMxn,
    exchangeRate: tc,
    tarifaNivel: pkg?.pobox_tarifa_nivel != null ? Number(pkg.pobox_tarifa_nivel) : null,
    poboxVentaUsd: num(pkg?.pobox_venta_usd),
    poboxPerBoxMxn,
    nationalPerBoxMxn,
    boxCount,
  };
}

/**
 * Para el escáner multisucursal:
 *   - Si scaneas la guía MASTER → retorna totales.
 *   - Si scaneas una guía HIJA → retorna costos POR CAJA (split del master).
 *
 * `scannedIsChild` debe pasarse según el contexto del escáner.
 */
export function getScannerBreakdown(masterPkg: any, scannedIsChild: boolean, children?: any[]): CostBreakdown {
  const full = getPackageCostBreakdown(masterPkg, { children });
  if (!scannedIsChild) return full;
  return {
    ...full,
    poboxServiceMxn: full.poboxPerBoxMxn,
    nationalShippingMxn: full.nationalPerBoxMxn,
    totalMxn: full.poboxPerBoxMxn + full.nationalPerBoxMxn + (full.gexMxn / Math.max(1, full.boxCount)),
  };
}

/** Formato MXN consistente: "$5,616.00 MXN" */
export const fmtMXN = (n: number): string =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
