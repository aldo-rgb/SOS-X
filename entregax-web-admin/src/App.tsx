import { useState } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CssBaseline,
  ThemeProvider,
  createTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PeopleIcon from '@mui/icons-material/People';
import StoreIcon from '@mui/icons-material/Store';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import ReceiptIcon from '@mui/icons-material/Receipt';

const drawerWidth = 260;

// Tema personalizado EntregaX
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2', // Azul profesional
    },
    secondary: {
      main: '#ff9800', // Naranja para acentos (estilo logística)
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});

// Menú de navegación
const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Envíos', icon: <LocalShippingIcon />, path: '/envios' },
  { text: 'Cotizaciones', icon: <ReceiptIcon />, path: '/cotizaciones' },
  { text: 'Clientes', icon: <PeopleIcon />, path: '/clientes' },
  { text: 'Sucursales', icon: <StoreIcon />, path: '/sucursales' },
  { text: 'Reportes', icon: <AssessmentIcon />, path: '/reportes' },
  { text: 'Configuración', icon: <SettingsIcon />, path: '/configuracion' },
];

function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawer = (
    <div>
      {/* Logo / Título de la empresa */}
      <Toolbar sx={{ backgroundColor: 'primary.main', color: 'white' }}>
        <LocalShippingIcon sx={{ mr: 1 }} />
        <Typography variant="h6" noWrap component="div" fontWeight="bold">
          EntregaX Admin
        </Typography>
      </Toolbar>
      <Divider />
      
      {/* Lista de navegación */}
      <List>
        {menuItems.map((item, index) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={selectedIndex === index}
              onClick={() => setSelectedIndex(index)}
              sx={{
                '&.Mui-selected': {
                  backgroundColor: 'primary.light',
                  color: 'primary.main',
                  '& .MuiListItemIcon-root': {
                    color: 'primary.main',
                  },
                },
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex' }}>
        <CssBaseline />
        
        {/* Barra superior */}
        <AppBar
          position="fixed"
          sx={{
            width: { sm: `calc(100% - ${drawerWidth}px)` },
            ml: { sm: `${drawerWidth}px` },
          }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="abrir menú"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { sm: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div">
              {menuItems[selectedIndex]?.text ?? 'Dashboard'}
            </Typography>
          </Toolbar>
        </AppBar>

        {/* Barra lateral - Móvil */}
        <Box
          component="nav"
          sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        >
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{ keepMounted: true }}
            sx={{
              display: { xs: 'block', sm: 'none' },
              '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
            }}
          >
            {drawer}
          </Drawer>
          
          {/* Barra lateral - Desktop */}
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: 'none', sm: 'block' },
              '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
            }}
            open
          >
            {drawer}
          </Drawer>
        </Box>

        {/* Contenido principal */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            width: { sm: `calc(100% - ${drawerWidth}px)` },
            mt: 8,
            backgroundColor: 'background.default',
            minHeight: '100vh',
          }}
        >
          {/* Área de contenido - Aquí irán las páginas */}
          <Box
            sx={{
              backgroundColor: 'white',
              borderRadius: 2,
              p: 3,
              boxShadow: 1,
            }}
          >
            <Typography variant="h4" gutterBottom color="primary">
              🚀 Bienvenido a EntregaX
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Sistema de administración de envíos y sucursales.
            </Typography>
            <Typography variant="body2" sx={{ mt: 2 }}>
              Sección actual: <strong>{menuItems[selectedIndex]?.text}</strong>
            </Typography>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
