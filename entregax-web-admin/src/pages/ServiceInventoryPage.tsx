import { useState, useCallback, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, CircularProgress, TextField, Button, ToggleButtonGroup, ToggleButton,
  TablePagination, InputAdornment, Tooltip, IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import api from '../services/api';

const ORANGE = '#F05A28';

const SERVICES = [
  { key: 'tdi_aereo',   label: 'TDI Aéreo',        emoji: '✈️',  color: '#1565C0' },
  { key: 'tdi_express', label: 'TDI Express',       emoji: '🚀',  color: '#7B1FA2' },
  { key: 'maritimo',    label: 'Marítimo China',    emoji: '🚢',  color: '#00695C' },
  { key: 'pobox_usa',   label: 'PO Box USA',        emoji: '🇺🇸', color: '#BF360C' },
  { key: 'dhl',         label: 'DHL Monterrey',     emoji: '📦',  color: '#F9A825' },
];

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  received:              { label: 'Recibido',              color: '#1565C0', bg: '#E3F2FD' },
  received_china:        { label: 'Recibido en China',     color: '#E65100', bg: '#FFF3E0' },
  received_mty:          { label: 'Recibido en MTY',       color: '#2E7D32', bg: '#E8F5E9' },
  in_transit:            { label: 'En Tránsito',           color: '#6A1B9A', bg: '#F3E5F5' },
  shipped:               { label: 'Despachado',            color: '#0277BD', bg: '#E1F5FE' },
  out_for_delivery:      { label: 'En Ruta de Entrega',    color: '#EF6C00', bg: '#FFF3E0' },
  delivered:             { label: 'Entregado',             color: '#2E7D32', bg: '#E8F5E9' },
  returned_to_warehouse: { label: 'Devuelto a Bodega',     color: '#B71C1C', bg: '#FFEBEE' },
};

interface PackageRow {
  guia: string;
  guia_corta?: string;
  guia_origen?: string;
  guia_origen_carrier?: string;
  received_at: string;
  updated_at?: string;
  status: string;
  box_id?: string;
  cliente_nombre?: string;
  paqueteria?: string;
  guia_salida?: string;
  costing_paid?: boolean;
  has_instructions?: boolean;
}

export default function ServiceInventoryPage() {
  const [service, setService] = useState('tdi_aereo');
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const fmt = (d?: string | null) =>
    d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  const statusChip = (s: string) => {
    const meta = STATUS_LABELS[s] || { label: s, color: '#555', bg: '#eee' };
    return <Chip label={meta.label} size="small" sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 600, fontSize: '0.7rem' }} />;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/packages/service-inventory', {
        params: { service, limit: rowsPerPage, offset: page * rowsPerPage, search: search || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined },
      });
      setRows(r.data.rows || []);
      setTotal(r.data.total || 0);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [service, page, rowsPerPage, search, dateFrom, dateTo]);

  useEffect(() => { setPage(0); }, [service]);
  useEffect(() => { load(); }, [load]);

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        📦 Inventario por Tipo de Servicio
      </Typography>

      {/* Selector de servicio */}
      <ToggleButtonGroup
        value={service}
        exclusive
        onChange={(_, v) => v && setService(v)}
        sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}
        size="small"
      >
        {SERVICES.map(s => (
          <ToggleButton key={s.key} value={s.key} sx={{ borderRadius: '20px !important', px: 2, '&.Mui-selected': { bgcolor: s.color, color: '#fff', '&:hover': { bgcolor: s.color } } }}>
            <span style={{ marginRight: 6 }}>{s.emoji}</span>{s.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* Filtros */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small" placeholder="Buscar guía, origen, cliente..." value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            sx={{ minWidth: 260 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <TextField size="small" label="Desde" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="Hasta" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
          <Button variant="contained" size="small" onClick={load} startIcon={<SearchIcon />} sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d44e22' } }}>
            Filtrar
          </Button>
          <Tooltip title="Recargar">
            <IconButton size="small" onClick={load}><RefreshIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {loading ? 'Cargando…' : `${total.toLocaleString()} guías`}
          </Typography>
        </Box>
      </Paper>

      {/* Tabla */}
      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>GUÍA</TableCell>
              {service !== 'maritimo' && (
                <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>{service === 'dhl' ? 'GUÍA HIJA' : 'GUÍA ORIGEN'}</TableCell>
              )}
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>CLIENTE</TableCell>
              {(service === 'tdi_aereo' || service === 'tdi_express' || service === 'pobox_usa' || service === 'dhl') && (
                <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>PAQUETERÍA / GUÍA SALIDA</TableCell>
              )}
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>FECHA INGRESO</TableCell>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>ÚLTIMO MOVIMIENTO</TableCell>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }}>ÚLTIMO STATUS</TableCell>
              <TableCell sx={{ bgcolor: '#111', color: '#fff', fontWeight: 700 }} align="center">PAGO / INST.</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={service === 'maritimo' ? 7 : 8} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={service === 'maritimo' ? 7 : 8} align="center" sx={{ py: 4, color: '#999' }}>Sin resultados</TableCell></TableRow>
            ) : rows.map((r, i) => (
              <TableRow key={i} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" fontWeight={700} fontFamily="monospace">{r.guia || '—'}</Typography>
                    {r.guia && <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(r.guia)}><ContentCopyIcon sx={{ fontSize: 13 }} /></IconButton></Tooltip>}
                  </Box>
                  {r.guia_corta && r.guia_corta !== r.guia && (
                    <Typography variant="caption" color="text.secondary" fontFamily="monospace">{r.guia_corta}</Typography>
                  )}
                </TableCell>
                {service !== 'maritimo' && (
                  <TableCell>
                    {r.guia_origen
                      ? <>
                          <Typography variant="caption" fontFamily="monospace" color="text.secondary" display="block">{r.guia_origen}</Typography>
                          {r.guia_origen_carrier && <Typography variant="caption" sx={{ color: '#888', fontSize: '0.65rem' }}>{r.guia_origen_carrier}</Typography>}
                        </>
                      : <Typography variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                )}
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{r.box_id || '—'}</Typography>
                  {r.cliente_nombre && <Typography variant="caption" color="text.secondary" display="block">{r.cliente_nombre}</Typography>}
                </TableCell>
                {(service === 'tdi_aereo' || service === 'tdi_express' || service === 'pobox_usa' || service === 'dhl') && (
                  <TableCell>
                    {r.paqueteria && <Typography variant="caption" display="block" fontWeight={600}>{r.paqueteria}</Typography>}
                    {r.guia_salida && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" fontFamily="monospace">{r.guia_salida}</Typography>
                        <Tooltip title="Copiar"><IconButton size="small" onClick={() => navigator.clipboard.writeText(r.guia_salida!)}><ContentCopyIcon sx={{ fontSize: 11 }} /></IconButton></Tooltip>
                      </Box>
                    )}
                    {!r.paqueteria && !r.guia_salida && <Typography variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                )}
                <TableCell><Typography variant="caption">{fmt(r.received_at)}</Typography></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{fmt(r.updated_at)}</Typography></TableCell>
                <TableCell>{statusChip(r.status)}</TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                    <Tooltip title={r.costing_paid ? 'Pago registrado' : 'Sin pago registrado'}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        {r.costing_paid
                          ? <CheckCircleIcon sx={{ fontSize: 16, color: '#2E7D32' }} />
                          : <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: '#BDBDBD' }} />}
                        <Typography variant="caption" sx={{ color: r.costing_paid ? '#2E7D32' : '#9E9E9E', fontSize: '0.65rem', lineHeight: 1 }}>
                          Pago
                        </Typography>
                      </Box>
                    </Tooltip>
                    <Tooltip title={r.has_instructions ? 'Con instrucciones de envío' : 'Sin instrucciones'}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        {r.has_instructions
                          ? <CheckCircleIcon sx={{ fontSize: 16, color: '#1565C0' }} />
                          : <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: '#BDBDBD' }} />}
                        <Typography variant="caption" sx={{ color: r.has_instructions ? '#1565C0' : '#9E9E9E', fontSize: '0.65rem', lineHeight: 1 }}>
                          Inst.
                        </Typography>
                      </Box>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100, 200]}
          labelRowsPerPage="Filas:"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Paper>
    </Box>
  );
}
