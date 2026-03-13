import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Switch,
  Modal,
  FlatList,
} from 'react-native';
import {
  Appbar,
  Card,
  ActivityIndicator,
  Divider,
  Avatar,
} from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';
import { useTranslation } from 'react-i18next';

const ORANGE = '#F05A28';
const BLACK = '#111111';

// Roles que pueden tener PIN de supervisor
const SUPERVISOR_ROLES = ['super_admin', 'admin', 'director', 'gerente_sucursal'];

type RootStackParamList = {
  Home: { user: any; token: string };
  MyProfile: { user: any; token: string };
  Verification: { user: any; token: string };
  EmployeeOnboarding: { user: any; token: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'MyProfile'>;

export default function MyProfileScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user: initialUser, token } = route.params;
  const [user, setUser] = useState(initialUser);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState(false);

  // Estados para editar teléfono y RFC
  const [showEditPhoneModal, setShowEditPhoneModal] = useState(false);
  const [showEditRefModal, setShowEditRefModal] = useState(false);
  const [editPhone, setEditPhone] = useState(user.phone || '');
  const [editRef, setEditRef] = useState(user.rfc || '');
  const [editPassword, setEditPassword] = useState('');
  const [edit2FACode, setEdit2FACode] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Estados para PIN de supervisor
  const [showPinModal, setShowPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [hasSupervisorPin, setHasSupervisorPin] = useState(user.has_supervisor_pin || false);

  // 🧾 Estados para datos fiscales
  const [showFiscalModal, setShowFiscalModal] = useState(false);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [savingFiscal, setSavingFiscal] = useState(false);
  const [fiscalData, setFiscalData] = useState({
    razon_social: '',
    rfc: '',
    codigo_postal: '',
    regimen_fiscal: '',
    uso_cfdi: 'G03'
  });
  
  // Catálogos SAT con valores por defecto
  const [regimenesFiscales, setRegimenesFiscales] = useState<Array<{ clave: string; descripcion: string }>>([
    { clave: '601', descripcion: 'General de Ley Personas Morales' },
    { clave: '603', descripcion: 'Personas Morales con Fines no Lucrativos' },
    { clave: '605', descripcion: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
    { clave: '606', descripcion: 'Arrendamiento' },
    { clave: '607', descripcion: 'Régimen de Enajenación o Adquisición de Bienes' },
    { clave: '608', descripcion: 'Demás ingresos' },
    { clave: '610', descripcion: 'Residentes en el Extranjero sin Establecimiento Permanente en México' },
    { clave: '611', descripcion: 'Ingresos por Dividendos (socios y accionistas)' },
    { clave: '612', descripcion: 'Personas Físicas con Actividades Empresariales y Profesionales' },
    { clave: '614', descripcion: 'Ingresos por intereses' },
    { clave: '615', descripcion: 'Régimen de los ingresos por obtención de premios' },
    { clave: '616', descripcion: 'Sin obligaciones fiscales' },
    { clave: '620', descripcion: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
    { clave: '621', descripcion: 'Incorporación Fiscal' },
    { clave: '622', descripcion: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
    { clave: '623', descripcion: 'Opcional para Grupos de Sociedades' },
    { clave: '624', descripcion: 'Coordinados' },
    { clave: '625', descripcion: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
    { clave: '626', descripcion: 'Régimen Simplificado de Confianza' },
  ]);
  const [usosCFDI, setUsosCFDI] = useState<Array<{ clave: string; descripcion: string }>>([
    { clave: 'G01', descripcion: 'Adquisición de mercancías' },
    { clave: 'G02', descripcion: 'Devoluciones, descuentos o bonificaciones' },
    { clave: 'G03', descripcion: 'Gastos en general' },
    { clave: 'I01', descripcion: 'Construcciones' },
    { clave: 'I02', descripcion: 'Mobiliario y equipo de oficina por inversiones' },
    { clave: 'I03', descripcion: 'Equipo de transporte' },
    { clave: 'I04', descripcion: 'Equipo de cómputo y accesorios' },
    { clave: 'I05', descripcion: 'Dados, troqueles, moldes, matrices y herramental' },
    { clave: 'I06', descripcion: 'Comunicaciones telefónicas' },
    { clave: 'I07', descripcion: 'Comunicaciones satelitales' },
    { clave: 'I08', descripcion: 'Otra maquinaria y equipo' },
    { clave: 'D01', descripcion: 'Honorarios médicos, dentales y gastos hospitalarios' },
    { clave: 'D02', descripcion: 'Gastos médicos por incapacidad o discapacidad' },
    { clave: 'D03', descripcion: 'Gastos funerales' },
    { clave: 'D04', descripcion: 'Donativos' },
    { clave: 'D05', descripcion: 'Intereses reales efectivamente pagados por créditos hipotecarios' },
    { clave: 'D06', descripcion: 'Aportaciones voluntarias al SAR' },
    { clave: 'D07', descripcion: 'Primas por seguros de gastos médicos' },
    { clave: 'D08', descripcion: 'Gastos de transportación escolar obligatoria' },
    { clave: 'D09', descripcion: 'Depósitos en cuentas para el ahorro, primas de pensiones' },
    { clave: 'D10', descripcion: 'Pagos por servicios educativos (colegiaturas)' },
    { clave: 'P01', descripcion: 'Por definir' },
    { clave: 'S01', descripcion: 'Sin efectos fiscales' },
    { clave: 'CP01', descripcion: 'Pagos' },
    { clave: 'CN01', descripcion: 'Nómina' },
  ]);
  const [showRegimenPicker, setShowRegimenPicker] = useState(false);
  const [showUsoCFDIPicker, setShowUsoCFDIPicker] = useState(false);
  
  // Verificar si el usuario puede tener PIN de supervisor
  const canHaveSupervisorPin = SUPERVISOR_ROLES.includes(user.role);

  const refreshVerificationStatus = async () => {
    setRefreshingStatus(true);
    try {
      console.log('🔄 Refreshing verification status...');
      console.log('API_URL:', API_URL);
      console.log('Token:', token?.substring(0, 20) + '...');
      
      const response = await fetch(`${API_URL}/api/verify/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Response data:', data);
        
        setUser((prevUser: any) => ({
          ...prevUser,
          isVerified: data.isVerified,
          verificationStatus: data.status,
        }));
        if (data.isVerified) {
          Alert.alert(t('profile.congratulations'), t('profile.accountVerifiedMsg'));
        } else if (data.status === 'rejected') {
          Alert.alert(t('profile.verificationRejected'), data.rejectionReason || t('profile.rejectedDesc'));
        } else {
          Alert.alert(t('profile.statusUpdated'), t('profile.stillInReview'));
        }
      } else {
        const errorData = await response.json();
        console.log('Error response:', errorData);
        Alert.alert('Error', errorData.error || 'Error al actualizar');
      }
    } catch (error) {
      console.log('Fetch error:', error);
      Alert.alert(t('common.error'), t('profile.couldNotUpdate'));
    } finally {
      setRefreshingStatus(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      Alert.alert(t('common.error'), t('profile.fillAllFields'));
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      Alert.alert(t('common.error'), t('profile.passwordMismatch'));
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      Alert.alert(t('common.error'), t('profile.passwordTooShort'));
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(t('common.success'), t('profile.passwordChanged'));
        setShowPasswordModal(false);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        Alert.alert(t('common.error'), data.error || t('profile.couldNotUpdate'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('errors.networkError'));
    } finally {
      setSaving(false);
    }
  };

  // Cambiar PIN de supervisor
  const handleChangeSupervisorPin = async () => {
    if (!newPin || newPin.length < 4) {
      Alert.alert('Error', 'El PIN debe tener al menos 4 dígitos');
      return;
    }

    if (newPin !== confirmPin) {
      Alert.alert('Error', 'Los PINs no coinciden');
      return;
    }

    if (hasSupervisorPin && !currentPin) {
      Alert.alert('Error', 'Ingresa tu PIN actual');
      return;
    }

    setSavingPin(true);
    try {
      const response = await fetch(`${API_URL}/api/warehouse/update-supervisor-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_pin: currentPin || null,
          new_pin: newPin,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('✅ Éxito', 'PIN de supervisor actualizado correctamente');
        setShowPinModal(false);
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setHasSupervisorPin(true);
      } else {
        Alert.alert('Error', data.error || 'No se pudo actualizar el PIN');
      }
    } catch (error) {
      Alert.alert('Error', 'Error de conexión');
    } finally {
      setSavingPin(false);
    }
  };

  // 🧾 Cargar datos fiscales del usuario
  const loadFiscalData = async () => {
    setFiscalLoading(true);
    try {
      const [fiscalRes, regimenesRes, usosRes] = await Promise.all([
        fetch(`${API_URL}/api/fiscal/data`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/fiscal/catalogos/regimenes`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/fiscal/catalogos/usos-cfdi`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (fiscalRes.ok) {
        const data = await fiscalRes.json();
        if (data.success) {
          setFiscalData(data.fiscal);
        }
      }

      if (regimenesRes.ok) {
        const data = await regimenesRes.json();
        setRegimenesFiscales(data.regimenes || []);
      }

      if (usosRes.ok) {
        const data = await usosRes.json();
        setUsosCFDI(data.usos || []);
      }
    } catch (error) {
      console.error('Error loading fiscal data:', error);
    } finally {
      setFiscalLoading(false);
    }
  };

  // 🧾 Guardar datos fiscales
  const handleSaveFiscalData = async () => {
    if (!fiscalData.razon_social || !fiscalData.rfc || !fiscalData.codigo_postal || !fiscalData.regimen_fiscal) {
      Alert.alert('Error', 'Por favor completa todos los campos obligatorios');
      return;
    }

    // Validar RFC
    const rfcUpper = fiscalData.rfc.toUpperCase().trim();
    if (rfcUpper.length !== 12 && rfcUpper.length !== 13) {
      Alert.alert('Error', 'El RFC debe tener 12 caracteres (persona moral) o 13 caracteres (persona física)');
      return;
    }

    // Validar código postal
    if (!/^\d{5}$/.test(fiscalData.codigo_postal)) {
      Alert.alert('Error', 'El código postal debe tener 5 dígitos');
      return;
    }

    setSavingFiscal(true);
    try {
      const response = await fetch(`${API_URL}/api/fiscal/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(fiscalData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert('✅ Éxito', 'Datos fiscales guardados correctamente');
        setShowFiscalModal(false);
      } else {
        Alert.alert('Error', data.error || 'No se pudieron guardar los datos');
      }
    } catch (error) {
      Alert.alert('Error', 'Error de conexión');
    } finally {
      setSavingFiscal(false);
    }
  };

  // Obtener nombre del régimen fiscal seleccionado
  const getRegimenNombre = () => {
    const regimen = regimenesFiscales.find(r => r.clave === fiscalData.regimen_fiscal);
    return regimen ? `${regimen.clave} - ${regimen.descripcion}` : 'Seleccionar régimen';
  };

  // Obtener nombre del uso CFDI seleccionado
  const getUsoCFDINombre = () => {
    const uso = usosCFDI.find(u => u.clave === fiscalData.uso_cfdi);
    return uso ? `${uso.clave} - ${uso.descripcion}` : 'G03 - Gastos en general';
  };

  const handleToggle2FA = async (value: boolean) => {
    if (value) {
      // Activar 2FA
      Alert.alert(
        t('profile.activate2FATitle'),
        t('profile.activate2FAMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile.activate'),
            onPress: async () => {
              try {
                const response = await fetch(`${API_URL}/api/auth/2fa/enable`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (response.ok) {
                  setTwoFactorEnabled(true);
                  Alert.alert(t('common.success'), t('profile.2faEnabled'));
                }
              } catch (error) {
                Alert.alert(t('common.error'), t('errors.networkError'));
              }
            },
          },
        ]
      );
    } else {
      // Desactivar 2FA
      Alert.alert(
        t('profile.deactivate2FATitle'),
        t('profile.deactivate2FAMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile.deactivate'),
            style: 'destructive',
            onPress: async () => {
              try {
                const response = await fetch(`${API_URL}/api/auth/2fa/disable`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (response.ok) {
                  setTwoFactorEnabled(false);
                  Alert.alert(t('common.success'), t('profile.2faDisabled'));
                }
              } catch (error) {
                Alert.alert(t('common.error'), t('errors.networkError'));
              }
            },
          },
        ]
      );
    }
  };

  // Guardar teléfono (requiere contraseña y 2FA si está activo)
  const handleSavePhone = async () => {
    if (!editPassword) {
      Alert.alert(t('common.error'), t('profile.passwordRequired'));
      return;
    }

    if (twoFactorEnabled && !edit2FACode) {
      Alert.alert(t('common.error'), t('profile.code2FARequired'));
      return;
    }

    setSavingEdit(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/update-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: editPhone,
          password: editPassword,
          twoFactorCode: twoFactorEnabled ? edit2FACode : undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser((prevUser: any) => ({ ...prevUser, phone: editPhone }));
        setShowEditPhoneModal(false);
        setEditPassword('');
        setEdit2FACode('');
        Alert.alert(t('common.success'), t('profile.phoneUpdated'));
      } else {
        Alert.alert(t('common.error'), data.error || t('errors.serverError'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('errors.networkError'));
    } finally {
      setSavingEdit(false);
    }
  };

  // Guardar RFC
  const handleSaveRef = async () => {
    if (!editRef.trim()) {
      Alert.alert(t('common.error'), t('errors.requiredField'));
      return;
    }

    setSavingEdit(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/update-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rfc: editRef.trim().toUpperCase(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser((prevUser: any) => ({ ...prevUser, rfc: editRef.trim().toUpperCase() }));
        setShowEditRefModal(false);
        Alert.alert(t('common.success'), t('profile.rfcUpdated'));
      } else {
        Alert.alert(t('common.error'), data.error || t('errors.serverError'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('errors.networkError'));
    } finally {
      setSavingEdit(false);
    }
  };

  const getVerificationStatusInfo = () => {
    const status = user.verificationStatus || 'not_started';
    const isVerified = user.isVerified === true;

    // 👷 Detectar si es empleado
    const employeeRoles = ['repartidor', 'warehouse_ops', 'counter_staff', 'customer_service', 'branch_manager'];
    const isEmployee = employeeRoles.includes(user.role);
    const isEmployeeOnboarded = user.isEmployeeOnboarded === true;

    // Si es empleado, mostrar estado de onboarding de empleado
    if (isEmployee) {
      if (isEmployeeOnboarded) {
        return {
          icon: 'checkmark-circle',
          color: '#4CAF50',
          title: '✅ Alta Completada',
          subtitle: 'Tu registro como empleado está completo',
          action: null,
          isEmployee: true,
        };
      } else {
        return {
          icon: 'person-add',
          color: '#1976D2',
          title: '👷 Alta de Empleado Pendiente',
          subtitle: 'Completa tu registro para comenzar a trabajar',
          action: 'employee_onboarding',
          isEmployee: true,
        };
      }
    }

    // Para clientes, usar la lógica normal de verificación
    if (isVerified) {
      return {
        icon: 'checkmark-circle',
        color: '#4CAF50',
        title: t('profile.verified'),
        subtitle: t('profile.verifiedDesc'),
        action: null,
        isEmployee: false,
      };
    }

    switch (status) {
      case 'pending_review':
        return {
          icon: 'time',
          color: '#ff9800',
          title: t('profile.pending'),
          subtitle: t('profile.pendingDesc'),
          action: null,
          isEmployee: false,
        };
      case 'rejected':
        return {
          icon: 'close-circle',
          color: '#f44336',
          title: t('profile.rejected'),
          subtitle: t('profile.rejectedDesc'),
          action: 'retry',
          isEmployee: false,
        };
      default:
        return {
          icon: 'alert-circle',
          color: '#ff9800',
          title: t('profile.notVerified'),
          subtitle: t('profile.notVerifiedDesc'),
          action: 'start',
          isEmployee: false,
        };
    }
  };

  const verificationInfo = getVerificationStatusInfo();

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
        <Appbar.Content title={t('profile.title')} titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Información del Usuario */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>
                  {user.name?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user.name}</Text>
                <Text style={styles.profileEmail}>{user.email}</Text>
                <Text style={styles.profileBoxId}>🏠 {t('profile.boxId')}: {user.boxId}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Estado de Verificación */}
        <Text style={styles.sectionTitle}>{verificationInfo.isEmployee ? '👷 Alta de Empleado' : t('profile.verificationStatus')}</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            onPress={() => {
              if (verificationInfo.action) {
                // Navegar a EmployeeOnboarding o Verification según corresponda
                if (verificationInfo.action === 'employee_onboarding') {
                  navigation.navigate('EmployeeOnboarding', { user, token });
                } else {
                  navigation.navigate('Verification', { user, token });
                }
              }
            }}
            disabled={!verificationInfo.action}
          >
            <Card.Content>
              <View style={styles.verificationRow}>
                <Ionicons 
                  name={verificationInfo.icon as any} 
                  size={40} 
                  color={verificationInfo.color} 
                />
                <View style={styles.verificationInfo}>
                  <Text style={[styles.verificationTitle, { color: verificationInfo.color }]}>
                    {verificationInfo.title}
                  </Text>
                  <Text style={styles.verificationSubtitle}>
                    {verificationInfo.subtitle}
                  </Text>
                </View>
                {verificationInfo.action && (
                  <Ionicons name="chevron-forward" size={24} color="#999" />
                )}
              </View>
              {verificationInfo.action && (
                <TouchableOpacity
                  style={[styles.verifyButton, verificationInfo.isEmployee && { backgroundColor: '#1976D2' }]}
                  onPress={() => {
                    if (verificationInfo.action === 'employee_onboarding') {
                      navigation.navigate('EmployeeOnboarding', { user, token });
                    } else {
                      navigation.navigate('Verification', { user, token });
                    }
                  }}
                >
                  <Text style={styles.verifyButtonText}>
                    {verificationInfo.action === 'employee_onboarding' 
                      ? '👷 Completar Alta'
                      : verificationInfo.action === 'retry' 
                        ? t('verification.rejected') 
                        : t('profile.startVerification')}
                  </Text>
                </TouchableOpacity>
              )}
              {/* Botón Refrescar solo cuando NO está verificado y NO es empleado */}
              {!verificationInfo.isEmployee && !user.isVerified && (
                <TouchableOpacity
                  style={[styles.verifyButton, { backgroundColor: '#2196F3', marginTop: verificationInfo.action ? 8 : 12 }]}
                  onPress={refreshVerificationStatus}
                  disabled={refreshingStatus}
                >
                  {refreshingStatus ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={[styles.verifyButtonText, { color: '#fff' }]}>{t('profile.refreshStatus')}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </Card.Content>
          </TouchableOpacity>
        </Card>

        {/* Seguridad */}
        <Text style={styles.sectionTitle}>{t('profile.security')}</Text>
        <Card style={styles.card}>
          <Card.Content>
            {/* Cambiar Contraseña */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setShowPasswordModal(true)}
            >
              <Ionicons name="lock-closed-outline" size={24} color={BLACK} />
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>{t('profile.changePassword')}</Text>
                <Text style={styles.menuItemSubtitle}>{t('profile.changePasswordDesc')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            <Divider style={styles.divider} />

            {/* 2FA */}
            <View style={styles.menuItem}>
              <Ionicons name="shield-checkmark-outline" size={24} color={BLACK} />
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>{t('profile.twoFactorAuth')}</Text>
                <Text style={styles.menuItemSubtitle}>
                  {twoFactorEnabled ? t('profile.enable2FA') : t('profile.twoFactorAuthDesc')}
                </Text>
              </View>
              <Switch
                value={twoFactorEnabled}
                onValueChange={handleToggle2FA}
                trackColor={{ false: '#ddd', true: ORANGE + '80' }}
                thumbColor={twoFactorEnabled ? ORANGE : '#f4f3f4'}
              />
            </View>

            {/* PIN de Supervisor - Solo para roles autorizados */}
            {canHaveSupervisorPin && (
              <>
                <Divider style={styles.divider} />
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setCurrentPin('');
                    setNewPin('');
                    setConfirmPin('');
                    setShowPinModal(true);
                  }}
                >
                  <Ionicons name="keypad-outline" size={24} color={ORANGE} />
                  <View style={styles.menuItemContent}>
                    <Text style={styles.menuItemTitle}>🔐 PIN de Supervisor</Text>
                    <Text style={styles.menuItemSubtitle}>
                      {hasSupervisorPin 
                        ? 'Cambiar tu PIN de autorización' 
                        : 'Configurar PIN para autorizar operaciones'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Información de la Cuenta */}
        <Text style={styles.sectionTitle}>{t('profile.accountInfo')}</Text>
        <Card style={styles.card}>
          <Card.Content>
            {/* Teléfono - Editable */}
            <TouchableOpacity 
              style={styles.infoRow}
              onPress={() => {
                setEditPhone(user.phone || '');
                setEditPassword('');
                setEdit2FACode('');
                setShowEditPhoneModal(true);
              }}
            >
              <Text style={styles.infoLabel}>{t('profile.phone')}</Text>
              <View style={styles.editableValue}>
                <Text style={styles.infoValue}>{user.phone || t('profile.notVerified')}</Text>
                <Ionicons name="pencil" size={16} color={ORANGE} style={{ marginLeft: 8 }} />
              </View>
            </TouchableOpacity>
          </Card.Content>
        </Card>

        {/* 🧾 Datos Fiscales */}
        <Text style={styles.sectionTitle}>🧾 Datos Fiscales</Text>
        <Card style={styles.card}>
          <Card.Content>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                loadFiscalData();
                setShowFiscalModal(true);
              }}
            >
              <Ionicons name="receipt-outline" size={24} color={ORANGE} />
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Configurar Datos de Facturación</Text>
                <Text style={styles.menuItemSubtitle}>
                  {fiscalData.rfc 
                    ? `RFC: ${fiscalData.rfc}` 
                    : 'Agrega tus datos para solicitar facturas'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Modal Editar Teléfono */}
      <Modal visible={showEditPhoneModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Teléfono</Text>
              <TouchableOpacity onPress={() => setShowEditPhoneModal(false)}>
                <Ionicons name="close" size={24} color={BLACK} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalForm}>
              <Text style={styles.inputLabel}>Nuevo Teléfono</Text>
              <TextInput
                style={styles.inputFull}
                placeholder="Ej: +52 81 1234 5678"
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Contraseña (para confirmar)</Text>
              <TextInput
                style={styles.inputFull}
                placeholder="Tu contraseña actual"
                secureTextEntry
                value={editPassword}
                onChangeText={setEditPassword}
              />

              {twoFactorEnabled && (
                <>
                  <Text style={styles.inputLabel}>Código 2FA</Text>
                  <TextInput
                    style={styles.inputFull}
                    placeholder="Código de 6 dígitos"
                    value={edit2FACode}
                    onChangeText={setEdit2FACode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <Text style={styles.helperText}>
                    Ingresa el código enviado a tu correo electrónico
                  </Text>
                </>
              )}

              <TouchableOpacity
                style={[styles.saveButton, savingEdit && styles.saveButtonDisabled]}
                onPress={handleSavePhone}
                disabled={savingEdit}
              >
                {savingEdit ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.saveButtonText}>Guardar Teléfono</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Editar REF */}
      <Modal visible={showEditRefModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar RFC</Text>
              <TouchableOpacity onPress={() => setShowEditRefModal(false)}>
                <Ionicons name="close" size={24} color={BLACK} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalForm}>
              <Text style={styles.inputLabel}></Text>
              <TextInput
                style={styles.inputFull}
                placeholder="Ej: MICODIGO123"
                value={editRef}
                onChangeText={setEditRef}
                autoCapitalize="characters"
              />
              <Text style={styles.helperText}>
                Este código lo pueden usar otros usuarios para referirte como su asesor
              </Text>

              <TouchableOpacity
                style={[styles.saveButton, savingEdit && styles.saveButtonDisabled]}
                onPress={handleSaveRef}
                disabled={savingEdit}
              >
                {savingEdit ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.saveButtonText}>Guardar Código</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 🧾 Modal Datos Fiscales */}
      <Modal visible={showFiscalModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🧾 Datos Fiscales</Text>
              <TouchableOpacity onPress={() => setShowFiscalModal(false)}>
                <Ionicons name="close" size={24} color={BLACK} />
              </TouchableOpacity>
            </View>

            {fiscalLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={ORANGE} />
                <Text style={{ marginTop: 12, color: '#666' }}>Cargando datos...</Text>
              </View>
            ) : (
              <ScrollView style={styles.modalForm}>
                <Text style={styles.inputLabel}>Razón Social *</Text>
                <TextInput
                  style={styles.inputFull}
                  placeholder="Nombre o razón social para facturar"
                  value={fiscalData.razon_social}
                  onChangeText={(text) => setFiscalData({ ...fiscalData, razon_social: text })}
                  autoCapitalize="characters"
                />

                <Text style={styles.inputLabel}>RFC *</Text>
                <TextInput
                  style={styles.inputFull}
                  placeholder="12 o 13 caracteres"
                  value={fiscalData.rfc}
                  onChangeText={(text) => setFiscalData({ ...fiscalData, rfc: text.toUpperCase() })}
                  autoCapitalize="characters"
                  maxLength={13}
                />

                <Text style={styles.inputLabel}>Código Postal Fiscal *</Text>
                <TextInput
                  style={styles.inputFull}
                  placeholder="5 dígitos"
                  value={fiscalData.codigo_postal}
                  onChangeText={(text) => setFiscalData({ ...fiscalData, codigo_postal: text.replace(/\D/g, '') })}
                  keyboardType="number-pad"
                  maxLength={5}
                />

                <Text style={styles.inputLabel}>Régimen Fiscal *</Text>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => {
                    setShowFiscalModal(false);
                    setTimeout(() => setShowRegimenPicker(true), 300);
                  }}
                >
                  <Text style={fiscalData.regimen_fiscal ? styles.pickerText : styles.pickerPlaceholder}>
                    {getRegimenNombre()}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>

                <Text style={styles.inputLabel}>Uso CFDI</Text>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => {
                    setShowFiscalModal(false);
                    setTimeout(() => setShowUsoCFDIPicker(true), 300);
                  }}
                >
                  <Text style={styles.pickerText}>
                    {getUsoCFDINombre()}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>

                <Text style={[styles.helperText, { marginTop: 12 }]}>
                  * Campos obligatorios para solicitar facturas
                </Text>

                <TouchableOpacity
                  style={[styles.saveButton, { marginTop: 20, marginBottom: 30 }, savingFiscal && styles.saveButtonDisabled]}
                  onPress={handleSaveFiscalData}
                  disabled={savingFiscal}
                >
                  {savingFiscal ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.saveButtonText}>Guardar Datos Fiscales</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Selector de Régimen Fiscal */}
      <Modal visible={showRegimenPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Régimen Fiscal</Text>
              <TouchableOpacity onPress={() => {
                setShowRegimenPicker(false);
                setTimeout(() => setShowFiscalModal(true), 300);
              }}>
                <Ionicons name="close" size={24} color={BLACK} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={regimenesFiscales}
              keyExtractor={(item) => item.clave}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    fiscalData.regimen_fiscal === item.clave && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setFiscalData({ ...fiscalData, regimen_fiscal: item.clave });
                    setShowRegimenPicker(false);
                    setTimeout(() => setShowFiscalModal(true), 300);
                  }}
                >
                  <Text style={styles.pickerItemCode}>{item.clave}</Text>
                  <Text style={styles.pickerItemDesc}>{item.descripcion}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Modal Selector de Uso CFDI */}
      <Modal visible={showUsoCFDIPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Uso CFDI</Text>
              <TouchableOpacity onPress={() => {
                setShowUsoCFDIPicker(false);
                setTimeout(() => setShowFiscalModal(true), 300);
              }}>
                <Ionicons name="close" size={24} color={BLACK} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={usosCFDI}
              keyExtractor={(item) => item.clave}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    fiscalData.uso_cfdi === item.clave && styles.pickerItemSelected
                  ]}
                  onPress={() => {
                    setFiscalData({ ...fiscalData, uso_cfdi: item.clave });
                    setShowUsoCFDIPicker(false);
                    setTimeout(() => setShowFiscalModal(true), 300);
                  }}
                >
                  <Text style={styles.pickerItemCode}>{item.clave}</Text>
                  <Text style={styles.pickerItemDesc}>{item.descripcion}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Modal Cambiar Contraseña */}
      <Modal visible={showPasswordModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cambiar Contraseña</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
                <Ionicons name="close" size={24} color={BLACK} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalForm}>
              <Text style={styles.inputLabel}>Contraseña Actual</Text>
              <View style={styles.passwordInput}>
                <TextInput
                  style={styles.input}
                  placeholder="Tu contraseña actual"
                  secureTextEntry={!showPasswords}
                  value={passwordForm.currentPassword}
                  onChangeText={(text) => setPasswordForm({ ...passwordForm, currentPassword: text })}
                />
                <TouchableOpacity onPress={() => setShowPasswords(!showPasswords)}>
                  <Ionicons 
                    name={showPasswords ? 'eye-off' : 'eye'} 
                    size={24} 
                    color="#666" 
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Nueva Contraseña</Text>
              <TextInput
                style={styles.inputFull}
                placeholder="Mínimo 8 caracteres"
                secureTextEntry={!showPasswords}
                value={passwordForm.newPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, newPassword: text })}
              />

              <Text style={styles.inputLabel}>Confirmar Nueva Contraseña</Text>
              <TextInput
                style={styles.inputFull}
                placeholder="Repite la nueva contraseña"
                secureTextEntry={!showPasswords}
                value={passwordForm.confirmPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, confirmPassword: text })}
              />

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleChangePassword}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.saveButtonText}>Cambiar Contraseña</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal PIN de Supervisor */}
      <Modal visible={showPinModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔐 PIN de Supervisor</Text>
              <TouchableOpacity onPress={() => setShowPinModal(false)}>
                <Ionicons name="close" size={24} color={BLACK} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalForm}>
              <Text style={styles.helperText}>
                Este PIN te permite autorizar operaciones especiales como recepción de guías DHL. Cada autorización queda registrada con tu nombre.
              </Text>

              {hasSupervisorPin && (
                <>
                  <Text style={styles.inputLabel}>PIN Actual</Text>
                  <TextInput
                    style={styles.inputFull}
                    placeholder="Tu PIN actual"
                    value={currentPin}
                    onChangeText={setCurrentPin}
                    keyboardType="number-pad"
                    maxLength={6}
                    secureTextEntry
                  />
                </>
              )}

              <Text style={styles.inputLabel}>Nuevo PIN (mínimo 4 dígitos)</Text>
              <TextInput
                style={styles.inputFull}
                placeholder="Ej: 1234"
                value={newPin}
                onChangeText={setNewPin}
                keyboardType="number-pad"
                maxLength={6}
                secureTextEntry
              />

              <Text style={styles.inputLabel}>Confirmar Nuevo PIN</Text>
              <TextInput
                style={styles.inputFull}
                placeholder="Repite el nuevo PIN"
                value={confirmPin}
                onChangeText={setConfirmPin}
                keyboardType="number-pad"
                maxLength={6}
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.saveButton, savingPin && styles.saveButtonDisabled, { backgroundColor: ORANGE }]}
                onPress={handleChangeSupervisorPin}
                disabled={savingPin}
              >
                {savingPin ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {hasSupervisorPin ? 'Cambiar PIN' : 'Crear PIN'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  appbar: {
    backgroundColor: BLACK,
  },
  appbarTitle: {
    color: 'white',
    fontWeight: 'bold',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 16,
    backgroundColor: 'white',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BLACK,
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  profileBoxId: {
    fontSize: 14,
    color: ORANGE,
    fontWeight: '600',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationInfo: {
    flex: 1,
    marginLeft: 16,
  },
  verificationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  verificationSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  verifyButton: {
    backgroundColor: ORANGE,
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  verifyButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuItemContent: {
    flex: 1,
    marginLeft: 16,
  },
  menuItemTitle: {
    fontSize: 16,
    color: BLACK,
    fontWeight: '500',
  },
  menuItemSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  divider: {
    marginVertical: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    color: BLACK,
    fontWeight: '500',
  },
  editableValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
  },
  modalForm: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    marginTop: 12,
  },
  passwordInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fafafa',
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  inputFull: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  saveButton: {
    backgroundColor: ORANGE,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Estilos de Asesor
  advisorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  advisorInfo: {
    flex: 1,
  },
  advisorName: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  advisorEmail: {
    fontSize: 14,
    color: '#666',
  },
  advisorCode: {
    fontSize: 12,
    color: ORANGE,
    marginTop: 2,
  },
  changeAdvisorButton: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ORANGE,
    borderRadius: 8,
  },
  changeAdvisorText: {
    color: ORANGE,
    fontWeight: '600',
  },
  advisorModalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    color: '#999',
    fontSize: 16,
  },
  advisorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  advisorCardSelected: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  advisorCardInfo: {
    flex: 1,
  },
  advisorCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  advisorCardEmail: {
    fontSize: 13,
    color: '#666',
  },
  advisorCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  advisorCardCode: {
    fontSize: 12,
    color: '#666',
  },
  advisorCardClients: {
    fontSize: 12,
    color: '#666',
  },
  // 🧾 Estilos para datos fiscales
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  pickerText: {
    fontSize: 14,
    color: BLACK,
    flex: 1,
  },
  pickerPlaceholder: {
    fontSize: 14,
    color: '#999',
    flex: 1,
  },
  pickerItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  pickerItemSelected: {
    backgroundColor: '#FFF3E0',
  },
  pickerItemCode: {
    fontSize: 14,
    fontWeight: '600',
    color: ORANGE,
    marginBottom: 4,
  },
  pickerItemDesc: {
    fontSize: 13,
    color: '#666',
  },
});
