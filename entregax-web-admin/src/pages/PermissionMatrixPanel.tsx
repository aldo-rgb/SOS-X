// ============================================
// PANEL MATRIZ DE PERMISOS POR ROL
// Solo accesible por Super Admin
// ============================================

import { useState, useEffect, Fragment } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  alpha,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Block as BlockIcon,
  Save as SaveIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ROLES CONFIGURABLES (Columnas de la matriz)
const CONFIGURABLE_ROLES = [
  'Admin',
  'Director',
  'Gerente de Sucursal',
  'Servicio a Cliente',
  'Personal de Mostrador',
  'Operaciones de Bodega',
];

// Colores para las categorías
const CATEGORY_COLORS: Record<string, string> = {
  'Admin': '#9C27B0',
  'Financiero': '#4CAF50',
  'Operativo': '#2196F3',
  'Ventas': '#FF9800',
  'General': '#607D8B',
};

interface Permission {
  id: number;
  slug: string;
  name: string;
  category: string;
}

interface NewPermission {
  slug: string;
  name: string;
  category: string;
}

export default function PermissionMatrixPanel() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  // Modal para agregar nuevo permiso
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newPermission, setNewPermission] = useState<NewPermission>({ slug: '', name: '', category: 'General' });

  useEffect(() => {
    loadMatrix();
  }, []);

  const loadMatrix = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/admin/permissions/matrix`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) {
        throw new Error(res.status === 403 ? 'Acceso denegado - Solo Super Admin' : 'Error al cargar matriz');
      }
      
      const data = await res.json();
      setPermissions(data.permissions || []);
      setActiveMap(data.activeMap || {});
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (role: string, permissionId: number, currentVal: boolean) => {
    // Optimismo en UI
    const key = `${role}_${permissionId}`;
    setActiveMap(prev => ({ ...prev, [key]: !currentVal }));

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/admin/permissions/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role,
          permissionId,
          assign: !currentVal,
        }),
      });

      if (!res.ok) {
        throw new Error('Error al actualizar');
      }
      
      setSnackbar({
        open: true,
        message: !currentVal ? `Permiso otorgado a ${role}` : `Permiso revocado de ${role}`,
        severity: 'success',
      });
    } catch {
      // Revertir si falla
      setActiveMap(prev => ({ ...prev, [key]: currentVal }));
      setSnackbar({ open: true, message: 'Error al guardar permiso', severity: 'error' });
    }
  };

  const handleAddPermission = async () => {
    if (!newPermission.slug || !newPermission.name) {
      setSnackbar({ open: true, message: 'Slug y Nombre son requeridos', severity: 'error' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/admin/permissions/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newPermission),
      });

      if (!res.ok) throw new Error('Error al agregar');

      setSnackbar({ open: true, message: 'Permiso agregado correctamente', severity: 'success' });
      setAddDialogOpen(false);
      setNewPermission({ slug: '', name: '', category: 'General' });
      loadMatrix();
    } catch {
      setSnackbar({ open: true, message: 'Error al agregar permiso', severity: 'error' });
    }
  };

  const handleDeletePermission = async (id: number, name: string) => {
    if (!confirm(`¿Eliminar el permiso "${name}"? Esta acción no se puede deshacer.`)) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/admin/permissions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Error al eliminar');

      setSnackbar({ open: true, message: 'Permiso eliminado', severity: 'success' });
      loadMatrix();
    } catch {
      setSnackbar({ open: true, message: 'Error al eliminar permiso', severity: 'error' });
    }
  };

  // Agrupar permisos por categoría
  const groupedPermissions = permissions.reduce<Record<string, Permission[]>>((acc, perm) => {
    const cat = perm.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(perm);
    return acc;
  }, {});

  // Contar permisos por rol
  const countPermissionsByRole = (role: string) => {
    return permissions.filter(p => activeMap[`${role}_${p.id}`]).length;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="contained" onClick={loadMatrix} startIcon={<RefreshIcon />}>
          Reintentar
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityIcon fontSize="large" color="primary" />
            Matriz de Permisos por Rol 🎛️
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Marca las casillas para otorgar capacidades a cada rol. Los cambios se aplican inmediatamente.
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            variant="outlined" 
            startIcon={<RefreshIcon />} 
            onClick={loadMatrix}
          >
            Actualizar
          </Button>
          <Button 
            variant="contained" 
            startIcon={<AddIcon />} 
            onClick={() => setAddDialogOpen(true)}
          >
            Nuevo Permiso
          </Button>
        </Box>
      </Box>

      {/* Stats rápidos */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {CONFIGURABLE_ROLES.map(role => (
          <Chip
            key={role}
            label={`${role}: ${countPermissionsByRole(role)}/${permissions.length}`}
            color={countPermissionsByRole(role) === permissions.length ? 'success' : 'default'}
            variant="outlined"
            icon={countPermissionsByRole(role) === permissions.length ? <CheckCircleIcon /> : <BlockIcon />}
          />
        ))}
      </Box>

      {/* Tabla de Matriz */}
      <TableContainer component={Paper} sx={{ maxHeight: '70vh', overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell 
                sx={{ 
                  bgcolor: '#1a1a2e', 
                  color: 'white', 
                  fontWeight: 'bold',
                  minWidth: 250,
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                }}
              >
                Permiso / Capacidad
              </TableCell>
              {CONFIGURABLE_ROLES.map(role => (
                <TableCell 
                  key={role} 
                  align="center" 
                  sx={{ 
                    bgcolor: '#1a1a2e', 
                    color: 'white', 
                    fontWeight: 'bold',
                    minWidth: 120,
                    whiteSpace: 'pre-line',
                    fontSize: '0.75rem',
                  }}
                >
                  {role}
                </TableCell>
              ))}
              <TableCell 
                sx={{ 
                  bgcolor: '#1a1a2e', 
                  color: 'white', 
                  fontWeight: 'bold',
                  width: 60,
                }}
              >
                
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.keys(groupedPermissions).sort().map(category => (
              <Fragment key={category}>
                {/* Encabezado de categoría */}
                <TableRow sx={{ bgcolor: alpha(CATEGORY_COLORS[category] || '#607D8B', 0.1) }}>
                  <TableCell 
                    colSpan={CONFIGURABLE_ROLES.length + 2}
                    sx={{ 
                      position: 'sticky', 
                      left: 0, 
                      bgcolor: alpha(CATEGORY_COLORS[category] || '#607D8B', 0.1),
                    }}
                  >
                    <Chip 
                      label={category} 
                      size="small" 
                      sx={{ 
                        fontWeight: 'bold',
                        bgcolor: CATEGORY_COLORS[category] || '#607D8B',
                        color: 'white',
                      }} 
                    />
                    <Typography variant="caption" sx={{ ml: 2, color: 'text.secondary' }}>
                      {groupedPermissions[category].length} permisos
                    </Typography>
                  </TableCell>
                </TableRow>

                {/* Filas de permisos */}
                {groupedPermissions[category].map(perm => (
                  <TableRow 
                    key={perm.id} 
                    hover
                    sx={{ 
                      '&:hover': { bgcolor: alpha(CATEGORY_COLORS[perm.category] || '#607D8B', 0.05) }
                    }}
                  >
                    <TableCell 
                      sx={{ 
                        position: 'sticky', 
                        left: 0, 
                        bgcolor: 'background.paper',
                        borderRight: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="body2" fontWeight="bold">
                        {perm.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                        {perm.slug}
                      </Typography>
                    </TableCell>
                    
                    {/* Columnas de checkboxes */}
                    {CONFIGURABLE_ROLES.map(role => {
                      const isChecked = !!activeMap[`${role}_${perm.id}`];
                      return (
                        <TableCell key={role} align="center" padding="checkbox">
                          <Tooltip 
                            title={isChecked ? `Quitar de ${role}` : `Otorgar a ${role}`}
                            arrow
                          >
                            <Checkbox
                              checked={isChecked}
                              onChange={() => handleToggle(role, perm.id, isChecked)}
                              color="success"
                              size="small"
                              sx={{
                                '&.Mui-checked': {
                                  color: CATEGORY_COLORS[perm.category] || '#4CAF50',
                                },
                              }}
                            />
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                    
                    {/* Botón eliminar */}
                    <TableCell align="center" padding="checkbox">
                      <Tooltip title="Eliminar permiso">
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleDeletePermission(perm.id, perm.name)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Leyenda */}
      <Paper sx={{ mt: 2, p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Categorías:</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <Chip key={cat} label={cat} size="small" sx={{ bgcolor: color, color: 'white' }} />
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          💡 <strong>Super Admin</strong> siempre tiene todos los permisos (no editable aquí por seguridad).
        </Typography>
      </Paper>

      {/* Dialog para agregar permiso */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <AddIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Agregar Nuevo Permiso
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Slug (identificador único)"
            fullWidth
            margin="normal"
            value={newPermission.slug}
            onChange={e => setNewPermission(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
            placeholder="ej: delete_invoices"
            helperText="Solo letras minúsculas, números y guiones bajos"
          />
          <TextField
            label="Nombre legible"
            fullWidth
            margin="normal"
            value={newPermission.name}
            onChange={e => setNewPermission(p => ({ ...p, name: e.target.value }))}
            placeholder="ej: Eliminar Facturas"
          />
          <TextField
            label="Categoría"
            fullWidth
            margin="normal"
            select
            SelectProps={{ native: true }}
            value={newPermission.category}
            onChange={e => setNewPermission(p => ({ ...p, category: e.target.value }))}
          >
            <option value="General">General</option>
            <option value="Admin">Admin</option>
            <option value="Financiero">Financiero</option>
            <option value="Operativo">Operativo</option>
            <option value="Ventas">Ventas</option>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            startIcon={<SaveIcon />} 
            onClick={handleAddPermission}
            disabled={!newPermission.slug || !newPermission.name}
          >
            Guardar Permiso
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar(s => ({ ...s, open: false }))} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
