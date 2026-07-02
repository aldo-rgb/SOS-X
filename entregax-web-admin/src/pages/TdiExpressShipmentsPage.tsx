// ============================================
// TDI EXPRESS — Gestión de envíos (recepción en serie)
// Ruta aérea TDI-EXPRES (China → Monterrey). Multi-idioma.
// Wizard réplica del de "Recibir Paquetería en Serie" de PO Box:
// formulario persistente + cantidad + copiar anterior + lista con eliminar.
// ============================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, IconButton, Stack, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
  Stepper, Step, StepLabel, CircularProgress, Alert, Grid, Card, CardContent,
  List, ListItem, ListItemText, ListItemIcon,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Flight as FlightIcon,
  Refresh as RefreshIcon,
  AddBox as AddBoxIcon,
  Add as AddIcon,
  Inventory2 as InventoryIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Print as PrintIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#FF6B35';
const BLACK = '#1A1A1A';

const STATUS_COLOR: Record<string, string> = {
  received_china: ORANGE,
  in_transit: '#C1272D',
  received_mty: '#1A1A1A',
  dispatched_national: '#6B7280',
  delivered: '#2E7D32',
};
const TARIFF_TO_PRODUCT: Record<string, string> = { L: 'logo', G: 'generico', S: 'sensible', F: 'fragil' };

interface Shipment {
  id: number;
  tracking_internal: string;
  box_id: string | null;
  status: string;
  total_boxes: number | null;
  weight: string | number | null;
  air_sale_price: string | number | null;
  client_name: string | null;
  captured_boxes: string | number;
  received_at: string | null;
  child_tariff_types?: string | null;
  dim_variants?: string | number | null;
  first_dims?: string | null;
}
interface ProductType { key: string; tariffType: string; pricePerKg: number; }
interface BoxRow {
  id: number;
  box_number: number;
  tracking_internal: string;
  tracking_provider: string | null;
  box_id: string | null;
  weight: string | number | null;
  air_chargeable_weight: string | number | null;
  pkg_length: string | number | null;
  pkg_width: string | number | null;
  pkg_height: string | number | null;
  air_tariff_type: string | null;
  description: string | null;
  notes?: string | null;
}

const emptyBox = {
  originGuide: '', originGuide2: '', clientNumber: '', grossWeight: '', chargeableWeight: '',
  length: '', width: '', height: '',
  extraChargeUsd: '',
};

interface Props { onBack: () => void; }

export default function TdiExpressShipmentsPage({ onBack }: Props) {
  const { t } = useTranslation();
  const token = localStorage.getItem('token');
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [snack, setSnack] = useState<{ sev: 'success' | 'error'; msg: string } | null>(null);

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [clientBoxId, setClientBoxId] = useState('');
  const [expectedBoxes, setExpectedBoxes] = useState('');
  const [masterId, setMasterId] = useState<number | null>(null);
  const [totalBoxes, setTotalBoxes] = useState(0);
  const [captured, setCaptured] = useState<BoxRow[]>([]);
  const [box, setBox] = useState({ ...emptyBox });
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  // Confirmación de eliminación (diálogo con diseño, no confirm() nativo)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number | null; busy: boolean }>(
    { open: false, id: null, busy: false }
  );
  // Editar número de cliente de un envío
  const [editClient, setEditClient] = useState<{ open: boolean; id: number | null; value: string; productType: string }>(
    { open: false, id: null, value: '', productType: '' }
  );

  // Refs para navegación con Enter en el wizard
  const clientRef = useRef<HTMLInputElement>(null);
  const expectedRef = useRef<HTMLInputElement>(null);
  const gwRef = useRef<HTMLInputElement>(null);
  const cwRef = useRef<HTMLInputElement>(null);
  const lengthRef = useRef<HTMLInputElement>(null);
  const widthRef = useRef<HTMLInputElement>(null);
  const heightRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  // Auto-focus al cambiar de paso o abrir wizard
  useEffect(() => {
    if (!wizardOpen) return;
    const tm = setTimeout(() => {
      if (step === 0) clientRef.current?.focus();
      else if (step === 1) gwRef.current?.focus();
    }, 80);
    return () => clearTimeout(tm);
  }, [wizardOpen, step]);
  // Enter -> siguiente campo
  const focusNext = (next: React.RefObject<HTMLInputElement | null>) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); next.current?.focus(); next.current?.select?.(); }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sh, pt] = await Promise.all([
        axios.get(`${API_URL}/api/tdi-express/stats`, { headers: authHeaders }),
        axios.get(`${API_URL}/api/tdi-express/shipments`, {
          headers: authHeaders, params: { search: search || undefined, status: statusFilter },
        }),
        axios.get(`${API_URL}/api/tdi-express/product-types`, { headers: authHeaders }),
      ]);
      setStats(s.data);
      setShipments(sh.data.shipments || []);
      setProductTypes(pt.data.productTypes || []);
    } catch (e) {
      console.error('TDI loadAll', e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Fecha y hora en horario de China (Guangzhou / Asia/Shanghai)
  const fmtChina = (s: string | null) => {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleString('es-MX', {
        timeZone: 'Asia/Shanghai', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
    } catch { return s; }
  };
  // Tipo(s) de producto de un envío a partir de los air_tariff_type de sus cajas
  const shipmentTypes = (s: Shipment) =>
    (s.child_tariff_types || '').split(',').filter(Boolean)
      .map((tt) => t(`tdiExpress.productTypes.${TARIFF_TO_PRODUCT[tt] || 'generico'}`))
      .join(', ') || '—';
  const shipmentDims = (s: Shipment) =>
    Number(s.dim_variants || 0) > 1 ? t('tdiExpress.table.mixed')
      : (s.first_dims ? `${s.first_dims} cm` : '—');

  // ---- Wizard ----
  const openWizard = () => {
    setStep(0);
    setClientBoxId('');
    setExpectedBoxes('');
    setMasterId(null);
    setTotalBoxes(0);
    setCaptured([]);
    setBox({ ...emptyBox });
    setQuantity('1');
    setSnack(null);
    setWizardOpen(true);
  };

  const reloadBoxes = async (mid: number) => {
    const det = await axios.get(`${API_URL}/api/tdi-express/shipments/${mid}`, { headers: authHeaders });
    setCaptured(det.data.boxes || []);
  };

  const startSerial = async () => {
    const total = parseInt(expectedBoxes, 10);
    if (!total || total < 1) {
      setSnack({ sev: 'error', msg: t('tdiExpress.wizard.required') });
      return;
    }
    setBusy(true);
    try {
      const r = await axios.post(
        `${API_URL}/api/tdi-express/serial/start`,
        { boxId: clientBoxId.trim() || undefined, expectedTotalBoxes: total },
        { headers: authHeaders }
      );
      setMasterId(r.data.masterId);
      setTotalBoxes(r.data.totalBoxes);
      setBox({ ...emptyBox, clientNumber: clientBoxId.trim() });
      setCaptured([]);
      setStep(1);
    } catch (e: any) {
      setSnack({ sev: 'error', msg: e?.response?.data?.error || 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const addBoxes = async () => {
    if (!masterId) return;
    if (!box.grossWeight || Number(box.grossWeight) <= 0) {
      setSnack({ sev: 'error', msg: t('tdiExpress.wizard.required') });
      return;
    }
    setBusy(true);
    try {
      const r = await axios.post(
        `${API_URL}/api/tdi-express/serial/${masterId}/box`,
        {
          // Guía origen — se aplica a TODAS las cajas del bloque (quantity).
          originGuide: box.originGuide.trim() || undefined,
          boxId: clientBoxId.trim() || undefined,
          grossWeight: Number(box.grossWeight),
          chargeableWeight: Number(box.chargeableWeight) || undefined,
          length: Number(box.length) || undefined,
          width: Number(box.width) || undefined,
          height: Number(box.height) || undefined,
          // Cargo extra opcional en USD — se registra como cargo_extra por cada
          // caja creada en guias_ajustes_financieros (backend).
          extraChargeUsd: Number(box.extraChargeUsd) > 0 ? Number(box.extraChargeUsd) : undefined,
          // sin comments: se llenan en el paso 3
          quantity: Math.max(1, parseInt(quantity, 10) || 1),
        },
        { headers: authHeaders }
      );
      await reloadBoxes(masterId);
      const dims0 = (box.length && box.width && box.height)
        ? `${box.length}×${box.width}×${box.height} cm` : '—';
      printLabels((r.data?.created || []).map((b: any) => ({
        tracking: b.tracking, boxNumber: b.boxNumber, total: totalBoxes,
        clientNumber: clientBoxId, originGuide: box.originGuide,
        originGuide2: '',
        gw: box.grossWeight, cw: box.chargeableWeight, dims: dims0,
      })));
      // Limpiar medidas para la siguiente caja (mantener cliente del wizard)
      setBox({ ...emptyBox });
      setQuantity('1');
      setSnack(null);
      // Listo para la siguiente captura: regresar foco al primer campo
      setTimeout(() => gwRef.current?.focus(), 60);
    } catch (e: any) {
      setSnack({ sev: 'error', msg: e?.response?.data?.error || 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const deleteBox = async (childId: number) => {
    if (!masterId) return;
    setBusy(true);
    try {
      await axios.delete(`${API_URL}/api/tdi-express/serial/${masterId}/child/${childId}`, { headers: authHeaders });
      await reloadBoxes(masterId);
    } catch (e: any) {
      setSnack({ sev: 'error', msg: e?.response?.data?.error || 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const copyPrevious = () => {
    const last = captured[captured.length - 1];
    if (!last) return;
    setBox((p) => ({
      ...p,
      grossWeight: last.weight != null ? String(last.weight) : '',
      chargeableWeight: last.air_chargeable_weight != null ? String(last.air_chargeable_weight) : '',
      length: last.pkg_length != null ? String(last.pkg_length) : '',
      width: last.pkg_width != null ? String(last.pkg_width) : '',
      height: last.pkg_height != null ? String(last.pkg_height) : '',
    }));
  };

  const finishWizard = () => {
    setWizardOpen(false);
    loadAll();
    setSnack({ sev: 'success', msg: t('tdiExpress.wizard.done') });
  };

  // Cancelar el wizard. Si ya se creó un master vacío (sin cajas), lo elimina silenciosamente.
  // Si ya hay cajas capturadas, solo cierra (el embarque parcial queda en la lista).
  const cancelWizard = async () => {
    if (masterId !== null && captured.length === 0) {
      try {
        await axios.delete(`${API_URL}/api/tdi-express/shipments/${masterId}`, { headers: authHeaders });
        loadAll();
      } catch {
        // si falla el borrado, el usuario puede eliminarlo manualmente desde la tabla
      }
    } else if (masterId !== null && captured.length > 0) {
      loadAll(); // refrescar para mostrar el embarque parcial en la lista
    }
    setWizardOpen(false);
  };

  // Imprime etiquetas TDI Express (4x6"), una por caja.
  const printLabels = (
    items: {
      tracking: string; boxNumber: number; total: number;
      clientNumber: string; originGuide: string; originGuide2?: string;
      gw: string | number | null; cw: string | number | null;
      dims: string;
    }[]
  ) => {
    if (!items.length) return;
    const w = window.open('', '_blank', 'width=440,height=660');
    if (!w) return;
    const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, '');
    const labels = items.map((it, i) => `
      <div class="label">
        <div class="hdr">TDI EXPRESS<span>${it.boxNumber} / ${it.total}</span></div>
        <div class="trk">${esc(it.tracking)}</div>
        <svg class="bc" id="bc${i}"></svg>
        <div class="qr" id="qr${i}"></div>
        <div class="row"><b>${esc(t('tdiExpress.wizard.clientNumber'))}:</b> ${esc(it.clientNumber) || '—'}</div>
        <div class="row"><b>${esc(t('tdiExpress.wizard.longGuide'))}:</b> ${esc(it.originGuide) || '—'}</div>
        <div class="row"><b>${esc(t('tdiExpress.wizard.shortGuide'))}:</b> ${esc(it.originGuide2) || '—'}</div>
        <div class="row"><b>GW:</b> ${esc(it.gw) || '—'} kg &nbsp; <b>CW:</b> ${esc(it.cw) || '—'} kg</div>
        <div class="row"><b>${esc(t('tdiExpress.wizard.length'))}:</b> ${esc(it.dims)}</div>
      </div>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>Etiquetas TDI Express</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
      <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif;}
        .label{width:4in;height:6in;padding:0.22in;border:1px solid #000;page-break-after:always;overflow:hidden;}
        .hdr{color:#000;padding:4px 0 8px;font-weight:bold;font-size:16px;display:flex;justify-content:space-between;border-bottom:2px solid #000;}
        .trk{font-size:22px;font-weight:900;text-align:center;letter-spacing:1px;margin:12px 0 2px;}
        .bc{display:block;width:88%;height:58px;margin:0 auto;}
        .qr{text-align:center;margin:4px 0 8px;}
        .qr img{width:120px;height:120px;}
        .row{font-size:13px;margin:5px 0;border-bottom:1px dashed #ccc;padding-bottom:4px;}
        @media print{@page{size:4in 6in;margin:0;} .label{border:none;}}
      </style></head><body>${labels}
      <script>
        ${items.map((it, i) => `try{JsBarcode("#bc${i}","${esc(it.tracking)}",{format:"CODE128",displayValue:true,fontSize:12,height:48,margin:0});}catch(e){}
        try{var q${i}=qrcode(0,'M');q${i}.addData("${esc(it.tracking)}");q${i}.make();document.getElementById("qr${i}").innerHTML=q${i}.createImgTag(4,0);}catch(e){}`).join('\n')}
        setTimeout(function(){window.print();},700);
      <\/script></body></html>`);
    w.document.close();
  };

  // Reimprime las etiquetas de un envío ya capturado.
  const reprintLabels = async (s: Shipment) => {
    try {
      const det = await axios.get(`${API_URL}/api/tdi-express/shipments/${s.id}`, { headers: authHeaders });
      const boxes: BoxRow[] = det.data.boxes || [];
      if (!boxes.length) { window.alert(t('tdiExpress.wizard.noBoxes')); return; }
      const total = s.total_boxes || boxes.length;
      printLabels(boxes.map((b) => ({
        tracking: b.tracking_internal, boxNumber: b.box_number, total,
        clientNumber: b.box_id || '', originGuide: b.tracking_provider || '',
        gw: b.weight, cw: b.air_chargeable_weight,
        dims: (b.pkg_length && b.pkg_width && b.pkg_height)
          ? `${b.pkg_length}×${b.pkg_width}×${b.pkg_height} cm` : '—',
        productType: b.air_tariff_type
          ? t(`tdiExpress.productTypes.${TARIFF_TO_PRODUCT[b.air_tariff_type] || 'generico'}`) : '',
      })));
    } catch (e: any) {
      window.alert(e?.response?.data?.error || 'Error');
    }
  };

  // Abre el diálogo de confirmación (con diseño) en vez del confirm() nativo.
  const deleteShipment = (id: number) => {
    setDeleteConfirm({ open: true, id, busy: false });
  };

  const doDeleteShipment = async () => {
    if (deleteConfirm.id == null) return;
    setDeleteConfirm((s) => ({ ...s, busy: true }));
    try {
      await axios.delete(`${API_URL}/api/tdi-express/shipments/${deleteConfirm.id}`, { headers: authHeaders });
      setDeleteConfirm({ open: false, id: null, busy: false });
      loadAll();
    } catch (e: any) {
      setDeleteConfirm({ open: false, id: null, busy: false });
      setSnack({ sev: 'error', msg: e?.response?.data?.error || 'Error' });
    }
  };

  const saveEdit = async () => {
    if (!editClient.id) return;
    if (!editClient.value.trim() && !editClient.productType) return;
    try {
      await axios.patch(
        `${API_URL}/api/tdi-express/shipments/${editClient.id}`,
        {
          boxId: editClient.value.trim() || undefined,
          productType: editClient.productType || undefined,
        },
        { headers: authHeaders }
      );
      setEditClient({ open: false, id: null, value: '', productType: '' });
      loadAll();
    } catch (e: any) {
      window.alert(e?.response?.data?.error || 'Error');
    }
  };

  const STATUSES = ['received_china', 'in_transit', 'received_mty', 'dispatched_national', 'delivered'];
  const remaining = Math.max(0, totalBoxes - captured.length);
  const qtyNum = Math.max(1, parseInt(quantity, 10) || 1);

  return (
    <Box sx={{ p: 3, maxWidth: 1300, mx: 'auto' }}>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3, background: `linear-gradient(135deg, ${BLACK} 0%, #2A2A2A 100%)`, color: '#FFF' }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <IconButton onClick={onBack} sx={{ color: '#FFF' }}><ArrowBackIcon /></IconButton>
          <FlightIcon sx={{ fontSize: 40, color: ORANGE }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>{t('tdiExpress.title')}</Typography>
            <Typography variant="body2" sx={{ color: '#BDBDBD' }}>{t('tdiExpress.subtitle')}</Typography>
          </Box>
          <Button variant="contained" startIcon={<AddBoxIcon />} onClick={openWizard}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A28' }, fontWeight: 700 }}>
            {t('tdiExpress.receivePackage')}
          </Button>
        </Stack>
      </Paper>

      {/* Stats */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { k: 'capturado_china', label: t('tdiExpress.stats.capturadoChina'), color: ORANGE },
            { k: 'en_transito', label: t('tdiExpress.stats.enTransito'), color: '#C1272D' },
            { k: 'recibido_mty', label: t('tdiExpress.stats.recibidoMty'), color: BLACK },
            { k: 'en_reenvio', label: t('tdiExpress.stats.enReenvio'), color: '#6B7280' },
            { k: 'entregado', label: t('tdiExpress.stats.entregado'), color: '#2E7D32' },
          ].map((c) => (
            <Grid size={{ xs: 6, md: 2.4 }} key={c.k}>
              <Card sx={{ borderRadius: 2, border: '1px solid #ECECEC', overflow: 'hidden' }}>
                <Box sx={{ height: 4, bgcolor: c.color }} />
                <CardContent>
                  <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>{c.label}</Typography>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: c.color }}>{stats[c.k] ?? 0}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField size="small" sx={{ flex: 1, minWidth: 240 }}
          placeholder={t('tdiExpress.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <TextField select size="small" sx={{ minWidth: 200 }} label={t('tdiExpress.statusFilter')}
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <MenuItem value="all">{t('tdiExpress.all')}</MenuItem>
          {STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`tdiExpress.statusLabels.${s}`)}</MenuItem>)}
        </TextField>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadAll}>{t('tdiExpress.refresh')}</Button>
      </Paper>

      {/* Tabla */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: BLACK }}>
              {['tracking', 'client', 'boxes', 'weight', 'dimensions', 'productType', 'status', 'received'].map((c) => (
                <TableCell key={c} sx={{ color: '#FFF', fontWeight: 700 }}>{t(`tdiExpress.table.${c}`)}</TableCell>
              ))}
              <TableCell align="center" sx={{ color: '#FFF', fontWeight: 700 }}>{t('tdiExpress.table.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={9} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
            {!loading && shipments.length === 0 && (
              <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: '#999' }}>
                {t('tdiExpress.noShipments')}
              </TableCell></TableRow>
            )}
            {shipments.map((s) => (
              <TableRow key={s.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: ORANGE }}>{s.tracking_internal}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{s.box_id || '—'}</TableCell>
                <TableCell><Chip size="small" icon={<InventoryIcon />} label={`${s.captured_boxes}/${s.total_boxes ?? 1}`} /></TableCell>
                <TableCell>{Number(s.weight || 0).toFixed(2)}</TableCell>
                <TableCell>{shipmentDims(s)}</TableCell>
                <TableCell>{shipmentTypes(s)}</TableCell>
                <TableCell>
                  <Chip size="small" label={t(`tdiExpress.statusLabels.${s.status}`)}
                    sx={{ bgcolor: STATUS_COLOR[s.status] || '#999', color: '#FFF', fontWeight: 600 }} />
                </TableCell>
                <TableCell>{fmtChina(s.received_at)}</TableCell>
                <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" title={t('tdiExpress.reprintLabels')}
                    onClick={() => reprintLabels(s)} sx={{ color: ORANGE }}>
                    <PrintIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" title={t('tdiExpress.editClient')}
                    onClick={() => setEditClient({
                      open: true, id: s.id, value: s.box_id || '',
                      productType: (s.child_tariff_types || '').split(',').filter(Boolean).length === 1
                        ? (TARIFF_TO_PRODUCT[(s.child_tariff_types || '').split(',')[0]] || '') : '',
                    })}
                    sx={{ color: '#1976D2' }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" title={t('tdiExpress.table.actions')}
                    onClick={() => deleteShipment(s.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ===== WIZARD ===== */}
      <Dialog open={wizardOpen} onClose={() => !busy && cancelWizard()} maxWidth="md" fullWidth>
        <DialogTitle sx={{ bgcolor: BLACK, color: '#FFF' }}>{t('tdiExpress.wizard.title')}</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
            <Step><StepLabel>{t('tdiExpress.wizard.step1')}</StepLabel></Step>
            <Step><StepLabel>{t('tdiExpress.wizard.step2')}</StepLabel></Step>
          </Stepper>

          {/* Paso 1 — cliente + total cajas */}
          {step === 0 && (
            <Stack spacing={2}>
              <TextField label={t('tdiExpress.wizard.clientBoxId')} value={clientBoxId}
                onChange={(e) => setClientBoxId(e.target.value.toUpperCase())} fullWidth
                inputRef={clientRef}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!clientBoxId.trim()) {
                      setSnack({ sev: 'error', msg: t('tdiExpress.wizard.required') });
                      return;
                    }
                    expectedRef.current?.focus();
                    expectedRef.current?.select?.();
                  }
                }} />
              <TextField label={t('tdiExpress.wizard.expectedBoxes')} type="number" value={expectedBoxes}
                onChange={(e) => setExpectedBoxes(e.target.value)} fullWidth inputProps={{ min: 1 }}
                inputRef={expectedRef}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!clientBoxId.trim()) {
                      setSnack({ sev: 'error', msg: t('tdiExpress.wizard.required') });
                      clientRef.current?.focus();
                      return;
                    }
                    const tot = parseInt(expectedBoxes, 10);
                    if (!tot || tot < 1) {
                      setSnack({ sev: 'error', msg: t('tdiExpress.wizard.required') });
                      return;
                    }
                    if (!busy) startSerial();
                  }
                }} />
            </Stack>
          )}

          {/* Paso 2 — formulario persistente + lista de cajas */}
          {step === 1 && (
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InventoryIcon sx={{ color: ORANGE }} /> {t('tdiExpress.wizard.step2')}
                </Typography>
                <Chip size="small" color={captured.length >= totalBoxes ? 'success' : 'warning'}
                  label={`${captured.length} / ${totalBoxes}`} />
              </Box>

              {/* Formulario de caja */}
              <Card elevation={0} sx={{ p: 2.5, borderRadius: 3, border: `2px dashed ${ORANGE}`, background: 'linear-gradient(180deg, #FFF8F5 0%, #FFFFFF 100%)' }}>
                {/* Sección única: PESO Y MEDIDAS (las guías se asignan en el paso siguiente) */}
                <Alert severity="info" icon={<InventoryIcon />} sx={{ mb: 1.5 }}>
                  {t('tdiExpress.wizard.step2Hint')}
                </Alert>

                {/* Guía origen — misma para todas las cajas del bloque */}
                <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700 }}>{t('tdiExpress.wizard.section1')}</Typography>
                <Grid container spacing={1.5} sx={{ mt: 0.2, mb: 1 }}>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <TextField
                      label={t('tdiExpress.wizard.originGuide')}
                      value={box.originGuide}
                      onChange={(e) => setBox({ ...box, originGuide: e.target.value.toUpperCase() })}
                      fullWidth
                      size="small"
                      placeholder="Ej. JD01234567890123"
                      helperText={qtyNum > 1 ? t('tdiExpress.wizard.originGuideBatchHint', { n: qtyNum }) : ''}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label={t('tdiExpress.wizard.extraChargeUsd')}
                      type="number"
                      value={box.extraChargeUsd}
                      onChange={(e) => setBox({ ...box, extraChargeUsd: e.target.value })}
                      fullWidth
                      size="small"
                      placeholder="0.00"
                      slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                      helperText={qtyNum > 1 ? t('tdiExpress.wizard.extraChargeBatchHint', { n: qtyNum }) : t('tdiExpress.wizard.extraChargeHint')}
                    />
                  </Grid>
                </Grid>

                <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700 }}>{t('tdiExpress.wizard.section2')}</Typography>
                <Grid container spacing={1.5} sx={{ mt: 0.2, mb: 1 }}>
                  <Grid size={{ xs: 6, sm: 2.4 }}>
                    <TextField label={t('tdiExpress.wizard.grossWeight')} type="number" value={box.grossWeight}
                      onChange={(e) => setBox({ ...box, grossWeight: e.target.value })} fullWidth size="small" required
                      inputRef={gwRef} onKeyDown={focusNext(cwRef)} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 2.4 }}>
                    <TextField label={t('tdiExpress.wizard.chargeableWeight')} type="number" value={box.chargeableWeight}
                      onChange={(e) => setBox({ ...box, chargeableWeight: e.target.value })} fullWidth size="small"
                      inputRef={cwRef} onKeyDown={focusNext(lengthRef)} />
                  </Grid>
                  <Grid size={{ xs: 4, sm: 2.4 }}>
                    <TextField label={t('tdiExpress.wizard.length')} type="number" value={box.length}
                      onChange={(e) => setBox({ ...box, length: e.target.value })} fullWidth size="small"
                      inputRef={lengthRef} onKeyDown={focusNext(widthRef)} />
                  </Grid>
                  <Grid size={{ xs: 4, sm: 2.4 }}>
                    <TextField label={t('tdiExpress.wizard.width')} type="number" value={box.width}
                      onChange={(e) => setBox({ ...box, width: e.target.value })} fullWidth size="small"
                      inputRef={widthRef} onKeyDown={focusNext(heightRef)} />
                  </Grid>
                  <Grid size={{ xs: 4, sm: 2.4 }}>
                    <TextField label={t('tdiExpress.wizard.height')} type="number" value={box.height}
                      onChange={(e) => setBox({ ...box, height: e.target.value })} fullWidth size="small"
                      inputRef={heightRef} onKeyDown={focusNext(qtyRef)} />
                  </Grid>
                </Grid>

                {/* Botones */}
                <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 5, sm: 2 }}>
                    <TextField label={t('tdiExpress.wizard.quantity')} type="number" value={quantity}
                      onChange={(e) => setQuantity(e.target.value)} fullWidth size="small"
                      slotProps={{ htmlInput: { min: 1, max: 99 } }}
                      inputRef={qtyRef}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (!busy) addBoxes();
                        }
                      }} />
                  </Grid>
                  <Grid size={{ xs: 7, sm: 6 }}>
                    <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={addBoxes} disabled={busy}
                      sx={{ height: 40, bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A28' }, fontWeight: 700 }}>
                      {busy ? <CircularProgress size={20} />
                        : qtyNum > 1 ? t('tdiExpress.wizard.addBoxes', { n: qtyNum }) : t('tdiExpress.wizard.addBox')}
                    </Button>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Button fullWidth variant="outlined" startIcon={<CopyIcon />} onClick={copyPrevious}
                      disabled={captured.length === 0}
                      sx={{ height: 40, borderColor: '#9C27B0', color: '#9C27B0' }}>
                      {t('tdiExpress.wizard.copyPrevious')}
                    </Button>
                  </Grid>
                </Grid>
              </Card>

              {/* Lista de cajas agregadas */}
              {captured.length > 0 ? (
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    📦 {t('tdiExpress.wizard.boxesAdded')} ({captured.length})
                  </Typography>
                  <List dense>
                    {captured.map((b, idx) => (
                      <ListItem key={b.id} sx={{ bgcolor: idx % 2 === 0 ? 'grey.50' : 'white', borderRadius: 1 }}
                        secondaryAction={
                          <IconButton edge="end" color="error" onClick={() => deleteBox(b.id)} disabled={busy}>
                            <DeleteIcon />
                          </IconButton>
                        }>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Chip label={b.box_number} size="small" sx={{ bgcolor: ORANGE, color: '#FFF' }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={`${b.tracking_internal} · ${Number(b.weight || 0)} kg`}
                          secondary={[
                            b.tracking_provider ? `${t('tdiExpress.wizard.originGuide')}: ${b.tracking_provider}` : null,
                            b.air_tariff_type ? t(`tdiExpress.productTypes.${TARIFF_TO_PRODUCT[b.air_tariff_type] || 'generico'}`) : null,
                            (b.pkg_length && b.pkg_width && b.pkg_height) ? `${b.pkg_length}×${b.pkg_width}×${b.pkg_height} cm` : null,
                          ].filter(Boolean).join(' · ')}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              ) : (
                <Alert severity="info">{t('tdiExpress.wizard.noBoxes')}</Alert>
              )}
            </Stack>
          )}

          {snack && <Alert severity={snack.sev} sx={{ mt: 2 }} onClose={() => setSnack(null)}>{snack.msg}</Alert>}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => cancelWizard()} disabled={busy}>{t('tdiExpress.wizard.cancel')}</Button>
          <Box sx={{ flex: 1 }} />
          {step === 0 && (
            <Button variant="contained" onClick={startSerial} disabled={busy}
              sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A28' } }}>
              {busy ? <CircularProgress size={20} /> : t('tdiExpress.wizard.start')}
            </Button>
          )}
          {step === 1 && (
            <Button variant="contained" onClick={finishWizard} disabled={busy || captured.length === 0}
              sx={{ bgcolor: remaining > 0 ? '#6B7280' : '#2E7D32', '&:hover': { opacity: 0.9 } }}>
              {remaining > 0 ? t('tdiExpress.wizard.remaining', { n: remaining }) : t('tdiExpress.wizard.finish')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ===== Editar envío: cliente y tipo de producto ===== */}
      <Dialog open={editClient.open} onClose={() => setEditClient({ open: false, id: null, value: '', productType: '' })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: BLACK, color: '#FFF' }}>{t('tdiExpress.editClient')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 3 }}>
            <TextField
              autoFocus fullWidth label={t('tdiExpress.wizard.clientNumber')}
              value={editClient.value}
              onChange={(e) => setEditClient({ ...editClient, value: e.target.value.toUpperCase() })}
            />
            <TextField
              select fullWidth label={t('tdiExpress.wizard.productType')}
              value={editClient.productType}
              onChange={(e) => setEditClient({ ...editClient, productType: e.target.value })}
            >
              {productTypes.map((p) => (
                <MenuItem key={p.key} value={p.key}>{t(`tdiExpress.productTypes.${p.key}`)}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditClient({ open: false, id: null, value: '', productType: '' })}>
            {t('tdiExpress.wizard.cancel')}
          </Button>
          <Button variant="contained" onClick={saveEdit}
            disabled={!editClient.value.trim() && !editClient.productType}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A28' } }}>
            {t('tdiExpress.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmación de eliminación con diseño (reemplaza confirm() nativo) */}
      <Dialog open={deleteConfirm.open} onClose={() => !deleteConfirm.busy && setDeleteConfirm({ open: false, id: null, busy: false })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#C62828', fontWeight: 700 }}>
          <DeleteIcon /> {t('tdiExpress.confirmDeleteTitle')}
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1 }}>{t('tdiExpress.confirmDelete')}</Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteConfirm({ open: false, id: null, busy: false })} disabled={deleteConfirm.busy}>
            {t('tdiExpress.wizard.cancel')}
          </Button>
          <Button variant="contained" color="error" onClick={doDeleteShipment} disabled={deleteConfirm.busy}
            startIcon={deleteConfirm.busy ? <CircularProgress size={16} sx={{ color: '#FFF' }} /> : <DeleteIcon />}>
            {t('tdiExpress.deleteBtn')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
