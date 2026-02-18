import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
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
  Chip,
  Avatar,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  CircularProgress,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Snackbar,
  type SelectChangeEvent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import FilterListIcon from '@mui/icons-material/FilterList';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import CloseIcon from '@mui/icons-material/Close';
import LockResetIcon from '@mui/icons-material/LockReset';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

interface User {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  role: string;
  created_at?: string;
}

interface ClientsPageProps {
  users: User[];
  loading: boolean;
  onRefresh: () => void;
  currentUser?: { id: number; name: string; email: string; role: string } | null;
}

// Función para obtener las iniciales del nombre
const getInitials = (name: string) => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

// Función para obtener color del rol
const getRoleColor = (role: string): "error" | "warning" | "info" | "success" | "default" | "secondary" | "primary" => {
  const colors: Record<string, "error" | "warning" | "info" | "success" | "default" | "secondary" | "primary"> = {
    super_admin: 'error',
    admin: 'error',
    director: 'secondary',
    branch_manager: 'warning',
    customer_service: 'primary',
    counter_staff: 'info',
    warehouse_ops: 'success',
    advisor: 'primary',
    sub_advisor: 'info',
    repartidor: 'warning',
    client: 'default',
  };
  return colors[role] || 'default';
};

// Función para traducir el rol
const translateRole = (role: string): string => {
  const translations: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    director: 'Director',
    branch_manager: 'Operaciones',
    customer_service: 'Servicio Cliente',
    counter_staff: 'Mostrador',
    warehouse_ops: 'Bodega',
    advisor: 'Asesor',
    sub_advisor: 'Sub-Asesor',
    repartidor: 'Repartidor',
    client: 'Cliente',
  };
  return translations[role] || role;
};

export default function ClientsPage({ users, loading, onRefresh, currentUser }: ClientsPageProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: '', email: '', role: '', box_id: '' });
  
  // Estado para crear nuevo usuario
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', phone: '' });
  const [creating, setCreating] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  // Estados para cambio de contraseña (solo super_admin)
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const API_URL = 'http://localhost:3001/api';
  // getToken utility available if needed
  const _getToken = () => localStorage.getItem('token') || '';
  void _getToken;

  // Translate role using i18n
  const translateRoleI18n = (role: string): string => {
    return t(`roles.${role}`, role);
  };

  // Filtrar usuarios
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.box_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  // Paginación
  const paginatedUsers = filteredUsers.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Ver detalles
  const handleViewDetails = (user: User) => {
    setSelectedUser(user);
    setDetailsOpen(true);
  };

  // Editar usuario
  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      box_id: user.box_id,
    });
    setEditOpen(true);
  };

  // Abrir diálogo de crear cliente
  const handleOpenCreate = () => {
    setCreateForm({ full_name: '', email: '', phone: '' });
    setCreateOpen(true);
  };

  // Crear nuevo usuario
  const handleCreateClient = async () => {
    if (!createForm.full_name || !createForm.email || !createForm.phone) {
      setSnackbar({ open: true, message: 'Por favor completa todos los campos (nombre, email y WhatsApp)', severity: 'error' });
      return;
    }

    setCreating(true);
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        fullName: createForm.full_name,
        email: createForm.email,
        phone: createForm.phone,
        isAdminCreated: true // Indica que fue creado por admin - usará contraseña por defecto
      });
      
      setSnackbar({ open: true, message: `✅ Cliente creado. Casillero: ${response.data.user?.boxId || 'Asignado'}`, severity: 'success' });
      setCreateOpen(false);
      onRefresh(); // Recargar lista de usuarios
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Error al crear cliente';
      setSnackbar({ open: true, message: errorMsg, severity: 'error' });
    } finally {
      setCreating(false);
    }
  };

  // Guardar cambios de usuario
  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      
      await axios.put(
        `${API_URL}/api/admin/users/${selectedUser.id}`,
        {
          full_name: editForm.full_name,
          email: editForm.email,
          role: editForm.role,
          box_id: editForm.box_id,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setEditOpen(false);
      setNewPassword('');
      setSnackbar({ open: true, message: 'Usuario actualizado correctamente', severity: 'success' });
      onRefresh(); // Recargar lista
    } catch (error) {
      console.error('Error al actualizar usuario:', error);
      setSnackbar({ open: true, message: 'Error al actualizar usuario', severity: 'error' });
    }
  };

  // Cambiar contraseña (solo super_admin)
  const handleChangePassword = async () => {
    if (!selectedUser || !newPassword) {
      setSnackbar({ open: true, message: 'Ingresa una nueva contraseña', severity: 'error' });
      return;
    }
    
    if (newPassword.length < 6) {
      setSnackbar({ open: true, message: 'La contraseña debe tener al menos 6 caracteres', severity: 'error' });
      return;
    }
    
    setChangingPassword(true);
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      
      await axios.put(
        `${API_URL}/api/admin/users/${selectedUser.id}/password`,
        { newPassword, requireChange: false },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setNewPassword('');
      setSnackbar({ open: true, message: '✅ Contraseña actualizada correctamente', severity: 'success' });
    } catch (error: any) {
      console.error('Error al cambiar contraseña:', error);
      setSnackbar({ open: true, message: error.response?.data?.error || 'Error al cambiar contraseña', severity: 'error' });
    } finally {
      setChangingPassword(false);
    }
  };

  // Resetear contraseña a Entregax123 y exigir cambio
  const handleResetPassword = async () => {
    if (!selectedUser) return;
    
    setResettingPassword(true);
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      
      await axios.put(
        `${API_URL}/api/admin/users/${selectedUser.id}/password`,
        { newPassword: 'Entregax123', requireChange: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSnackbar({ open: true, message: '🔐 Contraseña reseteada a Entregax123. El usuario deberá cambiarla en el próximo inicio de sesión.', severity: 'success' });
    } catch (error: any) {
      console.error('Error al resetear contraseña:', error);
      setSnackbar({ open: true, message: error.response?.data?.error || 'Error al resetear contraseña', severity: 'error' });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleRoleFilterChange = (event: SelectChangeEvent) => {
    setRoleFilter(event.target.value);
    setPage(0);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} color="text.primary">
            {t('clients.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('clients.subtitle', 'Administra los usuarios registrados en la plataforma')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Tooltip title={t('common.refresh', 'Actualizar lista')}>
            <IconButton 
              onClick={onRefresh}
              sx={{ 
                bgcolor: 'rgba(17, 17, 17, 0.05)',
                '&:hover': { bgcolor: 'rgba(17, 17, 17, 0.1)' }
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={handleOpenCreate}
            sx={{
              background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
              '&:hover': { background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)' }
            }}
          >
            {t('clients.newClient')}
          </Button>
        </Box>
      </Box>

      {/* Filters Bar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder={t('clients.searchPlaceholder')}
            size="small"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
            sx={{ 
              flex: 1, 
              minWidth: 280,
              '& .MuiOutlinedInput-root': {
                '&.Mui-focused fieldset': { borderColor: '#F05A28' },
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
          />
          
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('common.filter')} {t('clients.role')}</InputLabel>
            <Select
              value={roleFilter}
              label={`${t('common.filter')} ${t('clients.role')}`}
              onChange={handleRoleFilterChange}
            >
              <MenuItem value="all">{t('common.all', 'Todos')}</MenuItem>
              <MenuItem value="super_admin">{t('roles.super_admin')}</MenuItem>
              <MenuItem value="admin">{t('roles.admin')}</MenuItem>
              <MenuItem value="director">{t('roles.director')}</MenuItem>
              <MenuItem value="branch_manager">{t('roles.branch_manager')}</MenuItem>
              <MenuItem value="customer_service">{t('roles.customer_service')}</MenuItem>
              <MenuItem value="counter_staff">{t('roles.counter_staff')}</MenuItem>
              <MenuItem value="warehouse_ops">{t('roles.warehouse_ops')}</MenuItem>
              <MenuItem value="client">{t('roles.client')}</MenuItem>
            </Select>
          </FormControl>

          <Tooltip title={t('common.moreFilters', 'Más filtros (próximamente)')}>
            <IconButton sx={{ bgcolor: 'rgba(17, 17, 17, 0.05)' }}>
              <FilterListIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: '#F05A28' }} />
        </Box>
      ) : filteredUsers.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="h6" color="text.secondary">
            {t('clients.noClientsFound', 'No se encontraron clientes')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {searchTerm || roleFilter !== 'all' 
              ? t('clients.tryOtherFilters', 'Intenta con otros filtros de búsqueda') 
              : t('clients.noClientsYet', 'Aún no hay clientes registrados')}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>{t('clients.client', 'Cliente')}</TableCell>
                <TableCell>{t('clients.boxId')}</TableCell>
                <TableCell>{t('auth.email')}</TableCell>
                <TableCell>{t('clients.role')}</TableCell>
                <TableCell align="center">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedUsers.map((user) => (
                <TableRow 
                  key={user.id} 
                  hover 
                  sx={{ 
                    '&:hover': { bgcolor: 'rgba(240, 90, 40, 0.04)' },
                    cursor: 'pointer'
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={600} color="text.primary">
                      #{user.id}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar 
                        sx={{ 
                          width: 40, 
                          height: 40, 
                          background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)', 
                          fontSize: '0.85rem',
                          fontWeight: 600,
                        }}
                      >
                        {getInitials(user.full_name)}
                      </Avatar>
                      <Box>
                        <Typography fontWeight={500}>{user.full_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Desde {user.created_at ? new Date(user.created_at).toLocaleDateString('es-MX', { 
                            month: 'short', 
                            year: 'numeric' 
                          }) : 'N/A'}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={user.box_id} 
                      size="small"
                      sx={{ 
                        bgcolor: '#111111', 
                        color: 'white',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        letterSpacing: '0.5px',
                      }} 
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <MailOutlineIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                      <Typography variant="body2" color="text.secondary">
                        {user.email}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={translateRoleI18n(user.role)} 
                      size="small" 
                      color={getRoleColor(user.role)}
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                      <Tooltip title={t('clients.viewDetails', 'Ver detalles')}>
                        <IconButton 
                          size="small" 
                          onClick={() => handleViewDetails(user)}
                          sx={{ 
                            color: '#111111',
                            '&:hover': { bgcolor: 'rgba(17, 17, 17, 0.08)' }
                          }}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('clients.editClient')}>
                        <IconButton 
                          size="small"
                          onClick={() => handleEdit(user)}
                          sx={{ 
                            color: '#F05A28',
                            '&:hover': { bgcolor: 'rgba(240, 90, 40, 0.08)' }
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={filteredUsers.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage={t('common.rowsPerPage', 'Filas por página:')}
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} ${t('common.of', 'de')} ${count}`}
          />
        </TableContainer>
      )}

      {/* Stats Footer */}
      <Box sx={{ display: 'flex', gap: 3, mt: 3, flexWrap: 'wrap' }}>
        <Paper sx={{ p: 2, flex: 1, minWidth: 200, borderRadius: 2, borderLeft: 4, borderColor: '#F05A28' }}>
          <Typography variant="body2" color="text.secondary">{t('clients.totalClients')}</Typography>
          <Typography variant="h5" fontWeight={700}>{users.filter(u => u.role === 'client').length}</Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, minWidth: 200, borderRadius: 2, borderLeft: 4, borderColor: '#10B981' }}>
          <Typography variant="body2" color="text.secondary">{t('clients.activeStaff', 'Staff Activo')}</Typography>
          <Typography variant="h5" fontWeight={700}>{users.filter(u => u.role !== 'client').length}</Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, minWidth: 200, borderRadius: 2, borderLeft: 4, borderColor: '#111111' }}>
          <Typography variant="body2" color="text.secondary">{t('dashboard.totalUsers')}</Typography>
          <Typography variant="h5" fontWeight={700}>{users.length}</Typography>
        </Paper>
      </Box>

      {/* Details Dialog */}
      <Dialog 
        open={detailsOpen} 
        onClose={() => setDetailsOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight={700}>Detalles del Cliente</Typography>
            <IconButton onClick={() => setDetailsOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedUser && (
            <Box sx={{ pt: 2 }}>
              {/* Header del cliente */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Avatar 
                  sx={{ 
                    width: 64, 
                    height: 64, 
                    background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                  }}
                >
                  {getInitials(selectedUser.full_name)}
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight={600}>{selectedUser.full_name}</Typography>
                  <Chip 
                    label={translateRole(selectedUser.role)} 
                    size="small" 
                    color={getRoleColor(selectedUser.role)}
                    sx={{ mt: 0.5, fontWeight: 600 }}
                  />
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Información detallada */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 3 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">ID de Usuario</Typography>
                  <Typography variant="body1" fontWeight={500}>#{selectedUser.id}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Casillero</Typography>
                  <Box>
                    <Chip 
                      label={selectedUser.box_id} 
                      sx={{ 
                        bgcolor: '#111111', 
                        color: 'white',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                      }} 
                    />
                  </Box>
                </Box>
                <Box sx={{ gridColumn: 'span 2' }}>
                  <Typography variant="caption" color="text.secondary">Correo Electrónico</Typography>
                  <Typography variant="body1">{selectedUser.email}</Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 3 }} />

              {/* Estadísticas del cliente */}
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
                Estadísticas
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Paper sx={{ p: 2, flex: 1, textAlign: 'center', bgcolor: 'rgba(240, 90, 40, 0.05)', borderRadius: 2 }}>
                  <LocalShippingIcon sx={{ color: '#F05A28', mb: 1 }} />
                  <Typography variant="h5" fontWeight={700}>0</Typography>
                  <Typography variant="caption" color="text.secondary">En tránsito</Typography>
                </Paper>
                <Paper sx={{ p: 2, flex: 1, textAlign: 'center', bgcolor: 'rgba(16, 185, 129, 0.05)', borderRadius: 2 }}>
                  <InventoryIcon sx={{ color: '#10B981', mb: 1 }} />
                  <Typography variant="h5" fontWeight={700}>0</Typography>
                  <Typography variant="caption" color="text.secondary">Entregados</Typography>
                </Paper>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setDetailsOpen(false)} sx={{ color: 'text.secondary' }}>
            Cerrar
          </Button>
          <Button 
            variant="contained"
            onClick={() => {
              setDetailsOpen(false);
              if (selectedUser) handleEdit(selectedUser);
            }}
            sx={{
              background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
              '&:hover': { background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)' }
            }}
          >
            Editar Cliente
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog 
        open={editOpen} 
        onClose={() => setEditOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight={700}>Editar Cliente</Typography>
            <IconButton onClick={() => setEditOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="Nombre Completo"
              fullWidth
              value={editForm.full_name}
              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
            />
            <TextField
              label="Correo Electrónico"
              fullWidth
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
            <FormControl fullWidth>
              <InputLabel>Rol</InputLabel>
              <Select
                value={editForm.role}
                label="Rol"
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              >
                <MenuItem value="client">Cliente</MenuItem>
                <MenuItem value="advisor">Asesor</MenuItem>
                <MenuItem value="sub_advisor">Sub-Asesor</MenuItem>
                <MenuItem value="repartidor">Repartidor</MenuItem>
                <MenuItem value="warehouse_ops">Bodega</MenuItem>
                <MenuItem value="counter_staff">Mostrador</MenuItem>
                <MenuItem value="customer_service">Servicio a Cliente</MenuItem>
                <MenuItem value="branch_manager">Operaciones</MenuItem>
                <MenuItem value="director">Director</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="super_admin">Super Admin</MenuItem>
              </Select>
            </FormControl>
            {selectedUser && (
              <TextField
                label="Casillero"
                fullWidth
                value={selectedUser.box_id}
                disabled
                helperText="El casillero no puede ser modificado"
              />
            )}
            
            {/* Sección de Contraseña - Solo visible para super_admin */}
            {isSuperAdmin && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                  🔐 Gestión de Contraseña
                </Typography>
                
                {/* Cambiar Contraseña */}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <TextField
                    label="Nueva Contraseña"
                    fullWidth
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    size="small"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleChangePassword}
                    disabled={changingPassword || !newPassword}
                    sx={{ 
                      minWidth: 100,
                      bgcolor: '#2196F3',
                      '&:hover': { bgcolor: '#1976D2' }
                    }}
                  >
                    {changingPassword ? <CircularProgress size={20} color="inherit" /> : 'Cambiar'}
                  </Button>
                </Box>
                
                {/* Botón Resetear */}
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={resettingPassword ? <CircularProgress size={18} /> : <LockResetIcon />}
                  onClick={handleResetPassword}
                  disabled={resettingPassword}
                  fullWidth
                  sx={{ mt: 1 }}
                >
                  {resettingPassword ? 'Reseteando...' : 'Resetear a Entregax123'}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                  El usuario deberá cambiar la contraseña en su próximo inicio de sesión
                </Typography>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => { setEditOpen(false); setNewPassword(''); }} sx={{ color: 'text.secondary' }}>
            Cancelar
          </Button>
          <Button 
            variant="contained"
            onClick={handleSaveEdit}
            sx={{
              background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
              '&:hover': { background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)' }
            }}
          >
            Guardar Cambios
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Crear Cliente */}
      <Dialog 
        open={createOpen} 
        onClose={() => setCreateOpen(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}>
          <PersonAddIcon />
          Nuevo Usuario
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Nombre Completo *"
              fullWidth
              value={createForm.full_name}
              onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
              placeholder="Ej: Juan Pérez García"
            />
            <TextField
              label="Correo Electrónico *"
              fullWidth
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="cliente@email.com"
            />
            <TextField
              label="WhatsApp *"
              fullWidth
              value={createForm.phone}
              onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              placeholder="+52 81 1234 5678"
              helperText="Número de WhatsApp para notificaciones"
            />
            <Alert severity="info" sx={{ mt: 1 }}>
              Se asignará automáticamente un casillero único (ETX-XXXX).
              <br />
              <strong>Contraseña inicial:</strong> Entregax123 (el cliente deberá cambiarla en su primer inicio de sesión)
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ color: 'text.secondary' }}>
            Cancelar
          </Button>
          <Button 
            variant="contained"
            onClick={handleCreateClient}
            disabled={creating}
            startIcon={creating ? <CircularProgress size={20} color="inherit" /> : <PersonAddIcon />}
            sx={{
              background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
              '&:hover': { background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)' }
            }}
          >
            {creating ? 'Creando...' : 'Crear Cliente'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar para mensajes */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
