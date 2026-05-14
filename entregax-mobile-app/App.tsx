import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';

// Inicializar i18n
import './src/i18n';

// Inicializar Sentry antes de cualquier render (no-op si no hay DSN)
import { initSentry, wrapAppWithSentry } from './src/sentry';
initSentry();

import LoginScreen from './src/screens/LoginScreen';
import BootstrapScreen from './src/screens/BootstrapScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ExistingClientScreen from './src/screens/ExistingClientScreen';
import HomeScreen from './src/screens/HomeScreen';
import ConsolidationSummary from './src/screens/ConsolidationSummary';
import PaymentScreen from './src/screens/PaymentScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import VerificationScreen from './src/screens/VerificationScreen';
import MyAddressesScreen from './src/screens/MyAddressesScreen';
import MyPaymentMethodsScreen from './src/screens/MyPaymentMethodsScreen';
import MyProfileScreen from './src/screens/MyProfileScreen';
import DeleteAccountScreen from './src/screens/DeleteAccountScreen';
import GEXContractScreen from './src/screens/GEXContractScreen';
import RequestAdvisorScreen from './src/screens/RequestAdvisorScreen';
import SupportChatScreen from './src/screens/SupportChatScreen';
import HelpCenterScreen from './src/screens/HelpCenterScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import DeliveryInstructionsScreen from './src/screens/DeliveryInstructionsScreen';
import MaritimeDetailScreen from './src/screens/MaritimeDetailScreen';
import PackageDetailScreen from './src/screens/PackageDetailScreen';
import MyPaymentsScreen from './src/screens/MyPaymentsScreen';
import PaymentSummaryScreen from './src/screens/PaymentSummaryScreen';
import EmployeeOnboardingScreen from './src/screens/EmployeeOnboardingScreen';
import VehicleInspectionScreen from './src/screens/VehicleInspectionScreen';
import DriverHomeScreen from './src/screens/DriverHomeScreen';
import LoadingVanScreen from './src/screens/LoadingVanScreen';
import ReturnScanScreen from './src/screens/ReturnScanScreen';
import DeliveryConfirmScreen from './src/screens/DeliveryConfirmScreen';
import EmployeeHomeScreen from './src/screens/EmployeeHomeScreen';
import AttendanceCheckerScreen from './src/screens/AttendanceCheckerScreen';
import WarehouseScannerScreen from './src/screens/WarehouseScannerScreen';
import FirmaAbandonoScreen from './src/screens/FirmaAbandonoScreen';
import ServicesGuideScreen from './src/screens/ServicesGuideScreen';
import SaldoFavorScreen from './src/screens/SaldoFavorScreen';
import SupplierPaymentScreen from './src/screens/SupplierPaymentScreen';
import ExternalProviderTransitionScreen from './src/screens/ExternalProviderTransitionScreen';
import ReferidosScreen from './src/screens/ReferidosScreen';
// PO Box Screens
import POBoxReceiveScreen from './src/screens/POBoxReceiveScreen';
import POBoxEntryScreen from './src/screens/POBoxEntryScreen';
import POBoxExitScreen from './src/screens/POBoxExitScreen';
import POBoxCollectScreen from './src/screens/POBoxCollectScreen';
import POBoxQuoteScreen from './src/screens/POBoxQuoteScreen';
import QuoteHubScreen from './src/screens/QuoteHubScreen';
import POBoxRepackScreen from './src/screens/POBoxRepackScreen';
import POBoxInventoryScreen from './src/screens/POBoxInventoryScreen';
import POBoxHubScreen from './src/screens/POBoxHubScreen';
import DhlReceptionWizardScreen from './src/screens/DhlReceptionWizardScreen';
import DhlOperationsScreen from './src/screens/DhlOperationsScreen';
import ChinaAirHubScreen from './src/screens/ChinaAirHubScreen';
import ChinaAirReceptionScreen from './src/screens/ChinaAirReceptionScreen';
import ChinaAirInventoryScreen from './src/screens/ChinaAirInventoryScreen';
import ChinaSeaHubScreen from './src/screens/ChinaSeaHubScreen';
import ChinaSeaReceptionScreen from './src/screens/ChinaSeaReceptionScreen';
import ChinaSeaInventoryScreen from './src/screens/ChinaSeaInventoryScreen';
import RelabelingScreen from './src/screens/RelabelingScreen';
// Advisor Screens
import AdvisorDashboardScreen from './src/screens/AdvisorDashboardScreen';
import AdvisorClientsScreen from './src/screens/AdvisorClientsScreen';
import AdvisorCommissionsScreen from './src/screens/AdvisorCommissionsScreen';
import AdvisorReferralScreen from './src/screens/AdvisorReferralScreen';
import AdvisorTeamScreen from './src/screens/AdvisorTeamScreen';
import AdvisorClientTicketsScreen from './src/screens/AdvisorClientTicketsScreen';
import AdvisorNotificationsScreen from './src/screens/AdvisorNotificationsScreen';
// Chat Screens (módulo interno staff)
import ChatListScreen from './src/screens/ChatListScreen';
import ChatRoomScreen from './src/screens/ChatRoomScreen';
import NewChatScreen from './src/screens/NewChatScreen';
import ChatGroupInfoScreen from './src/screens/ChatGroupInfoScreen';

import { Package } from './src/services/api';
import { EMPLOYEE_ROLES } from './src/constants/roles';

// Re-exportar para compatibilidad
export { EMPLOYEE_ROLES };

// Tipos para navegación
export type RootStackParamList = {
  Bootstrap: undefined;
  Login: undefined;
  Register: undefined;
  ExistingClient: undefined;
  ChangePassword: { user: any; token: string; currentPassword: string };
  Verification: { user: any; token: string };
  Home: { user: any; token: string };
  EmployeeHome: { user: any; token: string };
  ConsolidationSummary: { selectedIds: number[]; packages: Package[]; token: string };
  Payment: { consolidationId: number; weight: number; token: string; user: any };
  MyAddresses: { user: any; token: string };
  MyPaymentMethods: { user: any; token: string };
  MyProfile: { user: any; token: string };
  DeleteAccount: { user: any; token: string };
  GEXContract: { package: Package; user: any; token: string };
  RequestAdvisor: { user: any; token: string };
  HelpCenter: { user: any; token: string };
  SupportChat: { user: any; token: string; mode?: 'ai' | 'human' };
  Notifications: { user: any; token: string };
  DeliveryInstructions: { package: Package; packages?: Package[]; user: any; token: string };
  MaritimeDetail: { package: Package; user: any; token: string };
  PackageDetail: { package: Package; user: any; token: string };
  MyPayments: { user: any; token: string };
  PaymentSummary: { packages: Package[]; user: any; token: string };
  EmployeeOnboarding: { user: any; token: string };
  // Pantallas del Chofer
  VehicleInspection: { user: any; token: string };
  DriverHome: { user: any; token: string };
  LoadingVan: { user: any; token: string };
  ReturnScan: { user: any; token: string };
  DeliveryConfirm: { user: any; token: string; package?: any };
  // Pantalla de Asistencia
  AttendanceChecker: { user: any; token: string };
  // Escáner de Bodega
  WarehouseScanner: { user: any; token: string };
  // Firma de Abandono
  FirmaAbandono: { user: any; token: string; abandonoToken: string };
  // Guía de Servicios
  ServicesGuide: { user: any; token: string };
  // Saldo a Favor y Referidos
  SaldoFavor: { user: any; token: string };
  SupplierPayment: { user: any; token: string };
  ExternalProviderTransition: { user: any; token: string; target?: string; label?: string };
  Referidos: { user: any; token: string };
  // PO Box Screens
  POBoxReceive: { user: any; token: string };
  POBoxEntry: { user: any; token: string };
  POBoxExit: { user: any; token: string };
  POBoxCollect: { user: any; token: string };
  POBoxQuote: { user: any; token: string };
  QuoteHub: { user: any; token: string };
  POBoxRepack: { user: any; token: string };
  POBoxInventory: { user: any; token: string };
  POBoxHub: { user: any; token: string };
  DhlReception: { user: any; token: string };
  DhlOperations: { user: any; token: string };
  ChinaAirHub: { user: any; token: string };
  ChinaAirReception: { user: any; token: string };
  ChinaAirInventory: { user: any; token: string };
  ChinaSeaHub: { user: any; token: string };
  ChinaSeaReception: { user: any; token: string; mode?: 'LCL' | 'FCL' };
  ChinaSeaInventory: { user: any; token: string };
  Relabeling: { user: any; token: string };
  // Advisor Screens
  AdvisorDashboard: { user: any; token: string };
  AdvisorClients: { user: any; token: string };
  AdvisorCommissions: { user: any; token: string };
  AdvisorReferral: { user: any; token: string };
  AdvisorTeam: { user: any; token: string };
  AdvisorClientTickets: { user: any; token: string };
  AdvisorNotifications: { user: any; token: string };
  // Chat interno staff
  ChatList: { user: any; token: string };
  ChatRoom: {
    user: any;
    token: string;
    conversationId: number;
    title?: string;
    type?: 'direct' | 'group';
    otherUser?: any;
  };
  NewChat: { user: any; token: string };
  ChatGroupInfo: {
    user: any;
    token: string;
    conversationId: number;
    title?: string;
    type?: 'direct' | 'group';
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Tema personalizado
const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#F05A28',
    secondary: '#111111',
  },
};

function App() {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Bootstrap"
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="Bootstrap" component={BootstrapScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="ExistingClient" component={ExistingClientScreen} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          <Stack.Screen name="Verification" component={VerificationScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen 
            name="EmployeeHome" 
            component={EmployeeHomeScreen}
            options={{ headerTitle: 'Home' }}
          />
          <Stack.Screen 
            name="ConsolidationSummary" 
            component={ConsolidationSummary}
          />
          <Stack.Screen 
            name="Payment" 
            component={PaymentScreen}
          />
          <Stack.Screen 
            name="MyAddresses" 
            component={MyAddressesScreen}
          />
          <Stack.Screen 
            name="MyPaymentMethods" 
            component={MyPaymentMethodsScreen}
          />
          <Stack.Screen 
            name="MyProfile" 
            component={MyProfileScreen}
          />
          <Stack.Screen
            name="DeleteAccount"
            component={DeleteAccountScreen}
          />
          <Stack.Screen 
            name="GEXContract" 
            component={GEXContractScreen}
          />
          <Stack.Screen 
            name="RequestAdvisor" 
            component={RequestAdvisorScreen}
          />
          <Stack.Screen 
            name="SupportChat" 
            component={SupportChatScreen}
          />
          <Stack.Screen 
            name="HelpCenter" 
            component={HelpCenterScreen}
          />
          <Stack.Screen 
            name="Notifications" 
            component={NotificationsScreen}
          />
          <Stack.Screen 
            name="DeliveryInstructions" 
            component={DeliveryInstructionsScreen}
          />
          <Stack.Screen 
            name="MaritimeDetail" 
            component={MaritimeDetailScreen}
          />
          <Stack.Screen 
            name="PackageDetail" 
            component={PackageDetailScreen}
          />
          <Stack.Screen 
            name="MyPayments" 
            component={MyPaymentsScreen}
          />
          <Stack.Screen 
            name="PaymentSummary" 
            component={PaymentSummaryScreen}
          />
          <Stack.Screen 
            name="EmployeeOnboarding" 
            component={EmployeeOnboardingScreen}
          />
          {/* Pantallas del Chofer */}
          <Stack.Screen 
            name="VehicleInspection" 
            component={VehicleInspectionScreen}
          />
          <Stack.Screen 
            name="DriverHome" 
            component={DriverHomeScreen}
          />
          <Stack.Screen 
            name="LoadingVan" 
            component={LoadingVanScreen}
          />
          <Stack.Screen 
            name="ReturnScan" 
            component={ReturnScanScreen}
          />
          <Stack.Screen 
            name="DeliveryConfirm" 
            component={DeliveryConfirmScreen}
          />
          {/* Pantalla de Asistencia */}
          <Stack.Screen 
            name="AttendanceChecker" 
            component={AttendanceCheckerScreen}
          />
          {/* Escáner de Bodega Multisucursal */}
          <Stack.Screen 
            name="WarehouseScanner" 
            component={WarehouseScannerScreen}
          />
          {/* Firma de Documento de Abandono */}
          <Stack.Screen 
            name="FirmaAbandono" 
            component={FirmaAbandonoScreen}
          />
          {/* Guía de Servicios de Envío */}
          <Stack.Screen 
            name="ServicesGuide" 
            component={ServicesGuideScreen}
          />
          {/* Saldo a Favor (Billetera Digital) */}
          <Stack.Screen 
            name="SaldoFavor" 
            component={SaldoFavorScreen}
            options={{
              headerShown: true,
              headerTitle: 'Saldo a Favor',
              headerTintColor: '#0097A7',
            }}
          />
          {/* Pago a Proveedores (ENTANGLED) */}
          <Stack.Screen
            name="SupplierPayment"
            component={SupplierPaymentScreen}
          />
          {/* Transición animada a proveedor externo */}
          <Stack.Screen
            name="ExternalProviderTransition"
            component={ExternalProviderTransitionScreen}
            options={{
              headerShown: false,
              animation: 'fade',
              gestureEnabled: false,
            }}
          />
          {/* Sistema de Referidos */}
          <Stack.Screen 
            name="Referidos" 
            component={ReferidosScreen}
            options={{
              headerShown: true,
              headerTitle: 'Invita y Gana',
              headerTintColor: '#F05A28',
            }}
          />
          {/* PO Box Screens */}
          <Stack.Screen name="POBoxReceive" component={POBoxReceiveScreen} />
          <Stack.Screen name="POBoxEntry" component={POBoxEntryScreen} />
          <Stack.Screen name="POBoxExit" component={POBoxExitScreen} />
          <Stack.Screen name="POBoxCollect" component={POBoxCollectScreen} />
          <Stack.Screen name="POBoxQuote" component={POBoxQuoteScreen} />
          <Stack.Screen name="QuoteHub" component={QuoteHubScreen} />
          <Stack.Screen name="POBoxRepack" component={POBoxRepackScreen} />
          <Stack.Screen name="POBoxInventory" component={POBoxInventoryScreen} />
          <Stack.Screen name="POBoxHub" component={POBoxHubScreen} />
          <Stack.Screen name="DhlReception" component={DhlReceptionWizardScreen} />
          <Stack.Screen name="DhlOperations" component={DhlOperationsScreen} />
          <Stack.Screen name="ChinaAirHub" component={ChinaAirHubScreen} />
          <Stack.Screen name="ChinaAirReception" component={ChinaAirReceptionScreen} />
          <Stack.Screen name="ChinaAirInventory" component={ChinaAirInventoryScreen} />
          <Stack.Screen name="ChinaSeaHub" component={ChinaSeaHubScreen} />
          <Stack.Screen name="ChinaSeaReception" component={ChinaSeaReceptionScreen} />
          <Stack.Screen name="ChinaSeaInventory" component={ChinaSeaInventoryScreen} />
          <Stack.Screen name="Relabeling" component={RelabelingScreen} />
          {/* Advisor Screens */}
          <Stack.Screen 
            name="AdvisorDashboard" 
            component={AdvisorDashboardScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen 
            name="AdvisorClients" 
            component={AdvisorClientsScreen}
            options={{
              headerShown: true,
              headerTitle: 'Mis Clientes',
              headerTintColor: '#F05A28',
            }}
          />
          <Stack.Screen 
            name="AdvisorCommissions" 
            component={AdvisorCommissionsScreen}
            options={{
              headerShown: true,
              headerTitle: 'Mis Comisiones',
              headerTintColor: '#F05A28',
            }}
          />
          <Stack.Screen 
            name="AdvisorReferral" 
            component={AdvisorReferralScreen}
            options={{
              headerShown: true,
              headerTitle: 'Referir Cliente',
              headerTintColor: '#F05A28',
            }}
          />
          <Stack.Screen 
            name="AdvisorTeam" 
            component={AdvisorTeamScreen}
            options={{
              headerShown: true,
              headerTitle: 'Mi Equipo',
              headerTintColor: '#9C27B0',
            }}
          />
          <Stack.Screen 
            name="AdvisorClientTickets" 
            component={AdvisorClientTicketsScreen}
            options={{
              headerShown: true,
              headerTitle: 'Tickets de Clientes',
              headerTintColor: '#E91E63',
            }}
          />
          <Stack.Screen 
            name="AdvisorNotifications" 
            component={AdvisorNotificationsScreen}
            options={{
              headerShown: true,
              headerTitle: 'Centro de Notificaciones',
              headerTintColor: '#F05A28',
            }}
          />
          {/* Chat interno staff */}
          <Stack.Screen name="ChatList" component={ChatListScreen} />
          <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
          <Stack.Screen name="NewChat" component={NewChatScreen} />
          <Stack.Screen name="ChatGroupInfo" component={ChatGroupInfoScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}

export default wrapAppWithSentry(App);
