// ============================================
// DIÁLOGO DE PERMISOS DE MÓDULOS POR PANEL
// Configura permisos granulares para cada módulo dentro de un panel
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Paper,
  alpha,
} from '@mui/material';
import {
  Save as SaveIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Calculate as CalculateIcon,
  Inventory as InventoryIcon,
  Sell as SellIcon,
  Receipt as ReceiptIcon,
  Assignment as AssignmentIcon,
  Route as RouteIcon,
  Email as EmailIcon,
  Api as ApiIcon,
  Assessment as AssessmentIcon,
  AccountBalanceWallet as WalletIcon,
  LocalShipping as LocalShippingIcon,
  VerifiedUser as VerifiedUserIcon,
  Timeline as TimelineIcon,
  Build as BuildIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Module {
  module_key: string;
  module_name: string;
  description?: string;
  icon?: string;
  can_view?: boolean;
  can_edit?: boolean;
}

interface ModulePermissionsDialogProps {
  open: boolean;
  onClose: () => void;
  userId: number;
  userName: string;
  panelKey: string;
  panelName: string;
  onSaved?: () => void;
}

const MODULE_ICONS: Record<string, React.ReactNode> = {
  costing: <CalculateIcon />,
  inventory: <InventoryIcon />,
  pricing: <SellIcon />,
  pobox_rates: <SellIcon />,
  dhl_rates: <SellIcon />,
  invoicing: <ReceiptIcon />,
  instructions: <AssignmentIcon />,
  routes: <RouteIcon />,
  consolidations: <InventoryIcon />,
  inbound_emails: <EmailIcon />,
  maritime_api: <ApiIcon />,
  air_api: <ApiIcon />,
  anticipos: <WalletIcon />,
  reports: <AssessmentIcon />,
  last_mile: <LocalShippingIcon />,
  verifications: <VerifiedUserIcon />,
  coverage: <TimelineIcon />,
  customs: <AssignmentIcon />,
  suppliers: <CalculateIcon />,
  // Módulos nuevos admin
  carrier_options: <LocalShippingIcon />,
  inbound_emails_air: <EmailIcon />,
  air_routes: <RouteIcon />,
  air_management: <BuildIcon />,
  cajo_management: <BuildIcon />,
  fcl_management: <BuildIcon />,
  paquete_express: <ApiIcon />,
  // Módulos de PO Box USA (ops_usa_pobox)
  receive: <InventoryIcon />,
  entry: <InventoryIcon />,
  exit: <LocalShippingIcon />,
  collect: <WalletIcon />,
  quote: <CalculateIcon />,
  repack: <InventoryIcon />,
  // Módulos de Operaciones genéricos
  reception: <InventoryIcon />,
  outbound: <LocalShippingIcon />,
  photos: <VerifiedUserIcon />,
  scanning: <InventoryIcon />,
  labels: <ReceiptIcon />,
  weight: <CalculateIcon />,
  processing: <AssignmentIcon />,
  customs_release: <VerifiedUserIcon />,
  distribution: <RouteIcon />,
  container_unload: <InventoryIcon />,
  damage_report: <AssessmentIcon />,
  storage: <InventoryIcon />,
  picking: <AssignmentIcon />,
  packing: <InventoryIcon />,
  dispatch: <LocalShippingIcon />,
  transfers: <RouteIcon />,
  inventory_count: <CalculateIcon />,
  quotes: <CalculateIcon />,
  rates: <SellIcon />,
  tracking: <TimelineIcon />,
  scan_receive: <InventoryIcon />,
  scan_deliver: <VerifiedUserIcon />,
  scan_transfer: <RouteIcon />,
  scan_return: <LocalShippingIcon />,
  batch_scan: <InventoryIcon />,
  stock_view: <InventoryIcon />,
  stock_adjust: <AssignmentIcon />,
  stock_count: <CalculateIcon />,
};

export default function ModulePermissionsDialog({
  open,
  onClose,
  userId,
  userName,
  panelKey,
  panelName,
  onSaved,
}: ModulePermissionsDialogProps) {
  const [modules, setModules] = useState<Module[]>([]);
  const [permissions, setPermissions] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const token = localStorage.getItem('token');

  const fetchModulePermissions = useCallback(async () => {
    if (!userId || !panelKey) return;
    
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_URL}/api/admin/panels/${panelKey}/user/${userId}/modules`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setModules(data.permissions || []);

        // Construir mapa de permisos
        const permsMap: Record<string, { can_view: boolean; can_edit: boolean }> = {};
        (data.permissions || []).forEach((m: Module) => {
          permsMap[m.module_key] = {
            can_view: m.can_view || false,
            can_edit: m.can_edit || false,
          };
        });
        setPermissions(permsMap);
      } else {
        throw new Error('Error al cargar módulos');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Error al cargar permisos de módulos');
    } finally {
      setLoading(false);
    }
  }, [userId, panelKey, token]);

  useEffect(() => {
    if (open) {
      fetchModulePermissions();
    }
  }, [open, fetchModulePermissions]);

  const handleTogglePermission = (moduleKey: string, field: 'can_view' | 'can_edit') => {
    setPermissions(prev => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        [field]: !prev[moduleKey]?.[field],
        // Si desactivas can_view, también desactiva can_edit
        ...(field === 'can_view' && prev[moduleKey]?.can_view ? { can_edit: false } : {}),
        // Si activas can_edit, también activa can_view
        ...(field === 'can_edit' && !prev[moduleKey]?.can_edit ? { can_view: true } : {}),
      }
    }));
  };

  const handleSelectAll = (value: boolean) => {
    setPermissions(prev => {
      const updated = { ...prev };
      modules.forEach(m => {
        updated[m.module_key] = { can_view: value, can_edit: false };
      });
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const permissionsArray = Object.entries(permissions).map(([module_key, perms]) => ({
        module_key,
        can_view: perms.can_view,
        can_edit: perms.can_edit,
      }));

      const res = await fetch(
        `${API_URL}/api/admin/panels/${panelKey}/user/${userId}/modules`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ permissions: permissionsArray }),
        }
      );

      if (res.ok) {
        onSaved?.();
        onClose();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Error al guardar permisos');
    } finally {
      setSaving(false);
    }
  };

  const countActiveModules = () => {
    return Object.values(permissions).filter(p => p.can_view).length;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ 
        bgcolor: '#1565C0', 
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Box>
          <Typography variant="h6">📦 Permisos de Módulos</Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            {userName} → {panelName}
          </Typography>
        </Box>
        <Chip 
          label={`${countActiveModules()}/${modules.length} activos`}
          sx={{ bgcolor: 'white', color: '#1565C0', fontWeight: 'bold' }}
        />
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
        ) : modules.length === 0 ? (
          <Alert severity="info" sx={{ m: 2 }}>
            Este panel no tiene módulos configurados.
          </Alert>
        ) : (
          <>
            {/* Acciones rápidas */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 2, gap: 1 }}>
              <Button
                size="small"
                onClick={() => handleSelectAll(true)}
                startIcon={<CheckCircleIcon />}
                color="success"
              >
                Seleccionar todos
              </Button>
              <Button
                size="small"
                onClick={() => handleSelectAll(false)}
                startIcon={<CancelIcon />}
                color="error"
              >
                Deseleccionar todos
              </Button>
            </Box>

            {/* Tabla de módulos */}
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha('#1565C0', 0.08) }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>Módulo</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', width: 120 }}>Puede Ver</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', width: 120 }}>Puede Editar</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {modules.map((module) => (
                    <TableRow 
                      key={module.module_key} 
                      hover
                      sx={{
                        bgcolor: permissions[module.module_key]?.can_view 
                          ? alpha('#4CAF50', 0.05) 
                          : 'transparent'
                      }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ 
                            color: permissions[module.module_key]?.can_view ? '#1565C0' : 'grey.500',
                            display: 'flex',
                            alignItems: 'center'
                          }}>
                            {MODULE_ICONS[module.module_key] || <BuildIcon />}
                          </Box>
                          <Box>
                            <Typography fontWeight="medium">
                              {t(`panels.modules.${module.module_key}`, module.module_name)}
                            </Typography>
                            {module.description && (
                              <Typography variant="caption" color="text.secondary">
                                {module.description}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Checkbox
                          checked={permissions[module.module_key]?.can_view || false}
                          onChange={() => handleTogglePermission(module.module_key, 'can_view')}
                          sx={{
                            '&.Mui-checked': {
                              color: '#4CAF50',
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Checkbox
                          checked={permissions[module.module_key]?.can_edit || false}
                          onChange={() => handleTogglePermission(module.module_key, 'can_edit')}
                          disabled={!permissions[module.module_key]?.can_view}
                          sx={{
                            '&.Mui-checked': {
                              color: '#1565C0',
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
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || loading}
        >
          Guardar Permisos
        </Button>
      </DialogActions>
    </Dialog>
  );
}
