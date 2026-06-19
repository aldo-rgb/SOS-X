// ============================================
// PO BOX CONSOLIDACIONES PAGE
// Panel de consolidaciones PO Box USA directamente
// desde Administración → PO Box → Consolidaciones
// Salta la selección de servicio (siempre PO Box)
// y va directo a selección de proveedor.
// ============================================

import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton, Alert,
  Snackbar, CircularProgress, Tooltip, Checkbox, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  PictureAsPdf as PictureAsPdfIcon,
  CheckCircle as CheckCircleIcon,
  Person as PersonIcon,
  ArrowBack as ArrowBackIcon,
  Assignment as AssignmentIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  ListAlt as ListAltIcon,
  Delete as DeleteIcon,
  GridOn as GridOnIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface ConsolidacionPendiente {
  id: number;
  status: string;
  package_count: number;
  missing_count?: number;
  lost_count?: number;
  has_missing?: boolean;
  total_cost_mxn: number;
  total_cost_usd: number;
  pending_cost_mxn?: number;
  pending_cost_usd?: number;
  paid_cost_mxn?: number;
  paid_cost_usd?: number;
  supplier_name: string;
  supplier_id: number;
  created_at: string;
  packages: Array<{
    id: number;
    tracking: string;
    tracking_provider?: string;
    description: string;
    weight: number;
    pkg_length?: number;
    pkg_width?: number;
    pkg_height?: number;
    pobox_service_cost: number;
    pobox_cost_usd: number;
    pobox_provider_cost_usd?: number;
    pobox_provider_cost_mxn?: number;
    registered_exchange_rate?: number;
    costing_paid: boolean;
    status?: string;
    missing_on_arrival?: boolean;
    is_lost?: boolean;
    is_master?: boolean;
    total_boxes?: number;
    client_name: string;
    client_box_id: string;
    created_at?: string;
    received_mty_at?: string | null;
    received_at?: string | null;
  }>;
}

interface PaymentReference {
  id: number;
  supplier_id: number;
  supplier_name: string;
  consolidation_ids: number[];
  total_usd: number;
  total_mxn: number;
  packages_count: number;
  packages_data: ReporteRow[];
  notas: string | null;
  created_by: number | null;
  created_at: string;
}

interface ReporteRow {
  consolidacion_id: number;
  supplier_name: string;
  tracking: string;
  tracking_provider: string;
  client: string;
  client_box_id: string;
  description: string;
  weight: number;
  dims: string;
  usd: number;
  tc: number;
  mxn: number;
  status: string;
  statusLabel: string;
  countsToTotal: boolean;
  reasonNoCount?: string;
  received_at?: string | null;
  received_mty_at?: string | null;
}

const formatCurrency = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return '—'; }
};

const POBoxConsolidacionesPage: React.FC = () => {
  // === STEP: 'supplier' | 'consolidations' ===
  const [step, setStep] = useState<'supplier' | 'consolidations'>('supplier');

  // Proveedores
  const [proveedores, setProveedores] = useState<Array<{ id: number; name: string; pending_payment?: number }>>([]);
  const [loadingProveedores, setLoadingProveedores] = useState(false);
  const [proveedorSel, setProveedorSel] = useState<{ id: number; name: string } | null>(null);

  // Consolidaciones
  const [consolidaciones, setConsolidaciones] = useState<ConsolidacionPendiente[]>([]);
  const [loadingConsolidaciones, setLoadingConsolidaciones] = useState(false);

  // Filtros
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroPago, setFiltroPago] = useState('pendiente');
  const [filtroConsolId, setFiltroConsolId] = useState<string>('todos');

  // Selección
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Referencias de pago
  const [refModalOpen, setRefModalOpen] = useState(false);
  const [referencias, setReferencias] = useState<PaymentReference[]>([]);
  const [loadingReferencias, setLoadingReferencias] = useState(false);
  const [creandoRef, setCreandoRef] = useState(false);
  const [deletingRefId, setDeletingRefId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'success' });

  // ── Cargar proveedores ──────────────────────────────────────────────
  const fetchProveedores = useCallback(async () => {
    setLoadingProveedores(true);
    try {
      const r = await api.get('/suppliers');
      setProveedores(r.data.suppliers || []);
    } catch { /* ignore */ } finally {
      setLoadingProveedores(false);
    }
  }, []);

  React.useEffect(() => { fetchProveedores(); }, [fetchProveedores]);

  // ── Cargar consolidaciones ──────────────────────────────────────────
  const fetchConsolidaciones = useCallback(async (from?: string, to?: string, supplierId?: number) => {
    setLoadingConsolidaciones(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.received_from = from;
      if (to) params.received_to = to;
      const r = await api.get('/suppliers/consolidaciones-pendientes', {
        params: Object.keys(params).length ? params : undefined,
      });
      const all = r.data.consolidations || [];
      const sid = supplierId ?? proveedorSel?.id;
      setConsolidaciones(sid ? all.filter((c: any) => Number(c.supplier_id) === Number(sid)) : all);
    } catch { /* ignore */ } finally {
      setLoadingConsolidaciones(false);
    }
  }, [proveedorSel?.id]);

  // ── Cargar referencias ──────────────────────────────────────────────
  const fetchReferencias = useCallback(async () => {
    if (!proveedorSel) return;
    setLoadingReferencias(true);
    try {
      const r = await api.get('/pobox/payment-references', { params: { supplier_id: proveedorSel.id } });
      setReferencias(r.data.references || []);
    } catch { /* ignore */ } finally {
      setLoadingReferencias(false);
    }
  }, [proveedorSel]);

  // ── Seleccionar proveedor ───────────────────────────────────────────
  const handleSelectProveedor = (prov: { id: number; name: string }) => {
    setProveedorSel(prov);
    setSelected(new Set());
    setStep('consolidations');
    fetchConsolidaciones(undefined, undefined, prov.id);
  };

  // ── Toggle helpers ──────────────────────────────────────────────────
  const getAllPackages = () => consolidaciones.flatMap(c => (c.packages || []).map(p => ({ ...p, consolidacion_id: c.id })));
  const filterByEstado = (p: { consolidacion_id?: number; received_mty_at?: string | null; missing_on_arrival?: boolean; is_lost?: boolean; costing_paid?: boolean }) => {
    // 0) Filtro por consolidación
    if (filtroConsolId !== 'todos' && p.consolidacion_id !== undefined && String(p.consolidacion_id) !== filtroConsolId) return false;
    // 1) Filtro por fecha de recibida MTY
    const mtyDate = p.received_mty_at ? p.received_mty_at.substring(0, 10) : null;
    if (filtroDesde) { if (!mtyDate || mtyDate < filtroDesde) return false; }
    if (filtroHasta) { if (!mtyDate || mtyDate > filtroHasta) return false; }
    // 2) Filtro por estado de la guía
    switch (filtroEstado) {
      case 'en_transito': if (p.received_mty_at || p.missing_on_arrival || p.is_lost) return false; break;
      case 'recibida': if (!p.received_mty_at || p.missing_on_arrival || p.is_lost) return false; break;
      case 'no_llego': if (!p.missing_on_arrival) return false; break;
      case 'perdida': if (!p.is_lost) return false; break;
      default: break; // 'todos'
    }
    // 3) Filtro por pago a proveedor
    switch (filtroPago) {
      case 'pendiente': if (p.costing_paid || p.missing_on_arrival || p.is_lost) return false; break;
      case 'pagada': if (!p.costing_paid) return false; break;
      default: break; // 'todos'
    }
    return true;
  };
  const toggleSelect = (id: number) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleAll = () => { const all = getAllPackages().filter(filterByEstado); setSelected(all.every(p => selected.has(p.id)) ? new Set() : new Set(all.map(p => p.id))); };

  // ── Reporte rows ────────────────────────────────────────────────────
  const getReporteRows = () => {
    const rows: ReporteRow[] = [];
    let totalUsd = 0; let totalMxn = 0;
    const involvedConsolIds = new Set<number>();
    consolidaciones.forEach((c) => {
      (c.packages || []).forEach((p) => {
        if (!selected.has(p.id)) return;
        if (p.is_master && Number(p.total_boxes || 1) > 1) return;
        involvedConsolIds.add(c.id);
        const usd = Number(p.pobox_provider_cost_usd ?? p.pobox_cost_usd ?? 0);
        const tc = Number(p.registered_exchange_rate ?? 0);
        const mxn = Number(p.pobox_provider_cost_mxn ?? (tc > 0 ? usd * tc : 0));
        const dims = p.pkg_length && p.pkg_width && p.pkg_height
          ? `${(Number(p.pkg_length) * 0.393701).toFixed(1)}×${(Number(p.pkg_width) * 0.393701).toFixed(1)}×${(Number(p.pkg_height) * 0.393701).toFixed(1)} in` : '—';
        const isMissing = !!p.missing_on_arrival;
        const isLost = !!p.is_lost;
        const isPaid = !!p.costing_paid;
        const hasArrived = !!p.received_mty_at;
        let statusLabel = 'A PAGAR';
        let countsToTotal = true;
        let reasonNoCount: string | undefined;
        if (isLost) { statusLabel = 'PERDIDA'; countsToTotal = false; reasonNoCount = 'Pérdida declarada'; }
        else if (isMissing) { statusLabel = 'FALTANTE'; countsToTotal = false; reasonNoCount = 'No llegó a MTY'; }
        else if (isPaid) { statusLabel = 'YA PAGADA'; countsToTotal = false; reasonNoCount = 'Pago ya registrado'; }
        else if (!hasArrived) { statusLabel = 'EN TRÁNSITO'; countsToTotal = false; reasonNoCount = 'Aún no llega a MTY'; }
        if (countsToTotal) { totalUsd += usd; totalMxn += mxn; }
        rows.push({
          consolidacion_id: c.id, supplier_name: c.supplier_name,
          tracking: p.tracking, tracking_provider: p.tracking_provider || '',
          client: p.client_name, client_box_id: p.client_box_id,
          description: p.description, weight: Number(p.weight || 0),
          dims, usd, tc, mxn, status: p.status || '',
          statusLabel, countsToTotal, reasonNoCount,
          received_at: p.created_at, received_mty_at: p.received_mty_at,
        });
      });
    });
    return { rows, totalUsd, totalMxn, selectedCount: involvedConsolIds.size };
  };

  // ── Generar PDF desde filas ─────────────────────────────────────────
  const generatePDFFromRows = (rows: ReporteRow[], totalUsd: number, totalMxn: number, selectedCount: number) => {
    const fecha = new Date().toLocaleString('es-MX');
    const counts = rows.reduce((acc, r) => { acc[r.statusLabel] = (acc[r.statusLabel] || 0) + 1; return acc; }, {} as Record<string, number>);
    const aPagar = counts['A PAGAR'] || 0; const yaPagada = counts['YA PAGADA'] || 0;
    const enTransito = counts['EN TRÁNSITO'] || 0; const faltante = counts['FALTANTE'] || 0; const perdida = counts['PERDIDA'] || 0;
    const rowStyle = (label: string) => label === 'YA PAGADA' ? 'background:#eef5ff;color:#1565c0;' : label === 'EN TRÁNSITO' ? 'background:#fff8e1;color:#a06000;' : label === 'FALTANTE' ? 'background:#fdecea;color:#b71c1c;' : label === 'PERDIDA' ? 'background:#f3e5f5;color:#6a1b9a;' : '';
    const badgeClass = (label: string) => label === 'A PAGAR' ? 'b-pay' : label === 'YA PAGADA' ? 'b-paid' : label === 'EN TRÁNSITO' ? 'b-tr' : label === 'FALTANTE' ? 'b-miss' : 'b-lost';
    const statusMap: Record<string, string> = { received: 'Recibido (USA)', received_mty: 'En MTY', in_transit: 'En tránsito', out_for_delivery: 'En reparto', delivered: 'Entregado' };
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Reporte Pagos Proveedor</title>
<style>@page{size:letter landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:10px;color:#222;margin:0}h1{font-size:16px;margin:0 0 4px;color:#C1272D}.sub{color:#666;font-size:10px;margin-bottom:6px}.breakdown{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;font-size:10px}.chip{padding:3px 8px;border-radius:10px;font-weight:600;border:1px solid #ddd}.chip.pay{background:#e8f5e9;color:#1b5e20;border-color:#a5d6a7}.chip.paid{background:#eef5ff;color:#1565c0;border-color:#90caf9}.chip.tr{background:#fff8e1;color:#a06000;border-color:#ffe082}.chip.miss{background:#fdecea;color:#b71c1c;border-color:#f5c2bd}.chip.lost{background:#f3e5f5;color:#6a1b9a;border-color:#ce93d8}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#1a1a1a;color:#fff;padding:6px 4px;text-align:left;font-size:9px}td{padding:5px 4px;border-bottom:1px solid #ddd;font-size:9px}td.num{text-align:right;font-variant-numeric:tabular-nums}th.center,td.center{text-align:center}.badge{display:inline-block;padding:2px 6px;border-radius:8px;font-weight:700;font-size:8px}.b-pay{background:#1b5e20;color:#fff}.b-paid{background:#1565c0;color:#fff}.b-tr{background:#a06000;color:#fff}.b-miss{background:#b71c1c;color:#fff}.b-lost{background:#6a1b9a;color:#fff}.totals{margin-top:12px;border:2px solid #C1272D;padding:8px 12px;display:flex;justify-content:space-between}.totals .big{font-size:14px;font-weight:900;color:#C1272D}.footer{margin-top:12px;font-size:9px;color:#999;text-align:center}</style></head><body>
<h1>🚚 EntregaX · Reporte de Pagos a Proveedores — PO Box</h1>
<div class="sub">Proveedor: ${proveedorSel?.name || rows[0]?.supplier_name || '—'} · Generado: ${fecha} · ${selectedCount} consolidación(es) · ${rows.length} guía(s) total</div>
<div class="breakdown"><span class="chip pay">A PAGAR: <strong>${aPagar}</strong></span>${yaPagada ? `<span class="chip paid">YA PAGADA: <strong>${yaPagada}</strong></span>` : ''}${enTransito ? `<span class="chip tr">EN TRÁNSITO: <strong>${enTransito}</strong></span>` : ''}${faltante ? `<span class="chip miss">FALTANTE: <strong>${faltante}</strong></span>` : ''}${perdida ? `<span class="chip lost">PERDIDA: <strong>${perdida}</strong></span>` : ''}</div>
<table><thead><tr><th class="num center">No.</th><th>Consolidación</th><th># Cliente</th><th>Guía Origen</th><th>Guía</th><th class="center">Ingresada</th><th class="center">Recibida MTY</th><th class="num center">Peso (lb)</th><th>Medidas (in)</th><th class="num">USD</th><th class="num">TC</th><th class="num">MXN</th><th class="center">Estado</th><th>Motivo</th></tr></thead><tbody>
${rows.map((r, idx) => `<tr style="${rowStyle(r.statusLabel)}"><td class="num center" style="font-weight:600">${idx + 1}</td><td>#${r.consolidacion_id}</td><td style="font-family:monospace;font-weight:600">${r.client_box_id || '—'}</td><td style="font-family:monospace">${r.tracking_provider || '—'}</td><td style="font-family:monospace;font-weight:600">${r.tracking}</td><td class="center">${fmtDate(r.received_at)}</td><td class="center">${fmtDate(r.received_mty_at)}</td><td class="num center">${r.weight.toFixed(2)}</td><td>${r.dims}</td><td class="num">$${r.usd.toFixed(2)}</td><td class="num">${r.tc.toFixed(2)}</td><td class="num">$${r.mxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td class="center"><span class="badge ${badgeClass(r.statusLabel)}">${r.statusLabel}</span></td><td>${r.reasonNoCount || statusMap[r.status] || r.status || '—'}</td></tr>`).join('')}
</tbody></table>
<div class="totals"><div>Guías a pagar: <strong>${aPagar}</strong> / ${rows.length} totales</div><div>Total USD: <span class="big">$${totalUsd.toFixed(2)}</span></div><div>Total MXN: <span class="big">$${totalMxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div></div>
<div class="footer">Los totales suman únicamente guías A PAGAR. Las YA PAGADA, EN TRÁNSITO, FALTANTE y PERDIDA aparecen para trazabilidad pero NO suman al pago actual.</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=1200,height=800');
    if (!w) { setSnackbar({ open: true, message: 'Permite ventanas emergentes para generar el PDF', severity: 'error' }); return; }
    w.document.write(html); w.document.close();
  };

  // ── Generar Excel (CSV) desde filas ────────────────────────────────
  const generateExcelFromRows = (rows: ReporteRow[], refId: number, supplierName: string) => {
    const headers = ['No.', 'Consolidación', '# Cliente', 'Guía Origen', 'Guía', 'Ingresada', 'Recibida MTY', 'Peso (lb)', 'Medidas (in)', 'USD', 'TC', 'MXN', 'Estado', 'Motivo'];
    const csvRows = rows.map((r: ReporteRow, idx: number) => [
      idx + 1, `#${r.consolidacion_id}`, r.client_box_id || '', r.tracking_provider || '', r.tracking,
      fmtDate(r.received_at), fmtDate(r.received_mty_at),
      r.weight.toFixed(2), r.dims,
      r.usd.toFixed(2), r.tc.toFixed(2), r.mxn.toFixed(2),
      r.statusLabel, r.reasonNoCount || '',
    ]);
    const totalUsd = rows.filter(r => r.countsToTotal).reduce((s, r) => s + r.usd, 0);
    const totalMxn = rows.filter(r => r.countsToTotal).reduce((s, r) => s + r.mxn, 0);
    csvRows.push(['', '', '', '', '', '', '', '', 'TOTAL A PAGAR', totalUsd.toFixed(2), '', totalMxn.toFixed(2), '', '']);
    const bom = '﻿';
    const csv = bom + [headers, ...csvRows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `referencia-${refId}-${supplierName.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Orden de Pago desde referencia (con REF #) ─────────────────────
  const generateOrdenPagoFromRef = (ref: PaymentReference) => {
    const rows = ref.packages_data || [];
    const totalUsd = Number(ref.total_usd) || rows.filter(r => r.countsToTotal).reduce((s, r) => s + r.usd, 0);
    const totalMxn = Number(ref.total_mxn) || rows.filter(r => r.countsToTotal).reduce((s, r) => s + r.mxn, 0);
    const fecha = new Date().toLocaleString('es-MX');
    const refFecha = new Date(ref.created_at).toLocaleString('es-MX');
    const idsStr = (ref.consolidation_ids || []).map(id => `#${id}`).join(', ');
    const rowsHTML = (ref.consolidation_ids || []).map(id => {
      const guias = rows.filter(r => r.consolidacion_id === id);
      const usd = guias.filter(r => r.countsToTotal).reduce((s, r) => s + r.usd, 0);
      const mxn = guias.filter(r => r.countsToTotal).reduce((s, r) => s + r.mxn, 0);
      return `<tr><td style="font-family:monospace;font-weight:600">#${id}</td><td style="text-align:center">${guias.length}</td><td style="text-align:right">$${usd.toFixed(2)}</td><td style="text-align:right">$${mxn.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Orden de Pago REF-${ref.id}</title>
<style>@page{size:letter;margin:20mm}body{font-family:Arial,sans-serif;font-size:12px;color:#222}h1{font-size:20px;color:#C1272D;margin:0 0 2px}h2{font-size:13px;color:#333;margin:0 0 16px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:2px solid #C1272D;padding-bottom:12px}.ref-badge{background:#C1272D;color:#fff;font-size:18px;font-weight:900;padding:6px 14px;border-radius:6px;letter-spacing:1px}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#1a1a1a;color:#fff;padding:6px 8px;text-align:left;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #ddd;font-size:11px}.totals{border:2px solid #C1272D;padding:14px 18px;margin:18px 0;display:flex;justify-content:space-around;align-items:center}.totals .lbl{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.5px}.totals .big{font-size:22px;font-weight:900;color:#C1272D}.ref-box{border:1px dashed #999;padding:12px;margin-top:18px;font-size:11px}.sig{margin-top:44px;display:flex;justify-content:space-between}.sig div{text-align:center;width:44%}.sig hr{border:none;border-top:1px solid #333;margin-bottom:4px}</style></head><body>
<div class="header"><div><h1>EntregaX · Orden de Pago</h1><h2>PO Box USA — Proveedor: <strong>${ref.supplier_name || proveedorSel?.name || ''}</strong></h2><p style="font-size:11px;color:#666;margin:4px 0">Consolidaciones: ${idsStr}</p><p style="font-size:11px;color:#666;margin:0">Generada por sistema: ${refFecha}</p></div><div style="text-align:right"><div class="ref-badge">REF-${ref.id}</div><p style="font-size:11px;color:#666;margin-top:6px">Impresa: ${fecha}</p></div></div>
<table><thead><tr><th>Consolidación</th><th style="text-align:center">Guías</th><th style="text-align:right">Total USD</th><th style="text-align:right">Total MXN</th></tr></thead><tbody>${rowsHTML}<tr style="background:#f5f5f5;font-weight:bold"><td>TOTAL (${(ref.consolidation_ids||[]).length} consolidaciones)</td><td style="text-align:center">${ref.packages_count ?? rows.length}</td><td style="text-align:right">$${totalUsd.toFixed(2)}</td><td style="text-align:right">$${totalMxn.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr></tbody></table>
<div class="totals"><div><div class="lbl">Total USD a pagar</div><div class="big">$${totalUsd.toFixed(2)}</div></div><div style="font-size:28px;color:#ddd">|</div><div><div class="lbl">Total MXN a pagar</div><div class="big">$${totalMxn.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div></div>
<div class="ref-box">Referencia EntregaX: <strong>REF-${ref.id}</strong>&nbsp;&nbsp;&nbsp;&nbsp;Folio / SPEI / Cheque: ___________________________________&nbsp;&nbsp;&nbsp;&nbsp;Fecha de pago: _____________</div>
<div class="sig"><div><hr>Elaborado por</div><div><hr>Autorizado por</div></div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { setSnackbar({ open: true, message: 'Permite ventanas emergentes para generar la orden', severity: 'error' }); return; }
    w.document.write(html); w.document.close();
  };

  // ── Generar Referencia ──────────────────────────────────────────────
  const handleGenerarReferencia = async () => {
    if (selected.size === 0) { setSnackbar({ open: true, message: 'Selecciona al menos una guía', severity: 'info' }); return; }
    const { rows, totalUsd, totalMxn } = getReporteRows();
    if (rows.length === 0) { setSnackbar({ open: true, message: 'Las guías seleccionadas no tienen datos', severity: 'info' }); return; }
    setCreandoRef(true);
    try {
      await api.post('/pobox/payment-references', {
        supplier_id: proveedorSel!.id,
        supplier_name: proveedorSel!.name,
        consolidation_ids: [...new Set(rows.map(r => r.consolidacion_id))],
        total_usd: totalUsd,
        total_mxn: totalMxn,
        packages_count: rows.length,
        packages_data: rows,
        notas: null,
      });
      await fetchReferencias();
      setRefModalOpen(true);
      setSnackbar({ open: true, message: '✅ Referencia generada correctamente', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al generar referencia', severity: 'error' });
    } finally {
      setCreandoRef(false);
    }
  };

  // ── Ver referencias ─────────────────────────────────────────────────
  const handleVerReferencias = async () => {
    await fetchReferencias();
    setRefModalOpen(true);
  };

  // ── Eliminar referencia ─────────────────────────────────────────────
  const handleEliminarReferencia = async (id: number) => {
    setDeletingRefId(id);
    try {
      await api.delete(`/pobox/payment-references/${id}`);
      setReferencias(prev => prev.filter(r => r.id !== id));
      setConfirmDeleteId(null);
      setSnackbar({ open: true, message: 'Referencia eliminada', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al eliminar', severity: 'error' });
    } finally {
      setDeletingRefId(null);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER — PASO 1: Selección de proveedor
  // ═══════════════════════════════════════════════════════════════════
  if (step === 'supplier') {
    return (
      <Box>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          📦 Consolidaciones PO Box — Selecciona proveedor
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Selecciona el proveedor cuyo pago vas a procesar.
        </Typography>
        {loadingProveedores ? (
          <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
        ) : proveedores.length === 0 ? (
          <Alert severity="info">No hay proveedores activos.</Alert>
        ) : (
          <Grid container spacing={2}>
            {proveedores.map((prov) => (
              <Grid key={prov.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper
                  elevation={2}
                  sx={{
                    p: 2, cursor: 'pointer', border: '2px solid transparent',
                    '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.50' },
                    transition: 'all 0.15s',
                  }}
                  onClick={() => handleSelectProveedor({ id: prov.id, name: prov.name })}
                >
                  <Box display="flex" alignItems="center" gap={1.5}>
                    <PersonIcon color="primary" />
                    <Box>
                      <Typography fontWeight="bold">{prov.name}</Typography>
                      {prov.pending_payment !== undefined && (
                        <Typography variant="caption" color="warning.main">
                          {prov.pending_payment} guía(s) pendientes
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER — PASO 2: Consolidaciones del proveedor
  // ═══════════════════════════════════════════════════════════════════
  return (
    <Box>
      {/* Encabezado + botón volver */}
      <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
        <Button
          startIcon={<ArrowBackIcon />}
          size="small"
          variant="outlined"
          onClick={() => { setStep('supplier'); setProveedorSel(null); setSelected(new Set()); }}
        >
          Cambiar proveedor
        </Button>
        <Typography variant="h6" fontWeight="bold" sx={{ mr: 'auto' }}>
          Pagos pendientes — {proveedorSel?.name}
        </Typography>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<ListAltIcon />}
          onClick={handleVerReferencias}
        >
          Ver Referencias
        </Button>
        <Tooltip title={selected.size === 0 ? 'Selecciona al menos una guía' : ''}>
          <span>
            <Button
              variant="contained"
              color="warning"
              startIcon={creandoRef ? <CircularProgress size={16} color="inherit" /> : <AddCircleOutlineIcon />}
              onClick={handleGenerarReferencia}
              disabled={selected.size === 0 || creandoRef}
            >
              Generar Referencia ({selected.size})
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Filtros */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          type="date" size="small" label="Recibida MTY desde" InputLabelProps={{ shrink: true }}
          value={filtroDesde}
          onChange={(e) => setFiltroDesde(e.target.value)}
          sx={{ minWidth: 180 }}
        />
        <TextField
          type="date" size="small" label="Recibida MTY hasta" InputLabelProps={{ shrink: true }}
          value={filtroHasta} inputProps={{ min: filtroDesde || undefined }}
          onChange={(e) => setFiltroHasta(e.target.value)}
          sx={{ minWidth: 180 }}
        />
        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel>Estado</InputLabel>
          <Select value={filtroEstado} label="Estado" onChange={(e) => setFiltroEstado(e.target.value)}>
            <MenuItem value="todos">Todos</MenuItem>
            <MenuItem value="en_transito">En tránsito</MenuItem>
            <MenuItem value="recibida">Recibida en MTY</MenuItem>
            <MenuItem value="no_llego">No llegó a MTY</MenuItem>
            <MenuItem value="perdida">Perdida</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Pago a proveedor</InputLabel>
          <Select value={filtroPago} label="Pago a proveedor" onChange={(e) => setFiltroPago(e.target.value)}>
            <MenuItem value="todos">Todos</MenuItem>
            <MenuItem value="pendiente">Pendientes de pago</MenuItem>
            <MenuItem value="pagada">Ya pagadas a proveedor</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Consolidación</InputLabel>
          <Select value={filtroConsolId} label="Consolidación" onChange={(e) => setFiltroConsolId(e.target.value)}>
            <MenuItem value="todos">Todas</MenuItem>
            {consolidaciones.map(c => (
              <MenuItem key={c.id} value={String(c.id)}>#{c.id}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button size="small" variant="outlined" disabled={!filtroDesde && !filtroHasta && filtroEstado === 'todos' && filtroPago === 'todos' && filtroConsolId === 'todos'}
          onClick={() => { setFiltroDesde(''); setFiltroHasta(''); setFiltroEstado('todos'); setFiltroPago('todos'); setFiltroConsolId('todos'); fetchConsolidaciones(undefined, undefined, proveedorSel?.id); }}>
          Limpiar filtros
        </Button>
        <Typography variant="body2" color="text.secondary">
          {filtroDesde || filtroHasta
            ? `Recibidas en MTY ${filtroDesde ? `desde ${new Date(filtroDesde + 'T00:00:00').toLocaleDateString('es-MX')}` : ''}${filtroDesde && filtroHasta ? ' ' : ''}${filtroHasta ? `hasta ${new Date(filtroHasta + 'T00:00:00').toLocaleDateString('es-MX')}` : ''}`
            : 'Sin filtro de fecha'}
        </Typography>
      </Box>

      {loadingConsolidaciones ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : consolidaciones.length === 0 ? (
        <Alert severity="info">No hay consolidaciones pendientes de pago para este proveedor.</Alert>
      ) : (
        <Box>
          {/* Resumen */}
          {(() => {
            const allPkgs = getAllPackages().filter(filterByEstado);
            const toShow = selected.size > 0 ? allPkgs.filter(p => selected.has(p.id)) : allPkgs;
            const totalUsd = toShow.reduce((s, p) => s + Number(p.pobox_provider_cost_usd ?? p.pobox_cost_usd ?? 0), 0);
            const totalMxn = toShow.reduce((s, p) => {
              const mxn = Number(p.pobox_provider_cost_mxn ?? 0) || (Number(p.pobox_provider_cost_usd ?? p.pobox_cost_usd ?? 0) * Number(p.registered_exchange_rate ?? 0));
              return s + mxn;
            }, 0);
            return (
              <Paper sx={{ p: 2, mb: 3, bgcolor: 'warning.light' }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  {selected.size > 0 ? 'Resumen Seleccionadas' : 'Resumen Total'}
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 3 }}>
                    <Typography variant="body2" color="text.secondary">Guías</Typography>
                    <Typography variant="h5" fontWeight="bold">{toShow.length}</Typography>
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <Typography variant="body2" color="text.secondary">Total USD</Typography>
                    <Typography variant="h6" fontWeight="bold" color="success.dark">${totalUsd.toFixed(2)}</Typography>
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <Typography variant="body2" color="text.secondary">Total MXN</Typography>
                    <Typography variant="h6" fontWeight="bold" color="primary.dark">{formatCurrency(totalMxn)}</Typography>
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <Typography variant="body2" color="text.secondary">Pendiente de pago</Typography>
                    <Typography variant="h6" fontWeight="bold" color="warning.dark">{formatCurrency(totalMxn)}</Typography>
                  </Grid>
                </Grid>
              </Paper>
            );
          })()}

          {/* Tabla flat de guías */}
          {(() => {
            const allPkgs = getAllPackages().filter(filterByEstado);
            return (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          indeterminate={allPkgs.some(p => selected.has(p.id)) && !allPkgs.every(p => selected.has(p.id))}
                          checked={allPkgs.length > 0 && allPkgs.every(p => selected.has(p.id))}
                          onChange={toggleAll}
                        />
                      </TableCell>
                      <TableCell><strong>Consol.</strong></TableCell>
                      <TableCell><strong>Tracking</strong></TableCell>
                      <TableCell><strong>Recibida MTY</strong></TableCell>
                      <TableCell><strong>Cliente</strong></TableCell>
                      <TableCell align="right"><strong>Peso (lb)</strong></TableCell>
                      <TableCell align="right"><strong>USD</strong></TableCell>
                      <TableCell align="right"><strong>MXN</strong></TableCell>
                      <TableCell align="center"><strong>Estatus</strong></TableCell>
                      <TableCell align="center"><strong>Pago Prov.</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allPkgs.map((p) => {
                      const isMissing = !!p.missing_on_arrival;
                      const isLost = !!p.is_lost;
                      const problema = isMissing || isLost;
                      return (
                        <TableRow key={p.id} hover selected={selected.has(p.id)} sx={problema ? { bgcolor: isLost ? '#FFEBEE' : '#FFF3E0' } : undefined}>
                          <TableCell padding="checkbox">
                            <Checkbox checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                          </TableCell>
                          <TableCell>
                            <Chip label={`#${p.consolidacion_id}`} size="small" color="primary" variant="outlined" />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontFamily="monospace" sx={{ textDecoration: isLost ? 'line-through' : 'none' }}>{p.tracking}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{fmtDate(p.received_mty_at)}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{p.client_name}</Typography>
                            <Typography variant="caption" color="text.secondary">{p.client_box_id}</Typography>
                          </TableCell>
                          <TableCell align="right">{Number(p.weight || 0).toFixed(2)}</TableCell>
                          <TableCell align="right" sx={problema ? { color: 'text.disabled' } : undefined}>${Number(p.pobox_provider_cost_usd ?? p.pobox_cost_usd ?? 0).toFixed(2)}</TableCell>
                          <TableCell align="right" sx={problema ? { color: 'text.disabled' } : undefined}>{formatCurrency(Number(p.pobox_provider_cost_mxn ?? 0) || (Number(p.pobox_provider_cost_usd ?? p.pobox_cost_usd ?? 0) * Number(p.registered_exchange_rate ?? 0)))}</TableCell>
                          <TableCell align="center">
                            {isLost ? <Chip label="Perdido" size="small" color="error" variant="filled" />
                              : isMissing ? <Chip label="No llegó" size="small" color="warning" variant="filled" />
                              : p.received_mty_at ? <Chip label="Recibida" size="small" color="success" variant="outlined" />
                              : <Chip label="En tránsito" size="small" color="info" variant="outlined" />}
                          </TableCell>
                          <TableCell align="center">
                            {problema ? <Typography variant="caption" color="text.disabled">No se paga</Typography>
                              : p.costing_paid ? <CheckCircleIcon color="success" fontSize="small" />
                              : <Typography variant="caption" color="warning.main">Pendiente</Typography>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            );
          })()}

          {/* Barra inferior */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', mt: 2, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" color={selected.size > 0 ? 'primary.main' : 'text.secondary'} fontWeight={selected.size > 0 ? 'bold' : 'normal'}>
              {selected.size === 0 ? 'Selecciona guías para generar reporte o referencia' : `${selected.size} guía(s) seleccionada(s)`}
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── Modal: Referencias de Pago ──────────────────────────────── */}
      <Dialog open={refModalOpen} onClose={() => setRefModalOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box display="flex" alignItems="center" gap={1}>
            <ListAltIcon color="warning" />
            <Typography fontWeight="bold">Referencias de Pago — {proveedorSel?.name}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">{referencias.length} referencia(s)</Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {loadingReferencias ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : referencias.length === 0 ? (
            <Box p={4} textAlign="center">
              <Typography color="text.secondary">No hay referencias de pago para este proveedor.</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell><strong>Ref #</strong></TableCell>
                    <TableCell><strong>Fecha</strong></TableCell>
                    <TableCell><strong>Consolidaciones</strong></TableCell>
                    <TableCell align="center"><strong>Guías</strong></TableCell>
                    <TableCell align="right"><strong>Total USD</strong></TableCell>
                    <TableCell align="right"><strong>Total MXN</strong></TableCell>
                    <TableCell align="center"><strong>Acciones</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {referencias.map((ref) => {
                    const rows = ref.packages_data || [];
                    const totalUsd = rows.filter((r: ReporteRow) => r.countsToTotal).reduce((s: number, r: ReporteRow) => s + Number(r.usd || 0), 0);
                    const totalMxn = rows.filter((r: ReporteRow) => r.countsToTotal).reduce((s: number, r: ReporteRow) => s + Number(r.mxn || 0), 0);
                    const isDeleting = deletingRefId === ref.id;
                    return (
                      <TableRow key={ref.id} hover>
                        <TableCell>
                          <Typography fontWeight="bold" fontFamily="monospace">REF-{ref.id}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{new Date(ref.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })}</Typography>
                          <Typography variant="caption" color="text.secondary">{new Date(ref.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</Typography>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" gap={0.5} flexWrap="wrap">
                            {(ref.consolidation_ids || []).map((id: number) => (
                              <Chip key={id} label={`#${id}`} size="small" variant="outlined" color="primary" />
                            ))}
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={ref.packages_count ?? rows.length} size="small" color="default" />
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight="bold" color="success.main">${Number(ref.total_usd || totalUsd).toFixed(2)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight="bold" color="primary.main">{formatCurrency(Number(ref.total_mxn || totalMxn))}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Box display="flex" gap={0.5} justifyContent="center">
                            <Tooltip title="Orden de Pago (REF)">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => generateOrdenPagoFromRef(ref)}
                              >
                                <AssignmentIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Descargar PDF detallado">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => generatePDFFromRows(rows, Number(ref.total_usd || totalUsd), Number(ref.total_mxn || totalMxn), (ref.consolidation_ids || []).length)}
                              >
                                <PictureAsPdfIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Descargar Excel">
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => generateExcelFromRows(rows, ref.id, ref.supplier_name || proveedorSel?.name || '')}
                              >
                                <GridOnIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Eliminar referencia">
                              <IconButton
                                size="small"
                                color="error"
                                disabled={isDeleting}
                                onClick={() => setConfirmDeleteId(ref.id)}
                              >
                                {isDeleting ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefModalOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirm Delete Dialog ─────────────────────────────────────── */}
      <Dialog open={confirmDeleteId !== null} onClose={() => setConfirmDeleteId(null)} maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeleteIcon color="error" /> Eliminar referencia
        </DialogTitle>
        <DialogContent>
          <Typography>¿Estás seguro de que quieres eliminar la referencia <strong>REF-{confirmDeleteId}</strong>? Esta acción no se puede deshacer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color="error"
            startIcon={deletingRefId === confirmDeleteId ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
            disabled={deletingRefId === confirmDeleteId}
            onClick={() => confirmDeleteId !== null && handleEliminarReferencia(confirmDeleteId)}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default POBoxConsolidacionesPage;
