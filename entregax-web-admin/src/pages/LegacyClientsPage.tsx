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
  HowToReg as ClaimedIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);
      setUploadResult(null);
      setFilePreview(null);
      
      // Leer el archivo para previsualización
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(l => l.trim());
        const delimiter = lines[0]?.includes('\t') ? '\t' : ',';
        
        // Detectar si tiene header
        const firstLine = lines[0] || '';
        const hasHeader = firstLine.toLowerCase().includes('casillero') || 
                          firstLine.toLowerCase().includes('box_id') ||
                          firstLine.toLowerCase().includes('nombre');
        
        // Contar líneas válidas (que tengan un box_id tipo S...)
        let validCount = 0;
        const samples: string[] = [];
        const startIdx = hasHeader ? 1 : 0;
        
        for (let i = startIdx; i < lines.length; i++) {
          const line = lines[i];
          const campos = line.split(delimiter);
          // Buscar campo que empiece con S (box_id)
          const hasBoxId = campos.some(c => {
            const clean = c.replace(/"/g, '').trim();
            return /^(S|RT)\d+/i.test(clean);
          });
          if (hasBoxId) {
            validCount++;
            if (samples.length < 3) {
              // Extraer box_id y nombre para muestra
              const boxId = campos.find(c => /^"?(S|RT)\d+/i.test(c.replace(/"/g, '').trim()));
              const nombre = campos[3]?.replace(/"/g, '').trim() || campos[1]?.replace(/"/g, '').trim();
              if (boxId) samples.push(`${boxId.replace(/"/g, '')} - ${nombre || 'Sin nombre'}`);
            }
          }
        }
        
        setFilePreview({
          totalLines: lines.length - (hasHeader ? 1 : 0),
          validLines: validCount,
          sampleData: samples
        });
      };
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
            Sube un archivo CSV con los datos de clientes a migrar. El sistema detectará automáticamente las columnas.
          </Alert>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Formato CSV esperado (con o sin header):
            </Typography>
            <Paper sx={{ p: 1.5, bgcolor: 'grey.100', fontFamily: 'monospace', fontSize: 12 }}>
              casillero,nombre,correo,fecha_alta<br/>
              S1,"Juan Pérez",juan@email.com,2018-11-28<br/>
              S2,"María García",maria@email.com,2019-03-15
            </Paper>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Columnas: casillero (box_id), nombre completo, correo electrónico, fecha de alta
            </Typography>
          </Box>

          <Button
            variant="outlined"
            component="label"
            fullWidth
            startIcon={<UploadIcon />}
            sx={{ mb: 2 }}
          >
            {selectedFile ? selectedFile.name : 'Seleccionar archivo .csv'}
            <input
              type="file"
              hidden
              accept=".csv"
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
    </Box>
  );
}
