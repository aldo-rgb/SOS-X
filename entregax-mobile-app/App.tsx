import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';

// Inicializar i18n
import './src/i18n';

import LoginScreen from './src/screens/LoginScreen';
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
import GEXContractScreen from './src/screens/GEXContractScreen';
import RequestAdvisorScreen from './src/screens/RequestAdvisorScreen';
import SupportChatScreen from './src/screens/SupportChatScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import DeliveryInstructionsScreen from './src/screens/DeliveryInstructionsScreen';
import MaritimeDetailScreen from './src/screens/MaritimeDetailScreen';
import MyPaymentsScreen from './src/screens/MyPaymentsScreen';
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
import { Package } from './src/services/api';
import { EMPLOYEE_ROLES } from './src/constants/roles';

// Re-exportar para compatibilidad
export { EMPLOYEE_ROLES };

// Tipos para navegación
export type RootStackParamList = {
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
  GEXContract: { package: Package; user: any; token: string };
  RequestAdvisor: { user: any; token: string };
  SupportChat: { user: any; token: string };
  Notifications: { user: any; token: string };
  DeliveryInstructions: { package: Package; packages?: Package[]; user: any; token: string };
  MaritimeDetail: { package: Package; user: any; token: string };
  MyPayments: { user: any; token: string };
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

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="ExistingClient" component={ExistingClientScreen} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          <Stack.Screen name="Verification" component={VerificationScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="EmployeeHome" component={EmployeeHomeScreen} />
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
            name="MyPayments" 
            component={MyPaymentsScreen}
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
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
