// ============================================
// REPRINT LABELS PAGE
// Página para reimprimir etiquetas de paquetes en bodega
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Tooltip,
  Avatar,
} from '@mui/material';
import {
  Search as SearchIcon,
  Print as PrintIcon,
  Refresh as RefreshIcon,
  Inventory as InventoryIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
} from '@mui/icons-material';
import api from '../services/api';

interface PackageInWarehouse {
  id: number;
  tracking: string;
  description: string;
  weight?: number;
  status: string;
  statusLabel: string;
  receivedAt: string;
  client: {
    id: number;
    name: string;
    email: string;
    boxId: string;
  };
  dimensions?: {
    length: number | null;
    width: number | null;
    height: number | null;
  };
}

export default function ReprintLabelsPage() {
  const [packages, setPackages] = useState<PackageInWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [printing, setPrinting] = useState<number | null>(null);

  // Cargar paquetes en bodega
  const loadPackages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Obtener paquetes con status 'received' (en bodega)
      const response = await api.get('/packages/inventory', {
        params: {
          status: 'received',
          warehouseLocation: 'usa_pobox',
        }
      });
      
      if (response.data.packages) {
        setPackages(response.data.packages);
      } else if (Array.isArray(response.data)) {
        setPackages(response.data);
      }
    } catch (err) {
      console.error('Error cargando paquetes:', err);
      setError('Error al cargar paquetes. Intenta de nuevo.');
      // Datos de ejemplo para desarrollo
      setPackages([
        {
          id: 1,
          tracking: 'US-1Z999AA10123456784',
          description: 'Electronics',
          weight: 2.5,
          status: 'received',
          statusLabel: 'En Bodega',
          receivedAt: '2026-03-10T14:30:00Z',
          client: { id: 1, name: 'María García', email: 'maria@email.com', boxId: 'S1-1234' },
          dimensions: { length: 30, width: 20, height: 15 },
        },
        {
          id: 2,
          tracking: 'US-1Z999AA10123456785',
          description: 'Clothing',
          weight: 1.2,
          status: 'received',
          statusLabel: 'En Bodega',
          receivedAt: '2026-03-10T10:15:00Z',
          client: { id: 2, name: 'Juan Pérez', email: 'juan@email.com', boxId: 'S1-0089' },
          dimensions: { length: 40, width: 30, height: 10 },
        },
        {
          id: 3,
          tracking: 'US-1Z999AA10123456786',
          description: 'Books',
          weight: 3.8,
          status: 'received',
          statusLabel: 'En Bodega',
          receivedAt: '2026-03-09T16:45:00Z',
          client: { id: 3, name: 'Ana López', email: 'ana@email.com', boxId: 'S1-2456' },
          dimensions: { length: 25, width: 20, height: 20 },
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  // Imprimir etiqueta
  const handlePrintLabel = async (pkg: PackageInWarehouse) => {
    setPrinting(pkg.id);
    try {
      // Llamar al endpoint de impresión
      const response = await api.post(`/packages/${pkg.id}/print-label`, {
        tracking: pkg.tracking,
        clientName: pkg.client.name,
        boxId: pkg.client.boxId,
        weight: pkg.weight,
        dimensions: pkg.dimensions,
      });

      if (response.data.labelUrl) {
        // Abrir PDF de etiqueta en nueva ventana
        window.open(response.data.labelUrl, '_blank');
      } else if (response.data.success) {
        // La impresión fue enviada directamente a la impresora
        alert('Etiqueta enviada a imprimir');
      }
    } catch (err) {
      console.error('Error imprimiendo etiqueta:', err);
      // Generar etiqueta localmente si falla el servidor
      generateLocalLabel(pkg);
    } finally {
      setPrinting(null);
    }
  };

  // Generar etiqueta localmente (fallback)
  const generateLocalLabel = (pkg: PackageInWarehouse) => {
    const labelContent = `
      <html>
        <head>
          <title>Etiqueta - ${pkg.tracking}</title>
          <style>
            @page { size: 4in 6in; margin: 0; }
            body { font-family: Arial, sans-serif; padding: 20px; }
            .label { border: 2px solid #000; padding: 15px; max-width: 380px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
            .logo { font-size: 24px; font-weight: bold; color: #C1272D; }
            .tracking { font-size: 18px; font-weight: bold; margin: 10px 0; }
            .barcode { text-align: center; margin: 15px 0; font-family: monospace; font-size: 24px; letter-spacing: 3px; }
            .client-info { border: 1px solid #ccc; padding: 10px; margin: 10px 0; }
            .box-id { font-size: 28px; font-weight: bold; text-align: center; background: #f0f0f0; padding: 10px; }
            .details { font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="header">
              <div class="logo">EntregaX</div>
              <div>PO Box USA - Etiqueta de Paquete</div>
            </div>
            <div class="tracking">Tracking: ${pkg.tracking}</div>
            <div class="barcode">||||| ${pkg.tracking.slice(-8)} |||||</div>
            <div class="client-info">
              <strong>Cliente:</strong> ${pkg.client.name}<br/>
              <strong>Email:</strong> ${pkg.client.email}
            </div>
            <div class="box-id">${pkg.client.boxId}</div>
            <div class="details">
              <p><strong>Descripción:</strong> ${pkg.description || 'N/A'}</p>
              <p><strong>Peso:</strong> ${pkg.weight ? pkg.weight + ' kg' : 'N/A'}</p>
              <p><strong>Dimensiones:</strong> ${pkg.dimensions ? `${pkg.dimensions.length}x${pkg.dimensions.width}x${pkg.dimensions.height} cm` : 'N/A'}</p>
              <p><strong>Recibido:</strong> ${new Date(pkg.receivedAt).toLocaleString()}</p>
            </div>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(labelContent);
      printWindow.document.close();
    }
  };

  // Filtrar paquetes por búsqueda
  const filteredPackages = packages.filter(pkg => {
    const searchLower = search.toLowerCase();
    return (
      pkg.tracking.toLowerCase().includes(searchLower) ||
      pkg.client.name.toLowerCase().includes(searchLower) ||
      pkg.client.boxId.toLowerCase().includes(searchLower) ||
      (pkg.description || '').toLowerCase().includes(searchLower)
    );
  });

  // Paginación
  const paginatedPackages = filteredPackages.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Avatar sx={{ bgcolor: '#9C27B0', width: 56, height: 56 }}>
          <PrintIcon sx={{ fontSize: 32 }} />
        </Avatar>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Reimprimir Etiquetas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Selecciona un paquete para reimprimir su etiqueta
          </Typography>
        </Box>
      </Box>

      {/* Buscador y Refresh */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            fullWidth
            placeholder="Buscar por tracking, cliente o casillero..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1 }}
          />
          <Tooltip title="Actualizar lista">
            <IconButton onClick={loadPackages} color="primary">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Tabla de paquetes */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredPackages.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <InventoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No hay paquetes en bodega
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {search ? 'No se encontraron resultados para tu búsqueda' : 'Todos los paquetes han sido entregados'}
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell><strong>Tracking</strong></TableCell>
                    <TableCell><strong>Cliente</strong></TableCell>
                    <TableCell><strong>Casillero</strong></TableCell>
                    <TableCell><strong>Descripción</strong></TableCell>
                    <TableCell align="center"><strong>Peso</strong></TableCell>
                    <TableCell><strong>Recibido</strong></TableCell>
                    <TableCell align="center"><strong>Acciones</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedPackages.map((pkg) => (
                    <TableRow 
                      key={pkg.id}
                      sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {pkg.tracking}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PersonIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                          <Typography variant="body2">{pkg.client.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={pkg.client.boxId} 
                          size="small" 
                          color="primary"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {pkg.description || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {pkg.weight ? `${pkg.weight} kg` : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CalendarIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                          <Typography variant="caption">
                            {formatDate(pkg.receivedAt)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={printing === pkg.id ? <CircularProgress size={16} color="inherit" /> : <PrintIcon />}
                          onClick={() => handlePrintLabel(pkg)}
                          disabled={printing === pkg.id}
                          sx={{
                            bgcolor: '#9C27B0',
                            '&:hover': { bgcolor: '#7B1FA2' },
                          }}
                        >
                          Imprimir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={filteredPackages.length}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 25, 50]}
              labelRowsPerPage="Filas por página:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
