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
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  LocalShipping as ShippingIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Payment as PaymentIcon,
  PictureAsPdf as PictureAsPdfIcon,
  WhatsApp as WhatsAppIcon,
  CheckCircle as CheckCircleIcon,
  Person as PersonIcon,
  ArrowBack as ArrowBackIcon,
  Assignment as AssignmentIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';
import Divider from '@mui/material/Divider';
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

const formatCurrency = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

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

  // Selección
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [soloFaltantes, setSoloFaltantes] = useState<Set<number>>(new Set());
  const [soloNoLlegados, setSoloNoLlegados] = useState<Set<number>>(new Set());

  // (Generar Orden de Pago abre PDF directo — sin estado de diálogo)

  // Realizar Pago Referenciado (múltiple) — 2 pasos: referencia → confirmación
  const [pagoRefDialogOpen, setPagoRefDialogOpen] = useState(false);
  const [pagoRefStep, setPagoRefStep] = useState<'referencia' | 'confirmacion'>('referencia');
  const [pagoRefInput, setPagoRefInput] = useState('');
  const [pagoRefNotas, setPagoRefNotas] = useState('');
  const [procesandoPagoRef, setProcesandoPagoRef] = useState(false);

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

  // ── Seleccionar proveedor ───────────────────────────────────────────
  const handleSelectProveedor = (prov: { id: number; name: string }) => {
    setProveedorSel(prov);
    setSelected(new Set());
    setExpanded(new Set());
    setStep('consolidations');
    fetchConsolidaciones(undefined, undefined, prov.id);
  };

  // ── Toggle helpers ──────────────────────────────────────────────────
  const toggleExpand = (id: number) => setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleSelect = (id: number) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleAll = () => setSelected(
    selected.size === consolidaciones.length ? new Set() : new Set(consolidaciones.map(c => c.id))
  );

  // ── Reporte (PDF / WA) ──────────────────────────────────────────────
  const getReporteRows = () => {
    const rows: Array<{
      consolidacion_id: number; supplier_name: string; tracking: string;
      tracking_provider: string; client: string; client_box_id: string;
      description: string; weight: number; dims: string;
      usd: number; tc: number; mxn: number; status: string;
      statusLabel: string; countsToTotal: boolean; reasonNoCount?: string;
      received_at?: string | null; received_mty_at?: string | null;
    }> = [];
    let totalUsd = 0; let totalMxn = 0;
    const sel = consolidaciones.filter(c => selected.has(c.id));
    sel.forEach((c) => {
      (c.packages || []).forEach((p) => {
        if (p.is_master && Number(p.total_boxes || 1) > 1) return;
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
    return { rows, totalUsd, totalMxn, selectedCount: sel.length };
  };

  const handleGenerarPDF = () => {
    if (selected.size === 0) { setSnackbar({ open: true, message: 'Selecciona al menos una consolidación', severity: 'info' }); return; }
    const { rows, totalUsd, totalMxn, selectedCount } = getReporteRows();
    if (rows.length === 0) { setSnackbar({ open: true, message: 'Las consolidaciones seleccionadas no tienen guías', severity: 'info' }); return; }
    const fecha = new Date().toLocaleString('es-MX');
    const counts = rows.reduce((acc, r) => { acc[r.statusLabel] = (acc[r.statusLabel] || 0) + 1; return acc; }, {} as Record<string, number>);
    const aPagar = counts['A PAGAR'] || 0; const yaPagada = counts['YA PAGADA'] || 0;
    const enTransito = counts['EN TRÁNSITO'] || 0; const faltante = counts['FALTANTE'] || 0; const perdida = counts['PERDIDA'] || 0;
    const rowStyle = (label: string) => label === 'YA PAGADA' ? 'background:#eef5ff;color:#1565c0;' : label === 'EN TRÁNSITO' ? 'background:#fff8e1;color:#a06000;' : label === 'FALTANTE' ? 'background:#fdecea;color:#b71c1c;' : label === 'PERDIDA' ? 'background:#f3e5f5;color:#6a1b9a;' : '';
    const badgeClass = (label: string) => label === 'A PAGAR' ? 'b-pay' : label === 'YA PAGADA' ? 'b-paid' : label === 'EN TRÁNSITO' ? 'b-tr' : label === 'FALTANTE' ? 'b-miss' : 'b-lost';
    const fmtDate = (d?: string | null) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return '—'; } };
    const statusMap: Record<string, string> = { received: 'Recibido (USA)', received_mty: 'En MTY', in_transit: 'En tránsito', out_for_delivery: 'En reparto', delivered: 'Entregado' };
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Reporte Pagos Proveedor</title>
<style>@page{size:letter landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:10px;color:#222;margin:0}h1{font-size:16px;margin:0 0 4px;color:#C1272D}.sub{color:#666;font-size:10px;margin-bottom:6px}.breakdown{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;font-size:10px}.chip{padding:3px 8px;border-radius:10px;font-weight:600;border:1px solid #ddd}.chip.pay{background:#e8f5e9;color:#1b5e20;border-color:#a5d6a7}.chip.paid{background:#eef5ff;color:#1565c0;border-color:#90caf9}.chip.tr{background:#fff8e1;color:#a06000;border-color:#ffe082}.chip.miss{background:#fdecea;color:#b71c1c;border-color:#f5c2bd}.chip.lost{background:#f3e5f5;color:#6a1b9a;border-color:#ce93d8}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#1a1a1a;color:#fff;padding:6px 4px;text-align:left;font-size:9px}td{padding:5px 4px;border-bottom:1px solid #ddd;font-size:9px}td.num{text-align:right;font-variant-numeric:tabular-nums}th.center,td.center{text-align:center}.badge{display:inline-block;padding:2px 6px;border-radius:8px;font-weight:700;font-size:8px}.b-pay{background:#1b5e20;color:#fff}.b-paid{background:#1565c0;color:#fff}.b-tr{background:#a06000;color:#fff}.b-miss{background:#b71c1c;color:#fff}.b-lost{background:#6a1b9a;color:#fff}.totals{margin-top:12px;border:2px solid #C1272D;padding:8px 12px;display:flex;justify-content:space-between}.totals .big{font-size:14px;font-weight:900;color:#C1272D}.footer{margin-top:12px;font-size:9px;color:#999;text-align:center}</style></head><body>
<h1>🚚 EntregaX · Reporte de Pagos a Proveedores — PO Box</h1>
<div class="sub">Proveedor: ${proveedorSel?.name || '—'} · Generado: ${fecha} · ${selectedCount} consolidación(es) · ${rows.length} guía(s) total</div>
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

  const handleEnviarWhatsApp = () => {
    if (selected.size === 0) { setSnackbar({ open: true, message: 'Selecciona al menos una consolidación', severity: 'info' }); return; }
    const { rows, totalUsd, totalMxn } = getReporteRows();
    if (rows.length === 0) { setSnackbar({ open: true, message: 'Sin guías en las consolidaciones seleccionadas', severity: 'info' }); return; }
    const fecha = new Date().toLocaleDateString('es-MX');
    const byCons = new Map<number, typeof rows>();
    rows.forEach(r => { const arr = byCons.get(r.consolidacion_id) || []; arr.push(r); byCons.set(r.consolidacion_id, arr); });
    let msg = `*🚚 EntregaX · Pagos PO Box — ${proveedorSel?.name || ''}*\n_Fecha:_ ${fecha}\n\n`;
    byCons.forEach((items, consId) => {
      msg += `*Consolidación #${consId}*\n`;
      items.forEach(r => { msg += `✅ \`${r.tracking}\` · ${r.weight.toFixed(1)}lb · $${r.usd.toFixed(2)} USD\n`; });
      msg += '\n';
    });
    msg += `━━━━━━━━━━━━━━━━\n*Total USD:* $${totalUsd.toFixed(2)}\n*Total MXN:* $${totalMxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ── Generar Orden de Pago (individual) ─────────────────────────────
  const handleGenerarOrdenPago = (c: ConsolidacionPendiente) => {
    const fecha = new Date().toLocaleString('es-MX');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Orden de Pago #${c.id}</title>
<style>@page{size:letter;margin:20mm}body{font-family:Arial,sans-serif;font-size:12px;color:#222}h1{font-size:20px;color:#C1272D;margin:0 0 4px}h2{font-size:14px;color:#333;margin:0 0 16px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:2px solid #C1272D;padding-bottom:12px}.info{margin-bottom:16px}.info dt{font-weight:700;color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.5px}.info dd{font-size:14px;margin:0 0 8px}.totals{border:2px solid #C1272D;padding:12px 16px;margin:20px 0;display:flex;justify-content:space-between}.totals .big{font-size:20px;font-weight:900;color:#C1272D}.ref-box{border:1px dashed #999;padding:10px;margin-top:20px;font-size:11px}.sig{margin-top:40px;display:flex;justify-content:space-between}.sig div{text-align:center;width:45%}.sig hr{border:none;border-top:1px solid #333;margin-bottom:4px}</style></head><body>
<div class="header"><div><h1>EntregaX · Orden de Pago</h1><h2>PO Box USA — Proveedor ${c.supplier_name}</h2></div><div style="text-align:right;font-size:11px;color:#666">Generada: ${fecha}<br/>Consolidación: <strong>#${c.id}</strong></div></div>
<dl class="info"><dt>Proveedor</dt><dd>${c.supplier_name}</dd><dt>Consolidación</dt><dd>#${c.id} · ${new Date(c.created_at).toLocaleDateString('es-MX')}</dd><dt>Paquetes</dt><dd>${c.package_count}</dd></dl>
<div class="totals"><div>Total USD: <span class="big">$${Number(c.total_cost_usd || 0).toFixed(2)}</span></div><div>Total MXN: <span class="big">$${Number(c.total_cost_mxn || 0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div></div>
<div class="ref-box">Referencia de pago (folio / SPEI / cheque): ___________________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Fecha de pago: _____________</div>
<div class="sig"><div><hr>Elaborado por</div><div><hr>Autorizado por</div></div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { setSnackbar({ open: true, message: 'Permite ventanas emergentes para generar la orden', severity: 'error' }); return; }
    w.document.write(html); w.document.close();
  };

  // ── Realizar Pago Referenciado ──────────────────────────────────────
  const handleConfirmarPagoReferenciado = async () => {
    const pagables = consolidaciones.filter(c => selected.has(c.id) && Number(c.total_cost_mxn || 0) > 0 && !c.has_missing);
    if (pagables.length === 0) { setSnackbar({ open: true, message: 'No hay consolidaciones pagables seleccionadas', severity: 'info' }); return; }
    if (!pagoRefInput.trim()) { setSnackbar({ open: true, message: 'La referencia es requerida', severity: 'info' }); return; }
    setProcesandoPagoRef(true);
    try {
      const r = await api.post('/caja-chica/pagar-consolidaciones-multiple', {
        consolidation_ids: pagables.map(c => c.id),
        referencia: pagoRefInput.trim(),
        notas: pagoRefNotas || null,
      });
      setSnackbar({ open: true, message: `✅ ${r.data.consolidations?.length || pagables.length} consolidaciones pagadas · ${r.data.packages_updated || 0} paquetes · ${formatCurrency(Number(r.data.total_monto || 0))}`, severity: 'success' });
      setPagoRefDialogOpen(false); setPagoRefStep('referencia'); setPagoRefInput(''); setPagoRefNotas('');
      setSelected(new Set());
      fetchConsolidaciones(filtroDesde || undefined, filtroHasta || undefined, proveedorSel?.id);
    } catch (e: any) {
      setSnackbar({ open: true, message: e?.response?.data?.error || 'Error al procesar pago', severity: 'error' });
    } finally { setProcesandoPagoRef(false); }
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
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <Button
          startIcon={<ArrowBackIcon />}
          size="small"
          variant="outlined"
          onClick={() => { setStep('supplier'); setProveedorSel(null); setSelected(new Set()); }}
        >
          Cambiar proveedor
        </Button>
        <Typography variant="h6" fontWeight="bold">
          Pagos pendientes — {proveedorSel?.name}
        </Typography>
      </Box>

      {/* Filtros de fecha */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          type="date" size="small" label="Desde" InputLabelProps={{ shrink: true }}
          value={filtroDesde}
          onChange={(e) => { const v = e.target.value; setFiltroDesde(v); fetchConsolidaciones(v || undefined, filtroHasta || undefined, proveedorSel?.id); }}
          sx={{ minWidth: 160 }}
        />
        <TextField
          type="date" size="small" label="Hasta" InputLabelProps={{ shrink: true }}
          value={filtroHasta} inputProps={{ min: filtroDesde || undefined }}
          onChange={(e) => { const v = e.target.value; setFiltroHasta(v); fetchConsolidaciones(filtroDesde || undefined, v || undefined, proveedorSel?.id); }}
          sx={{ minWidth: 160 }}
        />
        <Button size="small" variant="outlined" disabled={!filtroDesde && !filtroHasta}
          onClick={() => { setFiltroDesde(''); setFiltroHasta(''); fetchConsolidaciones(undefined, undefined, proveedorSel?.id); }}>
          Mostrar todas
        </Button>
        <Typography variant="body2" color="text.secondary">
          {filtroDesde || filtroHasta
            ? `Recibidas ${filtroDesde ? `desde ${new Date(filtroDesde + 'T00:00:00').toLocaleDateString('es-MX')}` : ''}${filtroDesde && filtroHasta ? ' ' : ''}${filtroHasta ? `hasta ${new Date(filtroHasta + 'T00:00:00').toLocaleDateString('es-MX')}` : ''}`
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
          <Paper sx={{ p: 2, mb: 3, bgcolor: 'warning.light' }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              {selected.size > 0 ? 'Resumen Seleccionadas' : 'Resumen Total'}
            </Typography>
            {(() => {
              const mostrar = selected.size > 0 ? consolidaciones.filter(c => selected.has(c.id)) : consolidaciones;
              const totalUsd = mostrar.reduce((s, c) => s + Number(c.total_cost_usd || 0), 0);
              const totalMxn = mostrar.reduce((s, c) => s + Number(c.total_cost_mxn || 0), 0);
              return (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 3 }}>
                    <Typography variant="body2" color="text.secondary">Consolidaciones</Typography>
                    <Typography variant="h5" fontWeight="bold">{mostrar.length}</Typography>
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
              );
            })()}
          </Paper>

          {/* Tabla */}
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selected.size > 0 && selected.size < consolidaciones.length}
                      checked={consolidaciones.length > 0 && selected.size === consolidaciones.length}
                      onChange={toggleAll}
                    />
                  </TableCell>
                  <TableCell width={40} />
                  <TableCell><strong>Consolidación</strong></TableCell>
                  <TableCell><strong>Proveedor</strong></TableCell>
                  <TableCell align="center"><strong>Paquetes</strong></TableCell>
                  <TableCell><strong>Estado</strong></TableCell>
                  <TableCell align="right"><strong>Total USD</strong></TableCell>
                  <TableCell align="right"><strong>Total MXN</strong></TableCell>
                  <TableCell align="center"><strong>Acción</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {consolidaciones.map((c) => {
                  const pkgs = c.packages || [];
                  const missing = Number(c.missing_count || 0);
                  const lost = Number(c.lost_count || 0);
                  const total = Number(c.package_count || pkgs.length);
                  const receivedInArr = pkgs.filter((p: any) => p.received_mty_at && !p.missing_on_arrival && !p.is_lost).length;
                  const excluded = Math.max(0, total - pkgs.length);
                  const received = receivedInArr + excluded;
                  const inTransit = Math.max(0, total - received - missing - lost);
                  let statusLabel = ''; let statusColor: 'info' | 'warning' | 'success' | 'default' | 'error' = 'default';
                  if (total === 0) { statusLabel = c.status || '—'; }
                  else if (missing > 0 || lost > 0) {
                    const parts: string[] = [];
                    if (missing > 0) parts.push(`${missing} faltante${missing === 1 ? '' : 's'}`);
                    if (lost > 0) parts.push(`${lost} perdida${lost === 1 ? '' : 's'}`);
                    if (inTransit > 0) parts.push(`${inTransit} en tránsito`);
                    statusLabel = `Parcial (${parts.join(', ')})`; statusColor = 'warning';
                  } else if (received === total) { statusLabel = 'Recibida'; statusColor = 'success'; }
                  else if (received === 0) { statusLabel = 'En Tránsito'; statusColor = 'info'; }
                  else { statusLabel = `Parcial (${received}/${total} recibidas)`; statusColor = 'warning'; }

                  return (
                    <React.Fragment key={c.id}>
                      <TableRow hover selected={selected.has(c.id)} sx={{ cursor: 'pointer', '& > td': { borderBottom: expanded.has(c.id) ? 'none' : undefined } }} onClick={() => toggleExpand(c.id)}>
                        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                        </TableCell>
                        <TableCell>
                          <IconButton size="small">{expanded.has(c.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <ShippingIcon color="primary" fontSize="small" />
                            <Typography fontWeight="bold">#{c.id}</Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(c.created_at).toLocaleDateString('es-MX')}
                          </Typography>
                        </TableCell>
                        <TableCell><Typography fontWeight="bold">{c.supplier_name}</Typography></TableCell>
                        <TableCell align="center"><Chip label={c.package_count} size="small" color="primary" variant="outlined" /></TableCell>
                        <TableCell><Chip label={statusLabel} size="small" color={statusColor} /></TableCell>
                        <TableCell align="right">
                          <Typography fontWeight="bold" color="success.main">${Number(c.total_cost_usd || 0).toFixed(2)}</Typography>
                          {Number(c.paid_cost_usd || 0) > 0 && <Typography variant="caption" color="success.dark" sx={{ display: 'block' }}>✓ ${Number(c.paid_cost_usd).toFixed(2)} pagado</Typography>}
                          {c.has_missing && Number(c.pending_cost_usd || 0) > 0 && <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>⚠ ${Number(c.pending_cost_usd).toFixed(2)} faltante</Typography>}
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight="bold" color="primary.main">{formatCurrency(Number(c.total_cost_mxn || 0))}</Typography>
                          {Number(c.paid_cost_mxn || 0) > 0 && <Typography variant="caption" color="success.dark" sx={{ display: 'block' }}>✓ {formatCurrency(Number(c.paid_cost_mxn))} pagado</Typography>}
                          {c.has_missing && Number(c.pending_cost_mxn || 0) > 0 && <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>⚠ {formatCurrency(Number(c.pending_cost_mxn))} faltante</Typography>}
                        </TableCell>
                        <TableCell align="center">
                          {Number(c.total_cost_mxn || 0) <= 0 ? (
                            <Typography variant="caption" color="text.secondary">
                              {Number(c.paid_cost_mxn || 0) > 0 ? 'Ya pagada' : 'Esperando llegada'}
                            </Typography>
                          ) : (
                            <Button variant="outlined" size="small" color="primary" startIcon={<AssignmentIcon />}
                              onClick={(e) => { e.stopPropagation(); handleGenerarOrdenPago(c); }}
                            >
                              Generar Orden de Pago
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Detalle expandido */}
                      {expanded.has(c.id) && (
                        <TableRow>
                          <TableCell colSpan={9} sx={{ p: 0, bgcolor: 'grey.50' }}>
                            <Box sx={{ p: 2 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                                <Typography variant="subtitle2">Paquetes en esta consolidación:</Typography>
                                {(() => {
                                  const pendCount = pkgs.filter((p: any) => !p.costing_paid && !p.is_lost && !p.missing_on_arrival).length;
                                  const noLlegCount = pkgs.filter((p: any) => p.missing_on_arrival || p.is_lost).length;
                                  const activePend = soloFaltantes.has(c.id);
                                  const activeNoLleg = soloNoLlegados.has(c.id);
                                  return (
                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                      {pendCount > 0 && pendCount < pkgs.length && (
                                        <Button size="small" variant={activePend ? 'contained' : 'outlined'} color="warning"
                                          onClick={() => setSoloFaltantes(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : (n.add(c.id), setSoloNoLlegados(p => { const x = new Set(p); x.delete(c.id); return x; })); return n; })}
                                        >{activePend ? `Mostrar todos (${pkgs.length})` : `Solo pendientes de pago (${pendCount})`}</Button>
                                      )}
                                      {noLlegCount > 0 && (
                                        <Button size="small" variant={activeNoLleg ? 'contained' : 'outlined'} color="error"
                                          onClick={() => setSoloNoLlegados(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : (n.add(c.id), setSoloFaltantes(p => { const x = new Set(p); x.delete(c.id); return x; })); return n; })}
                                        >{activeNoLleg ? `Mostrar todos (${pkgs.length})` : `Ver no llegados / perdidos (${noLlegCount})`}</Button>
                                      )}
                                    </Box>
                                  );
                                })()}
                              </Box>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Tracking</TableCell><TableCell>Cliente</TableCell><TableCell>Descripción</TableCell>
                                    <TableCell align="right">Peso (lb)</TableCell><TableCell align="right">USD</TableCell><TableCell align="right">MXN</TableCell>
                                    <TableCell align="center">Ingresada</TableCell><TableCell align="center">Recibida MTY</TableCell>
                                    <TableCell align="center">Estatus</TableCell><TableCell align="center">Pago Proveedor</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {pkgs
                                    .filter((p: any) => {
                                      if (soloNoLlegados.has(c.id)) return p.missing_on_arrival || p.is_lost;
                                      if (soloFaltantes.has(c.id)) return !p.costing_paid && !p.is_lost && !p.missing_on_arrival;
                                      return true;
                                    })
                                    .map((p: any) => {
                                      const isMissing = !!p.missing_on_arrival; const isLost = !!p.is_lost;
                                      const problema = isMissing || isLost;
                                      return (
                                        <TableRow key={p.id} sx={problema ? { bgcolor: isLost ? '#FFEBEE' : '#FFF3E0' } : undefined}>
                                          <TableCell><Typography variant="body2" fontFamily="monospace" sx={{ textDecoration: isLost ? 'line-through' : 'none' }}>{p.tracking}</Typography></TableCell>
                                          <TableCell><Typography variant="body2">{p.client_name}</Typography><Typography variant="caption" color="text.secondary">{p.client_box_id}</Typography></TableCell>
                                          <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{p.description || '-'}</Typography></TableCell>
                                          <TableCell align="right">{Number(p.weight || 0).toFixed(2)}</TableCell>
                                          <TableCell align="right" sx={problema ? { color: 'text.disabled' } : undefined}>${Number(p.pobox_cost_usd || 0).toFixed(2)}</TableCell>
                                          <TableCell align="right" sx={problema ? { color: 'text.disabled' } : undefined}>{formatCurrency(Number(p.pobox_service_cost || 0))}</TableCell>
                                          <TableCell align="center"><Typography variant="caption" color="text.secondary">{p.created_at ? new Date(p.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</Typography></TableCell>
                                          <TableCell align="center"><Typography variant="caption" color={(!problema && p.received_mty_at) ? 'text.primary' : 'text.disabled'}>{(!problema && p.received_mty_at) ? new Date(p.received_mty_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</Typography></TableCell>
                                          <TableCell align="center">
                                            {isLost ? <Chip label="Perdido" size="small" color="error" variant="filled" />
                                              : isMissing ? <Chip label="No llegó a MTY" size="small" color="warning" variant="filled" />
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
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Barra inferior */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" color={selected.size > 0 ? 'primary.main' : 'text.secondary'} fontWeight={selected.size > 0 ? 'bold' : 'normal'}>
              {selected.size === 0 ? 'Selecciona consolidaciones para generar reporte o pagar' : `${selected.size} consolidación(es) seleccionada(s)`}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Tooltip title={selected.size === 0 ? 'Selecciona al menos una consolidación' : ''}>
                <span>
                  <Button variant="outlined" color="error" startIcon={<PictureAsPdfIcon />} onClick={handleGenerarPDF} disabled={selected.size === 0}>
                    Descargar PDF
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={selected.size === 0 ? 'Selecciona al menos una consolidación' : ''}>
                <span>
                  <Button variant="outlined" startIcon={<WhatsAppIcon />} onClick={handleEnviarWhatsApp} disabled={selected.size === 0} sx={{ color: '#25D366', borderColor: '#25D366', '&:hover': { borderColor: '#1DA851', color: '#1DA851' } }}>
                    WhatsApp
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={selected.size === 0 ? 'Selecciona al menos una consolidación' : ''}>
                <span>
                  <Button
                    variant="contained" color="warning"
                    startIcon={<ReceiptIcon />}
                    onClick={() => { setPagoRefInput(''); setPagoRefNotas(''); setPagoRefStep('referencia'); setPagoRefDialogOpen(true); }}
                    disabled={selected.size === 0}
                  >
                    Realizar Pago Referenciado ({selected.size})
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </Box>
      )}

      {/* Dialog: Realizar Pago Referenciado (2 pasos) */}
      <Dialog open={pagoRefDialogOpen} onClose={() => !procesandoPagoRef && (setPagoRefDialogOpen(false), setPagoRefStep('referencia'))} maxWidth="sm" fullWidth>
        {pagoRefStep === 'referencia' ? (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReceiptIcon color="warning" /> Realizar Pago Referenciado
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Ingresa la referencia del pago realizado al proveedor (folio, SPEI, cheque, etc.)
              </Typography>
              <TextField
                label="Referencia de pago"
                placeholder="Ej: SPEI-2024060401 / CHK-00123"
                fullWidth autoFocus
                value={pagoRefInput}
                onChange={(e) => setPagoRefInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && pagoRefInput.trim()) setPagoRefStep('confirmacion'); }}
                sx={{ mt: 2 }}
              />
              <TextField
                label="Notas (opcional)"
                fullWidth multiline rows={2}
                value={pagoRefNotas}
                onChange={(e) => setPagoRefNotas(e.target.value)}
                sx={{ mt: 2 }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPagoRefDialogOpen(false)}>Cancelar</Button>
              <Button variant="contained" color="primary" disabled={!pagoRefInput.trim()} onClick={() => setPagoRefStep('confirmacion')}>
                Continuar →
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PaymentIcon color="warning" /> Confirmar Pago Referenciado
            </DialogTitle>
            <DialogContent>
              <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 2, mb: 2 }}>
                <Typography variant="body2" color="text.secondary">Referencia</Typography>
                <Typography variant="h6" fontWeight="bold" fontFamily="monospace">{pagoRefInput}</Typography>
                {pagoRefNotas && <Typography variant="caption" color="text.secondary">{pagoRefNotas}</Typography>}
              </Box>
              <Divider sx={{ my: 2 }} />
              {(() => {
                const pagables = consolidaciones.filter(c => selected.has(c.id) && Number(c.total_cost_mxn || 0) > 0 && !c.has_missing);
                const conFaltantes = consolidaciones.filter(c => selected.has(c.id) && c.has_missing);
                const totalMxn = pagables.reduce((s, c) => s + Number(c.total_cost_mxn || 0), 0);
                const totalUsd = pagables.reduce((s, c) => s + Number(c.total_cost_usd || 0), 0);
                return (
                  <>
                    {pagables.map(c => (
                      <Box key={c.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                        <Typography variant="body2">Consolidación #{c.id} · {c.supplier_name}</Typography>
                        <Typography variant="body2" fontWeight="bold">{formatCurrency(Number(c.total_cost_mxn || 0))}</Typography>
                      </Box>
                    ))}
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                      <Typography fontWeight="bold">Total</Typography>
                      <Box textAlign="right">
                        <Typography fontWeight="bold" color="warning.dark">{formatCurrency(totalMxn)}</Typography>
                        <Typography variant="caption" color="text.secondary">${totalUsd.toFixed(2)} USD</Typography>
                      </Box>
                    </Box>
                    {conFaltantes.length > 0 && (
                      <Alert severity="warning" sx={{ mt: 2 }}>
                        {conFaltantes.length} consolidación(es) con faltantes fueron excluidas. Págalas por separado.
                      </Alert>
                    )}
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      Se registrará un <strong>egreso</strong> en Caja CC y los paquetes quedarán marcados como <strong>pagados al proveedor</strong>.
                    </Alert>
                  </>
                );
              })()}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPagoRefStep('referencia')} disabled={procesandoPagoRef}>← Cambiar referencia</Button>
              <Button onClick={() => setPagoRefDialogOpen(false)} disabled={procesandoPagoRef}>Cancelar</Button>
              <Button
                variant="contained" color="warning"
                onClick={handleConfirmarPagoReferenciado}
                disabled={procesandoPagoRef}
                startIcon={procesandoPagoRef ? <CircularProgress size={16} /> : <PaymentIcon />}
              >
                {procesandoPagoRef ? 'Procesando...' : `Pagar (${consolidaciones.filter(c => selected.has(c.id) && Number(c.total_cost_mxn || 0) > 0 && !c.has_missing).length})`}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default POBoxConsolidacionesPage;
