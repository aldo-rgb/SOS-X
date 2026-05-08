import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Paper, Grid, Card, CardContent, CardActionArea, Avatar,
  Button, Chip, CircularProgress, Alert, Tabs, Tab, Table, TableHead, TableRow, TableCell,
  TableBody, IconButton, TextField, InputAdornment, Menu, MenuItem, Divider, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select,
  FormControlLabel, Switch, Stack, Snackbar, Stepper, Step, StepLabel, Autocomplete,
} from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CodeIcon from '@mui/icons-material/Code';
import SearchIcon from '@mui/icons-material/Search';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CategoryIcon from '@mui/icons-material/Category';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SyncIcon from '@mui/icons-material/Sync';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import PaidIcon from '@mui/icons-material/Paid';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import RefreshIcon from '@mui/icons-material/Refresh';
import DoNotDisturbAltIcon from '@mui/icons-material/DoNotDisturbAlt';
import axios from 'axios';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const RED = '#D32F2F';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

interface Emitter {
  id: number;
  alias: string;
  rfc: string;
  business_name: string;
  fiscal_regime?: string;
  zip_code?: string;
  logo_url?: string | null;
  service_types?: string[];
  perms: { can_view: boolean; can_emit_invoice: boolean; can_cancel_invoice: boolean };
}

const SERVICE_LABELS: Record<string, string> = {
  POBOX_USA: 'PO Box USA',
  AIR_CHN_MX: 'Aéreo China',
  AIR_CHN: 'Aéreo China',
  SEA_CHN_MX: 'Marítimo',
  AA_DHL: 'DHL',
  DHL_MTY: 'DHL',
  CAJO: 'CAJO',
  FEDEX: 'FedEx',
};

export default function AccountingHubPage() {
  const [emitters, setEmitters] = useState<Emitter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmitter, setSelectedEmitter] = useState<Emitter | null>(null);
  const [switchAnchor, setSwitchAnchor] = useState<HTMLElement | null>(null);
  const [showCounterMgr, setShowCounterMgr] = useState(false);
  const currentRole = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role || ''; } catch { return ''; } })();
  const isAdmin = ['super_admin', 'admin', 'director'].includes(currentRole);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/accounting/my-emitters');
        setEmitters(res.data.emitters || []);
      } catch (e: any) {
        console.error('load emitters:', e?.response?.data || e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  // Gateway: selección de empresa
  if (!selectedEmitter) {
    return (
      <Box sx={{ maxWidth: 1100, mx: 'auto', py: 4 }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h4" fontWeight="bold" sx={{ color: BLACK, mb: 1 }}>
            Portal Contable
          </Typography>
          <Typography variant="h6" color="text.secondary">
            ¿Qué entidad deseas gestionar hoy?
          </Typography>
          {isAdmin && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setShowCounterMgr(true)}
              sx={{ mt: 2, borderColor: ORANGE, color: ORANGE, '&:hover': { bgcolor: '#fff5f0', borderColor: ORANGE } }}
            >
              Gestionar accesos de contadores
            </Button>
          )}
        </Box>
        {isAdmin && showCounterMgr && (
          <CounterAccessManager emitters={emitters} onClose={() => setShowCounterMgr(false)} />
        )}

        {emitters.length === 0 ? (
          <Alert severity="warning" sx={{ mt: 3 }}>
            No tienes empresas asignadas. Contacta a un administrador para que te otorgue permisos.
          </Alert>
        ) : (
          <Grid container spacing={3} justifyContent="center">
            {emitters.map((e) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={e.id}>
                <Card sx={{ border: `2px solid #e5e7eb`, borderRadius: 3, transition: 'all 0.2s',
                  '&:hover': { borderColor: ORANGE, transform: 'translateY(-4px)', boxShadow: '0 8px 24px rgba(240,90,40,0.2)' }
                }}>
                  <CardActionArea onClick={() => setSelectedEmitter(e)} sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      {e.logo_url ? (
                        <Avatar src={e.logo_url} sx={{ width: 64, height: 64, bgcolor: '#fff', border: `2px solid ${ORANGE}` }} />
                      ) : (
                        <Avatar sx={{ width: 64, height: 64, bgcolor: ORANGE, color: 'white' }}>
                          <ApartmentIcon sx={{ fontSize: 36 }} />
                        </Avatar>
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="h6" fontWeight="bold" noWrap sx={{ color: BLACK }}>{e.alias}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                          {e.business_name}
                        </Typography>
                      </Box>
                    </Box>
                    <Divider />
                    <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Chip label={e.rfc} size="small" sx={{ fontFamily: 'monospace', bgcolor: '#fafafa', border: `1px solid #e5e7eb` }} />
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {e.perms.can_view && <Tooltip title="Puede ver"><CheckCircleIcon sx={{ fontSize: 18, color: ORANGE }} /></Tooltip>}
                        {e.perms.can_emit_invoice && <Tooltip title="Puede emitir"><ReceiptLongIcon sx={{ fontSize: 18, color: ORANGE }} /></Tooltip>}
                        {e.perms.can_cancel_invoice && <Tooltip title="Puede cancelar"><CancelIcon sx={{ fontSize: 18, color: RED }} /></Tooltip>}
                      </Box>
                    </Box>
                    <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: 24 }}>
                      {(e.service_types && e.service_types.length > 0) ? (
                        e.service_types.map((st) => (
                          <Chip
                            key={st}
                            label={SERVICE_LABELS[st] || st}
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              borderColor: ORANGE,
                              color: ORANGE,
                              bgcolor: 'rgba(240,90,40,0.06)',
                              '& .MuiChip-label': { px: 1 },
                            }}
                          />
                        ))
                      ) : (
                        <Typography variant="caption" sx={{ color: '#9ca3af', fontStyle: 'italic' }}>
                          Sin servicios asignados
                        </Typography>
                      )}
                    </Box>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    );
  }

  // Vista de empresa seleccionada
  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* Header con switch */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, bgcolor: BLACK, color: 'white' }}>
        <IconButton onClick={() => setSelectedEmitter(null)} sx={{ color: 'white' }}>
          <ArrowBackIcon />
        </IconButton>
        <Avatar sx={{ bgcolor: ORANGE, width: 44, height: 44 }}>
          <ApartmentIcon />
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight="bold">{selectedEmitter.alias}</Typography>
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            {selectedEmitter.business_name} · {selectedEmitter.rfc}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<SwapHorizIcon />}
          onClick={(e) => setSwitchAnchor(e.currentTarget)}
          sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)', textTransform: 'none', '&:hover': { borderColor: ORANGE, bgcolor: 'rgba(240,90,40,0.15)' } }}
        >
          Cambiar empresa
        </Button>
        <Menu anchorEl={switchAnchor} open={!!switchAnchor} onClose={() => setSwitchAnchor(null)}>
          {emitters.filter(e => e.id !== selectedEmitter.id).map(e => (
            <MenuItem key={e.id} onClick={() => { setSelectedEmitter(e); setSwitchAnchor(null); }}>
              <Avatar sx={{ width: 28, height: 28, bgcolor: ORANGE, mr: 1.5 }}><ApartmentIcon sx={{ fontSize: 18 }} /></Avatar>
              <Box>
                <Typography variant="body2" fontWeight="bold">{e.alias}</Typography>
                <Typography variant="caption" color="text.secondary">{e.rfc}</Typography>
              </Box>
            </MenuItem>
          ))}
          {emitters.length === 1 && (
            <MenuItem disabled>
              <Typography variant="caption" color="text.secondary">No tienes otras empresas</Typography>
            </MenuItem>
          )}
        </Menu>
      </Paper>

      <EmitterDashboard emitter={selectedEmitter} />
    </Box>
  );
}

// ============ DASHBOARD por Empresa ============
function EmitterDashboard({ emitter }: { emitter: Emitter }) {
  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoadingSummary(true);
      try {
        const res = await api.get(`/accounting/${emitter.id}/summary`);
        setSummary(res.data);
      } catch (e: any) {
        console.error('summary:', e?.response?.data || e.message);
      } finally {
        setLoadingSummary(false);
      }
    };
    load();
  }, [emitter.id]);

  return (
    <Box>
      {/* KPIs */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <KpiCard color={ORANGE} label="Facturas Activas" value={loadingSummary ? '…' : String(summary?.stats?.invoices_active || 0)} icon={<ReceiptLongIcon />} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KpiCard color={BLACK} label="Monto Facturado" value={loadingSummary ? '…' : fmt(summary?.stats?.invoice_amount_active || 0)} icon={<CheckCircleIcon />} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KpiCard color={RED} label="Canceladas" value={loadingSummary ? '…' : String(summary?.stats?.invoices_canceled || 0)} icon={<CancelIcon />} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <KpiCard color={ORANGE} label="Pendientes timbrar" value={loadingSummary ? '…' : String(summary?.stats?.pending_to_stamp || 0)} icon={<PendingActionsIcon />} />
        </Grid>
      </Grid>

      {/* Tabs de módulos */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            bgcolor: '#fafafa',
            borderBottom: '1px solid #e5e7eb',
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, color: BLACK },
            '& .Mui-selected': { color: `${ORANGE} !important` },
            '& .MuiTabs-indicator': { bgcolor: ORANGE, height: 3 },
          }}
        >
          <Tab label="Facturas Emitidas" icon={<ReceiptLongIcon />} iconPosition="start" />
          <Tab label="Pendientes por Timbrar" icon={<PendingActionsIcon />} iconPosition="start" />
          <Tab label="Inventarios" icon={<Inventory2Icon />} iconPosition="start" />
          <Tab label="Facturas Recibidas" icon={<MoveToInboxIcon />} iconPosition="start" />
          <Tab label="Cuentas por Pagar" icon={<PaidIcon />} iconPosition="start" />
          <Tab label="Movimientos Banco" icon={<AccountBalanceIcon />} iconPosition="start" />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {tab === 0 && <InvoicesTab emitter={emitter} />}
          {tab === 1 && <PendingStampTab emitter={emitter} />}
          {tab === 2 && <InventoryTab emitter={emitter} />}
          {tab === 3 && <ReceivedInvoicesTab emitter={emitter} />}
          {tab === 4 && <AccountsPayableTab emitter={emitter} />}
          {tab === 5 && <BankMovementsTab emitter={emitter} />}
        </Box>
      </Paper>
    </Box>
  );
}

function KpiCard({ color, label, value, icon }: { color: string; label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card sx={{ borderRadius: 2, borderLeft: `4px solid ${color}` }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, '&:last-child': { pb: 2 } }}>
        <Avatar sx={{ bgcolor: color, width: 44, height: 44 }}>{icon}</Avatar>
        <Box>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography variant="h6" fontWeight="bold" sx={{ color: BLACK, lineHeight: 1.2 }}>{value}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

// ============ Facturas Emitidas ============
function InvoicesTab({ emitter }: { emitter: Emitter }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'canceled'>('all');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const res = await api.get(`/accounting/${emitter.id}/invoices`, { params });
      setRows(res.data.invoices || []);
    } catch (e: any) {
      console.error('invoices:', e?.response?.data || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [emitter.id, statusFilter]); // eslint-disable-line

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Buscar folio, UUID, RFC o razón social…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          sx={{ minWidth: 280 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <Button variant="contained" onClick={load} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK }, textTransform: 'none' }}>Buscar</Button>
        <Box sx={{ flex: 1 }} />
        <Chip label="Todas" size="small" onClick={() => setStatusFilter('all')} color={statusFilter === 'all' ? 'default' : undefined} sx={{ bgcolor: statusFilter === 'all' ? BLACK : undefined, color: statusFilter === 'all' ? 'white' : undefined }} />
        <Chip label="Vigentes" size="small" onClick={() => setStatusFilter('valid')} sx={{ bgcolor: statusFilter === 'valid' ? ORANGE : undefined, color: statusFilter === 'valid' ? 'white' : undefined }} />
        <Chip label="Canceladas" size="small" onClick={() => setStatusFilter('canceled')} sx={{ bgcolor: statusFilter === 'canceled' ? RED : undefined, color: statusFilter === 'canceled' ? 'white' : undefined }} />
        <Tooltip title={emitter.perms.can_emit_invoice ? 'Crear factura desde cero' : 'Sin permiso para emitir en esta empresa'}>
          <span>
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              size="small"
              disabled={!emitter.perms.can_emit_invoice}
              onClick={() => setNewOpen(true)}
              sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK }, textTransform: 'none', ml: 1 }}
            >
              Nueva Factura
            </Button>
          </span>
        </Tooltip>
      </Box>

      {loading ? (
        <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress sx={{ color: ORANGE }} /></Box>
      ) : rows.length === 0 ? (
        <Alert severity="info">No hay facturas con los filtros actuales.</Alert>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Folio</TableCell>
              <TableCell>Cliente</TableCell>
              <TableCell>RFC</TableCell>
              <TableCell>UUID</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Fecha</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{r.serie || ''}{r.folio || '—'}</TableCell>
                <TableCell>{r.receptor_razon_social || r.cliente_nombre || '—'}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.receptor_rfc}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.7rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <Tooltip title={r.uuid_sat || ''}><span>{r.uuid_sat?.slice(0, 8) || '—'}…</span></Tooltip>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(parseFloat(r.total))}</TableCell>
                <TableCell>
                  {(r.status === 'canceled' || r.canceled_at) ? (
                    <Chip label="Cancelada" size="small" sx={{ bgcolor: RED, color: 'white' }} />
                  ) : (
                    <Chip label="Vigente" size="small" sx={{ bgcolor: ORANGE, color: 'white' }} />
                  )}
                </TableCell>
                <TableCell>{fmtDate(r.created_at)}</TableCell>
                <TableCell align="center">
                  {r.pdf_url && (
                    <Tooltip title="Descargar PDF">
                      <IconButton size="small" onClick={() => window.open(r.pdf_url, '_blank')}>
                        <PictureAsPdfIcon fontSize="small" sx={{ color: RED }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {r.xml_url && (
                    <Tooltip title="Descargar XML">
                      <IconButton size="small" onClick={() => window.open(r.xml_url, '_blank')}>
                        <CodeIcon fontSize="small" sx={{ color: BLACK }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Refrescar estatus SAT">
                    <IconButton size="small" onClick={async () => {
                      try {
                        const res = await api.get(`/admin/invoices/${r.id}/cancellation-status`, { params: { source: 'emitidas' } });
                        alert(`Estatus SAT: ${res.data.sat_status}\nDB: ${res.data.db_status}`);
                        load();
                      } catch (e: any) {
                        alert(e?.response?.data?.error || 'Error consultando SAT');
                      }
                    }}>
                      <RefreshIcon fontSize="small" sx={{ color: ORANGE }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <NewInvoiceDialog open={newOpen} emitter={emitter} onClose={() => setNewOpen(false)} onCreated={load} />
    </Box>
  );
}

// ============ Catálogos SAT (subset usable) ============
const USO_CFDI_OPTIONS: { code: string; label: string }[] = [
  { code: 'G01', label: 'G01 - Adquisición de mercancías' },
  { code: 'G02', label: 'G02 - Devoluciones, descuentos o bonificaciones' },
  { code: 'G03', label: 'G03 - Gastos en general' },
  { code: 'I01', label: 'I01 - Construcciones' },
  { code: 'I02', label: 'I02 - Mobiliario y equipo de oficina' },
  { code: 'I04', label: 'I04 - Equipo de cómputo y accesorios' },
  { code: 'I06', label: 'I06 - Comunicaciones telefónicas' },
  { code: 'I08', label: 'I08 - Otra maquinaria y equipo' },
  { code: 'D01', label: 'D01 - Honorarios médicos, dentales y hospitalarios' },
  { code: 'P01', label: 'P01 - Por definir' },
  { code: 'S01', label: 'S01 - Sin efectos fiscales' },
  { code: 'CP01', label: 'CP01 - Pagos' },
];

const REGIMEN_FISCAL_OPTIONS: { code: string; label: string }[] = [
  { code: '601', label: '601 - General de Ley Personas Morales' },
  { code: '603', label: '603 - Personas Morales con Fines no Lucrativos' },
  { code: '605', label: '605 - Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { code: '606', label: '606 - Arrendamiento' },
  { code: '608', label: '608 - Demás ingresos' },
  { code: '610', label: '610 - Residentes en el Extranjero sin Establecimiento Permanente en México' },
  { code: '611', label: '611 - Ingresos por Dividendos (socios y accionistas)' },
  { code: '612', label: '612 - Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '614', label: '614 - Ingresos por intereses' },
  { code: '615', label: '615 - Régimen de los ingresos por obtención de premios' },
  { code: '616', label: '616 - Sin obligaciones fiscales' },
  { code: '621', label: '621 - Incorporación Fiscal' },
  { code: '622', label: '622 - Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { code: '625', label: '625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
  { code: '626', label: '626 - Régimen Simplificado de Confianza' },
];

const PAYMENT_FORM_OPTIONS: { code: string; label: string }[] = [
  { code: '01', label: '01 - Efectivo' },
  { code: '02', label: '02 - Cheque nominativo' },
  { code: '03', label: '03 - Transferencia electrónica de fondos' },
  { code: '04', label: '04 - Tarjeta de crédito' },
  { code: '05', label: '05 - Monedero electrónico' },
  { code: '28', label: '28 - Tarjeta de débito' },
  { code: '99', label: '99 - Por definir' },
];

const UNIT_OPTIONS: { code: string; label: string }[] = [
  { code: 'E48', label: 'E48 - Unidad de servicio' },
  { code: 'H87', label: 'H87 - Pieza' },
  { code: 'KGM', label: 'KGM - Kilogramo' },
  { code: 'LTR', label: 'LTR - Litro' },
  { code: 'MTR', label: 'MTR - Metro' },
  { code: 'XBX', label: 'XBX - Caja' },
  { code: 'ACT', label: 'ACT - Actividad' },
  { code: 'HUR', label: 'HUR - Hora' },
];

const IVA_RATE_OPTIONS = [
  { value: 0, label: '0%' },
  { value: 0.08, label: '8% (frontera)' },
  { value: 0.16, label: '16%' },
];
const IVA_RETENTION_OPTIONS = [
  { value: 0, label: 'Sin retención' },
  { value: 0.10666667, label: 'IVA 10.6667% (2/3)' },
  { value: 0.04, label: 'IVA 4%' },
];
const ISR_RETENTION_OPTIONS = [
  { value: 0, label: 'Sin retención' },
  { value: 0.10, label: 'ISR 10%' },
  { value: 0.0125, label: 'ISR 1.25%' },
];

type ManualItem = {
  uid: string;
  product_id?: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  sat_clave_prod_serv: string;
  sat_clave_unidad: string;
  no_identificacion?: string;
  iva_rate: number;
  iva_retention_rate: number;
  isr_retention_rate: number;
  discount: number;
};

function newEmptyItem(): ManualItem {
  return {
    uid: Math.random().toString(36).slice(2),
    product_id: null,
    description: '',
    quantity: 1,
    unit_price: 0,
    sat_clave_prod_serv: '',
    sat_clave_unidad: 'E48',
    no_identificacion: '',
    iva_rate: 0.16,
    iva_retention_rate: 0,
    isr_retention_rate: 0,
    discount: 0,
  };
}

function NewInvoiceDialog({ open, emitter, onClose, onCreated }: {
  open: boolean; emitter: Emitter; onClose: () => void; onCreated: () => void;
}) {
  const [step, setStep] = useState(0);

  // Receptor
  const [clientQuery, setClientQuery] = useState('');
  const [clientOptions, setClientOptions] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [receptor, setReceptor] = useState({
    rfc: '', razon_social: '', regimen_fiscal: '616', cp: '', uso_cfdi: 'G03', email: '', user_id: null as number | null,
  });

  // Conceptos
  const [items, setItems] = useState<ManualItem[]>([newEmptyItem()]);
  const [products, setProducts] = useState<any[]>([]);

  // Pago
  const [paymentForm, setPaymentForm] = useState('03');
  const [paymentMethod, setPaymentMethod] = useState<'PUE' | 'PPD'>('PUE');
  const [currency, setCurrency] = useState('MXN');
  const [serie, setSerie] = useState('');
  const [folio, setFolio] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setClientQuery(''); setClientOptions([]); setSelectedClient(null);
    setReceptor({ rfc: '', razon_social: '', regimen_fiscal: '616', cp: '', uso_cfdi: 'G03', email: '', user_id: null });
    setItems([newEmptyItem()]);
    setPaymentForm('03'); setPaymentMethod('PUE'); setCurrency('MXN');
    setSerie(''); setFolio(''); setErr(null);
    // Cargar catálogo de productos
    (async () => {
      try {
        const r = await api.get(`/accounting/${emitter.id}/products`, { params: { limit: 200 } });
        setProducts(r.data.products || []);
      } catch { setProducts([]); }
    })();
  }, [open, emitter.id]);

  // Búsqueda de clientes (debounced)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/accounting/${emitter.id}/fiscal-clients`, { params: { search: clientQuery } });
        setClientOptions(r.data.clients || []);
      } catch { setClientOptions([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [clientQuery, emitter.id, open]);

  const applyClient = (c: any | null) => {
    setSelectedClient(c);
    if (c) {
      const inferredUso = (c.rfc || '').toUpperCase() === 'XAXX010101000' ? 'S01' : 'G03';
      setReceptor({
        rfc: c.rfc || '',
        razon_social: c.razon_social || c.full_name || '',
        regimen_fiscal: c.regimen_fiscal || '616',
        cp: c.cp || '',
        uso_cfdi: inferredUso,
        email: c.email || '',
        user_id: c.id || null,
      });
    }
  };

  const setItem = (uid: string, patch: Partial<ManualItem>) => {
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, newEmptyItem()]);
  const removeItem = (uid: string) => setItems((prev) => prev.length > 1 ? prev.filter((it) => it.uid !== uid) : prev);
  const applyProduct = (uid: string, p: any | null) => {
    if (!p) { setItem(uid, { product_id: null }); return; }
    setItem(uid, {
      product_id: p.id,
      description: p.description || '',
      unit_price: parseFloat(p.unit_price) || 0,
      sat_clave_prod_serv: p.sat_clave_prod_serv || '',
      sat_clave_unidad: p.sat_clave_unidad || 'E48',
      no_identificacion: p.sku || '',
      iva_rate: typeof p.tax_rate === 'string' ? parseFloat(p.tax_rate) : (p.tax_rate ?? 0.16),
    });
  };

  // Totales
  const totals = items.reduce((acc, it) => {
    const sub = Math.max(0, (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0));
    const iva = sub * (Number(it.iva_rate) || 0);
    const ivaRet = sub * (Number(it.iva_retention_rate) || 0);
    const isrRet = sub * (Number(it.isr_retention_rate) || 0);
    acc.subtotal += sub;
    acc.iva += iva;
    acc.retenciones += ivaRet + isrRet;
    return acc;
  }, { subtotal: 0, iva: 0, retenciones: 0 });
  const total = totals.subtotal + totals.iva - totals.retenciones;

  // Validaciones para avanzar de paso
  const receptorValid =
    /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i.test(receptor.rfc.trim()) &&
    !!receptor.razon_social.trim() &&
    !!receptor.regimen_fiscal &&
    /^\d{5}$/.test(receptor.cp.trim()) &&
    !!receptor.uso_cfdi;
  const itemsValid = items.length > 0 && items.every((it) =>
    !!it.description.trim() && !!it.sat_clave_prod_serv.trim() && Number(it.quantity) > 0 && Number(it.unit_price) >= 0
  );

  const submit = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      const payload = {
        receptor: {
          rfc: receptor.rfc.toUpperCase().trim(),
          razon_social: receptor.razon_social.trim(),
          regimen_fiscal: receptor.regimen_fiscal,
          cp: receptor.cp.trim(),
          uso_cfdi: receptor.uso_cfdi,
          email: receptor.email.trim() || undefined,
          user_id: receptor.user_id,
        },
        items: items.map((it) => ({
          description: it.description.trim(),
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          sat_clave_prod_serv: it.sat_clave_prod_serv.trim(),
          sat_clave_unidad: it.sat_clave_unidad || 'E48',
          no_identificacion: it.no_identificacion?.trim() || undefined,
          discount: Number(it.discount) || 0,
          iva_rate: Number(it.iva_rate) || 0,
          iva_retention_rate: Number(it.iva_retention_rate) || 0,
          isr_retention_rate: Number(it.isr_retention_rate) || 0,
        })),
        payment_form: paymentForm,
        payment_method: paymentMethod,
        currency,
        serie: serie.trim() || undefined,
        folio: folio.trim() ? Number(folio) : undefined,
      };
      const r = await api.post(`/accounting/${emitter.id}/invoices/manual`, payload);
      if (r.data?.success) {
        onCreated();
        onClose();
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ bgcolor: BLACK, color: 'white' }}>
        Nueva Factura — {emitter.alias || emitter.business_name}
        <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>{emitter.rfc}</Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          <Step><StepLabel>Receptor</StepLabel></Step>
          <Step><StepLabel>Conceptos y pago</StepLabel></Step>
        </Stepper>

        {step === 0 && (
          <Stack spacing={2}>
            <Autocomplete
              options={clientOptions}
              value={selectedClient}
              onChange={(_, v) => applyClient(v)}
              onInputChange={(_, v) => setClientQuery(v)}
              getOptionLabel={(o) => `${o.razon_social || o.full_name || ''} (${o.rfc})`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(p) => <TextField {...p} size="small" label="Buscar cliente existente (RFC, razón social, email)" />}
              noOptionsText="Sin resultados — escribe los datos manualmente abajo"
            />
            <Divider><Chip label="Datos fiscales del receptor" size="small" /></Divider>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth size="small" label="RFC *" value={receptor.rfc}
                  onChange={(e) => setReceptor({ ...receptor, rfc: e.target.value.toUpperCase() })}
                  inputProps={{ style: { fontFamily: 'monospace' }, maxLength: 13 }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 8 }}>
                <TextField fullWidth size="small" label="Razón social *" value={receptor.razon_social}
                  onChange={(e) => setReceptor({ ...receptor, razon_social: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Régimen fiscal *</InputLabel>
                  <Select label="Régimen fiscal *" value={receptor.regimen_fiscal}
                    onChange={(e) => setReceptor({ ...receptor, regimen_fiscal: String(e.target.value) })}>
                    {REGIMEN_FISCAL_OPTIONS.map((o) => <MenuItem key={o.code} value={o.code}>{o.label}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <TextField fullWidth size="small" label="CP receptor *" value={receptor.cp}
                  onChange={(e) => setReceptor({ ...receptor, cp: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Uso CFDI *</InputLabel>
                  <Select label="Uso CFDI *" value={receptor.uso_cfdi}
                    onChange={(e) => setReceptor({ ...receptor, uso_cfdi: String(e.target.value) })}>
                    {USO_CFDI_OPTIONS.map((o) => <MenuItem key={o.code} value={o.code}>{o.label}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth size="small" label="Email (opcional, para envío del CFDI)" value={receptor.email}
                  onChange={(e) => setReceptor({ ...receptor, email: e.target.value })} />
              </Grid>
            </Grid>
          </Stack>
        )}

        {step === 1 && (
          <Stack spacing={2}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Conceptos</Typography>
            {items.map((it, idx) => (
              <Paper key={it.uid} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>Concepto #{idx + 1}</Typography>
                    <Box sx={{ flex: 1 }} />
                    <IconButton size="small" disabled={items.length <= 1} onClick={() => removeItem(it.uid)}>
                      <DeleteIcon fontSize="small" sx={{ color: items.length <= 1 ? 'grey.400' : RED }} />
                    </IconButton>
                  </Box>
                  <Autocomplete
                    options={products}
                    value={products.find((p) => p.id === it.product_id) || null}
                    onChange={(_, v) => applyProduct(it.uid, v)}
                    getOptionLabel={(o) => `${o.sku ? `[${o.sku}] ` : ''}${o.description} — ${fmt(parseFloat(o.unit_price) || 0)}`}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(p) => <TextField {...p} size="small" label="Buscar en inventario (opcional)" />}
                    noOptionsText="Sin productos — captura manualmente abajo"
                  />
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <TextField fullWidth size="small" label="Descripción *" value={it.description}
                        onChange={(e) => setItem(it.uid, { description: e.target.value })} />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <TextField fullWidth size="small" label="Clave SAT prod/serv *" value={it.sat_clave_prod_serv}
                        onChange={(e) => setItem(it.uid, { sat_clave_prod_serv: e.target.value })}
                        inputProps={{ style: { fontFamily: 'monospace' }, maxLength: 8 }} />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Unidad</InputLabel>
                        <Select label="Unidad" value={it.sat_clave_unidad}
                          onChange={(e) => setItem(it.uid, { sat_clave_unidad: String(e.target.value) })}>
                          {UNIT_OPTIONS.map((u) => <MenuItem key={u.code} value={u.code}>{u.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 4, md: 2 }}>
                      <TextField fullWidth size="small" type="number" label="Cantidad *" value={it.quantity}
                        onChange={(e) => setItem(it.uid, { quantity: Number(e.target.value) })}
                        inputProps={{ min: 0, step: '0.01' }} />
                    </Grid>
                    <Grid size={{ xs: 4, md: 2 }}>
                      <TextField fullWidth size="small" type="number" label="Precio unitario *" value={it.unit_price}
                        onChange={(e) => setItem(it.uid, { unit_price: Number(e.target.value) })}
                        inputProps={{ min: 0, step: '0.01' }} />
                    </Grid>
                    <Grid size={{ xs: 4, md: 2 }}>
                      <TextField fullWidth size="small" type="number" label="Descuento" value={it.discount}
                        onChange={(e) => setItem(it.uid, { discount: Number(e.target.value) })}
                        inputProps={{ min: 0, step: '0.01' }} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 2 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>IVA</InputLabel>
                        <Select label="IVA" value={it.iva_rate}
                          onChange={(e) => setItem(it.uid, { iva_rate: Number(e.target.value) })}>
                          {IVA_RATE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 6, md: 2 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Ret. IVA</InputLabel>
                        <Select label="Ret. IVA" value={it.iva_retention_rate}
                          onChange={(e) => setItem(it.uid, { iva_retention_rate: Number(e.target.value) })}>
                          {IVA_RETENTION_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 6, md: 2 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Ret. ISR</InputLabel>
                        <Select label="Ret. ISR" value={it.isr_retention_rate}
                          onChange={(e) => setItem(it.uid, { isr_retention_rate: Number(e.target.value) })}>
                          {ISR_RETENTION_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.85rem', color: 'text.secondary' }}>
                    Importe: <b style={{ marginLeft: 6 }}>
                      {fmt(Math.max(0, (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0)))}
                    </b>
                  </Box>
                </Stack>
              </Paper>
            ))}
            <Box>
              <Button startIcon={<AddIcon />} onClick={addItem} sx={{ textTransform: 'none', color: ORANGE }}>
                Agregar concepto
              </Button>
            </Box>

            <Divider><Chip label="Datos de pago" size="small" /></Divider>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Forma de pago</InputLabel>
                  <Select label="Forma de pago" value={paymentForm} onChange={(e) => setPaymentForm(String(e.target.value))}>
                    {PAYMENT_FORM_OPTIONS.map((o) => <MenuItem key={o.code} value={o.code}>{o.label}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Método</InputLabel>
                  <Select label="Método" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'PUE' | 'PPD')}>
                    <MenuItem value="PUE">PUE (Pago en una exhibición)</MenuItem>
                    <MenuItem value="PPD">PPD (Pago en parcialidades)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Moneda</InputLabel>
                  <Select label="Moneda" value={currency} onChange={(e) => setCurrency(String(e.target.value))}>
                    <MenuItem value="MXN">MXN</MenuItem>
                    <MenuItem value="USD">USD</MenuItem>
                    <MenuItem value="EUR">EUR</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField fullWidth size="small" label="Serie" value={serie}
                  onChange={(e) => setSerie(e.target.value.toUpperCase())} inputProps={{ maxLength: 10 }} />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField fullWidth size="small" type="number" label="Folio" value={folio}
                  onChange={(e) => setFolio(e.target.value)} />
              </Grid>
            </Grid>

            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#fafafa' }}>
              <Stack spacing={0.5}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span><b>{fmt(totals.subtotal)}</b>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>IVA</span><b>{fmt(totals.iva)}</b>
                </Box>
                {totals.retenciones > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: RED }}>
                    <span>Retenciones</span><b>−{fmt(totals.retenciones)}</b>
                  </Box>
                )}
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
                  <b>Total</b><b style={{ color: ORANGE }}>{fmt(total)}</b>
                </Box>
              </Stack>
            </Paper>
          </Stack>
        )}

        {err && <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
        {step === 1 && <Button onClick={() => setStep(0)} disabled={submitting}>Atrás</Button>}
        {step === 0 && (
          <Button variant="contained"
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK } }}
            disabled={!receptorValid}
            onClick={() => setStep(1)}>
            Siguiente
          </Button>
        )}
        {step === 1 && (
          <Button variant="contained"
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK } }}
            disabled={!itemsValid || submitting}
            onClick={submit}>
            {submitting ? 'Timbrando…' : `Emitir CFDI · ${fmt(total)}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// =======================================================================
// INVENTARIOS
// =======================================================================
function InventoryTab({ emitter }: { emitter: Emitter }) {
  const [subTab, setSubTab] = useState(0);
  return (
    <Box>
      <Tabs
        value={subTab}
        onChange={(_, v) => setSubTab(v)}
        sx={{
          mb: 2,
          minHeight: 40,
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 40, color: BLACK },
          '& .Mui-selected': { color: `${ORANGE} !important` },
          '& .MuiTabs-indicator': { bgcolor: ORANGE },
        }}
      >
        <Tab label="Productos" icon={<Inventory2Icon fontSize="small" />} iconPosition="start" />
        <Tab label="Categorías" icon={<CategoryIcon fontSize="small" />} iconPosition="start" />
      </Tabs>
      {subTab === 0 && <ProductsSection emitter={emitter} />}
      {subTab === 1 && <CategoriesSection emitter={emitter} />}
    </Box>
  );
}

function CategoriesSection({ emitter }: { emitter: Emitter }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ open: boolean; row: any | null }>({ open: false, row: null });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/accounting/${emitter.id}/categories`);
      setRows(res.data.categories || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [emitter.id]); // eslint-disable-line

  const save = async (data: any) => {
    if (dialog.row?.id) {
      await api.put(`/accounting/${emitter.id}/categories/${dialog.row.id}`, data);
    } else {
      await api.post(`/accounting/${emitter.id}/categories`, data);
    }
    setDialog({ open: false, row: null });
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('¿Eliminar categoría?')) return;
    await api.delete(`/accounting/${emitter.id}/categories/${id}`);
    load();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', mb: 2 }}>
        <Typography variant="subtitle2" sx={{ flex: 1, color: BLACK }}>Categorías de producto/servicio</Typography>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDialog({ open: true, row: null })} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK }, textTransform: 'none' }}>Nueva categoría</Button>
      </Box>

      {loading ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress sx={{ color: ORANGE }} /></Box> :
        rows.length === 0 ? <Alert severity="info">Aún no hay categorías. Crea la primera para organizar tu inventario.</Alert> : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Clave SAT</TableCell>
                <TableCell>Unidad</TableCell>
                <TableCell align="right">IVA</TableCell>
                <TableCell align="right">Productos</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {r.color && <Box sx={{ width: 12, height: 12, bgcolor: r.color, borderRadius: '50%' }} />}
                      <Typography variant="body2" fontWeight="bold">{r.name}</Typography>
                    </Box>
                    {r.description && <Typography variant="caption" color="text.secondary">{r.description}</Typography>}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{r.sat_clave_prod_serv || '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{r.sat_clave_unidad}</TableCell>
                  <TableCell align="right">{(parseFloat(r.default_tax_rate) * 100).toFixed(0)}%</TableCell>
                  <TableCell align="right">{r.product_count}</TableCell>
                  <TableCell align="center">
                    <IconButton size="small" onClick={() => setDialog({ open: true, row: r })}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => remove(r.id)}><DeleteIcon fontSize="small" sx={{ color: RED }} /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

      <CategoryDialog open={dialog.open} row={dialog.row} onClose={() => setDialog({ open: false, row: null })} onSave={save} />
    </Box>
  );
}

function CategoryDialog({ open, row, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    setForm(row || { name: '', description: '', sat_clave_prod_serv: '', sat_clave_unidad: 'H87', default_tax_rate: 0.16, color: '#F05A28' });
  }, [row, open]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: BLACK, color: 'white' }}>{row ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Nombre *" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth size="small" />
          <TextField label="Descripción" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth size="small" multiline rows={2} />
          <Stack direction="row" spacing={2}>
            <TextField label="Clave SAT ProdServ" value={form.sat_clave_prod_serv || ''} onChange={(e) => setForm({ ...form, sat_clave_prod_serv: e.target.value })} size="small" sx={{ flex: 1 }} helperText="Ej: 78101800" />
            <TextField label="Clave Unidad SAT" value={form.sat_clave_unidad || 'H87'} onChange={(e) => setForm({ ...form, sat_clave_unidad: e.target.value })} size="small" sx={{ width: 140 }} helperText="Ej: H87 (Pieza)" />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="IVA (decimal)" type="number" inputProps={{ step: 0.01, min: 0, max: 1 }} value={form.default_tax_rate ?? 0.16} onChange={(e) => setForm({ ...form, default_tax_rate: parseFloat(e.target.value) })} size="small" sx={{ flex: 1 }} helperText="0.16 = 16%" />
            <TextField label="Color" type="color" value={form.color || '#F05A28'} onChange={(e) => setForm({ ...form, color: e.target.value })} size="small" sx={{ width: 120 }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK } }} onClick={() => onSave(form)} disabled={!form.name}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}

function ProductsSection({ emitter }: { emitter: Emitter }) {
  const [rows, setRows] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [lowStock, setLowStock] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; row: any | null }>({ open: false, row: null });
  const [stockDialog, setStockDialog] = useState<{ open: boolean; row: any | null }>({ open: false, row: null });

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search.trim()) params.search = search.trim();
      if (catFilter !== 'all') params.category_id = catFilter;
      if (lowStock) params.low_stock = 'true';
      const [pr, cr] = await Promise.all([
        api.get(`/accounting/${emitter.id}/products`, { params }),
        api.get(`/accounting/${emitter.id}/categories`),
      ]);
      setRows(pr.data.products || []);
      setCategories(cr.data.categories || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [emitter.id, catFilter, lowStock]); // eslint-disable-line

  const save = async (data: any) => {
    if (dialog.row?.id) await api.put(`/accounting/${emitter.id}/products/${dialog.row.id}`, data);
    else await api.post(`/accounting/${emitter.id}/products`, data);
    setDialog({ open: false, row: null });
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('¿Eliminar producto del catálogo?')) return;
    await api.delete(`/accounting/${emitter.id}/products/${id}`);
    load();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="Buscar SKU, descripción, clave SAT…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
          sx={{ minWidth: 280 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Categoría</InputLabel>
          <Select label="Categoría" value={catFilter} onChange={(e) => setCatFilter(String(e.target.value))}>
            <MenuItem value="all">Todas</MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControlLabel control={<Switch size="small" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />} label="Stock bajo" />
        <Button variant="contained" size="small" onClick={load} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK }, textTransform: 'none' }}>Buscar</Button>
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setDialog({ open: true, row: null })} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK }, textTransform: 'none' }}>Nuevo producto</Button>
      </Box>

      {loading ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress sx={{ color: ORANGE }} /></Box> :
        rows.length === 0 ? <Alert severity="info">No hay productos con los filtros actuales. Crea el primero o importa desde una factura recibida.</Alert> : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Categoría</TableCell>
                <TableCell>Clave SAT</TableCell>
                <TableCell align="right">Precio</TableCell>
                <TableCell align="right">IVA</TableCell>
                <TableCell align="right">Stock</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const low = parseFloat(r.stock_qty) <= parseFloat(r.min_stock || 0) && parseFloat(r.min_stock || 0) > 0;
                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.sku || '—'}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">{r.description}</Typography>
                      {r.is_service && <Chip label="Servicio" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />}
                    </TableCell>
                    <TableCell>
                      {r.category_name ? <Chip label={r.category_name} size="small" sx={{ bgcolor: r.category_color || '#e5e7eb', color: r.category_color ? 'white' : BLACK }} /> : '—'}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.sat_clave_prod_serv}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(parseFloat(r.unit_price))}</TableCell>
                    <TableCell align="right">{(parseFloat(r.tax_rate) * 100).toFixed(0)}%</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                        {low && <Tooltip title="Stock bajo"><WarningAmberIcon fontSize="small" sx={{ color: RED }} /></Tooltip>}
                        <Typography variant="body2" fontWeight="bold" sx={{ color: low ? RED : BLACK }}>{parseFloat(r.stock_qty).toFixed(r.is_service ? 0 : 2)}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Movimiento de stock">
                        <IconButton size="small" onClick={() => setStockDialog({ open: true, row: r })}><Inventory2Icon fontSize="small" sx={{ color: ORANGE }} /></IconButton>
                      </Tooltip>
                      <IconButton size="small" onClick={() => setDialog({ open: true, row: r })}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => remove(r.id)}><DeleteIcon fontSize="small" sx={{ color: RED }} /></IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

      <ProductDialog open={dialog.open} row={dialog.row} categories={categories} onClose={() => setDialog({ open: false, row: null })} onSave={save} />
      <StockAdjustDialog open={stockDialog.open} row={stockDialog.row} emitterId={emitter.id} onClose={() => setStockDialog({ open: false, row: null })} onSaved={load} />
    </Box>
  );
}

function ProductDialog({ open, row, categories, onClose, onSave }: any) {
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    setForm(row || {
      category_id: '', sku: '', description: '', sat_clave_prod_serv: '',
      sat_clave_unidad: 'H87', unit_measure: 'Pieza', unit_price: 0, currency: 'MXN',
      tax_rate: 0.16, tax_included: false, stock_qty: 0, min_stock: 0,
      barcode: '', is_service: false, notes: ''
    });
  }, [row, open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ bgcolor: BLACK, color: 'white' }}>{row ? 'Editar producto' : 'Nuevo producto / servicio'}</DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField label="Descripción *" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth size="small" />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="SKU / Código" value={form.sku || ''} onChange={(e) => setForm({ ...form, sku: e.target.value })} fullWidth size="small" />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Categoría</InputLabel>
              <Select label="Categoría" value={form.category_id || ''} onChange={(e) => {
                const cat = categories.find((c: any) => c.id === e.target.value);
                setForm({
                  ...form,
                  category_id: e.target.value,
                  sat_clave_prod_serv: form.sat_clave_prod_serv || cat?.sat_clave_prod_serv || '',
                  sat_clave_unidad: form.sat_clave_unidad || cat?.sat_clave_unidad || 'H87',
                  tax_rate: form.tax_rate ?? cat?.default_tax_rate ?? 0.16,
                });
              }}>
                <MenuItem value=""><em>Sin categoría</em></MenuItem>
                {categories.map((c: any) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField label="Clave SAT ProdServ *" value={form.sat_clave_prod_serv || ''} onChange={(e) => setForm({ ...form, sat_clave_prod_serv: e.target.value })} fullWidth size="small" helperText="Ej: 78101800" />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField label="Clave Unidad SAT *" value={form.sat_clave_unidad || 'H87'} onChange={(e) => setForm({ ...form, sat_clave_unidad: e.target.value })} fullWidth size="small" helperText="Ej: H87" />
          </Grid>

          <Grid size={{ xs: 6, md: 3 }}>
            <TextField label="Unidad (visual)" value={form.unit_measure || 'Pieza'} onChange={(e) => setForm({ ...form, unit_measure: e.target.value })} fullWidth size="small" />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField label="Precio unitario" type="number" inputProps={{ step: 0.01 }} value={form.unit_price ?? 0} onChange={(e) => setForm({ ...form, unit_price: parseFloat(e.target.value) })} fullWidth size="small" />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Moneda</InputLabel>
              <Select label="Moneda" value={form.currency || 'MXN'} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <MenuItem value="MXN">MXN</MenuItem>
                <MenuItem value="USD">USD</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <TextField label="IVA" type="number" inputProps={{ step: 0.01, min: 0, max: 1 }} value={form.tax_rate ?? 0.16} onChange={(e) => setForm({ ...form, tax_rate: parseFloat(e.target.value) })} fullWidth size="small" helperText="0.16 = 16%" />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControlLabel control={<Switch checked={!!form.tax_included} onChange={(e) => setForm({ ...form, tax_included: e.target.checked })} />} label="IVA incl." />
          </Grid>

          <Grid size={{ xs: 6, md: 3 }}>
            <TextField label="Stock inicial" type="number" inputProps={{ step: 0.01 }} value={form.stock_qty ?? 0} onChange={(e) => setForm({ ...form, stock_qty: parseFloat(e.target.value) })} fullWidth size="small" disabled={!!row} helperText={row ? 'Usa movimiento de stock' : ''} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField label="Stock mínimo" type="number" inputProps={{ step: 0.01 }} value={form.min_stock ?? 0} onChange={(e) => setForm({ ...form, min_stock: parseFloat(e.target.value) })} fullWidth size="small" />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Código de barras" value={form.barcode || ''} onChange={(e) => setForm({ ...form, barcode: e.target.value })} fullWidth size="small" />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <FormControlLabel control={<Switch checked={!!form.is_service} onChange={(e) => setForm({ ...form, is_service: e.target.checked })} />} label="Servicio" />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField label="Notas" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} fullWidth size="small" multiline rows={2} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK } }} onClick={() => onSave(form)} disabled={!form.description || !form.sat_clave_prod_serv}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}

function StockAdjustDialog({ open, row, emitterId, onClose, onSaved }: any) {
  const [type, setType] = useState<'in' | 'out' | 'adjust'>('in');
  const [qty, setQty] = useState<string>('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setType('in'); setQty(''); setReason(''); } }, [open]);

  const save = async () => {
    if (!qty) return;
    setSaving(true);
    try {
      await api.post(`/accounting/${emitterId}/products/${row.id}/stock`, {
        movement_type: type, quantity: parseFloat(qty), reason
      });
      onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  if (!row) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ bgcolor: BLACK, color: 'white' }}>Movimiento de inventario</DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Typography variant="body2" sx={{ mb: 2 }}>{row.description} · Stock actual: <b>{parseFloat(row.stock_qty).toFixed(2)}</b></Typography>
        <Stack spacing={2}>
          <FormControl size="small" fullWidth>
            <InputLabel>Tipo</InputLabel>
            <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value as any)}>
              <MenuItem value="in">Entrada (sumar)</MenuItem>
              <MenuItem value="out">Salida (restar)</MenuItem>
              <MenuItem value="adjust">Ajuste (fijar cantidad)</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Cantidad" type="number" inputProps={{ step: 0.01 }} value={qty} onChange={(e) => setQty(e.target.value)} size="small" fullWidth />
          <TextField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} size="small" fullWidth multiline rows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK } }} onClick={save} disabled={saving || !qty}>Aplicar</Button>
      </DialogActions>
    </Dialog>
  );
}

// =======================================================================
// FACTURAS RECIBIDAS
// =======================================================================
function ReceivedInvoicesTab({ emitter }: { emitter: Emitter }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search.trim()) params.search = search.trim();
      const res = await api.get(`/accounting/${emitter.id}/received-invoices`, { params });
      setRows(res.data.invoices || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [emitter.id]); // eslint-disable-line

  const remove = async (id: number) => {
    if (!confirm('¿Eliminar factura recibida? Se revertirá el inventario importado.')) return;
    await api.delete(`/accounting/${emitter.id}/received-invoices/${id}`);
    load();
  };

  const [importingId, setImportingId] = useState<number | null>(null);
  const importToInventory = async (row: any) => {
    if (row.tipo_comprobante !== 'I') {
      alert('Sólo se puede importar inventario de CFDI tipo Ingreso (I).');
      return;
    }
    if (!confirm(`¿Importar al inventario los conceptos de la factura ${row.serie || ''}${row.folio || row.id}? Se crearán/sumarán productos según el XML.`)) return;
    setImportingId(row.id);
    try {
      const res = await api.post(`/accounting/${emitter.id}/received-invoices/${row.id}/import-inventory`);
      const { imported_items, skipped_items, total_items } = res.data || {};
      alert(`Importación completada: ${imported_items}/${total_items} conceptos al inventario${skipped_items ? ` (${skipped_items} omitidos)` : ''}.`);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.response?.data?.message || 'Error al importar al inventario');
    } finally {
      setImportingId(null);
    }
  };

  const openDetail = async (id: number) => {
    const res = await api.get(`/accounting/${emitter.id}/received-invoices/${id}`);
    setDetail({ ...res.data.invoice, items: res.data.items });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="Buscar UUID, RFC emisor, folio…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
          sx={{ minWidth: 300 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <Button variant="contained" size="small" onClick={load} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK }, textTransform: 'none' }}>Buscar</Button>
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<UploadFileIcon />} variant="contained" onClick={() => setUploadOpen(true)} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK }, textTransform: 'none' }}>Subir XML</Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Sube el XML del CFDI recibido de tu proveedor. El sistema extrae los datos y puede <b>cargar automáticamente el inventario</b> si la factura es de tipo Ingreso.
      </Alert>

      {loading ? <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress sx={{ color: ORANGE }} /></Box> :
        rows.length === 0 ? <Alert severity="info">Aún no has cargado facturas recibidas.</Alert> : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Folio</TableCell>
                <TableCell>Proveedor</TableCell>
                <TableCell>UUID</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Inventario</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover style={{ cursor: 'pointer' }} onClick={() => openDetail(r.id)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{r.serie || ''}{r.folio || '—'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{r.emisor_nombre || '—'}</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{r.emisor_rfc}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                    <Tooltip title={r.uuid_sat || ''}><span>{r.uuid_sat?.slice(0, 8)}…</span></Tooltip>
                  </TableCell>
                  <TableCell>{fmtDate(r.fecha_emision)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(parseFloat(r.total))}</TableCell>
                  <TableCell>
                    <Chip label={r.tipo_comprobante || '—'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {r.inventory_imported ? (
                      <Chip icon={<CheckCircleIcon />} label="Importado" size="small" sx={{ bgcolor: ORANGE, color: 'white' }} />
                    ) : r.tipo_comprobante !== 'I' ? (
                      <Tooltip title="Sólo se puede importar inventario desde CFDI tipo Ingreso (I)">
                        <Chip label="No aplica" size="small" variant="outlined" />
                      </Tooltip>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={importingId === r.id}
                        onClick={() => importToInventory(r)}
                        sx={{ textTransform: 'none', borderColor: ORANGE, color: ORANGE, '&:hover': { borderColor: BLACK, color: BLACK } }}
                      >
                        {importingId === r.id ? 'Importando…' : 'Importar a inventario'}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" onClick={() => remove(r.id)}><DeleteIcon fontSize="small" sx={{ color: RED }} /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

      <UploadXmlDialog open={uploadOpen} emitterId={emitter.id} onClose={() => setUploadOpen(false)} onUploaded={load} />
      <ReceivedInvoiceDetailDialog invoice={detail} onClose={() => setDetail(null)} />
    </Box>
  );
}

function UploadXmlDialog({ open, emitterId, onClose, onUploaded }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [importInv, setImportInv] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setFile(null); setErr(null); setImportInv(false); } }, [open]);

  const upload = async () => {
    if (!file) return;
    setSaving(true); setErr(null);
    try {
      const text = await file.text();
      const res = await api.post(`/accounting/${emitterId}/received-invoices/upload`, {
        xml_content: text, xml_filename: file.name, import_inventory: importInv
      });
      if (res.data?.success) {
        onUploaded();
        onClose();
      }
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.response?.data?.message || e.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: BLACK, color: 'white' }}>Subir CFDI (XML)</DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2}>
          <Box
            onClick={() => inputRef.current?.click()}
            sx={{ border: `2px dashed ${ORANGE}`, borderRadius: 2, p: 4, textAlign: 'center', cursor: 'pointer', bgcolor: '#fff8f5', '&:hover': { bgcolor: '#fff0e8' } }}
          >
            <UploadFileIcon sx={{ fontSize: 48, color: ORANGE, mb: 1 }} />
            <Typography variant="body2" fontWeight="bold">{file ? file.name : 'Haz clic o arrastra el archivo .xml del CFDI'}</Typography>
            <Typography variant="caption" color="text.secondary">Solo XML timbrado por el SAT (Facturama, Contpaqi, etc.)</Typography>
            <input ref={inputRef} type="file" accept=".xml,text/xml,application/xml" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </Box>
          <FormControlLabel control={<Switch checked={importInv} onChange={(e) => setImportInv(e.target.checked)} />} label="Cargar conceptos al inventario automáticamente (solo tipo Ingreso)" />
          {err && <Alert severity="error">{err}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK } }} disabled={!file || saving} onClick={upload}>
          {saving ? 'Procesando…' : 'Subir y procesar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReceivedInvoiceDetailDialog({ invoice, onClose }: any) {
  if (!invoice) return null;
  return (
    <Dialog open={!!invoice} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ bgcolor: BLACK, color: 'white' }}>
        CFDI {invoice.serie || ''}{invoice.folio || '—'}
        <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>{invoice.uuid_sat}</Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="caption" color="text.secondary">Emisor</Typography>
            <Typography variant="body2" fontWeight="bold">{invoice.emisor_nombre}</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{invoice.emisor_rfc}</Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="caption" color="text.secondary">Receptor</Typography>
            <Typography variant="body2" fontWeight="bold">{invoice.receptor_nombre}</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{invoice.receptor_rfc}</Typography>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Subtotal</Typography><Typography fontWeight="bold">{fmt(parseFloat(invoice.subtotal))}</Typography></Grid>
          <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">IVA</Typography><Typography fontWeight="bold">{fmt(parseFloat(invoice.iva))}</Typography></Grid>
          <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Total</Typography><Typography fontWeight="bold" sx={{ color: ORANGE }}>{fmt(parseFloat(invoice.total))}</Typography></Grid>
          <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Fecha</Typography><Typography>{fmtDate(invoice.fecha_emision)}</Typography></Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Conceptos</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Clave SAT</TableCell>
              <TableCell>Descripción</TableCell>
              <TableCell align="right">Cant.</TableCell>
              <TableCell align="right">P.U.</TableCell>
              <TableCell align="right">Importe</TableCell>
              <TableCell>Producto</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(invoice.items || []).map((it: any) => (
              <TableRow key={it.id}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{it.sat_clave_prod_serv}</TableCell>
                <TableCell>{it.description}</TableCell>
                <TableCell align="right">{parseFloat(it.quantity).toFixed(2)}</TableCell>
                <TableCell align="right">{fmt(parseFloat(it.unit_price))}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(parseFloat(it.amount))}</TableCell>
                <TableCell>
                  {it.matched_product_id ? (
                    <Chip icon={<CheckCircleIcon />} label={it.matched_sku || it.matched_description?.substring(0, 20) || 'Vinculado'} size="small" sx={{ bgcolor: ORANGE, color: 'white' }} />
                  ) : (
                    <Chip label="Sin vincular" size="small" variant="outlined" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
// ============ Pendientes por Timbrar ============
function PendingStampTab({ emitter }: { emitter: Emitter }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/accounting/${emitter.id}/pending-stamp`);
      setRows(res.data.pending || []);
    } catch (e: any) {
      console.error('pending:', e?.response?.data || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [emitter.id]); // eslint-disable-line

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Estos son pagos completados en los que el cliente solicitó factura pero aún no se ha timbrado el CFDI.
        Emite manualmente la factura desde aquí.
      </Alert>

      {loading ? (
        <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress sx={{ color: ORANGE }} /></Box>
      ) : rows.length === 0 ? (
        <Alert severity="success">🎉 No hay pagos pendientes por timbrar.</Alert>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Referencia</TableCell>
              <TableCell>Cliente</TableCell>
              <TableCell>RFC</TableCell>
              <TableCell align="right">Monto</TableCell>
              <TableCell>Método</TableCell>
              <TableCell>Pagado</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 'bold', color: ORANGE }}>{r.payment_reference}</TableCell>
                <TableCell>{r.full_name || r.email || '—'}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.rfc || '—'}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>{fmt(parseFloat(r.amount))}</TableCell>
                <TableCell><Chip label={r.payment_method || '—'} size="small" variant="outlined" /></TableCell>
                <TableCell>{fmtDate(r.paid_at)}</TableCell>
                <TableCell>
                  {r.factura_error ? (
                    <Tooltip title={r.factura_error}>
                      <Chip label="Error" size="small" sx={{ bgcolor: RED, color: 'white' }} />
                    </Tooltip>
                  ) : (
                    <Chip label="Pendiente" size="small" sx={{ bgcolor: ORANGE, color: 'white' }} />
                  )}
                </TableCell>
                <TableCell align="center">
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!emitter.perms.can_emit_invoice}
                    onClick={async () => {
                      try {
                        await api.post(`/fiscal/invoice/manual`, { payment_id: r.id, fiscal_emitter_id: emitter.id });
                        load();
                      } catch (e: any) {
                        alert(e?.response?.data?.message || e?.response?.data?.error || 'Error al emitir');
                      }
                    }}
                    sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK }, textTransform: 'none' }}
                  >
                    Emitir CFDI
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

// ============================================================
// MOVIMIENTOS BANCO (Belvo)
// ============================================================
function BankMovementsTab({ emitter }: { emitter: Emitter }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [movs, setMovs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ from: string; to: string; type: string; match: string; search: string }>({
    from: '', to: '', type: '', match: '', search: '',
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { limit: 300 };
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.type) params.type = filters.type;
      if (filters.match) params.match_status = filters.match;
      if (filters.search) params.search = filters.search;
      const r = await api.get(`/accounting/${emitter.id}/bank-movements`, { params });
      setMovs(r.data.movements || []);
      setStats(r.data.stats || null);
      setLinks(r.data.links || []);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error cargando movimientos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [emitter.id]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await api.post(`/accounting/${emitter.id}/bank-movements/sync`, { days_back: 7 });
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error sincronizando');
    } finally {
      setSyncing(false);
    }
  };

  const matchChip = (s: string) => {
    if (s === 'matched') return <Chip size="small" label="Conciliado" sx={{ bgcolor: '#16a34a', color: 'white' }} />;
    if (s === 'pending') return <Chip size="small" label="Pendiente" sx={{ bgcolor: '#f59e0b', color: 'white' }} />;
    if (s === 'unmatched') return <Chip size="small" label="Sin match" variant="outlined" />;
    return <Chip size="small" label={s || '—'} variant="outlined" />;
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {stats && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 2, mb: 2 }}>
          <KpiCard color="#16a34a" label={`Ingresos (${stats.in_count || 0})`} value={fmt(parseFloat(stats.in_total || 0))} icon={<TrendingUpIcon />} />
          <KpiCard color={RED} label={`Egresos (${stats.out_count || 0})`} value={fmt(parseFloat(stats.out_total || 0))} icon={<TrendingDownIcon />} />
          <KpiCard color={ORANGE} label="Conciliados" value={String(stats.matched_count || 0)} icon={<CheckCircleIcon />} />
          <KpiCard color="#f59e0b" label="Pendientes" value={String(stats.pending_count || 0)} icon={<PendingActionsIcon />} />
        </Box>
      )}

      {links.length === 0 ? (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
          Esta empresa no tiene bancos conectados vía Belvo. Pide al administrador que configure la conexión desde <b>Empresas → Belvo</b>.
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          Conectado: {links.map((l: any) => (
            <Chip key={l.id} size="small" icon={<AccountBalanceIcon />} label={l.institution_name} sx={{ mr: 1, bgcolor: '#0ea5e9', color: 'white' }} />
          ))}
          {links[0]?.last_sync_at && <span style={{ marginLeft: 8, color: '#6b7280' }}>Última sync: {fmtDate(links[0].last_sync_at)}</span>}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 2 }} alignItems="center">
        <TextField size="small" type="date" label="Desde" InputLabelProps={{ shrink: true }} value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} />
        <TextField size="small" type="date" label="Hasta" InputLabelProps={{ shrink: true }} value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Tipo</InputLabel>
          <Select label="Tipo" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="INFLOW">Ingreso</MenuItem>
            <MenuItem value="OUTFLOW">Egreso</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Conciliación</InputLabel>
          <Select label="Conciliación" value={filters.match} onChange={e => setFilters({ ...filters, match: e.target.value })}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="matched">Conciliado</MenuItem>
            <MenuItem value="pending">Pendiente</MenuItem>
            <MenuItem value="unmatched">Sin match</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small" placeholder="Descripción, referencia, comercio..."
          value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ flex: 1, minWidth: 200 }}
        />
        <Button variant="outlined" onClick={load} sx={{ borderColor: BLACK, color: BLACK }}>Aplicar</Button>
        <Button
          variant="contained"
          startIcon={syncing ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <SyncIcon />}
          onClick={handleSync}
          disabled={syncing || links.length === 0}
          sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d94e1f' } }}
        >
          {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: ORANGE }} /></Box>
      ) : movs.length === 0 ? (
        <Alert severity="info">No hay movimientos con los filtros seleccionados.</Alert>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: BLACK }}>
              <TableRow>
                {['Fecha', 'Descripción', 'Referencia', 'Banco', 'Tipo', 'Monto', 'Conciliación', 'Match'].map(h => (
                  <TableCell key={h} sx={{ color: 'white', fontWeight: 700 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {movs.map((m: any) => (
                <TableRow key={m.id} hover>
                  <TableCell>{fmtDate(m.value_date)}</TableCell>
                  <TableCell sx={{ maxWidth: 280 }}>
                    <Typography variant="body2" noWrap title={m.description}>{m.description || '—'}</Typography>
                    {m.merchant_name && <Typography variant="caption" color="text.secondary">{m.merchant_name}</Typography>}
                  </TableCell>
                  <TableCell><Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{m.reference || '—'}</Typography></TableCell>
                  <TableCell>{m.institution_name}</TableCell>
                  <TableCell>
                    {m.type === 'INFLOW'
                      ? <Chip size="small" label="Ingreso" sx={{ bgcolor: '#16a34a', color: 'white' }} />
                      : <Chip size="small" label="Egreso" sx={{ bgcolor: RED, color: 'white' }} />}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: m.type === 'INFLOW' ? '#16a34a' : RED }}>
                    {m.type === 'OUTFLOW' ? '-' : '+'}{fmt(parseFloat(m.amount))}
                  </TableCell>
                  <TableCell>{matchChip(m.match_status)}</TableCell>
                  <TableCell>
                    {m.matched_client ? (
                      <Box>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>{m.matched_client}</Typography>
                        {m.matched_reference && <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', color: '#6b7280' }}>{m.matched_reference}</Typography>}
                      </Box>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}

// =======================================================================
// CUENTAS POR PAGAR (Facturama + manual + descarga masiva)
// =======================================================================
function AccountsPayableTab({ emitter }: { emitter: Emitter }) {
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'paid'>('pending');
  const [monthFilter, setMonthFilter] = useState<string>(''); // '' = todos, 'YYYY-MM' = mes específico
  const [search, setSearch] = useState('');
  const [actionDlg, setActionDlg] = useState<{ open: boolean; mode: 'approve' | 'reject' | 'pay' | null; row: any | null }>({ open: false, mode: null, row: null });
  const [actionForm, setActionForm] = useState<any>({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' as 'success' | 'error' | 'info' | 'warning' });
  const [syncingFacturapi, setSyncingFacturapi] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { status: statusFilter };
      if (search.trim()) params.q = search.trim();
      if (monthFilter) {
        const [y, m] = monthFilter.split('-').map(Number);
        const from = new Date(y, m - 1, 1);
        const to = new Date(y, m, 0); // último día del mes
        params.from = from.toISOString().slice(0, 10);
        params.to = to.toISOString().slice(0, 10);
      }
      const res = await api.get(`/accounting/${emitter.id}/payables`, { params });
      setRows(res.data.data || []);
      setTotals(res.data.totals || {});
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error cargando CxP', severity: 'error' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [emitter.id, statusFilter, monthFilter]);

  const handleSyncFacturapi = async () => {
    setSyncingFacturapi(true);
    try {
      const today = new Date();
      const ago = new Date(today); ago.setDate(today.getDate() - 30);
      const r = await api.post(`/admin/facturapi/sync/${emitter.id}`, {
        from: ago.toISOString().slice(0, 10),
        to: today.toISOString().slice(0, 10),
      });
      const found = r.data.total_found ?? 0;
      const ins = r.data.inserted ?? 0;
      const skp = r.data.skipped ?? 0;
      if (found === 0) {
        setSnackbar({
          open: true,
          message: `⚠️ Facturapi no devolvió CFDIs recibidos en los últimos 30 días para ${emitter.rfc}. Verifica que el módulo de "Recibidas" esté habilitado.`,
          severity: 'warning',
        });
      } else {
        setSnackbar({
          open: true,
          message: `✅ ${ins} nuevas, ${skp} omitidas (de ${found} encontradas vía Facturapi)`,
          severity: 'success',
        });
      }
      load();
    } catch (e: any) {
      const code = e?.response?.status;
      const detail = e?.response?.data?.detail || e?.response?.data?.error || e.message;
      if (code === 400) {
        setSnackbar({
          open: true,
          message: `⚠️ Facturapi no está configurado para este emisor. Ve a Empresas → Configuración Fiscal y agrega tu API key.`,
          severity: 'warning',
        });
      } else if (code === 401 || code === 403) {
        setSnackbar({
          open: true,
          message: `⚠️ API key de Facturapi rechazada. Verifica la clave en Empresas → Configuración Fiscal. ${detail}`,
          severity: 'warning',
        });
      } else if (code === 404) {
        const howToFix = e?.response?.data?.how_to_fix;
        setSnackbar({
          open: true,
          message: howToFix
            ? `⚠️ Bandeja de Recibidas NO activada en Facturapi. Pasos: ${howToFix.replace(/\n/g, ' → ')}`
            : `⚠️ Tu cuenta Facturapi no tiene habilitada la "Bandeja de Recibidas". Actívala en app.facturapi.io → sección Recibidas. ${detail}`,
          severity: 'warning',
        });
      } else {
        setSnackbar({ open: true, message: detail || 'Error sincronizando con Facturapi', severity: 'error' });
      }
    } finally { setSyncingFacturapi(false); }
  };

  const openAction = (mode: 'approve' | 'reject' | 'pay', row: any) => {
    setActionForm(mode === 'pay'
      ? { paid_amount: row.total, paid_reference: '', paid_at: new Date().toISOString().slice(0, 10) }
      : mode === 'approve'
        ? { due_date: '', scheduled_payment_date: '', notes: '' }
        : { reason: '' });
    setActionDlg({ open: true, mode, row });
  };

  const submitAction = async () => {
    const { mode, row } = actionDlg;
    if (!row || !mode) return;
    try {
      await api.post(`/accounting/${emitter.id}/payables/${row.id}/${mode}`, actionForm);
      setSnackbar({ open: true, message: '✅ Operación realizada', severity: 'success' });
      setActionDlg({ open: false, mode: null, row: null });
      load();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error en operación', severity: 'error' });
    }
  };

  const fmt = (n: any) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(parseFloat(n) || 0);
  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString() : '—';
  const sourceLabel = (s: string) => ({
    facturama_webhook: 'Facturama (webhook)',
    facturama_sync:    'Facturama (sync)',
    facturama_portal:  'Facturama (portal)',
    facturapi_sync:    'Facturapi',
    manual:            'Manual',
    sat_descarga_masiva: 'SAT'
  } as any)[s] || s || '—';

  return (
    <Box>
      {/* KPIs */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: `4px solid #ed6c02` }}><CardContent>
            <Typography variant="caption" color="text.secondary">Pendientes de aprobar</Typography>
            <Typography variant="h6" fontWeight="bold">{totals.pending_count || 0}</Typography>
            <Typography variant="caption">{fmt(totals.pending_total)}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: `4px solid #1976d2` }}><CardContent>
            <Typography variant="caption" color="text.secondary">Aprobadas sin pagar</Typography>
            <Typography variant="h6" fontWeight="bold">{totals.approved_unpaid_count || 0}</Typography>
            <Typography variant="caption">{fmt(totals.approved_unpaid_total)}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: `4px solid #2e7d32` }}><CardContent>
            <Typography variant="caption" color="text.secondary">Pagadas</Typography>
            <Typography variant="h6" fontWeight="bold">{totals.paid_count || 0}</Typography>
            <Typography variant="caption">{fmt(totals.paid_total)}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: `4px solid #0ea5e9` }}><CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Facturapi</Typography>
              <Typography variant="body2" fontWeight={600}>Sincronizar</Typography>
            </Box>
            <IconButton onClick={handleSyncFacturapi} disabled={syncingFacturapi} title="Descargar CFDIs recibidos vía Facturapi" sx={{ bgcolor: '#0ea5e9', color: 'white', '&:hover': { bgcolor: BLACK } }}>
              {syncingFacturapi ? <CircularProgress size={18} sx={{ color: 'white' }} /> : <SyncIcon />}
            </IconButton>
          </CardContent></Card>
        </Grid>
      </Grid>

      {/* Filtros */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Tabs value={statusFilter} onChange={(_, v) => setStatusFilter(v)} sx={{ '& .MuiTabs-indicator': { bgcolor: ORANGE } }}>
          <Tab value="pending"  label={`Pendientes (${totals.pending_count || 0})`} />
          <Tab value="approved" label={`Aprobadas (${totals.approved_unpaid_count || 0})`} />
          <Tab value="paid"     label={`Pagadas (${totals.paid_count || 0})`} />
          <Tab value="rejected" label="Rechazadas" />
        </Tabs>
        <Box sx={{ flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Mes</InputLabel>
          <Select label="Mes" value={monthFilter} onChange={(e) => setMonthFilter(String(e.target.value))}>
            <MenuItem value=""><em>Todos los meses</em></MenuItem>
            {(() => {
              const opts: { value: string; label: string }[] = [];
              const now = new Date();
              const start = new Date(2026, 0, 1); // enero 2026
              let d = new Date(now.getFullYear(), now.getMonth(), 1);
              while (d >= start) {
                const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
                opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
                d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
              }
              return opts.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>);
            })()}
          </Select>
        </FormControl>
        <TextField size="small" placeholder="Buscar UUID, RFC, folio…" value={search}
          onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
          sx={{ minWidth: 280 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <Button onClick={load} variant="contained" size="small" sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK }, textTransform: 'none' }}>Filtrar</Button>
      </Box>

      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress sx={{ color: ORANGE }} /></Box>
      ) : rows.length === 0 ? (
        <Alert severity="info">Sin facturas en este estado.</Alert>
      ) : (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tipo</TableCell>
                <TableCell>Proveedor</TableCell>
                <TableCell>UUID / Folio</TableCell>
                <TableCell>Origen</TableCell>
                <TableCell>Emisión</TableCell>
                <TableCell>Vencimiento</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Chip
                      size="small"
                      label={r.tipo_comprobante || '—'}
                      sx={{
                        fontWeight: 700,
                        minWidth: 32,
                        bgcolor:
                          r.tipo_comprobante === 'I' ? '#E3F2FD' :
                          r.tipo_comprobante === 'E' ? '#FFEBEE' :
                          r.tipo_comprobante === 'P' ? '#E8F5E9' :
                          r.tipo_comprobante === 'N' ? '#FFF3E0' :
                          r.tipo_comprobante === 'T' ? '#F3E5F5' : '#EEEEEE',
                        color:
                          r.tipo_comprobante === 'I' ? '#1565C0' :
                          r.tipo_comprobante === 'E' ? '#C62828' :
                          r.tipo_comprobante === 'P' ? '#2E7D32' :
                          r.tipo_comprobante === 'N' ? '#E65100' :
                          r.tipo_comprobante === 'T' ? '#6A1B9A' : '#616161',
                      }}
                    />
                    {r.metodo_pago && (
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.3, fontSize: '0.65rem' }}>
                        {r.metodo_pago}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{r.emisor_nombre || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{r.emisor_rfc || ''}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{r.uuid_sat?.slice(0, 8)}…</Typography>
                    <Typography variant="caption" display="block" color="text.secondary">{[r.serie, r.folio].filter(Boolean).join(' ')}</Typography>
                  </TableCell>
                  <TableCell><Chip size="small" label={sourceLabel(r.detection_source)} variant="outlined" /></TableCell>
                  <TableCell>{fmtDate(r.fecha_emision)}</TableCell>
                  <TableCell>{fmtDate(r.due_date)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(r.total)} <Typography variant="caption" color="text.secondary">{r.moneda}</Typography></TableCell>
                  <TableCell>
                    {r.payment_status === 'paid' ? (
                      <Chip size="small" color="success" label="Pagada" icon={<PaidIcon />} />
                    ) : r.approval_status === 'approved' ? (
                      <Chip size="small" color="info" label="Aprobada" icon={<CheckCircleIcon />} />
                    ) : r.approval_status === 'rejected' ? (
                      <Chip size="small" color="error" label="Rechazada" icon={<CancelIcon />} />
                    ) : (
                      <Chip size="small" color="warning" label="Pendiente" icon={<PendingActionsIcon />} />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      {(() => {
                        const isFacturapi = r.facturapi_id && r.fiscal_emitter_id;
                        const downloadFacturapi = async (type: 'pdf' | 'xml') => {
                          try {
                            const resp = await api.get(
                              `/admin/facturapi/${r.fiscal_emitter_id}/download/${type}/${r.facturapi_id}`,
                              { responseType: 'blob' }
                            );
                            const blob = new Blob([resp.data], {
                              type: type === 'pdf' ? 'application/pdf' : 'application/xml',
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${r.uuid_sat || r.facturapi_id}.${type}`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          } catch (err: any) {
                            setSnackbar({ open: true, message: err?.response?.data?.error || 'Error descargando archivo', severity: 'error' });
                          }
                        };
                        return (
                          <>
                            {(r.pdf_url || isFacturapi) && (
                              <Tooltip title="Descargar PDF">
                                <IconButton
                                  size="small"
                                  sx={{ color: '#D32F2F' }}
                                  {...(isFacturapi
                                    ? { onClick: () => downloadFacturapi('pdf') }
                                    : { component: 'a' as any, href: r.pdf_url, target: '_blank' })}
                                >
                                  <PictureAsPdfIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {(r.xml_url || isFacturapi) && (
                              <Tooltip title="Descargar XML">
                                <IconButton
                                  size="small"
                                  sx={{ p: 0.5 }}
                                  {...(isFacturapi
                                    ? { onClick: () => downloadFacturapi('xml') }
                                    : { component: 'a' as any, href: r.xml_url, target: '_blank' })}
                                >
                                  <Box
                                    sx={{
                                      fontSize: '0.62rem',
                                      fontWeight: 800,
                                      px: 0.6,
                                      py: 0.15,
                                      borderRadius: 0.5,
                                      bgcolor: '#1565C0',
                                      color: 'white',
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    XML
                                  </Box>
                                </IconButton>
                              </Tooltip>
                            )}
                          </>
                        );
                      })()}
                      {r.approval_status === 'pending' && (
                        <>
                          <Tooltip title="Aprobar"><IconButton size="small" color="success" onClick={() => openAction('approve', r)}><ThumbUpIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Rechazar"><IconButton size="small" color="error" onClick={() => openAction('reject', r)}><ThumbDownIcon fontSize="small" /></IconButton></Tooltip>
                        </>
                      )}
                      {r.approval_status === 'approved' && r.payment_status !== 'paid' && (
                        <Tooltip title="Marcar como pagada"><IconButton size="small" color="primary" onClick={() => openAction('pay', r)}><PaidIcon fontSize="small" /></IconButton></Tooltip>
                      )}
                      <Tooltip title="Aceptar cancelación SAT (proveedor solicitó cancelar)">
                        <IconButton size="small" sx={{ color: '#2e7d32' }} onClick={async () => {
                          if (!confirm(`¿Aceptar cancelación del CFDI ${r.uuid_sat?.slice(0, 8)}…? Esto comunica al SAT que aceptas que el proveedor cancele.`)) return;
                          try {
                            await api.post('/admin/invoices/respond-cancellation', { invoiceId: r.id, accept: true, source: 'recibidas' });
                            setSnackbar({ open: true, message: 'Cancelación aceptada ante el SAT', severity: 'success' });
                            load();
                          } catch (e: any) {
                            setSnackbar({ open: true, message: e?.response?.data?.error || 'Error', severity: 'error' });
                          }
                        }}><CheckCircleIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Rechazar cancelación SAT">
                        <IconButton size="small" sx={{ color: RED }} onClick={async () => {
                          if (!confirm(`¿Rechazar la cancelación del CFDI ${r.uuid_sat?.slice(0, 8)}…? El proveedor no podrá cancelarla.`)) return;
                          try {
                            await api.post('/admin/invoices/respond-cancellation', { invoiceId: r.id, accept: false, source: 'recibidas' });
                            setSnackbar({ open: true, message: 'Cancelación rechazada ante el SAT', severity: 'success' });
                            load();
                          } catch (e: any) {
                            setSnackbar({ open: true, message: e?.response?.data?.error || 'Error', severity: 'error' });
                          }
                        }}><DoNotDisturbAltIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Diálogo de acción */}
      <Dialog open={actionDlg.open} onClose={() => setActionDlg({ open: false, mode: null, row: null })} maxWidth="sm" fullWidth>
        <DialogTitle>
          {actionDlg.mode === 'approve' && '✅ Aprobar factura'}
          {actionDlg.mode === 'reject'  && '❌ Rechazar factura'}
          {actionDlg.mode === 'pay'     && '💰 Marcar como pagada'}
        </DialogTitle>
        <DialogContent>
          {actionDlg.row && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>{actionDlg.row.emisor_nombre}</strong> · {fmt(actionDlg.row.total)} {actionDlg.row.moneda}
            </Alert>
          )}
          {actionDlg.mode === 'approve' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField type="date" label="Fecha de vencimiento" InputLabelProps={{ shrink: true }} size="small"
                value={actionForm.due_date} onChange={(e) => setActionForm({ ...actionForm, due_date: e.target.value })} />
              <TextField type="date" label="Fecha programada de pago" InputLabelProps={{ shrink: true }} size="small"
                value={actionForm.scheduled_payment_date} onChange={(e) => setActionForm({ ...actionForm, scheduled_payment_date: e.target.value })} />
              <TextField label="Notas (opcional)" size="small" multiline rows={2}
                value={actionForm.notes} onChange={(e) => setActionForm({ ...actionForm, notes: e.target.value })} />
            </Box>
          )}
          {actionDlg.mode === 'reject' && (
            <TextField label="Motivo del rechazo" size="small" fullWidth multiline rows={3} sx={{ mt: 1 }}
              value={actionForm.reason} onChange={(e) => setActionForm({ ...actionForm, reason: e.target.value })} />
          )}
          {actionDlg.mode === 'pay' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField label="Monto pagado" type="number" size="small"
                value={actionForm.paid_amount} onChange={(e) => setActionForm({ ...actionForm, paid_amount: e.target.value })} />
              <TextField label="Referencia / folio de pago" size="small"
                value={actionForm.paid_reference} onChange={(e) => setActionForm({ ...actionForm, paid_reference: e.target.value })} />
              <TextField type="date" label="Fecha de pago" InputLabelProps={{ shrink: true }} size="small"
                value={actionForm.paid_at} onChange={(e) => setActionForm({ ...actionForm, paid_at: e.target.value })} />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDlg({ open: false, mode: null, row: null })}>Cancelar</Button>
          <Button variant="contained" onClick={submitAction} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: BLACK } }}>Confirmar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

// ============ Gestión de accesos de contadores ============
interface AccountantUser {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: { fiscal_emitter_id: number; can_view: boolean; can_emit_invoice: boolean; can_cancel_invoice: boolean }[];
}

function CounterAccessManager({ emitters, onClose }: { emitters: Emitter[]; onClose: () => void }) {
  const [accountants, setAccountants] = useState<AccountantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/accounting/accountants');
      setAccountants(res.data.accountants || []);
    } catch {
      setSnackbar({ open: true, message: 'Error al cargar contadores', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const hasPermission = (accountant: AccountantUser, emitterId: number) =>
    accountant.permissions.some((p) => p.fiscal_emitter_id === emitterId);

  const toggle = async (accountant: AccountantUser, emitter: Emitter) => {
    const key = `${accountant.id}-${emitter.id}`;
    setSaving(key);
    try {
      if (hasPermission(accountant, emitter.id)) {
        await api.delete(`/accounting/accountants/${accountant.id}/permissions/${emitter.id}`);
        setAccountants((prev) => prev.map((a) =>
          a.id === accountant.id
            ? { ...a, permissions: a.permissions.filter((p) => p.fiscal_emitter_id !== emitter.id) }
            : a
        ));
        setSnackbar({ open: true, message: `Acceso revocado a ${accountant.name}`, severity: 'success' });
      } else {
        await api.post(`/accounting/accountants/${accountant.id}/permissions`, {
          fiscal_emitter_id: emitter.id,
          can_view: true,
          can_emit_invoice: true,
          can_cancel_invoice: false,
        });
        setAccountants((prev) => prev.map((a) =>
          a.id === accountant.id
            ? { ...a, permissions: [...a.permissions, { fiscal_emitter_id: emitter.id, can_view: true, can_emit_invoice: true, can_cancel_invoice: false }] }
            : a
        ));
        setSnackbar({ open: true, message: `Acceso otorgado a ${accountant.name}`, severity: 'success' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Error al actualizar permiso', severity: 'error' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 4, border: `2px solid ${ORANGE}`, borderRadius: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptLongIcon sx={{ color: ORANGE }} />
          <Typography variant="h6" fontWeight="bold" sx={{ color: BLACK }}>
            Accesos de Contadores
          </Typography>
        </Box>
        <Button size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>Cerrar</Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Controla qué empresas puede ver y facturar cada contador.
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress sx={{ color: ORANGE }} />
        </Box>
      ) : accountants.length === 0 ? (
        <Alert severity="info">No hay usuarios con rol de contador registrados.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {accountants.map((accountant) => (
            <Paper key={accountant.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: BLACK, fontSize: 14 }}>
                  {accountant.name.charAt(0).toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="body2" fontWeight="bold">{accountant.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{accountant.email}</Typography>
                </Box>
                <Chip label={accountant.role} size="small" sx={{ ml: 'auto', bgcolor: '#f5f5f5', fontSize: '0.7rem' }} />
              </Box>
              <Divider sx={{ mb: 1.5 }} />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {emitters.map((emitter) => {
                  const active = hasPermission(accountant, emitter.id);
                  const key = `${accountant.id}-${emitter.id}`;
                  return (
                    <Chip
                      key={emitter.id}
                      label={
                        saving === key
                          ? '...'
                          : emitter.alias
                      }
                      onClick={() => { if (saving !== key) toggle(accountant, emitter); }}
                      icon={active ? <CheckCircleIcon sx={{ fontSize: '16px !important', color: `${ORANGE} !important` }} /> : undefined}
                      variant={active ? 'filled' : 'outlined'}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: active ? 'rgba(240,90,40,0.1)' : undefined,
                        borderColor: active ? ORANGE : '#e5e7eb',
                        color: active ? ORANGE : 'text.secondary',
                        fontWeight: active ? 700 : 400,
                        '&:hover': { borderColor: ORANGE, bgcolor: 'rgba(240,90,40,0.08)' },
                      }}
                    />
                  );
                })}
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Paper>
  );
}
