// ============================================
// INVENTARIO POR SUCURSAL
// Vista de paquetes en inventario por cada sucursal
// ============================================

import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Alert,
  Chip,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Skeleton,
  InputAdornment,
  Badge,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  LocalShipping as DhlIcon,
  FlightTakeoff as AirIcon,
  DirectionsBoat as SeaIcon,
  LocalPostOffice as UsaIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  QrCode as QrCodeIcon,
  CheckCircle as InStockIcon,
  ExitToApp as ReleasedIcon,
  Store as StoreIcon,
} from '@mui/icons-material';
import api from '../services/api';

// Tipos
interface Branch {
  id: number;
  code: string;
  name: string;
  city: string;
}

interface InventoryItem {
  id: number;
  package_type: 'dhl' | 'package' | 'consolidation';
  package_id: number;
  tracking_number: string;
  status: 'in_stock' | 'released' | 'in_transit';
  received_at: string;
  released_at: string | null;
  branch_name: string;
  branch_code: string;
  received_by_name: string;
  client_name: string;
  weight: number | null;
}

interface InventorySummary {
  total: number;
  in_stock: number;
  released: number;
  by_type: {
    dhl: number;
    packages: number;
  };
}

interface Props {
  branchId?: number;
  showBranchSelector?: boolean;
}

export default function BranchInventoryPage({ branchId, showBranchSelector = true }: Props) {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<number | 'all'>(branchId || 'all');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [tabValue, setTabValue] = useState(0); // 0=Todos, 1=En Stock, 2=Liberados
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  // Cargar sucursales
  useEffect(() => {
    fetchBranches();
  }, []);

  // Cargar inventario cuando cambia sucursal o filtros
  useEffect(() => {
    fetchInventory();
  }, [selectedBranch, tabValue, filterType]);

  const fetchBranches = async () => {
    try {
      const response = await api.get('/api/admin/branches');
      setBranches(response.data.branches || []);
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  };

  const fetchInventory = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      
      if (selectedBranch !== 'all') {
        params.append('branch_id', String(selectedBranch));
      }
      
      // Status según tab
      if (tabValue === 1) {
        params.append('status', 'in_stock');
      } else if (tabValue === 2) {
        params.append('status', 'released');
      }
      
      // Filtro por tipo de paquete
      if (filterType !== 'all') {
        params.append('package_type', filterType);
      }
      
      params.append('limit', '200');
      
      const response = await api.get(`/api/warehouse/inventory?${params.toString()}`);
      
      setInventory(response.data.inventory || []);
      setSummary(response.data.summary || null);
    } catch (err: any) {
      console.error('Error fetching inventory:', err);
      setError(err.response?.data?.error || 'Error al cargar inventario');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar por búsqueda local
  const filteredInventory = inventory.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.tracking_number?.toLowerCase().includes(query) ||
      item.client_name?.toLowerCase().includes(query) ||
      item.branch_name?.toLowerCase().includes(query)
    );
  });

  // Formatear fecha
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Obtener icono según tipo
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'dhl': return <DhlIcon sx={{ color: '#FFCC00' }} />;
      case 'air': return <AirIcon sx={{ color: '#2196F3' }} />;
      case 'sea': return <SeaIcon sx={{ color: '#00BCD4' }} />;
      case 'usa': return <UsaIcon sx={{ color: '#F44336' }} />;
      default: return <InventoryIcon />;
    }
  };

  // Obtener color de estado
  const getStatusColor = (status: string): 'success' | 'default' | 'warning' => {
    switch (status) {
      case 'in_stock': return 'success';
      case 'released': return 'default';
      case 'in_transit': return 'warning';
      default: return 'default';
    }
  };

  // Exportar a CSV
  const handleExport = () => {
    const headers = ['Guía', 'Tipo', 'Cliente', 'Sucursal', 'Estado', 'Recibido', 'Liberado', 'Peso'];
    const rows = filteredInventory.map(item => [
      item.tracking_number,
      item.package_type,
      item.client_name,
      item.branch_name,
      item.status,
      formatDate(item.received_at),
      formatDate(item.released_at),
      item.weight || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario_${selectedBranch}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Skeleton loading
  const renderSkeleton = () => (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} variant="rounded" width={150} height={100} />
        ))}
      </Box>
      <Skeleton variant="rounded" height={400} />
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InventoryIcon sx={{ color: '#F05A28' }} />
            Inventario por Sucursal
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Control de paquetes en bodega por ubicación
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchInventory}
          >
            Actualizar
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
          >
            Exportar
          </Button>
        </Box>
      </Box>

      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          {/* Selector de sucursal */}
          {showBranchSelector && (
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Sucursal</InputLabel>
                <Select
                  value={selectedBranch}
                  label="Sucursal"
                  onChange={(e) => setSelectedBranch(e.target.value as number | 'all')}
                >
                  <MenuItem value="all">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <StoreIcon fontSize="small" />
                      Todas las sucursales
                    </Box>
                  </MenuItem>
                  {branches.map(branch => (
                    <MenuItem key={branch.id} value={branch.id}>
                      {branch.name} - {branch.city}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {/* Filtro por tipo */}
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Tipo</InputLabel>
              <Select
                value={filterType}
                label="Tipo"
                onChange={(e) => setFilterType(e.target.value)}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="dhl">DHL</MenuItem>
                <MenuItem value="package">Paquetes</MenuItem>
                <MenuItem value="consolidation">Consolidaciones</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Búsqueda */}
          <Grid size={{ xs: 12, sm: 12, md: showBranchSelector ? 4 : 6 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Buscar por guía, cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        renderSkeleton()
      ) : (
        <>
          {/* Cards de resumen */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <CardContent sx={{ textAlign: 'center', color: 'white' }}>
                  <InventoryIcon sx={{ fontSize: 40, opacity: 0.8 }} />
                  <Typography variant="h4" fontWeight="bold">
                    {summary?.total || 0}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Total Paquetes
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ background: 'linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%)' }}>
                <CardContent sx={{ textAlign: 'center', color: 'white' }}>
                  <InStockIcon sx={{ fontSize: 40, opacity: 0.8 }} />
                  <Typography variant="h4" fontWeight="bold">
                    {summary?.in_stock || 0}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    En Stock
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ background: 'linear-gradient(135deg, #9E9E9E 0%, #607D8B 100%)' }}>
                <CardContent sx={{ textAlign: 'center', color: 'white' }}>
                  <ReleasedIcon sx={{ fontSize: 40, opacity: 0.8 }} />
                  <Typography variant="h4" fontWeight="bold">
                    {summary?.released || 0}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Liberados
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ background: 'linear-gradient(135deg, #FFCC00 0%, #FFA000 100%)' }}>
                <CardContent sx={{ textAlign: 'center', color: 'white' }}>
                  <DhlIcon sx={{ fontSize: 40, opacity: 0.8 }} />
                  <Typography variant="h4" fontWeight="bold">
                    {summary?.by_type?.dhl || 0}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    DHL
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Tabs de estado */}
          <Paper sx={{ mb: 2 }}>
            <Tabs
              value={tabValue}
              onChange={(_, newValue) => setTabValue(newValue)}
              indicatorColor="primary"
            >
              <Tab 
                label={
                  <Badge badgeContent={summary?.total || 0} color="primary">
                    <Box sx={{ pr: 2 }}>Todos</Box>
                  </Badge>
                } 
              />
              <Tab 
                label={
                  <Badge badgeContent={summary?.in_stock || 0} color="success">
                    <Box sx={{ pr: 2 }}>En Stock</Box>
                  </Badge>
                } 
              />
              <Tab 
                label={
                  <Badge badgeContent={summary?.released || 0} color="default">
                    <Box sx={{ pr: 2 }}>Liberados</Box>
                  </Badge>
                } 
              />
            </Tabs>
          </Paper>

          {/* Tabla de inventario */}
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell width={50}></TableCell>
                  <TableCell><strong>Guía</strong></TableCell>
                  <TableCell><strong>Cliente</strong></TableCell>
                  <TableCell><strong>Sucursal</strong></TableCell>
                  <TableCell><strong>Estado</strong></TableCell>
                  <TableCell><strong>Recibido</strong></TableCell>
                  <TableCell><strong>Liberado</strong></TableCell>
                  <TableCell align="right"><strong>Peso</strong></TableCell>
                  <TableCell><strong>Recibió</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredInventory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                      <InventoryIcon sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
                      <Typography color="text.secondary">
                        No hay paquetes en inventario
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInventory.map((item) => (
                    <TableRow 
                      key={item.id}
                      hover
                      sx={{ 
                        '&:hover': { bgcolor: '#f5f5f5' },
                        opacity: item.status === 'released' ? 0.7 : 1
                      }}
                    >
                      <TableCell>
                        {getTypeIcon(item.package_type)}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <QrCodeIcon fontSize="small" sx={{ color: '#999' }} />
                          <Typography variant="body2" fontWeight="bold" fontFamily="monospace">
                            {item.tracking_number}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {item.client_name || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={item.branch_name}
                          icon={<StoreIcon />}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={getStatusColor(item.status)}
                          label={
                            item.status === 'in_stock' ? 'En Stock' :
                            item.status === 'released' ? 'Liberado' : 'En Tránsito'
                          }
                          icon={item.status === 'in_stock' ? <InStockIcon /> : <ReleasedIcon />}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(item.received_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(item.released_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {item.weight ? (
                          <Typography variant="body2" fontWeight="medium">
                            {item.weight} kg
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {item.received_by_name}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Footer con conteo */}
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Mostrando {filteredInventory.length} de {summary?.total || 0} paquetes
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Última actualización: {new Date().toLocaleTimeString('es-MX')}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}
