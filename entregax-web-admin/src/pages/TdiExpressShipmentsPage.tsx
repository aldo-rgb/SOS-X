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
  List, ListItem, ListItemText, ListItemIcon, LinearProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Flight as FlightIcon,
  Refresh as RefreshIcon,
  AddBox as AddBoxIcon,
  Inventory2 as InventoryIcon,
  CheckCircle as CheckIcon,
  Delete as DeleteIcon,
  Print as PrintIcon,
  Edit as EditIcon,
  QrCodeScanner as QrCodeScannerIcon,
  Scale as ScaleIcon,
  Straighten as StraightenIcon,
  ArrowForward as ArrowForwardIcon,
  KeyboardReturn as KeyboardReturnIcon,
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
}

const emptyBox = {
  originGuide: '', originGuide2: '', clientNumber: '', grossWeight: '', chargeableWeight: '',
  length: '', width: '', height: '',
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
  // Scanner sub-step: 0=Guía larga, 1=Guía corta, 2=Peso y medidas
  const [scanStage, setScanStage] = useState<0 | 1 | 2>(0);
  const guideLargeRef = useRef<HTMLInputElement>(null);
  const guideShortRef = useRef<HTMLInputElement>(null);
  const gwRef = useRef<HTMLInputElement>(null);
  // Editar número de cliente de un envío
  const [editClient, setEditClient] = useState<{ open: boolean; id: number | null; value: string; productType: string }>(
    { open: false, id: null, value: '', productType: '' }
  );

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

  // Auto-focus del input activo según el sub-paso del escáner
  useEffect(() => {
    if (!wizardOpen || step !== 1) return;
    const refs = [guideLargeRef, guideShortRef, gwRef];
    const t = setTimeout(() => refs[scanStage]?.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [scanStage, step, wizardOpen, captured.length]);

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
    setScanStage(0);
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
      setScanStage(0);
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
          originGuide: box.originGuide.trim() || undefined,
          boxId: box.clientNumber.trim() || undefined,
          grossWeight: Number(box.grossWeight),
          chargeableWeight: Number(box.chargeableWeight) || undefined,
          length: Number(box.length) || undefined,
          width: Number(box.width) || undefined,
          height: Number(box.height) || undefined,
          // guía secundaria guardada en notes
          comments: box.originGuide2.trim() || undefined,
          quantity: Math.max(1, parseInt(quantity, 10) || 1),
        },
        { headers: authHeaders }
      );
      await reloadBoxes(masterId);
      const dims0 = (box.length && box.width && box.height)
        ? `${box.length}×${box.width}×${box.height} cm` : '—';
      printLabels((r.data?.created || []).map((b: any) => ({
        tracking: b.tracking, boxNumber: b.boxNumber, total: totalBoxes,
        clientNumber: box.clientNumber, originGuide: box.originGuide,
        originGuide2: box.originGuide2,
        gw: box.grossWeight, cw: box.chargeableWeight, dims: dims0,
      })));
      // Conservar cliente para la siguiente caja; limpiar guías y medidas
      setBox({ ...emptyBox, clientNumber: box.clientNumber });
      setQuantity('1');
      setScanStage(0);
      setSnack(null);
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
        <div class="row"><b>Guía 1:</b> ${esc(it.originGuide) || '—'}</div>
        <div class="row"><b>Guía 2:</b> ${esc(it.originGuide2) || '—'}</div>
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

  const deleteShipment = async (id: number) => {
    if (!window.confirm(t('tdiExpress.confirmDelete'))) return;
    try {
      await axios.delete(`${API_URL}/api/tdi-express/shipments/${id}`, { headers: authHeaders });
      loadAll();
    } catch (e: any) {
      window.alert(e?.response?.data?.error || 'Error');
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
            <Step><StepLabel>{t('tdiExpress.wizard.step3')}</StepLabel></Step>
          </Stepper>

          {/* Paso 1 — cliente + total cajas */}
          {step === 0 && (
            <Stack spacing={2}>
              <TextField label={t('tdiExpress.wizard.clientBoxId')} value={clientBoxId}
                onChange={(e) => setClientBoxId(e.target.value.toUpperCase())} fullWidth />
              <TextField label={t('tdiExpress.wizard.expectedBoxes')} type="number" value={expectedBoxes}
                onChange={(e) => setExpectedBoxes(e.target.value)} fullWidth inputProps={{ min: 1 }} />
            </Stack>
          )}

          {/* Paso 2 — Escáner: guía larga → guía corta → peso/medidas */}
          {step === 1 && (() => {
            const currentBoxNumber = captured.length + 1;
            const progressPct = totalBoxes > 0 ? Math.min(100, (captured.length / totalBoxes) * 100) : 0;
            const stageTitles = ['Escanear guía larga', 'Escanear guía corta', 'Peso y medidas'];
            const stageIcons = [
              <QrCodeScannerIcon key="0" sx={{ fontSize: 28 }} />,
              <QrCodeScannerIcon key="1" sx={{ fontSize: 28 }} />,
              <ScaleIcon key="2" sx={{ fontSize: 28 }} />,
            ];
            const canSaveBox =
              box.originGuide.trim() !== '' &&
              box.originGuide2.trim() !== '' &&
              !!box.grossWeight && Number(box.grossWeight) > 0;

            return (
              <Stack spacing={2.5}>
                {/* Encabezado con progreso global */}
                <Card elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid #E5E7EB', background: `linear-gradient(135deg, ${BLACK} 0%, #2A2A2A 100%)`, color: '#FFF' }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22 }}>
                      {currentBoxNumber > totalBoxes ? <CheckIcon /> : currentBoxNumber}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="overline" sx={{ color: '#BDBDBD', letterSpacing: 1.2 }}>
                        Cliente {clientBoxId || '—'}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                        Caja {Math.min(currentBoxNumber, totalBoxes)} de {totalBoxes}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={progressPct}
                        sx={{
                          mt: 1, height: 8, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.15)',
                          '& .MuiLinearProgress-bar': { bgcolor: ORANGE, borderRadius: 99 },
                        }}
                      />
                    </Box>
                    <Stack alignItems="flex-end" spacing={0.3}>
                      <Chip size="small" label={`${captured.length} / ${totalBoxes}`}
                        sx={{ bgcolor: '#FFFFFF', color: BLACK, fontWeight: 800 }} />
                      <Typography variant="caption" sx={{ color: '#BDBDBD' }}>
                        {remaining > 0 ? `Faltan ${remaining}` : 'Completo'}
                      </Typography>
                    </Stack>
                  </Stack>
                </Card>

                {/* Sub-stepper (escáner) */}
                <Stepper activeStep={scanStage} alternativeLabel sx={{
                  '& .MuiStepIcon-root.Mui-active': { color: ORANGE },
                  '& .MuiStepIcon-root.Mui-completed': { color: '#2E7D32' },
                }}>
                  <Step><StepLabel>Guía larga</StepLabel></Step>
                  <Step><StepLabel>Guía corta</StepLabel></Step>
                  <Step><StepLabel>Peso y medidas</StepLabel></Step>
                </Stepper>

                {captured.length >= totalBoxes ? (
                  <Alert severity="success" icon={<CheckIcon />} sx={{ borderRadius: 2 }}>
                    Todas las cajas fueron capturadas. Pulsa <b>Finalizar</b> para continuar.
                  </Alert>
                ) : (
                  <Card elevation={0} sx={{ p: 3, borderRadius: 3, border: `2px dashed ${ORANGE}`, background: 'linear-gradient(180deg, #FFF8F5 0%, #FFFFFF 100%)' }}>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                      <Box sx={{
                        width: 44, height: 44, borderRadius: '50%', bgcolor: ORANGE, color: '#FFF',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {stageIcons[scanStage]}
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="overline" sx={{ color: '#6B7280', fontWeight: 700 }}>
                          Paso {scanStage + 1} de 3
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: BLACK, lineHeight: 1.1 }}>
                          {stageTitles[scanStage]}
                        </Typography>
                      </Box>
                    </Stack>

                    {/* Sub-paso 0: Guía larga */}
                    {scanStage === 0 && (
                      <TextField
                        inputRef={guideLargeRef}
                        autoFocus fullWidth
                        label="Guía larga (principal)"
                        placeholder="Escanea o escribe: 2LMX64000..."
                        value={box.originGuide}
                        onChange={(e) => setBox({ ...box, originGuide: e.target.value.toUpperCase() })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && box.originGuide.trim()) {
                            e.preventDefault();
                            setScanStage(1);
                          }
                        }}
                        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 22, fontWeight: 700, py: 1 } } }}
                      />
                    )}

                    {/* Sub-paso 1: Guía corta */}
                    {scanStage === 1 && (
                      <Stack spacing={1.5}>
                        <Chip
                          icon={<CheckIcon />} label={`Guía larga: ${box.originGuide || '—'}`}
                          sx={{ alignSelf: 'flex-start', bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontFamily: 'monospace' }}
                        />
                        <TextField
                          inputRef={guideShortRef}
                          autoFocus fullWidth
                          label="Guía corta (secundaria)"
                          placeholder="Escanea o escribe: 9650623485"
                          value={box.originGuide2}
                          onChange={(e) => setBox({ ...box, originGuide2: e.target.value.toUpperCase() })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && box.originGuide2.trim()) {
                              e.preventDefault();
                              setScanStage(2);
                            }
                          }}
                          slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 22, fontWeight: 700, py: 1 } } }}
                        />
                      </Stack>
                    )}

                    {/* Sub-paso 2: Peso y medidas */}
                    {scanStage === 2 && (
                      <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip icon={<CheckIcon />} label={`Larga: ${box.originGuide}`} size="small"
                            sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontFamily: 'monospace' }} />
                          <Chip icon={<CheckIcon />} label={`Corta: ${box.originGuide2}`} size="small"
                            sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontFamily: 'monospace' }} />
                        </Stack>
                        <Grid container spacing={1.5}>
                          <Grid size={{ xs: 6, sm: 4 }}>
                            <TextField
                              inputRef={gwRef}
                              autoFocus fullWidth required
                              label={t('tdiExpress.wizard.grossWeight')} type="number"
                              value={box.grossWeight}
                              onChange={(e) => setBox({ ...box, grossWeight: e.target.value })}
                              slotProps={{ input: { sx: { fontSize: 18, fontWeight: 700 } } }}
                            />
                          </Grid>
                          <Grid size={{ xs: 6, sm: 4 }}>
                            <TextField fullWidth label={t('tdiExpress.wizard.chargeableWeight')} type="number"
                              value={box.chargeableWeight}
                              onChange={(e) => setBox({ ...box, chargeableWeight: e.target.value })} />
                          </Grid>
                          <Grid size={{ xs: 4, sm: 4 }}>
                            <TextField fullWidth label={t('tdiExpress.wizard.length')} type="number"
                              value={box.length} onChange={(e) => setBox({ ...box, length: e.target.value })}
                              slotProps={{ input: { startAdornment: <StraightenIcon fontSize="small" sx={{ mr: 0.5, color: '#9CA3AF' }} /> } }} />
                          </Grid>
                          <Grid size={{ xs: 4, sm: 4 }}>
                            <TextField fullWidth label={t('tdiExpress.wizard.width')} type="number"
                              value={box.width} onChange={(e) => setBox({ ...box, width: e.target.value })} />
                          </Grid>
                          <Grid size={{ xs: 4, sm: 4 }}>
                            <TextField fullWidth label={t('tdiExpress.wizard.height')} type="number"
                              value={box.height} onChange={(e) => setBox({ ...box, height: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && canSaveBox && !busy) {
                                  e.preventDefault();
                                  addBoxes();
                                }
                              }} />
                          </Grid>
                        </Grid>
                      </Stack>
                    )}

                    {/* Controles del sub-paso */}
                    <Stack direction="row" spacing={1.5} sx={{ mt: 2.5 }}>
                      <Button
                        variant="text" color="inherit"
                        disabled={scanStage === 0 || busy}
                        onClick={() => setScanStage((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2) : s))}
                        sx={{ color: '#6B7280' }}
                      >
                        Atrás
                      </Button>
                      <Box sx={{ flex: 1 }} />
                      {scanStage < 2 && (
                        <Button
                          variant="contained" endIcon={<ArrowForwardIcon />}
                          disabled={
                            (scanStage === 0 && !box.originGuide.trim()) ||
                            (scanStage === 1 && !box.originGuide2.trim())
                          }
                          onClick={() => setScanStage((s) => ((s + 1) as 0 | 1 | 2))}
                          sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#E55A28' }, fontWeight: 700, px: 3 }}
                        >
                          Continuar
                        </Button>
                      )}
                      {scanStage === 2 && (
                        <Button
                          variant="contained" startIcon={busy ? <CircularProgress size={18} sx={{ color: '#FFF' }} /> : <CheckIcon />}
                          disabled={!canSaveBox || busy}
                          onClick={addBoxes}
                          sx={{ bgcolor: '#2E7D32', '&:hover': { bgcolor: '#256528' }, fontWeight: 800, px: 3 }}
                        >
                          Guardar caja {currentBoxNumber}
                        </Button>
                      )}
                    </Stack>

                    <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5, color: '#9CA3AF' }}>
                      <KeyboardReturnIcon sx={{ fontSize: 14 }} />
                      Pulsa Enter para avanzar tras escanear / capturar.
                    </Typography>
                  </Card>
                )}

                {/* Lista de cajas ya capturadas */}
                {captured.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
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
                            <Chip label={b.box_number} size="small" sx={{ bgcolor: ORANGE, color: '#FFF', fontWeight: 700 }} />
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
                )}
              </Stack>
            );
          })()}

          {/* Paso 3 — completado */}
          {step === 2 && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CheckIcon sx={{ fontSize: 64, color: '#2E7D32' }} />
              <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>{t('tdiExpress.wizard.done')}</Typography>
              <Typography color="text.secondary">
                {t('tdiExpress.wizard.captured')}: {captured.length}/{totalBoxes}
              </Typography>
            </Box>
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
            <Button variant="contained" onClick={() => setStep(2)} disabled={busy || captured.length === 0}
              sx={{ bgcolor: remaining > 0 ? '#6B7280' : '#2E7D32', '&:hover': { opacity: 0.9 } }}>
              {remaining > 0 ? t('tdiExpress.wizard.remaining', { n: remaining }) : t('tdiExpress.wizard.finish')}
            </Button>
          )}
          {step === 2 && (
            <Button variant="contained" onClick={finishWizard}
              sx={{ bgcolor: '#2E7D32', '&:hover': { bgcolor: '#256528' } }}>
              {t('tdiExpress.wizard.close')}
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
    </Box>
  );
}
