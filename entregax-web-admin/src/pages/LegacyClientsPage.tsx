import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  Snackbar
} from '@mui/material';
import {
  Search as SearchIcon,
  CloudUpload as UploadIcon,
  CheckCircle as CheckCircleIcon,
  Pending as PendingIcon,
  Refresh as RefreshIcon,
  People as PeopleIcon,
  HowToReg as ClaimedIcon,
  CloudSync as SyncIcon,
  Replay as ReplayIcon,
  CheckBox as CheckBoxIcon,
  Badge as BadgeIcon,
  Close as CloseIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface LastSend {
  Estado?: string;
  estado?: string;
  'Guia de ingreso'?: string;
  'Fecha de salida'?: string;
  'Fecha de ingreso'?: string;
  kilos?: string | number;
  cbm?: string | number;
  peso?: string | number;
  bultos?: string | number;
  [key: string]: any;
}

interface LegacyClient {
  id: number;
  box_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  registration_date: string | null;
  is_claimed: boolean;
  claimed_by_user_id: number | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  created_at: string;
  asesor: string | null;
  asesor_entregax: string | null;
  chartback: boolean;
  chartback_status: string | null;
  last_send: LastSend | null;
  last_send_maritimo: LastSend | null;
}

interface AsesorStat {
  asesor: string;
  total: number;
  reclamados: number;
  pendientes: number;
}

interface Stats {
  total: number;
  claimed: number;
  pending: number;
  chartback_count: number;
  por_asesor: AsesorStat[];
}

interface ImportResult {
  success: boolean;
  message: string;
  stats: {
    importados: number;
    duplicados: number;
    errores: number;
    total: number;
  };
}

export default function LegacyClientsPage() {
  const { t: _t } = useTranslation();
  const [clients, setClients] = useState<LegacyClient[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showOnlyClaimed, setShowOnlyClaimed] = useState(false);
  const [showOnlyChartback, setShowOnlyChartback] = useState(false);
  const [showOnlyRecovered, setShowOnlyRecovered] = useState(false);
  const [showOnlyRetention, setShowOnlyRetention] = useState(false);
  const [hideRecovered, setHideRecovered] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalClients, setTotalClients] = useState(0);

  // Upload dialog
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<{ totalLines: number; validLines: number; sampleData: string[] } | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<LegacyClient | null>(null);

  // Filtro por asesor
  const [asesorFilter, setAsesorFilter] = useState('');
  const [asesorOptions, setAsesorOptions] = useState<string[]>([]);

  // Filtro por fecha de último envío
  const [lastSendFrom, setLastSendFrom] = useState('');
  const [lastSendTo, setLastSendTo] = useState('');

  // Sync external dialog
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    stats?: { total: number; importados: number; actualizados: number; omitidos: number; errores: number };
  } | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  // Chartback selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [copySnack, setCopySnack] = useState(false);

  const handleCopyGuias = () => {
    const lines: string[] = [];
    clients.forEach(c => {
      if (!selectedIds.has(c.id)) return;
      if (!c.box_id) return;
      const asesor = c.asesor_entregax?.trim() || '-';
      lines.push(`${String(c.box_id).trim()} - ${asesor}`);
    });
    if (lines.length === 0) return;
    navigator.clipboard.writeText(lines.join('\n'));
    setCopySnack(true);
  };
  const [chartbackSaving, setChartbackSaving] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');

  // INE / Datos externos del cliente
  const [ineDialog, setIneDialog] = useState<{ open: boolean; boxId: string | null; loading: boolean; data: any | null; error: string | null }>({
    open: false, boxId: null, loading: false, data: null, error: null,
  });

  const openIneDialog = async (boxId: string) => {
    setIneDialog({ open: true, boxId, loading: true, data: null, error: null });
    try {
      const res = await fetch(`${API_URL}/api/legacy/clients/${encodeURIComponent(boxId)}/external`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error al consultar');
      setIneDialog(prev => ({ ...prev, loading: false, data: json?.data || json, error: null }));
    } catch (e: any) {
      setIneDialog(prev => ({ ...prev, loading: false, error: e?.message || 'Error al consultar' }));
    }
  };

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/legacy/stats`, { headers });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page + 1),
        limit: String(rowsPerPage),
        ...(search && { search }),
        ...(showOnlyClaimed && { claimed: 'true' }),
        ...(asesorFilter && { asesor: asesorFilter }),
        ...(showOnlyChartback && { chartback: 'true' }),
        ...(showOnlyRecovered && { recovered: 'true' }),
        ...(showOnlyRetention && { retention: 'true' }),
        ...(hideRecovered && { hideRecovered: 'true' }),
        ...(lastSendFrom && { lastSendFrom }),
        ...(lastSendTo && { lastSendTo })
      });

      const response = await fetch(`${API_URL}/api/legacy/clients?${params}`, { headers });
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients);
        setTotalClients(data.pagination.total);
        if (!asesorFilter && data.asesores) {
          setAsesorOptions(data.asesores);
        }
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, showOnlyClaimed, asesorFilter, showOnlyChartback, showOnlyRecovered, showOnlyRetention, hideRecovered, lastSendFrom, lastSendTo]);

  useEffect(() => {
    fetchStats();
    fetchClients();
  }, [fetchStats, fetchClients]);

  // Reset selection when page/filter changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, showOnlyClaimed, asesorFilter, showOnlyChartback, showOnlyRecovered, showOnlyRetention, hideRecovered, lastSendFrom, lastSendTo]);

  const previewFromRows = (rows: string[][]) => {
    const firstRow = rows[0] || [];
    const firstRowJoined = firstRow.join(' ').toLowerCase();
    const hasHeader = firstRowJoined.includes('casillero') ||
                      firstRowJoined.includes('box_id') ||
                      firstRowJoined.includes('nombre') ||
                      firstRowJoined.includes('correo') ||
                      firstRowJoined.includes('email');
    const startIdx = hasHeader ? 1 : 0;
    let validCount = 0;
    const samples: string[] = [];
    for (let i = startIdx; i < rows.length; i++) {
      const campos = rows[i] || [];
      const boxIdField = campos.find(c => /^(S|RT)\d+/i.test((c || '').trim()));
      if (boxIdField) {
        validCount++;
        if (samples.length < 3) {
          const nombre = campos[1] || campos[3] || 'Sin nombre';
          samples.push(`${boxIdField.trim()} - ${(nombre || '').trim()}`);
        }
      }
    }
    setFilePreview({
      totalLines: rows.length - (hasHeader ? 1 : 0),
      validLines: validCount,
      sampleData: samples
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !event.target.files[0]) return;
    const file = event.target.files[0];
    setSelectedFile(file);
    setUploadResult(null);
    setFilePreview(null);

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.xlsm');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (isExcel) {
          const buf = e.target?.result as ArrayBuffer;
          const wb = XLSX.read(buf, { type: 'array' });
          const sheetName = wb.SheetNames[0];
          const sheet = sheetName ? wb.Sheets[sheetName] : null;
          if (!sheet) { setFilePreview({ totalLines: 0, validLines: 0, sampleData: [] }); return; }
          const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
          const rows = raw
            .map(r => r.map(c => (c === null || c === undefined ? '' : String(c).trim())))
            .filter(r => r.some(c => c && c.length > 0));
          previewFromRows(rows);
        } else {
          const text = e.target?.result as string;
          const lines = text.split('\n').filter(l => l.trim());
          const delimiter = lines[0]?.includes('\t') ? '\t' : ',';
          const rows = lines.map(l => l.split(delimiter).map(c => c.replace(/"/g, '').trim()));
          previewFromRows(rows);
        }
      } catch (err) {
        console.error('Preview error:', err);
        setFilePreview({ totalLines: 0, validLines: 0, sampleData: [] });
      }
    };
    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(`${API_URL}/api/legacy/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        setUploadResult(data);
      } else {
        setUploadResult({
          success: false,
          message: data.error || 'Error al importar',
          stats: { importados: 0, duplicados: 0, errores: 0, total: 0 }
        });
      }
      fetchStats();
      fetchClients();
    } catch (error: any) {
      setUploadResult({
        success: false,
        message: 'Error al importar',
        stats: { importados: 0, duplicados: 0, errores: 0, total: 0 }
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!clientToDelete) return;

    try {
      await fetch(`${API_URL}/api/legacy/clients/${clientToDelete.id}`, {
        method: 'DELETE',
        headers
      });
      setDeleteDialogOpen(false);
      setClientToDelete(null);
      fetchStats();
      fetchClients();
    } catch (error) {
      console.error('Error deleting client:', error);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-MX');
  };

  // Chartback helpers
  const allVisibleIds = clients.map(c => c.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));
  const someSelected = allVisibleIds.some(id => selectedIds.has(id)) && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds);
      allVisibleIds.forEach(id => next.delete(id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      allVisibleIds.forEach(id => next.add(id));
      setSelectedIds(next);
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSetChartback = async (value: boolean) => {
    if (selectedIds.size === 0) return;
    setChartbackSaving(true);
    try {
      const resp = await fetch(`${API_URL}/api/legacy/clients/chartback`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), chartback: value })
      });
      if (resp.ok) {
        setSnackMsg(value
          ? `${selectedIds.size} cliente(s) marcados como Chartback`
          : `${selectedIds.size} cliente(s) desmarcados de Chartback`
        );
        setSelectedIds(new Set());
        fetchStats();
        fetchClients();
      }
    } catch (e) {
      setSnackMsg('Error al actualizar');
    } finally {
      setChartbackSaving(false);
    }
  };

  const handleSetChartbackI = async () => {
    if (selectedIds.size === 0) return;
    setChartbackSaving(true);
    try {
      const resp = await fetch(`${API_URL}/api/legacy/clients/chartback-i`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (resp.ok) {
        setSnackMsg(`${selectedIds.size} cliente(s) marcados como Chartback I (primera ronda con el mismo asesor)`);
        setSelectedIds(new Set());
        fetchStats();
        fetchClients();
      }
    } catch (e) {
      setSnackMsg('Error al marcar Chartback I');
    } finally {
      setChartbackSaving(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">
          Clientes Legacy (Migración)
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<UploadIcon />}
            onClick={() => { setUploadResult(null); setSelectedFile(null); setFilePreview(null); setUploadDialogOpen(true); }}
          >
            Importar Excel
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={syncing ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />}
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              setSyncResult(null);
              setSyncDialogOpen(true);
              try {
                const resp = await fetch(`${API_URL}/api/legacy/sync-external`, {
                  method: 'POST',
                  headers: { ...headers, 'Content-Type': 'application/json' }
                });
                const data = await resp.json();
                if (resp.ok) {
                  setSyncResult({ success: true, message: data.message || 'Sincronización completada', stats: data.stats });
                } else {
                  setSyncResult({ success: false, message: data.error || 'Error al sincronizar' });
                }
                fetchStats();
                fetchClients();
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Error de red al sincronizar';
                setSyncResult({ success: false, message: msg });
              } finally {
                setSyncing(false);
              }
            }}
          >
            {syncing ? 'Sincronizando…' : 'Sincronizar Sistema EX'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => { fetchStats(); fetchClients(); }}
          >
            Actualizar
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <PeopleIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">{stats.total}</Typography>
                  <Typography color="text.secondary">Total Importados</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <ClaimedIcon sx={{ fontSize: 40, color: 'success.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {stats.claimed}
                  </Typography>
                  <Typography color="text.secondary">Reclamados</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <PendingIcon sx={{ fontSize: 40, color: 'warning.main' }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold" color="warning.main">
                    {stats.pending}
                  </Typography>
                  <Typography color="text.secondary">Pendientes</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Widget: Chartback */}
      <Paper
        sx={{
          p: 2.5,
          mb: 2,
          border: '1.5px solid',
          borderColor: showOnlyChartback ? '#1565c0' : '#e3eaf5',
          bgcolor: showOnlyChartback ? '#e8f0fe' : '#f5f8ff',
          cursor: 'pointer',
          transition: 'all 0.15s',
          '&:hover': { borderColor: '#1565c0', bgcolor: '#e8f0fe' },
        }}
        onClick={() => { setShowOnlyChartback(v => !v); setPage(0); setShowOnlyClaimed(false); }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ReplayIcon sx={{ fontSize: 36, color: '#1565c0' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ color: '#1565c0', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
              Chartback — Reactivación de Clientes
            </Typography>
            <Typography variant="h4" fontWeight="bold" sx={{ color: '#1565c0', lineHeight: 1.2 }}>
              {stats?.chartback_count ?? '—'}
              <Typography component="span" variant="body2" sx={{ color: '#555', ml: 1, fontWeight: 400 }}>
                clientes marcados
              </Typography>
            </Typography>
          </Box>
          {showOnlyChartback && (
            <Chip label="Filtrando" size="small" color="primary" sx={{ fontWeight: 700 }} />
          )}
          <Typography variant="caption" sx={{ color: '#1565c0', opacity: 0.7 }}>
            {showOnlyChartback ? 'Ver todos' : 'Ver lista →'}
          </Typography>
        </Box>
      </Paper>

      {/* Widget: clientes por asesor */}
      {stats?.por_asesor && stats.por_asesor.filter(a => a.asesor !== 'Sin Asesor').length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5, color: '#555' }}>
            Clientes por Asesor
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {stats.por_asesor
              .filter(a => a.asesor !== 'Sin Asesor')
              .map((a) => (
                <Box
                  key={a.asesor}
                  onClick={() => { setAsesorFilter(a.asesor); setShowOnlyClaimed(false); setPage(0); }}
                  sx={{
                    px: 2, py: 1, borderRadius: 2, cursor: 'pointer',
                    border: asesorFilter === a.asesor ? '2px solid #E65100' : '1px solid #e5e7eb',
                    bgcolor: asesorFilter === a.asesor ? '#fff7ed' : '#fafafa',
                    transition: 'all 0.15s',
                    '&:hover': { borderColor: '#E65100', bgcolor: '#fff7ed' },
                    minWidth: 130,
                  }}
                >
                  <Typography variant="body2" fontWeight="bold" noWrap sx={{ color: '#111' }}>
                    {a.asesor}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#E65100', fontWeight: 700 }}>
                      {a.total} total
                    </Typography>
                    <Typography variant="caption" color="text.disabled">·</Typography>
                    <Typography variant="caption" sx={{ color: '#2e7d32' }}>
                      {a.reclamados} ✓
                    </Typography>
                  </Box>
                </Box>
              ))}
          </Box>
        </Paper>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            placeholder="Buscar por casillero, nombre o correo..."
            size="small"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            sx={{ minWidth: 350 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Asesor</InputLabel>
            <Select
              value={asesorFilter}
              label="Asesor"
              onChange={(e) => { setAsesorFilter(e.target.value); setPage(0); }}
            >
              <MenuItem value="">Todos los asesores</MenuItem>
              {asesorOptions.map((a) => (
                <MenuItem key={a} value={a}>{a}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch
                checked={showOnlyClaimed}
                onChange={(e) => { setShowOnlyClaimed(e.target.checked); setPage(0); }}
              />
            }
            label="Solo reclamados"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showOnlyChartback}
                onChange={(e) => { setShowOnlyChartback(e.target.checked); setPage(0); setShowOnlyClaimed(false); setShowOnlyRecovered(false); setShowOnlyRetention(false); }}
                color="primary"
              />
            }
            label="Solo Chartback"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showOnlyRecovered}
                onChange={(e) => { setShowOnlyRecovered(e.target.checked); setPage(0); setShowOnlyClaimed(false); setShowOnlyChartback(false); setShowOnlyRetention(false); if (e.target.checked) setHideRecovered(false); }}
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#2e7d32' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#2e7d32' } }}
              />
            }
            label="Solo Recuperados"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showOnlyRetention}
                onChange={(e) => { setShowOnlyRetention(e.target.checked); setPage(0); setShowOnlyClaimed(false); setShowOnlyChartback(false); setShowOnlyRecovered(false); }}
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#ed6c02' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#ed6c02' } }}
              />
            }
            label="Solo Retención"
          />
          <FormControlLabel
            control={
              <Switch
                checked={hideRecovered}
                onChange={(e) => { setHideRecovered(e.target.checked); setPage(0); if (e.target.checked) setShowOnlyRecovered(false); }}
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#757575' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#757575' } }}
              />
            }
            label="Ocultar Recuperados"
          />
          <TextField
            label="Último envío desde"
            type="date"
            size="small"
            value={lastSendFrom}
            onChange={(e) => { setLastSendFrom(e.target.value); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />
          <TextField
            label="Último envío hasta"
            type="date"
            size="small"
            value={lastSendTo}
            onChange={(e) => { setLastSendTo(e.target.value); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />
          {(lastSendFrom || lastSendTo) && (
            <Button
              size="small"
              variant="text"
              onClick={() => { setLastSendFrom(''); setLastSendTo(''); setPage(0); }}
              sx={{ color: '#666', minWidth: 'auto', px: 1 }}
            >
              Limpiar fechas
            </Button>
          )}
        </Box>
      </Paper>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <Paper sx={{ p: 1.5, mb: 1, display: 'flex', alignItems: 'center', gap: 2, bgcolor: '#e8f0fe', border: '1.5px solid #1565c0' }}>
          <CheckBoxIcon sx={{ color: '#1565c0' }} />
          <Typography variant="body2" fontWeight="bold" sx={{ color: '#1565c0', flex: 1 }}>
            {selectedIds.size} cliente(s) seleccionado(s)
          </Typography>
          <Button
            size="small"
            variant="contained"
            sx={{ bgcolor: '#7B1FA2' }}
            disabled={chartbackSaving}
            startIcon={chartbackSaving ? <CircularProgress size={14} color="inherit" /> : <ReplayIcon />}
            onClick={handleSetChartbackI}
          >
            Chartback I
          </Button>
          <Button
            size="small"
            variant="contained"
            sx={{ bgcolor: '#1565c0' }}
            disabled={chartbackSaving}
            startIcon={chartbackSaving ? <CircularProgress size={14} color="inherit" /> : <ReplayIcon />}
            onClick={() => handleSetChartback(true)}
          >
            Chartback Público
          </Button>
          <Button
            size="small"
            variant="outlined"
            sx={{ borderColor: '#1565c0', color: '#1565c0' }}
            disabled={chartbackSaving}
            onClick={() => handleSetChartback(false)}
          >
            Quitar Chartback
          </Button>
          <Button
            size="small"
            variant="outlined"
            sx={{ borderColor: '#1565c0', color: '#1565c0' }}
            startIcon={<CopyIcon />}
            onClick={handleCopyGuias}
          >
            Copiar
          </Button>
          <Button size="small" color="inherit" onClick={() => setSelectedIds(new Set())}>
            Cancelar
          </Button>
        </Paper>
      )}
      <Snackbar
        open={copySnack}
        autoHideDuration={2500}
        onClose={() => setCopySnack(false)}
        message="Casilleros y asesores copiados al portapapeles"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: 'grey.100' }}>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={someSelected}
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  size="small"
                />
              </TableCell>
              <TableCell><strong>Casillero</strong></TableCell>
              <TableCell><strong>Nombre</strong></TableCell>
              <TableCell><strong>Correo</strong></TableCell>
              <TableCell><strong>Teléfono</strong></TableCell>
              <TableCell><strong>Fecha Alta Original</strong></TableCell>
              <TableCell align="center"><strong>Estado</strong></TableCell>
              <TableCell align="center"><strong>Chartback</strong></TableCell>
              <TableCell><strong>Asesor (Sistema EX)</strong></TableCell>
              <TableCell><strong>Asesor (EntregaX)</strong></TableCell>
              <TableCell><strong>Último Envío</strong></TableCell>
              <TableCell><strong>Reclamado Por</strong></TableCell>
              <TableCell align="center"><strong>Acciones</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No se encontraron clientes
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow
                  key={client.id}
                  hover
                  selected={selectedIds.has(client.id)}
                  sx={client.chartback && String(client.chartback_status || '').trim().toLowerCase() !== 'recovered' ? { bgcolor: '#f0f4ff' } : undefined}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selectedIds.has(client.id)}
                      onChange={() => toggleOne(client.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight="bold" color="primary">
                      {client.box_id}
                    </Typography>
                  </TableCell>
                  <TableCell>{client.full_name || '-'}</TableCell>
                  <TableCell>{client.email || '-'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                      {client.phone || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatDate(client.registration_date)}</TableCell>
                  <TableCell align="center">
                    {client.is_claimed ? (
                      <Chip
                        icon={<CheckCircleIcon />}
                        label="Reclamado"
                        color="success"
                        size="small"
                      />
                    ) : (
                      <Chip
                        icon={<PendingIcon />}
                        label="Pendiente"
                        color="warning"
                        size="small"
                      />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {String(client.chartback_status || '').trim().toLowerCase() === 'retention' ? (
                      <Chip
                        label="Retención"
                        size="small"
                        sx={{ bgcolor: '#ed6c02', color: '#fff', fontWeight: 700 }}
                      />
                    ) : String(client.chartback_status || '').trim().toLowerCase() === 'recovered' ? (
                      <Chip
                        label="Recuperado"
                        size="small"
                        sx={{ bgcolor: '#2e7d32', color: '#fff', fontWeight: 700 }}
                      />
                    ) : client.chartback ? (
                      <Chip
                        icon={<ReplayIcon />}
                        label="Chartback"
                        size="small"
                        sx={{ bgcolor: '#1565c0', color: '#fff', fontWeight: 700 }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color={client.asesor ? 'text.primary' : 'text.disabled'}>
                      {client.asesor || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color={client.asesor_entregax ? 'text.primary' : 'text.disabled'}>
                      {client.asesor_entregax || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: 160 }}>
                    {(() => {
                      const aero = client.last_send;
                      const mar = client.last_send_maritimo;
                      if (!aero && !mar) return <Typography variant="caption" color="text.disabled">—</Typography>;
                      const items = [];
                      if (aero) {
                        const fecha = aero['Fecha de ingreso'] || aero['Fecha de salida'] || null;
                        const guia = aero['Guia de ingreso'] || null;
                        items.push(
                          <Box key="aero" sx={{ mb: mar ? 1 : 0 }}>
                            <Chip label="Aéreo" size="small" sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontSize: 10, height: 18, mb: 0.5 }} />
                            {guia && <Typography variant="caption" display="block" sx={{ fontWeight: 600 }}>{guia}</Typography>}
                            {fecha && <Typography variant="caption" display="block" color="text.secondary">{fecha}</Typography>}
                          </Box>
                        );
                      }
                      if (mar) {
                        const fecha = mar['Fecha de ingreso'] || mar['Fecha de salida'] || null;
                        const guia = mar['Guia de ingreso'] || null;
                        items.push(
                          <Box key="mar">
                            <Chip label="Marítimo" size="small" sx={{ bgcolor: '#e8f5e9', color: '#2e7d32', fontSize: 10, height: 18, mb: 0.5 }} />
                            {guia && <Typography variant="caption" display="block" sx={{ fontWeight: 600 }}>{guia}</Typography>}
                            {fecha && <Typography variant="caption" display="block" color="text.secondary">{fecha}</Typography>}
                          </Box>
                        );
                      }
                      return <>{items}</>;
                    })()}
                  </TableCell>
                  <TableCell>
                    {client.is_claimed ? (
                      <Box>
                        <Typography variant="body2">{client.claimed_by_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(client.claimed_at)}
                        </Typography>
                      </Box>
                    ) : '-'}
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<BadgeIcon />}
                      onClick={() => openIneDialog(client.box_id)}
                      sx={{ textTransform: 'none', fontSize: 11, py: 0.3, px: 1, whiteSpace: 'nowrap' }}
                    >
                      Ver INE
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={totalClients}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="Filas por página:"
        />
      </TableContainer>

      {/* Upload Dialog */}
      <Dialog
        open={uploadDialogOpen}
        onClose={() => !uploading && setUploadDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Importar Clientes Legacy</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Sube un archivo <strong>Excel (.xlsx)</strong> o <strong>CSV</strong> con los datos de clientes a migrar.
            El sistema detectará automáticamente las columnas.
          </Alert>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Formato esperado (con o sin encabezado):
            </Typography>
            <Paper sx={{ p: 1.5, bgcolor: 'grey.100', fontFamily: 'monospace', fontSize: 12 }}>
              A: Casillero  &nbsp; B: Nombre  &nbsp; C: Correo<br/>
              S3349 &nbsp; Francisco Javier Oliva Rivera &nbsp; digitalsalesbjx@gmail.com<br/>
              S3348 &nbsp; Ernesto Gabriel Briseño Tovar &nbsp; gargolos@gmail.com
            </Paper>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Columnas: <strong>A</strong>=casillero (S####), <strong>B</strong>=nombre, <strong>C</strong>=correo.
              Cualquier columna adicional (ej. teléfono) se ignora.
              Los duplicados (mismo casillero) se actualizan si aún no han sido reclamados.
            </Typography>
          </Box>

          <Button
            variant="outlined"
            component="label"
            fullWidth
            startIcon={<UploadIcon />}
            sx={{ mb: 2 }}
          >
            {selectedFile ? selectedFile.name : 'Seleccionar archivo (.xlsx, .xls o .csv)'}
            <input
              type="file"
              hidden
              accept=".xlsx,.xls,.xlsm,.csv,.tsv,.txt"
              onChange={handleFileSelect}
            />
          </Button>

          {filePreview && !uploadResult && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight="bold">📊 Previsualización del archivo</Typography>
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2">📁 Total de líneas: {filePreview.totalLines}</Typography>
                <Typography variant="body2" color="success.main" fontWeight="bold">
                  ✅ Clientes a importar: {filePreview.validLines}
                </Typography>
                {filePreview.validLines < filePreview.totalLines && (
                  <Typography variant="body2" color="warning.main">
                    ⚠️ Líneas sin número de cliente válido: {filePreview.totalLines - filePreview.validLines}
                  </Typography>
                )}
                {filePreview.sampleData.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">Muestra:</Typography>
                    {filePreview.sampleData.map((sample, idx) => (
                      <Typography key={idx} variant="body2" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                        • {sample}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            </Alert>
          )}

          {uploadResult && (
            <Alert severity={uploadResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
              <Typography variant="subtitle2">{uploadResult.message}</Typography>
              {uploadResult.success && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2">✅ Importados: {uploadResult.stats.importados}</Typography>
                  <Typography variant="body2">⚠️ Duplicados: {uploadResult.stats.duplicados}</Typography>
                  <Typography variant="body2">❌ Errores: {uploadResult.stats.errores}</Typography>
                  <Typography variant="body2">📊 Total líneas: {uploadResult.stats.total}</Typography>
                </Box>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)} disabled={uploading}>
            Cerrar
          </Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            startIcon={uploading ? <CircularProgress size={20} /> : <UploadIcon />}
          >
            {uploading ? 'Importando...' : 'Importar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirmar Eliminación</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Estás seguro de eliminar el cliente legacy <strong>{clientToDelete?.box_id}</strong> ({clientToDelete?.full_name})?
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Esta acción no se puede deshacer. El cliente no podrá reclamar este casillero.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sync Result Dialog */}
      <Dialog open={syncDialogOpen} onClose={() => !syncing && setSyncDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Sincronización Sistema EntregaX</DialogTitle>
        <DialogContent>
          {syncing && !syncResult && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
              <CircularProgress size={28} />
              <Typography>Consultando sistemaentregax.com…</Typography>
            </Box>
          )}
          {syncResult && (
            <>
              <Alert severity={syncResult.success ? 'success' : 'error'} sx={{ mb: 2 }}>
                {syncResult.message}
              </Alert>
              {syncResult.stats && (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">Total recibidos</Typography>
                        <Typography variant="h5" fontWeight="bold">{syncResult.stats.total}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="success.main">Nuevos</Typography>
                        <Typography variant="h5" fontWeight="bold" color="success.main">{syncResult.stats.importados}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="info.main">Actualizados</Typography>
                        <Typography variant="h5" fontWeight="bold" color="info.main">{syncResult.stats.actualizados}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">Omitidos</Typography>
                        <Typography variant="h5" fontWeight="bold">{syncResult.stats.omitidos}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="error.main">Errores</Typography>
                        <Typography variant="h5" fontWeight="bold" color="error.main">{syncResult.stats.errores}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncDialogOpen(false)} disabled={syncing}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar confirmación */}
      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3500}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {/* Modal: INE / Datos externos del cliente */}
      <Dialog
        open={ineDialog.open}
        onClose={() => setIneDialog({ open: false, boxId: null, loading: false, data: null, error: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#111', color: '#fff' }}>
          <BadgeIcon />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Identificación oficial — {ineDialog.boxId || ''}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              Datos consultados en sistemaentregax.com
            </Typography>
          </Box>
          <Button
            size="small"
            onClick={() => setIneDialog({ open: false, boxId: null, loading: false, data: null, error: null })}
            sx={{ color: '#fff', minWidth: 'auto' }}
          >
            <CloseIcon />
          </Button>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {ineDialog.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : ineDialog.error ? (
            <Alert severity="error">{ineDialog.error}</Alert>
          ) : ineDialog.data ? (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {ineDialog.data.claveCliente || ineDialog.data.claveCliente === 0 ? (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">Clave Cliente</Typography>
                    <Typography variant="body2" fontWeight={700}>{ineDialog.data.claveCliente}</Typography>
                  </Grid>
                ) : null}
                {ineDialog.data.wechat ? (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">WeChat</Typography>
                    <Typography variant="body2" fontWeight={700}>{ineDialog.data.wechat}</Typography>
                  </Grid>
                ) : null}
                {ineDialog.data.facebook ? (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">Facebook</Typography>
                    <Typography variant="body2" fontWeight={700}>{ineDialog.data.facebook}</Typography>
                  </Grid>
                ) : null}
                {ineDialog.data.token ? (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">Token externo</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{ineDialog.data.token}</Typography>
                  </Grid>
                ) : null}
              </Grid>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 700 }}>
                      INE — Lado Frontal
                    </Typography>
                    {ineDialog.data.ladoa ? (
                      <Box
                        component="a"
                        href={ineDialog.data.ladoa}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ display: 'block' }}
                      >
                        <Box
                          component="img"
                          src={ineDialog.data.ladoa}
                          alt="INE lado frontal"
                          sx={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain', cursor: 'zoom-in', border: '1px solid #eee', borderRadius: 1 }}
                        />
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.disabled">No disponible</Typography>
                    )}
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 700 }}>
                      INE — Lado Reverso
                    </Typography>
                    {ineDialog.data.ladob ? (
                      <Box
                        component="a"
                        href={ineDialog.data.ladob}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ display: 'block' }}
                      >
                        <Box
                          component="img"
                          src={ineDialog.data.ladob}
                          alt="INE lado reverso"
                          sx={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain', cursor: 'zoom-in', border: '1px solid #eee', borderRadius: 1 }}
                        />
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.disabled">No disponible</Typography>
                    )}
                  </Paper>
                </Grid>
              </Grid>
              {!ineDialog.data.ladoa && !ineDialog.data.ladob && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Este cliente no tiene INE registrada en el sistema externo.
                </Alert>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIneDialog({ open: false, boxId: null, loading: false, data: null, error: null })}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
