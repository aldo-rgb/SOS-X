import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
  CircularProgress,
  Tooltip,
  InputAdornment,
  Chip,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Business as BusinessIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Refresh as RefreshIcon,
  Calculate as CalculateIcon,
  Inventory as InventoryIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import axios from 'axios';
import SupplierCostingPanel from './SupplierCostingPanel';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Supplier {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Stats
  total_packages?: number;
  pending_payment?: number;
  total_cost?: number;
}

interface SupplierFormData {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

const initialFormData: SupplierFormData = {
  name: '',
  email: '',
  phone: '',
  notes: ''
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Proveedor seleccionado para ver costeo
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  
  // Dialog state
  const [openDialog, setOpenDialog] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  
  // Delete confirmation
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  
  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({ open: false, message: '', severity: 'info' });

  useEffect(() => {
    loadSuppliers();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = suppliers.filter(s => 
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.phone?.includes(searchTerm)
      );
      setFilteredSuppliers(filtered);
    } else {
      setFilteredSuppliers(suppliers);
    }
  }, [searchTerm, suppliers]);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/suppliers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuppliers(response.data.suppliers || []);
    } catch (error) {
      console.error('Error cargando proveedores:', error);
      setSnackbar({ open: true, message: 'Error al cargar proveedores', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (supplier?: Supplier, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name,
        email: supplier.email || '',
        phone: supplier.phone || '',
        notes: supplier.notes || ''
      });
    } else {
      setEditingSupplier(null);
      setFormData(initialFormData);
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingSupplier(null);
    setFormData(initialFormData);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setSnackbar({ open: true, message: 'El nombre es requerido', severity: 'error' });
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      
      if (editingSupplier) {
        await axios.put(`${API_URL}/api/suppliers/${editingSupplier.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSnackbar({ open: true, message: 'Proveedor actualizado', severity: 'success' });
      } else {
        await axios.post(`${API_URL}/api/suppliers`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSnackbar({ open: true, message: 'Proveedor creado', severity: 'success' });
      }
      
      handleCloseDialog();
      loadSuppliers();
    } catch (error: unknown) {
      console.error('Error guardando proveedor:', error);
      const errMsg = error instanceof Error && 'response' in error 
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Error al guardar')
        : 'Error al guardar';
      setSnackbar({ 
        open: true, 
        message: errMsg, 
        severity: 'error' 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (supplier: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    setSupplierToDelete(supplier);
    setDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!supplierToDelete) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/suppliers/${supplierToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSnackbar({ open: true, message: 'Proveedor eliminado', severity: 'success' });
      loadSuppliers();
    } catch (error) {
      console.error('Error eliminando proveedor:', error);
      setSnackbar({ open: true, message: 'Error al eliminar', severity: 'error' });
    } finally {
      setDeleteDialog(false);
      setSupplierToDelete(null);
    }
  };

  const handleSupplierClick = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
  };

  // Si hay un proveedor seleccionado, mostrar su panel de costeo
  if (selectedSupplier) {
    return (
      <SupplierCostingPanel 
        supplier={selectedSupplier} 
        onBack={() => setSelectedSupplier(null)} 
      />
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <BusinessIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight="bold">Proveedores PO Box</Typography>
            <Typography variant="body2" color="text.secondary">
              Selecciona un proveedor para ver su panel de costeo
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <IconButton onClick={loadSuppliers} disabled={loading}>
            <RefreshIcon />
          </IconButton>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Nuevo Proveedor
          </Button>
        </Box>
      </Box>

      {/* Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Buscar por nombre, correo o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            )
          }}
        />
      </Paper>

      {/* Suppliers Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : filteredSuppliers.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <BusinessIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            {searchTerm ? 'No se encontraron proveedores' : 'No hay proveedores registrados'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {searchTerm ? 'Intenta con otro término de búsqueda' : 'Crea tu primer proveedor para comenzar'}
          </Typography>
          {!searchTerm && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
              Crear Proveedor
            </Button>
          )}
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {filteredSuppliers.map((supplier) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={supplier.id}>
              <Card 
                sx={{ 
                  height: '100%',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 6,
                  }
                }}
              >
                <CardActionArea 
                  onClick={() => handleSupplierClick(supplier)}
                  sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                >
                  {/* Header con gradiente */}
                  <Box
                    sx={{
                      background: 'linear-gradient(135deg, #5E35B1 0%, #7E57C2 100%)',
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <BusinessIcon sx={{ color: 'white', fontSize: 32 }} />
                      <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                        {supplier.name}
                      </Typography>
                    </Box>
                    <CalculateIcon sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 40 }} />
                  </Box>
                  
                  <CardContent sx={{ flexGrow: 1 }}>
                    {/* Contacto */}
                    <Box sx={{ mb: 2 }}>
                      {supplier.email && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <EmailIcon fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">
                            {supplier.email}
                          </Typography>
                        </Box>
                      )}
                      {supplier.phone && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PhoneIcon fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">
                            {supplier.phone}
                          </Typography>
                        </Box>
                      )}
                      {!supplier.email && !supplier.phone && (
                        <Typography variant="body2" color="text.disabled" fontStyle="italic">
                          Sin información de contacto
                        </Typography>
                      )}
                    </Box>

                    <Divider sx={{ my: 1.5 }} />

                    {/* Stats */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <InventoryIcon fontSize="small" color="primary" />
                        <Typography variant="body2" color="text.secondary">
                          {supplier.total_packages || 0} paquetes
                        </Typography>
                      </Box>
                      <Chip 
                        label="Ver Costeo" 
                        size="small" 
                        color="primary" 
                        variant="outlined"
                        icon={<MoneyIcon />}
                      />
                    </Box>

                    {supplier.notes && (
                      <Typography 
                        variant="caption" 
                        color="text.secondary" 
                        sx={{ 
                          display: 'block', 
                          mt: 1.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        📝 {supplier.notes}
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>

                {/* Acciones (fuera del CardActionArea) */}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Tooltip title="Editar">
                    <IconButton size="small" onClick={(e) => handleOpenDialog(supplier, e)} color="primary">
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Eliminar">
                    <IconButton size="small" onClick={(e) => handleDeleteClick(supplier, e)} color="error">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              label="Nombre *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              autoFocus
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <BusinessIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
            <TextField
              label="Correo Electrónico"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
            <TextField
              label="Teléfono"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PhoneIcon color="action" />
                  </InputAdornment>
                )
              }}
            />
            <TextField
              label="Notas"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              fullWidth
              multiline
              rows={3}
              placeholder="Información adicional del proveedor..."
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDialog} disabled={saving}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSave} 
            disabled={saving || !formData.name.trim()}
          >
            {saving ? <CircularProgress size={24} /> : (editingSupplier ? 'Guardar' : 'Crear')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Confirmar Eliminación</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Estás seguro de eliminar al proveedor <strong>{supplierToDelete?.name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
