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
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  Tooltip,
  FormControlLabel,
  Switch
} from '@mui/material';
import {
  Search as SearchIcon,
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Pending as PendingIcon,
  Refresh as RefreshIcon,
  People as PeopleIcon,
  HowToReg as ClaimedIcon,
  CloudSync as SyncIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface LegacyClient {
  id: number;
  box_id: string;
  full_name: string | null;
  email: string | null;
  registration_date: string | null;
  is_claimed: boolean;
  claimed_by_user_id: number | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  claimed: number;
  pending: number;
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

  // Sync external dialog
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    stats?: { total: number; importados: number; actualizados: number; omitidos: number; errores: number };
  } | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

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
        ...(showOnlyClaimed && { claimed: 'true' })
      });
      
      const response = await fetch(`${API_URL}/api/legacy/clients?${params}`, { headers });
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients);
        setTotalClients(data.pagination.total);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, showOnlyClaimed]);

  useEffect(() => {
    fetchStats();
    fetchClients();
  }, [fetchStats, fetchClients]);

  const previewFromRows = (rows: string[][]) => {
    // Detectar header
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

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
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
          <FormControlLabel
            control={
              <Switch
                checked={showOnlyClaimed}
                onChange={(e) => { setShowOnlyClaimed(e.target.checked); setPage(0); }}
              />
            }
            label="Mostrar solo reclamados"
          />
        </Box>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: 'grey.100' }}>
              <TableCell><strong>Casillero</strong></TableCell>
              <TableCell><strong>Nombre</strong></TableCell>
              <TableCell><strong>Correo</strong></TableCell>
              <TableCell><strong>Fecha Alta Original</strong></TableCell>
              <TableCell align="center"><strong>Estado</strong></TableCell>
              <TableCell><strong>Reclamado Por</strong></TableCell>
              <TableCell align="center"><strong>Acciones</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No se encontraron clientes
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow key={client.id} hover>
                  <TableCell>
                    <Typography fontWeight="bold" color="primary">
                      {client.box_id}
                    </Typography>
                  </TableCell>
                  <TableCell>{client.full_name || '-'}</TableCell>
                  <TableCell>{client.email || '-'}</TableCell>
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
                    {!client.is_claimed && (
                      <Tooltip title="Eliminar">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            setClientToDelete(client);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    )}
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
    </Box>
  );
}
