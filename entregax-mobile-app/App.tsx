import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';

// Inicializar i18n
import './src/i18n';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
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
import { Package } from './src/services/api';

// Tipos para navegación
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ChangePassword: { user: any; token: string; currentPassword: string };
  Verification: { user: any; token: string };
  Home: { user: any; token: string };
  ConsolidationSummary: { selectedIds: number[]; packages: Package[]; token: string };
  Payment: { consolidationId: number; weight: number; token: string; user: any };
  MyAddresses: { user: any; token: string };
  MyPaymentMethods: { user: any; token: string };
  MyProfile: { user: any; token: string };
  GEXContract: { package: Package; user: any; token: string };
  RequestAdvisor: { user: any; token: string };
  SupportChat: { user: any; token: string };
  Notifications: { user: any; token: string };
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
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          <Stack.Screen name="Verification" component={VerificationScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
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
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
