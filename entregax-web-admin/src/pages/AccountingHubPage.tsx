import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Grid, Card, CardContent, CardActionArea, Avatar,
  Button, Chip, CircularProgress, Alert, Tabs, Tab, Table, TableHead, TableRow, TableCell,
  TableBody, IconButton, TextField, InputAdornment, Menu, MenuItem, Divider, Tooltip,
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
  perms: { can_view: boolean; can_emit_invoice: boolean; can_cancel_invoice: boolean };
}

export default function AccountingHubPage() {
  const [emitters, setEmitters] = useState<Emitter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmitter, setSelectedEmitter] = useState<Emitter | null>(null);
  const [switchAnchor, setSwitchAnchor] = useState<HTMLElement | null>(null);

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
        </Box>

        {emitters.length === 0 ? (
          <Alert severity="warning" sx={{ mt: 3 }}>
            No tienes empresas asignadas. Contacta a un administrador para que te otorgue permisos.
          </Alert>
        ) : (
          <Grid container spacing={3} justifyContent="center">
            {emitters.map((e) => (
              <Grid item xs={12} sm={6} md={4} key={e.id}>
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
        <Grid item xs={6} md={3}>
          <KpiCard color={ORANGE} label="Facturas Activas" value={loadingSummary ? '…' : String(summary?.stats?.invoices_active || 0)} icon={<ReceiptLongIcon />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard color={BLACK} label="Monto Facturado" value={loadingSummary ? '…' : fmt(summary?.stats?.invoice_amount_active || 0)} icon={<CheckCircleIcon />} />
        </Grid>
        <Grid item xs={6} md={3}>
          <KpiCard color={RED} label="Canceladas" value={loadingSummary ? '…' : String(summary?.stats?.invoices_canceled || 0)} icon={<CancelIcon />} />
        </Grid>
        <Grid item xs={6} md={3}>
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
        </Tabs>

        <Box sx={{ p: 2 }}>
          {tab === 0 && <InvoicesTab emitter={emitter} />}
          {tab === 1 && <PendingStampTab emitter={emitter} />}
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
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
