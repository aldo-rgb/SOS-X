import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
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
  Paper,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  Collapse,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PeopleIcon from '@mui/icons-material/People';
// StoreIcon, AssessmentIcon, SettingsIcon, InventoryIcon removidos - secciones eliminadas del sidebar
import LogoutIcon from '@mui/icons-material/Logout';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LanguageIcon from '@mui/icons-material/Language';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
// VerifiedUserIcon removido - Verificaciones ahora en Paneles > Admin
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
// PaymentsIcon removido - Pago Proveedores ahora en Paneles > Admin
import LoginPage from './pages/LoginPage';
import ClientsPage from './pages/ClientsPage';
// QuotesPage removido - ahora se accede desde PanelsHubPage > Nacional México
// ConsolidationsPage removido - ahora se accede desde PanelsHubPage > PO Box USA > Salida
import CommissionsPage from './pages/CommissionsPage';
import PermissionsPage from './pages/PermissionsPage';
// VerificationsPage removido - ahora se accede desde PanelsHubPage > Paneles Admin
import FiscalPage from './pages/FiscalPage';
// SupplierPaymentsPage removido - ahora se accede desde PanelsHubPage > Paneles Admin
// SettingsPage removido - funcionalidad duplicada con CommissionsPage
// PricingPage removido - tarifas se manejarán por cada tipo de servicio desde Panel de Admin
// WarrantiesPage removido - ahora se accede desde AdminHubPage > Paneles Administrativos
// PanelsHubPage removido - ahora todo se accede desde el sidebar con submenús
// ServiceTypesPage - ahora oculto del sidebar
// SupportBoardPage, UnifiedLeadsPage, CRMClientsPage - ahora en CustomerServiceHubPage
import SalesReportPage from './pages/SalesReportPage';
import CustomerServiceHubPage from './pages/CustomerServiceHubPage';
// SellIcon removido - tarifas ya no está en sidebar
// SecurityIcon removido - warranties ahora está en AdminHubPage
// WhatshotIcon, HeadsetMicIcon, PersonSearchIcon - ahora en CustomerServiceHubPage
// CategoryIcon removido - tipo de servicio oculto
// SupportAgentIcon removido - no se usa
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import BarChartIcon from '@mui/icons-material/BarChart';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import BuildIcon from '@mui/icons-material/Build';
import InventoryIcon from '@mui/icons-material/Inventory';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import AdminHubPage from './pages/AdminHubPage';
import CajaChicaPage from './pages/CajaChicaPage';
import WarehouseHubPage from './pages/WarehouseHubPage';
import HRManagementPage from './pages/HRManagementPage';
import FleetManagementPage from './pages/FleetManagementPage';
import SecurityIcon from '@mui/icons-material/Security';
import DescriptionIcon from '@mui/icons-material/Description';
import LegalDocumentsPage from './pages/LegalDocumentsPage';

const drawerWidth = 280;

// 🎨 ENTREGAX: Sistema de Diseño Corporativo
// Paleta basada en el logo: Naranja Energético + Negro Corporativo
const theme = createTheme({
  palette: {
    primary: { 
      main: '#F05A28',      // 🟠 Action Orange - El héroe del logo
      light: '#FF7043',
      dark: '#C1272D',      // Rojo profundo para degradados
      contrastText: '#FFFFFF',
    },
    secondary: { 
      main: '#111111',      // ⬛ Deep Tech Black
      light: '#1F2937',
      contrastText: '#FFFFFF',
    },
    success: { 
      main: '#10B981',      // 🟢 Verde Esmeralda - Entregado
      light: '#D1FAE5',
      contrastText: '#FFFFFF',
    },
    warning: { 
      main: '#F05A28',      // 🟠 En Tránsito usa nuestro naranja
      light: '#FEF3C7',
    },
    error: { 
      main: '#EF4444',      // 🔴 Alerta/Pago Pendiente
      light: '#FEE2E2',
    },
    background: { 
      default: '#F4F6F8',   // Canvas - Gris casi blanco
      paper: '#FFFFFF',     // Blanco puro para tarjetas
    },
    text: {
      primary: '#111827',   // Gris muy oscuro para lectura
      secondary: '#6B7280', // Gris suave para subtítulos
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700, letterSpacing: -0.5 },
    h5: { fontWeight: 600, letterSpacing: -0.3 },
    h6: { fontWeight: 600 },
    body1: { fontSize: '0.95rem' },
    body2: { fontSize: '0.875rem' },
    button: {
      textTransform: 'none',
      fontWeight: 700,
    },
  },
  shape: {
    borderRadius: 8, // Bordes modernos
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 700,
          padding: '12px 24px',
          borderRadius: 8,
        },
        containedPrimary: {
          background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)',
          '&:hover': {
            background: 'linear-gradient(90deg, #A01F25 0%, #D94A20 100%)',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          backgroundColor: '#111111',
          color: '#FFFFFF',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        },
      },
    },
  },
});

// Menu items with translation keys
const menuItemsConfig: Array<{
  key: string;
  icon: React.ReactElement;
  subItems?: Array<{ key: string; icon: React.ReactElement }>;
}> = [
  { key: 'dashboard', icon: <DashboardIcon /> },
  { key: 'salesReport', icon: <BarChartIcon /> }, // CRM - Reportes de Ventas
  { key: 'clients', icon: <PeopleIcon /> },
  { 
    key: 'panels', 
    icon: <DashboardCustomizeIcon />, 
    subItems: [
      { key: 'panelsAdmin', icon: <BuildIcon /> },         // Herramientas Administrativas
      { key: 'panelsOperations', icon: <InventoryIcon /> }, // Herramientas de Operación
      { key: 'panelsService', icon: <HeadsetMicIcon /> },   // Servicio a Cliente
    ]
  },
  { key: 'cajaChica', icon: <LocalAtmIcon /> }, // Caja Chica - solo admin/super_admin/director
  { key: 'commissions', icon: <MonetizationOnIcon /> },
  { key: 'permissions', icon: <SecurityIcon /> },
  { key: 'legalDocs', icon: <DescriptionIcon /> }, // Documentos Legales - solo super_admin
  { key: 'fiscal', icon: <ReceiptLongIcon /> },
];

interface User {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  role: string;
  created_at?: string;
}

interface AuthUser {
  id: number;
  name: string;
  email: string;
  boxId: string;
  role: string;
}

interface DashboardStats {
  users: {
    total: number;
    clients: number;
    staff: number;
    newThisWeek: number;
  };
  packages: {
    inTransit: number;
    deliveredToday: number;
    pendingPickup: number;
  };
  revenue: {
    monthly: number;
    currency: string;
  };
}

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

function App() {
  const { t, i18n } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSubIndex, setSelectedSubIndex] = useState<number | null>(null); // Para submenús
  const [panelsExpanded, setPanelsExpanded] = useState(false); // Estado del submenú expandido
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [langAnchorEl, setLangAnchorEl] = useState<null | HTMLElement>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [userPanelPermissions, setUserPanelPermissions] = useState<Record<string, boolean>>({});
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  const isSuperAdmin = currentUser?.role === 'super_admin';

  // Cargar permisos del usuario para filtrar menú
  useEffect(() => {
    const loadMenuPermissions = async () => {
      if (!isAuthenticated) {
        setPermissionsLoaded(false);
        return;
      }
      if (isSuperAdmin) {
        setPermissionsLoaded(true);
        return;
      }
      const token = localStorage.getItem('token');
      
      try {
        const url = `${API_URL}/panels/me`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const permsMap: Record<string, boolean> = {};
          // El backend retorna "panels" no "permissions"
          (data.panels || []).forEach((p: { panel_key: string; can_view: boolean }) => {
            if (p.can_view) {
              permsMap[p.panel_key] = true;
            }
          });
          setUserPanelPermissions(permsMap);
          setPermissionsLoaded(true);
        } else {
          setPermissionsLoaded(true);
        }
      } catch (err) {
        console.error('Error loading menu permissions:', err);
        setPermissionsLoaded(true);
      }
    };
    loadMenuPermissions();
  }, [isAuthenticated, isSuperAdmin]);

  // Función para verificar si tiene algún permiso de servicio a cliente
  const hasAnyCustomerServicePermission = (): boolean => {
    if (isSuperAdmin) return true;
    // Si los permisos aún no cargan, mostrar el menú (se filtrará dentro del componente)
    if (!permissionsLoaded) return true;
    return ['cs_leads', 'cs_clients', 'cs_support'].some(key => userPanelPermissions[key]);
  };

  // Función para verificar si tiene algún permiso de administración
  const hasAnyAdminPermission = (): boolean => {
    if (isSuperAdmin) return true;
    // Si los permisos aún no cargan, mostrar el menú (se filtrará dentro del componente)
    if (!permissionsLoaded) return true;
    const adminPanels = [
      'admin_china_air', 'admin_china_sea', 'admin_usa_pobox', 'admin_mx_cedis', 'admin_mx_national',
      'admin_verifications', 'admin_supplier_payments', 'admin_financial', 'admin_payment_invoices',
      'admin_exchange_rates', 'admin_carousel', 'admin_hr', 'admin_fleet', 'admin_gex'
    ];
    const hasPermission = adminPanels.some(key => userPanelPermissions[key]);
    return hasPermission;
  };

  // Función para verificar si tiene algún permiso de operaciones
  const hasAnyOperationsPermission = (): boolean => {
    if (isSuperAdmin) return true;
    // Si los permisos aún no cargan, mostrar el menú (se filtrará dentro del componente)
    if (!permissionsLoaded) return true;
    const opsPanels = ['ops_usa_pobox', 'ops_china_air', 'ops_china_sea', 'ops_mx_cedis', 'ops_mx_national', 'ops_scanner', 'ops_inventory'];
    return opsPanels.some(key => userPanelPermissions[key]);
  };

  // Menu items with translated text - filtrado por rol
  const menuItems = menuItemsConfig
    .filter(item => {
      const role = currentUser?.role || '';
      
      // super_admin ve todo
      if (role === 'super_admin') {
        return true;
      }
      
      // admin: Dashboard, Reportes Ventas, Herramientas, Caja Chica
      if (role === 'admin') {
        return ['dashboard', 'salesReport', 'panels', 'cajaChica'].includes(item.key);
      }
      
      // director: Dashboard, Herramientas, Caja Chica
      if (role === 'director') {
        return ['dashboard', 'panels', 'cajaChica'].includes(item.key);
      }
      
      // Todos los demás: Dashboard, Herramientas
      return ['dashboard', 'panels'].includes(item.key);
    })
    .map(item => {
      // NO filtrar subItems aquí - dejar que cada página interna filtre sus propios permisos
      // Esto evita problemas de sincronización con el estado de permisos
      return {
        ...item,
        text: t(`menu.${item.key}`),
        subItems: item.subItems?.map(sub => ({
          ...sub,
          text: t(`menu.${sub.key}`)
        }))
      };
    });

  // Toggle language
  const toggleLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setLangAnchorEl(null);
  };

  // Verificar autenticación al cargar
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
  }, []);

  const handleLoginSuccess = (data: { user: AuthUser; access: any }) => {
    setCurrentUser(data.user);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setAnchorEl(null);
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data.users || response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardStats = async () => {
    setStatsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/dashboard/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setDashboardStats(response.data.data);
      }
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
      fetchDashboardStats();
    }
  }, [isAuthenticated]);

  // Si no está autenticado, mostrar página de login
  if (!isAuthenticated) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </ThemeProvider>
    );
  }

  // Función para obtener las iniciales del nombre
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Función para traducir el rol usando i18n
  const translateRole = (role: string): string => {
    return t(`roles.${role}`, role);
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#111111' }}>
      {/* Logo Header - Negro Corporativo */}
      <Box
        sx={{
          p: 2.5,
          bgcolor: '#111111',
          color: 'white',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            component="img"
            src="/logo.png"
            alt="EntregaX"
            sx={{
              width: 140,
              height: 'auto',
              objectFit: 'contain',
            }}
          />
        </Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 0.5 }}>
          Panel Administrativo
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Navigation */}
      <List sx={{ flex: 1, py: 2, px: 1.5 }}>
        {menuItems.map((item, index) => (
          <Box key={item.key}>
            <ListItem disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={selectedIndex === index && selectedSubIndex === null}
                onClick={() => {
                  if (item.subItems) {
                    // Si tiene submenú, expandir/colapsar
                    setPanelsExpanded(!panelsExpanded);
                  } else {
                    setSelectedIndex(index);
                    setSelectedSubIndex(null);
                  }
                }}
                sx={{
                  borderRadius: 2,
                  py: 1.25,
                  color: 'rgba(255,255,255,0.7)',
                  '&.Mui-selected': {
                    bgcolor: '#F05A28',
                    color: 'white',
                    '& .MuiListItemIcon-root': { color: 'white' },
                    '&:hover': { bgcolor: '#D94A20' },
                  },
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.text} 
                  primaryTypographyProps={{ fontWeight: 500, fontSize: '0.9rem' }}
                />
                {item.subItems && (
                  panelsExpanded ? <ExpandLess sx={{ color: 'rgba(255,255,255,0.5)' }} /> : <ExpandMore sx={{ color: 'rgba(255,255,255,0.5)' }} />
                )}
              </ListItemButton>
            </ListItem>
            
            {/* Submenú */}
            {item.subItems && (
              <Collapse in={panelsExpanded} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {item.subItems.map((subItem, subIndex) => (
                    <ListItem key={subItem.key} disablePadding sx={{ mb: 0.5 }}>
                      <ListItemButton
                        selected={selectedIndex === index && selectedSubIndex === subIndex}
                        onClick={() => {
                          setSelectedIndex(index);
                          setSelectedSubIndex(subIndex);
                        }}
                        sx={{
                          borderRadius: 2,
                          py: 1,
                          pl: 4,
                          color: 'rgba(255,255,255,0.6)',
                          '&.Mui-selected': {
                            bgcolor: 'rgba(240, 90, 40, 0.3)',
                            color: 'white',
                            '& .MuiListItemIcon-root': { color: 'white' },
                            '&:hover': { bgcolor: 'rgba(240, 90, 40, 0.4)' },
                          },
                          '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                          {subItem.icon}
                        </ListItemIcon>
                        <ListItemText 
                          primary={subItem.text} 
                          primaryTypographyProps={{ fontWeight: 500, fontSize: '0.85rem' }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Collapse>
            )}
          </Box>
        ))}
      </List>

      {/* User Info Footer */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)', width: 36, height: 36, fontSize: '0.875rem' }}>
            {currentUser ? getInitials(currentUser.name) : 'U'}
          </Avatar>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Typography variant="body2" fontWeight={600} noWrap sx={{ color: 'white' }}>
              {currentUser?.name}
            </Typography>
            <Typography variant="caption" noWrap sx={{ color: 'rgba(255,255,255,0.5)' }}>
              {currentUser ? translateRole(currentUser.role) : ''}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  // Dashboard mejorado con datos reales
  const Dashboard = () => (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={700} color="text.primary">
          {t('dashboard.welcome')}, <span style={{ color: '#F05A28' }}>{currentUser?.name.split(' ')[0]}</span>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('dashboard.dailySummary')}
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 3, mb: 4 }}>
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {t('dashboard.totalUsers')}
              </Typography>
              <Typography variant="h4" fontWeight={700} sx={{ color: '#111111', mt: 1 }}>
                {statsLoading ? '...' : dashboardStats?.users.total || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {dashboardStats?.users.newThisWeek || 0} {t('dashboard.newThisWeek')}
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: '#111111', width: 48, height: 48 }}>
              <PeopleIcon sx={{ color: 'white' }} />
            </Avatar>
          </Box>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {t('dashboard.inTransit')}
              </Typography>
              <Typography variant="h4" fontWeight={700} sx={{ color: '#F05A28', mt: 1 }}>
                {statsLoading ? '...' : dashboardStats?.packages.inTransit || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {dashboardStats?.packages.pendingPickup || 0} {t('dashboard.pendingPickup')}
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: 'rgba(240, 90, 40, 0.1)', width: 48, height: 48 }}>
              <LocalShippingIcon sx={{ color: '#F05A28' }} />
            </Avatar>
          </Box>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {t('dashboard.deliveredToday')}
              </Typography>
              <Typography variant="h4" fontWeight={700} sx={{ color: '#10B981', mt: 1 }}>
                {statsLoading ? '...' : dashboardStats?.packages.deliveredToday || 0}
              </Typography>
              <Typography variant="caption" color="#10B981">
                ✓ {t('dashboard.realTimeUpdated')}
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: '#D1FAE5', width: 48, height: 48 }}>
              <LocalShippingIcon sx={{ color: '#10B981' }} />
            </Avatar>
          </Box>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {t('dashboard.monthlyIncome')}
              </Typography>
              <Typography variant="h4" fontWeight={700} color="text.primary" sx={{ mt: 1 }}>
                ${statsLoading ? '...' : ((dashboardStats?.revenue.monthly || 0) / 1000).toFixed(1)}k
              </Typography>
              <Typography variant="caption" color="text.secondary">
                MXN
              </Typography>
            </Box>
            <Avatar sx={{ background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)', width: 48, height: 48 }}>
              <TrendingUpIcon sx={{ color: 'white' }} />
            </Avatar>
          </Box>
        </Paper>
      </Box>

      {/* Quick Stats Row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3, mb: 3 }}>
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            {t('dashboard.userDistribution')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Box sx={{ flex: 1, textAlign: 'center', p: 2, bgcolor: 'rgba(240, 90, 40, 0.05)', borderRadius: 2 }}>
              <Typography variant="h4" fontWeight={700} color="primary">
                {dashboardStats?.users.clients || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">{t('menu.clients')}</Typography>
            </Box>
            <Box sx={{ flex: 1, textAlign: 'center', p: 2, bgcolor: 'rgba(17, 17, 17, 0.05)', borderRadius: 2 }}>
              <Typography variant="h4" fontWeight={700}>
                {dashboardStats?.users.staff || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Staff</Typography>
            </Box>
          </Box>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            {t('dashboard.recentActivity')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('dashboard.recentActivityDesc')}
          </Typography>
        </Paper>
      </Box>
    </Box>
  );

  const renderContent = () => {
    const currentMenuKey = menuItems[selectedIndex]?.key;
    
    // Si hay un submenú seleccionado y estamos en panels
    if (selectedSubIndex !== null && currentMenuKey === 'panels') {
      switch (selectedSubIndex) {
        case 0: return <AdminHubPage users={users} loading={loading} onRefresh={fetchUsers} panelPermissions={userPanelPermissions} permissionsReady={permissionsLoaded} />; // Administración
        case 1: return <WarehouseHubPage users={users} />; // Operaciones (Bodegas)
        case 2: return <CustomerServiceHubPage users={users} loading={loading} onRefresh={fetchUsers} />; // Servicio a Cliente
        case 3: return <HRManagementPage />; // Recursos Humanos
        case 4: return <FleetManagementPage />; // Gestión de Flotilla
        default: return null;
      }
    }
    
    // Renderizar según el key del menú actual
    switch (currentMenuKey) {
      case 'dashboard': return <Dashboard />;
      case 'salesReport': return <SalesReportPage />; // CRM - Reportes de Ventas
      case 'clients': return <ClientsPage users={users} loading={loading} onRefresh={fetchUsers} currentUser={currentUser} />;
      case 'panels': 
        // Si panels está seleccionado pero no hay submenú, expandir automáticamente
        if (!panelsExpanded) {
          setPanelsExpanded(true);
        }
        return null; // No renderiza nada, debe seleccionar un submenú
      case 'commissions': return <CommissionsPage />; // Comisiones (incluye tipos de servicio)
      case 'cajaChica': return <CajaChicaPage />; // Caja Chica
      case 'permissions': return <PermissionsPage />; // Matriz de Permisos
      case 'legalDocs': return <LegalDocumentsPage />; // Documentos Legales (Contratos y Aviso Privacidad)
      case 'fiscal': return <FiscalPage />; // Facturación
      default: 
        return (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography variant="h5" color="text.secondary" fontWeight={500}>
              {menuItems[selectedIndex]?.text}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {i18n.language === 'es' ? 'Esta sección está en desarrollo' : 'This section is under development'}
            </Typography>
          </Box>
        );
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex' }}>
        <CssBaseline />
        
        {/* AppBar */}
        <AppBar 
          position="fixed" 
          elevation={0}
          sx={{ 
            width: { sm: `calc(100% - ${drawerWidth}px)` }, 
            ml: { sm: `${drawerWidth}px` },
            bgcolor: 'background.paper',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <IconButton 
                edge="start" 
                onClick={() => setMobileOpen(!mobileOpen)} 
                sx={{ mr: 2, display: { sm: 'none' }, color: 'text.primary' }}
              >
                <MenuIcon />
              </IconButton>
              <Typography variant="h6" color="text.primary" fontWeight={600}>
                {selectedSubIndex !== null && menuItems[selectedIndex]?.subItems 
                  ? menuItems[selectedIndex].subItems[selectedSubIndex]?.text 
                  : menuItems[selectedIndex]?.text}
              </Typography>
            </Box>

            {/* Language & User Menu */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* Language Selector */}
              <Tooltip title={i18n.language === 'es' ? 'Change language' : 'Cambiar idioma'}>
                <IconButton onClick={(e) => setLangAnchorEl(e.currentTarget)} sx={{ color: 'text.secondary' }}>
                  <LanguageIcon />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={langAnchorEl}
                open={Boolean(langAnchorEl)}
                onClose={() => setLangAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <MenuItem onClick={() => toggleLanguage('es')} selected={i18n.language === 'es'}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <span>🇲🇽</span> Español
                  </Box>
                </MenuItem>
                <MenuItem onClick={() => toggleLanguage('en')} selected={i18n.language === 'en'}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <span>🇺🇸</span> English
                  </Box>
                </MenuItem>
                <MenuItem onClick={() => toggleLanguage('zh')} selected={i18n.language === 'zh'}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <span>🇨🇳</span> 中文
                  </Box>
                </MenuItem>
              </Menu>

              {/* User Menu */}
              <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
                <Avatar sx={{ background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)', width: 36, height: 36, fontSize: '0.875rem' }}>
                  {currentUser ? getInitials(currentUser.name) : 'U'}
                </Avatar>
              </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              PaperProps={{
                sx: { borderRadius: 2, mt: 1, minWidth: 200 }
              }}
            >
              <MenuItem disabled>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{currentUser?.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{currentUser?.email}</Typography>
                </Box>
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout} sx={{ color: '#EF4444' }}>
                <LogoutIcon sx={{ mr: 1, fontSize: 20 }} />
                {t('auth.logout')}
              </MenuItem>
            </Menu>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Sidebar */}
        <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{
              display: { xs: 'block', sm: 'none' },
              '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
            }}
          >
            {drawer}
          </Drawer>
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: 'none', sm: 'block' },
              '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, borderRight: 'none' },
            }}
            open
          >
            {drawer}
          </Drawer>
        </Box>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            width: { sm: `calc(100% - ${drawerWidth}px)` },
            mt: 8,
            bgcolor: 'background.default',
            minHeight: '100vh',
          }}
        >
          <Paper sx={{ p: 4, borderRadius: 2, minHeight: 'calc(100vh - 140px)' }}>
            {renderContent()}
          </Paper>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
