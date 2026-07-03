import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Paper, TextField, Button, Avatar,
  CircularProgress, Chip, Tooltip, IconButton,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PeopleIcon from '@mui/icons-material/People';

// Mismos labels/keys que el ledger "Comisiones Generadas".
const serviceLabels: Record<string, string> = {
  'pobox_usa_mx': '📦 PO Box USA',
  'aereo_china_mx': '✈️ Aéreo China',
  'maritimo_china_mx': '🚢 Marítimo',
  'nacional_mx': '🚚 Nacional',
  'liberacion_aa_dhl': '📮 DHL',
  'gex_warranty': '🛡️ GEX',
  'xpay': '💱 X-Pay',
};

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const ORANGE = '#F05A28';

const getToken = () => localStorage.getItem('token') || '';

interface AdvisorBoardRow {
  advisorId: number;
  advisorName: string;
  leaderName: string | null;
  photoUrl: string | null;
  referralCode: string | null;
  totalCount: number;
  totalVolume: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
  pendingCount: number;
  paidCount: number;
  lastCommissionAt: string | null;
}

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const initials = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');

// Colores del podio (top 3)
const PODIUM = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function CommissionsBoardTab() {
  const { i18n } = useTranslation();
  const es = i18n.language === 'es';
  const [rows, setRows] = useState<AdvisorBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [service, setService] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (service) params.service_type = service;
      const res = await axios.get(`${API_URL}/admin/commissions/by-advisor`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        params,
      });
      const data: AdvisorBoardRow[] = (res.data || []).filter((r: AdvisorBoardRow) => r.advisorId != null);
      // Orden: por comisión que les corresponde (pendiente) desc, luego total.
      data.sort((a, b) => (b.pendingCommission - a.pendingCommission) || (b.totalCommission - a.totalCommission));
      setRows(data);
    } catch (e) {
      console.error('Error loading board:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const hasFilter = Boolean(fromDate || toDate || service);

  const totalPending = rows.reduce((s, r) => s + r.pendingCommission, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidCommission, 0);
  const totalCommission = rows.reduce((s, r) => s + r.totalCommission, 0);
  const activeAdvisors = rows.filter(r => r.pendingCommission > 0 || r.totalCommission > 0).length;

  return (
    <Box>
      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          {es ? '📅 Filtrar por fecha' : '📅 Filter by date'}
        </Typography>
        <TextField
          label={es ? 'Desde' : 'From'} type="date" size="small"
          value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label={es ? 'Hasta' : 'To'} type="date" size="small"
          value={toDate} onChange={(e) => setToDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>{es ? 'Servicio' : 'Service'}</InputLabel>
          <Select value={service} label={es ? 'Servicio' : 'Service'} onChange={(e) => setService(e.target.value)}>
            <MenuItem value="">{es ? 'Todos' : 'All'}</MenuItem>
            {Object.entries(serviceLabels).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {hasFilter && (
          <Button size="small" color="inherit" onClick={() => { setFromDate(''); setToDate(''); setService(''); }}>
            {es ? 'Limpiar' : 'Clear'}
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={es ? 'Actualizar' : 'Refresh'}>
          <IconButton onClick={load} sx={{ bgcolor: 'grey.100' }}><RefreshIcon /></IconButton>
        </Tooltip>
      </Paper>

      {/* KPIs (grandes, para pantalla gigante) */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 4 }}>
        {[
          { label: es ? 'Comisión por pagar' : 'Pending commission', value: totalPending, color: ORANGE, main: true },
          { label: es ? 'Comisión pagada' : 'Paid commission', value: totalPaid, color: '#2e7d32' },
          { label: es ? 'Comisión total' : 'Total commission', value: totalCommission, color: '#1565c0' },
        ].map((kpi) => (
          <Paper key={kpi.label} sx={{
            flex: '1 1 260px', minWidth: 240, p: 3, borderRadius: 3,
            background: kpi.main ? `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` : '#fff',
            color: kpi.main ? '#fff' : 'inherit',
            border: kpi.main ? 'none' : '1px solid', borderColor: 'divider',
          }}>
            <Typography variant="subtitle2" sx={{ opacity: kpi.main ? 0.9 : 0.7, fontWeight: 600 }}>
              {kpi.label}
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: 28, md: 40 }, lineHeight: 1.1, color: kpi.main ? '#fff' : kpi.color }}>
              {fmt(kpi.value)}
            </Typography>
          </Paper>
        ))}
        <Paper sx={{ flex: '1 1 200px', minWidth: 180, p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PeopleIcon sx={{ color: 'text.secondary' }} />
            <Typography variant="subtitle2" sx={{ opacity: 0.7, fontWeight: 600 }}>
              {es ? 'Asesores' : 'Advisors'}
            </Typography>
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: 28, md: 40 }, lineHeight: 1.1 }}>
            {activeAdvisors}
          </Typography>
        </Paper>
      </Box>

      {/* Grid de asesores */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: ORANGE }} />
        </Box>
      ) : rows.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <Typography color="text.secondary">
            {es ? 'No hay comisiones en el periodo seleccionado.' : 'No commissions in the selected period.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr', xl: '1fr 1fr 1fr 1fr' },
          gap: 2.5,
        }}>
          {rows.map((r, idx) => {
            const isPodium = idx < 3;
            const ring = isPodium ? PODIUM[idx] : 'transparent';
            return (
              <Paper key={r.advisorId} elevation={isPodium ? 6 : 1} sx={{
                p: 2.5, borderRadius: 3, position: 'relative', overflow: 'hidden',
                border: '2px solid', borderColor: isPodium ? ring : 'divider',
                transition: 'transform .15s', '&:hover': { transform: 'translateY(-3px)' },
              }}>
                {/* Rank */}
                <Box sx={{
                  position: 'absolute', top: 12, right: 12,
                  width: 34, height: 34, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: isPodium ? ring : 'grey.200',
                  color: isPodium ? '#111' : 'text.secondary', fontWeight: 800, fontSize: 15,
                }}>
                  {isPodium ? <EmojiEventsIcon sx={{ fontSize: 20 }} /> : idx + 1}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Avatar
                    src={r.photoUrl || undefined}
                    sx={{
                      width: 72, height: 72, fontSize: 26, fontWeight: 700,
                      bgcolor: ORANGE,
                      border: '3px solid', borderColor: isPodium ? ring : 'grey.100',
                    }}
                  >
                    {initials(r.advisorName)}
                  </Avatar>
                  <Box sx={{ minWidth: 0, pr: 4 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }} noWrap title={r.advisorName}>
                      {r.advisorName || `#${r.advisorId}`}
                    </Typography>
                    {r.leaderName && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {es ? 'Líder: ' : 'Leader: '}{r.leaderName}
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Monto que le corresponde (pendiente) */}
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  {es ? 'Comisión por pagar' : 'Pending commission'}
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: 32, lineHeight: 1.1, color: ORANGE, mb: 1.5 }}>
                  {fmt(r.pendingCommission)}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip size="small" label={`${es ? 'Total' : 'Total'}: ${fmt(r.totalCommission)}`} sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontWeight: 600 }} />
                  <Chip size="small" label={`${es ? 'Pagado' : 'Paid'}: ${fmt(r.paidCommission)}`} sx={{ bgcolor: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }} />
                  <Chip size="small" variant="outlined" label={`${r.totalCount} ${es ? 'guías' : 'shipments'}`} />
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
