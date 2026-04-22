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
    const dims = pkg.dimensions ? `${pkg.dimensions.length} × ${pkg.dimensions.width} × ${pkg.dimensions.height} cm` : '';
    const receivedDate = new Date(pkg.receivedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase();
    const labelContent = `
      <html>
        <head>
          <title>Etiqueta - ${pkg.tracking}</title>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
          <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: 4in 6in; margin: 0; }
            body { font-family: Arial, sans-serif; }
            .label { width: 4in; height: 6in; padding: 0.2in; border: 2px solid #000; display: flex; flex-direction: column; margin: 0 auto; overflow: hidden; }
            .header { display: flex; justify-content: flex-end; margin-bottom: 2px; }
            .date-badge { background: #111; color: white; padding: 3px 8px; font-size: 11px; font-weight: bold; border-radius: 4px; }
            .tracking-main { text-align: center; margin: 2px 0; }
            .tracking-code { font-size: 20px; font-weight: bold; letter-spacing: 1px; }
            .box-indicator { font-size: 13px; color: #333; font-weight: 600; display: inline-block; margin-top: 1px; }
            .qr-section { text-align: center; margin: 3px 0; }
            .qr-section svg, .qr-section img { width: 85px !important; height: 85px !important; }
            .barcode-section { text-align: center; margin: 4px 0; }
            .barcode-section svg { width: 85%; height: 70px; }
            .divider { border-top: 2px dashed #ccc; margin: 4px 0; }
            .client-info { text-align: center; margin: 2px 0; }
            .client-box { font-size: 42px; color: #F05A28; font-weight: 900; letter-spacing: 2px; line-height: 1; }
            .details { text-align: center; font-size: 13px; font-weight: 600; margin: 3px 0; display: flex; justify-content: center; gap: 10px; }
            .detail-item { background: #f5f5f5; padding: 2px 8px; border-radius: 4px; }
            .description { text-align: center; font-size: 10px; color: #666; margin-top: 2px; }
            .footer { text-align: center; font-size: 7px; color: #999; border-top: 1px solid #eee; padding-top: 2px; margin-top: auto; }
            @media print { body { margin: 0; } .label { border: none; page-break-inside: avoid; overflow: hidden; } }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="header">
              <div class="date-badge">${receivedDate}</div>
            </div>
            <div class="tracking-main">
              <div class="tracking-code">${pkg.tracking}</div>
              <div class="box-indicator">1 de 1</div>
            </div>
            <div class="qr-section"><div id="qr"></div></div>
            <div class="barcode-section"><svg id="barcode"></svg></div>
            <div class="divider"></div>
            <div class="client-info">
              <div class="client-box">📦 ${pkg.client.boxId}</div>
            </div>
            <div class="details">
              ${pkg.weight ? `<span class="detail-item">⚖️ ${pkg.weight} kg</span>` : ''}
              ${dims ? `<span class="detail-item">📐 ${dims}</span>` : ''}
            </div>
            <div class="description">Hidalgo TX</div>
            <div class="footer">
              <small>Impreso: ${new Date().toLocaleString('es-MX')}</small>
            </div>
          </div>
          <script>
            try { JsBarcode("#barcode", "${pkg.tracking.replace(/-/g, '')}", { format: "CODE128", width: 2.2, height: 70, displayValue: false, margin: 0 }); } catch(e) {}
            try { var qr = qrcode(0, 'M'); qr.addData('https://app.entregax.com/track/${pkg.tracking}'); qr.make(); document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 2, margin: 0 }); } catch(e) {}
            window.onload = function() { setTimeout(function() { window.print(); }, 600); };
          <\/script>
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
