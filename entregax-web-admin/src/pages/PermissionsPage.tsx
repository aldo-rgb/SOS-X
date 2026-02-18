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
  const [tabValue, setTabValue] = useState(0);

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
          <Tab 
            icon={<MatrixIcon />} 
            iconPosition="start" 
            label="Matriz por Rol" 
          />
          <Tab 
            icon={<PersonIcon />} 
            iconPosition="start" 
            label="Paneles por Usuario" 
          />
        </Tabs>
      </Paper>

      {/* Tab 0: Matriz de Permisos por Rol */}
      <TabPanel value={tabValue} index={0}>
        <PermissionMatrixPanel />
      </TabPanel>

      {/* Tab 1: Permisos de Paneles por Usuario */}
      <TabPanel value={tabValue} index={1}>
        <UserPanelPermissionsPage />
      </TabPanel>
    </Box>
  );
}
