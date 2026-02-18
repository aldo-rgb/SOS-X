// ============================================
// PÁGINA DE PERMISOS DE PANELES POR USUARIO
// Asigna qué paneles puede ver cada usuario
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
  Checkbox,
  Button,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Snackbar,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  Divider,
  alpha,
} from '@mui/material';
import {
  Search as SearchIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Person as PersonIcon,
  Security as SecurityIcon,
  Flight as FlightIcon,
  DirectionsBoat as BoatIcon,
  LocalShipping as TruckIcon,
  Warehouse as WarehouseIcon,
  LocationOn as LocationIcon,
  Whatshot as WhatshotIcon,
  PersonSearch as PersonSearchIcon,
  HeadsetMic as HeadsetMicIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Edit as EditIcon,
  AdminPanelSettings as AdminIcon,
  Build as BuildIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Panel {
  panel_key: string;
  panel_name: string;
  category: string;
  description?: string;
  icon?: string;
}

interface UserWithPermissions {
  id: number;
  full_name: string;
  email: string;
  role: string;
  box_id?: string;
  panel_count: number;
}

interface UserPermission {
  panel_key: string;
  can_view: boolean;
  can_edit: boolean;
  panel_name?: string;
  category?: string;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  admin: { label: 'Administración', color: '#9C27B0', icon: <AdminIcon /> },
  operations: { label: 'Operaciones', color: '#2196F3', icon: <InventoryIcon /> },
  customer_service: { label: 'Servicio a Cliente', color: '#4CAF50', icon: <HeadsetMicIcon /> },
};

const PANEL_ICONS: Record<string, React.ReactNode> = {
  admin_china_air: <FlightIcon />,
  admin_china_sea: <BoatIcon />,
  admin_usa_pobox: <TruckIcon />,
  admin_mx_cedis: <WarehouseIcon />,
  admin_mx_national: <LocationIcon />,
  ops_china_air: <FlightIcon />,
  ops_china_sea: <BoatIcon />,
  ops_usa_pobox: <TruckIcon />,
  ops_mx_cedis: <WarehouseIcon />,
  ops_mx_national: <LocationIcon />,
  cs_leads: <WhatshotIcon />,
  cs_clients: <PersonSearchIcon />,
  cs_support: <HeadsetMicIcon />,
};

export default function UserPanelPermissionsPage() {
  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  // Dialog para editar permisos
  const [editDialog, setEditDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithPermissions | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const token = localStorage.getItem('token');

  const fetchUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (roleFilter) params.append('role', roleFilter);

      console.log('[PermissionsPage] Fetching users from:', `${API_URL}/api/admin/panels/users?${params}`);
      console.log('[PermissionsPage] Token exists:', !!token);

      const res = await fetch(`${API_URL}/api/admin/panels/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('[PermissionsPage] Response status:', res.status);
      
      const data = await res.json();
      console.log('[PermissionsPage] Response data:', data);
      
      if (res.ok) {
        setUsers(data.users || []);
      } else {
        console.error('[PermissionsPage] API error:', data.error || 'Unknown error');
        setSnackbar({ open: true, message: data.error || 'Error al cargar usuarios', severity: 'error' });
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
    }
  }, [token, searchTerm, roleFilter]);

  const fetchPanels = useCallback(async () => {
    try {
      console.log('[PermissionsPage] Fetching panels...');
      const res = await fetch(`${API_URL}/api/admin/panels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('[PermissionsPage] Panels response status:', res.status);
      const data = await res.json();
      console.log('[PermissionsPage] Panels data:', data.panels?.length || 0, 'panels');
      
      if (res.ok) {
        setPanels(data.panels || []);
      } else {
        console.error('[PermissionsPage] Panels API error:', data.error);
        setSnackbar({ open: true, message: data.error || 'Error al cargar paneles', severity: 'error' });
      }
    } catch (error) {
      console.error('Error fetching panels:', error);
      setSnackbar({ open: true, message: 'Error de conexión con servidor', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPanels();
  }, [fetchPanels]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleEditUser = async (user: UserWithPermissions) => {
    setSelectedUser(user);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/admin/panels/user/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        
        // Construir mapa de permisos
        const permsMap: Record<string, { can_view: boolean; can_edit: boolean }> = {};
        panels.forEach(p => {
          permsMap[p.panel_key] = { can_view: false, can_edit: false };
        });
        
        data.permissions.forEach((p: UserPermission) => {
          permsMap[p.panel_key] = { can_view: p.can_view, can_edit: p.can_edit };
        });

        setUserPermissions(permsMap);
        setEditDialog(true);
      }
    } catch (error) {
      console.error('Error fetching user permissions:', error);
      setSnackbar({ open: true, message: 'Error al cargar permisos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermission = (panelKey: string, field: 'can_view' | 'can_edit') => {
    setUserPermissions(prev => ({
      ...prev,
      [panelKey]: {
        ...prev[panelKey],
        [field]: !prev[panelKey]?.[field],
        // Si desactivas can_view, también desactiva can_edit
        ...(field === 'can_view' && prev[panelKey]?.can_view ? { can_edit: false } : {}),
        // Si activas can_edit, también activa can_view
        ...(field === 'can_edit' && !prev[panelKey]?.can_edit ? { can_view: true } : {}),
      }
    }));
  };

  const handleSelectAllCategory = (category: string, value: boolean) => {
    setUserPermissions(prev => {
      const updated = { ...prev };
      panels.filter(p => p.category === category).forEach(p => {
        updated[p.panel_key] = { can_view: value, can_edit: false };
      });
      return updated;
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    setSaving(true);

    try {
      const permissions = Object.entries(userPermissions).map(([panel_key, perms]) => ({
        panel_key,
        can_view: perms.can_view,
        can_edit: perms.can_edit,
      }));

      const res = await fetch(`${API_URL}/api/admin/panels/user/${selectedUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ permissions }),
      });

      if (res.ok) {
        setSnackbar({ open: true, message: 'Permisos actualizados correctamente', severity: 'success' });
        setEditDialog(false);
        fetchUsers();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      console.error('Error saving permissions:', error);
      setSnackbar({ open: true, message: 'Error al guardar permisos', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const getRoleLabel = (role: string) => {
    const roleLabels: Record<string, string> = {
      'super_admin': 'Super Admin',
      'advisor': 'Asesor',
      'sub_advisor': 'Sub-Asesor',
      'branch_manager': 'Gerente Sucursal',
      'counter_staff': 'Mostrador',
      'customer_service': 'Servicio Cliente',
      'warehouse_ops': 'Bodega',
      'repartidor': 'Repartidor',
    };
    return roleLabels[role] || role;
  };

  const getPanelsByCategory = (category: string) => {
    return panels.filter(p => p.category === category);
  };

  const countCategoryPermissions = (category: string) => {
    const categoryPanels = panels.filter(p => p.category === category);
    return categoryPanels.filter(p => userPermissions[p.panel_key]?.can_view).length;
  };

  if (loading && panels.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <SecurityIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight="bold">
            Permisos de Paneles por Usuario
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Asigna qué paneles puede ver cada usuario del sistema
          </Typography>
        </Box>
      </Box>

      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Buscar usuario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 250 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Filtrar por rol</InputLabel>
            <Select
              value={roleFilter}
              label="Filtrar por rol"
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <MenuItem value="">Todos los roles</MenuItem>
              <MenuItem value="advisor">Asesor</MenuItem>
              <MenuItem value="sub_advisor">Sub-Asesor</MenuItem>
              <MenuItem value="branch_manager">Gerente Sucursal</MenuItem>
              <MenuItem value="counter_staff">Mostrador</MenuItem>
              <MenuItem value="customer_service">Servicio Cliente</MenuItem>
              <MenuItem value="warehouse_ops">Bodega</MenuItem>
              <MenuItem value="repartidor">Repartidor</MenuItem>
            </Select>
          </FormControl>
          <Button
            startIcon={<RefreshIcon />}
            onClick={fetchUsers}
            variant="outlined"
          >
            Actualizar
          </Button>
        </Box>
      </Paper>

      {/* Lista de Usuarios */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell>Usuario</TableCell>
                <TableCell>Rol</TableCell>
                <TableCell align="center">Paneles Asignados</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        {user.full_name.charAt(0)}
                      </Avatar>
                      <Box>
                        <Typography fontWeight="medium">{user.full_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {user.email}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={getRoleLabel(user.role)} 
                      size="small"
                      color={user.role === 'Admin' ? 'secondary' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip 
                      label={`${user.panel_count} paneles`}
                      color={user.panel_count > 0 ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Editar permisos">
                      <IconButton 
                        color="primary" 
                        onClick={() => handleEditUser(user)}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No se encontraron usuarios
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Dialog para editar permisos */}
      <Dialog 
        open={editDialog} 
        onClose={() => setEditDialog(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <PersonIcon />
            <Box>
              <Typography variant="h6">Permisos de Paneles</Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {selectedUser?.full_name} ({selectedUser?.email})
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, mt: 2 }}>
          <Tabs 
            value={activeTab} 
            onChange={(_, v) => setActiveTab(v)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            {Object.entries(CATEGORY_LABELS).map(([key, { label, icon }], index) => (
              <Tab 
                key={key}
                icon={icon as React.ReactElement}
                iconPosition="start"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {label}
                    <Chip 
                      label={countCategoryPermissions(key)} 
                      size="small" 
                      color={countCategoryPermissions(key) > 0 ? 'success' : 'default'}
                    />
                  </Box>
                }
              />
            ))}
          </Tabs>

          {Object.keys(CATEGORY_LABELS).map((category, index) => (
            <Box 
              key={category}
              hidden={activeTab !== index}
              sx={{ p: 2 }}
            >
              {activeTab === index && (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 1 }}>
                    <Button
                      size="small"
                      onClick={() => handleSelectAllCategory(category, true)}
                      startIcon={<CheckCircleIcon />}
                    >
                      Seleccionar todos
                    </Button>
                    <Button
                      size="small"
                      onClick={() => handleSelectAllCategory(category, false)}
                      startIcon={<CancelIcon />}
                    >
                      Deseleccionar todos
                    </Button>
                  </Box>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Panel</TableCell>
                          <TableCell align="center">Puede Ver</TableCell>
                          <TableCell align="center">Puede Editar</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {getPanelsByCategory(category).map((panel) => (
                          <TableRow key={panel.panel_key} hover>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Box sx={{ 
                                  color: CATEGORY_LABELS[category].color,
                                  display: 'flex',
                                  alignItems: 'center'
                                }}>
                                  {PANEL_ICONS[panel.panel_key] || <BuildIcon />}
                                </Box>
                                <Box>
                                  <Typography fontWeight="medium">
                                    {panel.panel_name}
                                  </Typography>
                                  {panel.description && (
                                    <Typography variant="caption" color="text.secondary">
                                      {panel.description}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            </TableCell>
                            <TableCell align="center">
                              <Checkbox
                                checked={userPermissions[panel.panel_key]?.can_view || false}
                                onChange={() => handleTogglePermission(panel.panel_key, 'can_view')}
                                sx={{
                                  '&.Mui-checked': {
                                    color: CATEGORY_LABELS[category].color,
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Checkbox
                                checked={userPermissions[panel.panel_key]?.can_edit || false}
                                onChange={() => handleTogglePermission(panel.panel_key, 'can_edit')}
                                disabled={!userPermissions[panel.panel_key]?.can_view}
                                sx={{
                                  '&.Mui-checked': {
                                    color: CATEGORY_LABELS[category].color,
                                  }
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </Box>
          ))}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditDialog(false)}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSavePermissions}
            disabled={saving}
          >
            Guardar Permisos
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
