/**
 * 📦 packageCosts.ts — Fuente única de verdad (web admin).
 * Espejo idéntico a entregax-mobile-app/src/utils/packageCosts.ts
 * Ver ese archivo para documentación completa.
 */

const num = (v: any): number => {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export interface CostBreakdown {
  poboxServiceMxn: number;
  nationalShippingMxn: number;
  gexMxn: number;
  totalMxn: number;
  paidMxn: number;
  pendingMxn: number;
  exchangeRate: number;
  tarifaNivel: number | null;
  poboxVentaUsd: number;
  poboxPerBoxMxn: number;
  nationalPerBoxMxn: number;
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
  if (Array.isArray(pkg?.included_guides)) return pkg.included_guides.length || 1;
  return 1;
};

export function getPackageCostBreakdown(pkg: any, opts: { children?: any[] } = {}): CostBreakdown {
  const children = opts.children ?? pkg?.child_packages ?? pkg?.included_guides ?? [];
  const tc = num(pkg?.registered_exchange_rate ?? pkg?.registeredExchangeRate);

  // Resolver costo PO Box MXN de un paquete individual
  const resolvePobox = (p: any, fallbackTc: number): number => {
    const s = num(p?.pobox_service_cost ?? p?.poboxServiceCost);
    if (s > 0) return s;
    const u = num(p?.pobox_venta_usd ?? p?.poboxVentaUsd);
    const t = num(p?.registered_exchange_rate ?? p?.registeredExchangeRate) || fallbackTc;
    if (u > 0 && t > 0) return u * t;
    return num(p?.assigned_cost_mxn ?? p?.assignedCostMxn);
  };

  // 1) PO Box service (MXN). Master multipieza con hijas → Σ hijas; resto → propio.
  let poboxServiceMxn = 0;
  const isMaster = !!(pkg?.is_master ?? pkg?.isMaster);
  const hasChildren = Array.isArray(children) && children.length > 0;
  if (isMaster && hasChildren) {
    poboxServiceMxn = children.reduce((s: number, c: any) => s + resolvePobox(c, tc), 0);
    if (poboxServiceMxn === 0) poboxServiceMxn = resolvePobox(pkg, tc);
  } else {
    poboxServiceMxn = resolvePobox(pkg, tc);
  }

  // 2) Envío nacional
  let nationalShippingMxn = num(pkg?.national_shipping_cost ?? pkg?.nationalShippingCost ?? pkg?.nationalLabelCost);
  if (nationalShippingMxn === 0) {
    nationalShippingMxn = sumChildren(children, (c) =>
      num(c.national_shipping_cost ?? c.nationalShippingCost ?? c.nationalLabelCost)
    );
  }

  // 3) GEX
  let gexMxn = num(pkg?.gex_total_cost ?? pkg?.gexTotalCost ?? pkg?.totalCost);
  if (gexMxn === 0) {
    gexMxn = sumChildren(children, (c) => num(c.gex_total_cost ?? c.gexTotalCost ?? c.totalCost));
  }

  const totalMxn = poboxServiceMxn + nationalShippingMxn + gexMxn;
  const paidMxn = num(pkg?.monto_pagado ?? pkg?.montoPagado);
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
    tarifaNivel:
      pkg?.pobox_tarifa_nivel != null
        ? Number(pkg.pobox_tarifa_nivel)
        : pkg?.poboxTarifaNivel != null
        ? Number(pkg.poboxTarifaNivel)
        : null,
    poboxVentaUsd: num(pkg?.pobox_venta_usd ?? pkg?.poboxVentaUsd),
    poboxPerBoxMxn,
    nationalPerBoxMxn,
    boxCount,
  };
}

export function getScannerBreakdown(masterPkg: any, scannedIsChild: boolean, children?: any[]): CostBreakdown {
  const full = getPackageCostBreakdown(masterPkg, { children });
  if (!scannedIsChild) return full;
  return {
    ...full,
    poboxServiceMxn: full.poboxPerBoxMxn,
    nationalShippingMxn: full.nationalPerBoxMxn,
    totalMxn: full.poboxPerBoxMxn + full.nationalPerBoxMxn + full.gexMxn / Math.max(1, full.boxCount),
  };
}

export const fmtMXN = (n: number): string =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
