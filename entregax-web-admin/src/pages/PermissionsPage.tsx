// ============================================
// PÁGINA DE MATRIZ DE PERMISOS
// Acceso directo desde sidebar
// ============================================

import { useState } from 'react';
import { Box, Typography, Tabs, Tab, Paper } from '@mui/material';
import { 
  Security as SecurityIcon,
  GridOn as MatrixIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import PermissionMatrixPanel from './PermissionMatrixPanel';
import UserPanelPermissionsPage from './UserPanelPermissionsPage';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function PermissionsPage() {
  const myRole = (() => {
    try { return String(JSON.parse(localStorage.getItem('user') || '{}').role || '').toLowerCase(); }
    catch { return ''; }
  })();
  const isSuperAdmin = myRole === 'super_admin';
  // Admin entra directo a "Paneles por Usuario"; solo super_admin ve "Matriz por Rol".
  const [tabValue, setTabValue] = useState(isSuperAdmin ? 0 : 1);

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 2, 
        mb: 3,
        pb: 2,
        borderBottom: 1,
        borderColor: 'divider'
      }}>
        <SecurityIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight="bold">
            Gestión de Permisos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Administra permisos por rol y paneles por usuario
          </Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={tabValue} 
          onChange={(_, v) => setTabValue(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {isSuperAdmin && (
            <Tab
              icon={<MatrixIcon />}
              iconPosition="start"
              label="Matriz por Rol"
              value={0}
            />
          )}
          <Tab
            icon={<PersonIcon />}
            iconPosition="start"
            label="Paneles por Usuario"
            value={1}
          />
        </Tabs>
      </Paper>

      {/* Tab 0: Matriz de Permisos por Rol — SOLO super_admin */}
      {isSuperAdmin && (
        <TabPanel value={tabValue} index={0}>
          <PermissionMatrixPanel />
        </TabPanel>
      )}

      {/* Tab 1: Permisos de Paneles por Usuario */}
      <TabPanel value={tabValue} index={1}>
        <UserPanelPermissionsPage />
      </TabPanel>
    </Box>
  );
}
