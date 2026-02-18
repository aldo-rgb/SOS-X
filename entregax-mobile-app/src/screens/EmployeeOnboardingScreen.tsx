import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';

interface EmployeeOnboardingScreenProps {
  navigation: any;
  route?: {
    params?: {
      user?: any;
      token?: string;
    };
  };
  onComplete?: () => void;
}

type MaritalStatus = 'Soltero' | 'Casado' | 'Divorciado' | 'Viudo' | 'Unión Libre';
type ShirtSize = 'Chica' | 'Mediana' | 'Grande' | 'Extra Grande';

export default function EmployeeOnboardingScreen({ navigation, route, onComplete }: EmployeeOnboardingScreenProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  
  // Obtener datos del usuario para saber si es repartidor
  const user = route?.params?.user;
  const token = route?.params?.token;
  const isDriver = user?.role === 'repartidor';
  
  // Total de pasos: 6 si es repartidor, 5 si no
  const totalSteps = isDriver ? 6 : 5;
  
  // Form data
  const [formData, setFormData] = useState({
    address: '',
    phone: user?.phone || '',
    emergencyContact: '',
    pantsSize: '',
    shirtSize: 'Mediana' as ShirtSize,
    shoeSize: '',
    maritalStatus: 'Soltero' as MaritalStatus,
    spouseName: '',
    childrenCount: '0',
    licenseExpiry: '',
  });
  
  // Photos
  const [photos, setPhotos] = useState({
    profilePhoto: null as string | null,
    ineFront: null as string | null,
    ineBack: null as string | null,
    licenseFront: null as string | null,
    licenseBack: null as string | null,
  });

  // Privacy notice content
  const [privacyNotice, setPrivacyNotice] = useState<any>(null);

  // Cargar aviso de privacidad
  useEffect(() => {
    const loadPrivacy = async () => {
      try {
        const response = await api.get('/api/hr/privacy-notice');
        setPrivacyNotice(response.data);
      } catch (error) {
        console.error('Error cargando aviso de privacidad:', error);
      }
    };
    loadPrivacy();
  }, []);

  // Solicitar permisos de cámara/galería
  const requestMediaPermissions = async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permiso Requerido',
        'Necesitamos acceso a tu galería para subir fotos.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir Configuración', onPress: () => Linking.openSettings() }
        ]
      );
      return false;
    }
    return true;
  };
  
  // Tomar foto con cámara o seleccionar de galería
  const pickImage = async (type: 'profilePhoto' | 'ineFront' | 'ineBack' | 'licenseFront' | 'licenseBack') => {
    // Para documentos (INE, licencia), solo permitir cámara
    const isDocument = ['ineFront', 'ineBack', 'licenseFront', 'licenseBack'].includes(type);
    
    if (isDocument) {
      // Documentos: solo cámara, no galería
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso Requerido', 'Se necesita permiso de cámara para fotografiar tus documentos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });
      
      if (!result.canceled && result.assets[0]) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setPhotos(prev => ({ ...prev, [type]: base64Image }));
      }
      return;
    }
    
    // Para foto de perfil, permitir cámara o galería
    const hasPermission = await requestMediaPermissions();
    if (!hasPermission) return;
    
    Alert.alert(
      'Seleccionar Foto',
      '¿Cómo deseas agregar la foto?',
      [
        {
          text: '📸 Cámara',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Error', 'Se necesita permiso de cámara');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 0.8,
              base64: true,
            });
            
            if (!result.canceled && result.assets[0]) {
              const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
              setPhotos(prev => ({ ...prev, [type]: base64Image }));
            }
          }
        },
        {
          text: '🖼️ Galería',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 0.8,
              base64: true,
            });
            
            if (!result.canceled && result.assets[0]) {
              const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
              setPhotos(prev => ({ ...prev, [type]: base64Image }));
            }
          }
        },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  // Aceptar aviso de privacidad Y solicitar ubicación
  const handleAcceptPrivacy = async () => {
    setLoading(true);
    try {
      // Primero solicitar permiso de ubicación
      const locationGranted = await requestLocationPermission();
      if (!locationGranted) {
        setLoading(false);
        return; // No continuar si no se otorga el permiso
      }

      // Registrar aceptación del aviso de privacidad
      await api.post('/api/hr/accept-privacy', {}, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setPrivacyAccepted(true);
      setStep(1);
    } catch (error) {
      console.error('Error aceptando privacidad:', error);
      Alert.alert('Error', 'No se pudo registrar la aceptación. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // Solicitar permisos de ubicación
  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso Requerido',
          'EntregaX necesita acceder a tu ubicación para el control de asistencia. Por favor, habilita el permiso en la configuración de tu dispositivo.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir Configuración', onPress: () => Linking.openSettings() }
          ]
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error solicitando permiso de ubicación:', error);
      return false;
    }
  };

  // Guardar datos del empleado
  const handleSaveOnboarding = async () => {
    // Validaciones
    if (!formData.address.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa tu dirección completa.');
      return;
    }
    if (!formData.phone.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa tu número de teléfono.');
      return;
    }
    if (!formData.emergencyContact.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa un contacto de emergencia.');
      return;
    }
    if (!formData.pantsSize.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa tu talla de pantalón.');
      return;
    }
    if (!formData.shoeSize.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa tu talla de zapatos.');
      return;
    }
    if (formData.maritalStatus === 'Casado' && !formData.spouseName.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa el nombre de tu cónyuge.');
      return;
    }
    if (!photos.profilePhoto) {
      Alert.alert('Foto Requerida', 'Por favor toma tu foto de perfil.');
      return;
    }
    if (!photos.ineFront || !photos.ineBack) {
      Alert.alert('Documentos Requeridos', 'Por favor sube las fotos de tu INE (frente y vuelta).');
      return;
    }
    if (isDriver && (!photos.licenseFront || !photos.licenseBack)) {
      Alert.alert('Documentos Requeridos', 'Por favor sube las fotos de tu licencia de conducir (frente y vuelta).');
      return;
    }
    if (isDriver && !formData.licenseExpiry) {
      Alert.alert('Campo Requerido', 'Por favor ingresa la fecha de vencimiento de tu licencia.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/hr/onboarding', {
        address: formData.address,
        phone: formData.phone,
        emergencyContact: formData.emergencyContact,
        pantsSize: formData.pantsSize,
        shirtSize: formData.shirtSize,
        shoeSize: formData.shoeSize,
        maritalStatus: formData.maritalStatus,
        spouseName: formData.spouseName,
        childrenCount: parseInt(formData.childrenCount) || 0,
        profilePhotoUrl: photos.profilePhoto,
        ineFrontUrl: photos.ineFront,
        ineBackUrl: photos.ineBack,
        driverLicenseFrontUrl: photos.licenseFront,
        driverLicenseBackUrl: photos.licenseBack,
        driverLicenseExpiry: formData.licenseExpiry || null,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      Alert.alert(
        '📋 Documentos Enviados',
        'Tu expediente ha sido enviado para verificación. Un administrador revisará tus documentos y recibirás una notificación cuando tu cuenta sea aprobada.',
        [{ 
          text: 'Entendido', 
          onPress: () => {
            if (onComplete) {
              onComplete();
            } else if (navigation) {
              // Los empleados regresan a EmployeeHome
              navigation.replace('EmployeeHome', { user, token: route?.params?.token });
            }
          }
        }]
      );
    } catch (error) {
      Alert.alert('Error', 'No se pudieron guardar los datos. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // Componente para captura de foto
  const PhotoCapture = ({ 
    title, 
    subtitle, 
    photo, 
    onPress, 
    aspectRatio = '4:3',
    icon = 'camera'
  }: { 
    title: string; 
    subtitle: string; 
    photo: string | null; 
    onPress: () => void;
    aspectRatio?: '1:1' | '4:3';
    icon?: string;
  }) => (
    <TouchableOpacity style={styles.photoCapture} onPress={onPress}>
      {photo ? (
        <Image 
          source={{ uri: photo }} 
          style={[
            styles.capturedPhoto,
            aspectRatio === '1:1' ? styles.photoSquare : styles.photoCard
          ]} 
        />
      ) : (
        <View style={[
          styles.photoPlaceholder,
          aspectRatio === '1:1' ? styles.photoSquare : styles.photoCard
        ]}>
          <Ionicons name={icon as any} size={40} color="#C1272D" />
          <Text style={styles.photoPlaceholderText}>{title}</Text>
          <Text style={styles.photoPlaceholderSubtext}>{subtitle}</Text>
        </View>
      )}
      {photo && (
        <View style={styles.photoOverlay}>
          <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
          <Text style={styles.photoOverlayText}>✓ Cargada</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  // PASO 0: Aviso de Privacidad
  if (step === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Ionicons name="shield-checkmark" size={64} color="#C1272D" />
            <Text style={styles.title}>Aviso de Privacidad</Text>
            <Text style={styles.subtitle}>
              Por favor lee y acepta el aviso de privacidad antes de continuar
            </Text>
          </View>

          {privacyNotice ? (
            <View style={styles.privacyCard}>
              <Text style={styles.privacyTitle}>{privacyNotice.title}</Text>
              <Text style={styles.privacyCompany}>{privacyNotice.company}</Text>
              
              {privacyNotice.sections?.map((section: any, index: number) => (
                <View key={index} style={styles.privacySection}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionContent}>{section.content}</Text>
                </View>
              ))}
              
              <Text style={styles.privacyDate}>
                Última actualización: {privacyNotice.lastUpdate}
              </Text>
            </View>
          ) : (
            <ActivityIndicator size="large" color="#C1272D" style={{ marginVertical: 40 }} />
          )}

          <TouchableOpacity
            style={[styles.acceptButton, loading && styles.buttonDisabled]}
            onPress={handleAcceptPrivacy}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.acceptButtonText}>
                  Aviso de Privacidad y Activar Localizacion
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.legalNote}>
            Al presionar "", confirmas que has leído y entendido el aviso de privacidad,
            y autorizas a EntregaX a tratar tus datos personales y rastrear tu ubicación
            durante tu jornada laboral.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // PASO 1: Foto de Perfil
  if (step === 1) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Ionicons name="person-circle" size={64} color="#C1272D" />
            <Text style={styles.title}>Foto de Perfil</Text>
            <Text style={styles.subtitle}>Paso 1 de {totalSteps} - Tu fotografía para identificación</Text>
          </View>

          <View style={styles.photoSection}>
            <PhotoCapture
              title="Tomar Selfie"
              subtitle="Mira directamente a la cámara"
              photo={photos.profilePhoto}
              onPress={() => pickImage('profilePhoto')}
              aspectRatio="1:1"
              icon="person"
            />
            
            <View style={styles.photoTips}>
              <Text style={styles.tipsTitle}>📸 Consejos para tu foto:</Text>
              <Text style={styles.tipItem}>• Buena iluminación</Text>
              <Text style={styles.tipItem}>• Fondo claro y uniforme</Text>
              <Text style={styles.tipItem}>• Sin lentes de sol ni gorras</Text>
              <Text style={styles.tipItem}>• Expresión neutral mirando a la cámara</Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(0)}
            >
              <Ionicons name="arrow-back" size={20} color="#666" />
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nextButton, !photos.profilePhoto && styles.buttonDisabled]}
              onPress={() => setStep(2)}
              disabled={!photos.profilePhoto}
            >
              <Text style={styles.nextButtonText}>Siguiente</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // PASO 2: INE Frente y Vuelta
  if (step === 2) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Ionicons name="card" size={64} color="#C1272D" />
            <Text style={styles.title}>INE / Identificación</Text>
            <Text style={styles.subtitle}>Paso 2 de {totalSteps} - Frente y vuelta de tu INE</Text>
          </View>

          <View style={styles.photosGrid}>
            <View style={styles.photoItem}>
              <Text style={styles.photoLabel}>Frente de INE</Text>
              <PhotoCapture
                title="INE Frente"
                subtitle="Foto con datos visibles"
                photo={photos.ineFront}
                onPress={() => pickImage('ineFront')}
                icon="card-outline"
              />
            </View>
            
            <View style={styles.photoItem}>
              <Text style={styles.photoLabel}>Vuelta de INE</Text>
              <PhotoCapture
                title="INE Vuelta"
                subtitle="Código de barras visible"
                photo={photos.ineBack}
                onPress={() => pickImage('ineBack')}
                icon="card"
              />
            </View>
          </View>

          <View style={styles.photoTips}>
            <Text style={styles.tipsTitle}>📋 Importante:</Text>
            <Text style={styles.tipItem}>• Asegúrate que todos los datos sean legibles</Text>
            <Text style={styles.tipItem}>• Evita reflejos o sombras</Text>
            <Text style={styles.tipItem}>• La foto debe estar enfocada</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(1)}
            >
              <Ionicons name="arrow-back" size={20} color="#666" />
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nextButton, (!photos.ineFront || !photos.ineBack) && styles.buttonDisabled]}
              onPress={() => setStep(3)}
              disabled={!photos.ineFront || !photos.ineBack}
            >
              <Text style={styles.nextButtonText}>Siguiente</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // PASO 3: Licencia de Conducir (solo para repartidores)
  if (step === 3 && isDriver) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Ionicons name="car" size={64} color="#C1272D" />
            <Text style={styles.title}>Licencia de Conducir</Text>
            <Text style={styles.subtitle}>Paso 3 de {totalSteps} - Requerido para repartidores</Text>
          </View>

          <View style={styles.driverAlert}>
            <Ionicons name="warning" size={24} color="#FF9800" />
            <Text style={styles.driverAlertText}>
              Como repartidor, necesitas subir tu licencia de conducir vigente.
            </Text>
          </View>

          <View style={styles.photosGrid}>
            <View style={styles.photoItem}>
              <Text style={styles.photoLabel}>Frente de Licencia</Text>
              <PhotoCapture
                title="Licencia Frente"
                subtitle="Con foto y datos"
                photo={photos.licenseFront}
                onPress={() => pickImage('licenseFront')}
                icon="car-outline"
              />
            </View>
            
            <View style={styles.photoItem}>
              <Text style={styles.photoLabel}>Vuelta de Licencia</Text>
              <PhotoCapture
                title="Licencia Vuelta"
                subtitle="Con vigencia visible"
                photo={photos.licenseBack}
                onPress={() => pickImage('licenseBack')}
                icon="car"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Fecha de Vencimiento de Licencia *</Text>
            <TextInput
              style={styles.input}
              placeholder="DD/MM/AAAA (ej: 15/06/2027)"
              value={formData.licenseExpiry}
              onChangeText={(text) => {
                // Formato automático DD/MM/AAAA
                let formatted = text.replace(/[^0-9]/g, '');
                if (formatted.length >= 2) formatted = formatted.slice(0, 2) + '/' + formatted.slice(2);
                if (formatted.length >= 5) formatted = formatted.slice(0, 5) + '/' + formatted.slice(5);
                if (formatted.length > 10) formatted = formatted.slice(0, 10);
                setFormData({ ...formData, licenseExpiry: formatted });
              }}
              keyboardType="numeric"
              maxLength={10}
            />
            <Text style={styles.helperText}>Ingresa la fecha como aparece en tu licencia</Text>
          </View>

          <View style={styles.photoTips}>
            <Text style={styles.tipsTitle}>🚗 Requisitos:</Text>
            <Text style={styles.tipItem}>• Licencia tipo A o B vigente</Text>
            <Text style={styles.tipItem}>• La fecha de vencimiento debe ser legible</Text>
            <Text style={styles.tipItem}>• Sin manchas ni rayones que oculten información</Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(2)}
            >
              <Ionicons name="arrow-back" size={20} color="#666" />
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nextButton, (!photos.licenseFront || !photos.licenseBack || !formData.licenseExpiry) && styles.buttonDisabled]}
              onPress={() => setStep(4)}
              disabled={!photos.licenseFront || !photos.licenseBack || !formData.licenseExpiry}
            >
              <Text style={styles.nextButtonText}>Siguiente</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Ajustar número de paso si no es repartidor
  const dataStep = isDriver ? 4 : 3;
  const uniformStep = isDriver ? 5 : 4;
  const locationStep = isDriver ? 6 : 5;

  // PASO: Datos Personales
  if (step === dataStep) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Ionicons name="person" size={64} color="#C1272D" />
            <Text style={styles.title}>Datos Personales</Text>
            <Text style={styles.subtitle}>Paso {dataStep} de {totalSteps} - Información de contacto</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Dirección Completa *</Text>
            <TextInput
              style={styles.input}
              placeholder="Calle, número, colonia, ciudad, CP"
              value={formData.address}
              onChangeText={(text) => setFormData({ ...formData, address: text })}
              multiline
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Teléfono Celular *</Text>
            <TextInput
              style={styles.input}
              placeholder="10 dígitos"
              value={formData.phone}
              onChangeText={(text) => setFormData({ ...formData, phone: text })}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Contacto de Emergencia *</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre y teléfono"
              value={formData.emergencyContact}
              onChangeText={(text) => setFormData({ ...formData, emergencyContact: text })}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Estado Civil</Text>
            <View style={styles.optionsRow}>
              {(['Soltero', 'Casado', 'Divorciado', 'Viudo', 'Unión Libre'] as MaritalStatus[]).map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.optionButton,
                    formData.maritalStatus === status && styles.optionButtonActive
                  ]}
                  onPress={() => setFormData({ ...formData, maritalStatus: status })}
                >
                  <Text style={[
                    styles.optionButtonText,
                    formData.maritalStatus === status && styles.optionButtonTextActive
                  ]}>
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {formData.maritalStatus === 'Casado' && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Nombre del Cónyuge *</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre completo"
                value={formData.spouseName}
                onChangeText={(text) => setFormData({ ...formData, spouseName: text })}
              />
            </View>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Cantidad de Hijos</Text>
            <TextInput
              style={[styles.input, { width: 100 }]}
              placeholder="0"
              value={formData.childrenCount}
              onChangeText={(text) => setFormData({ ...formData, childrenCount: text })}
              keyboardType="numeric"
              maxLength={2}
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(isDriver ? 3 : 2)}
            >
              <Ionicons name="arrow-back" size={20} color="#666" />
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nextButton}
              onPress={() => setStep(uniformStep)}
            >
              <Text style={styles.nextButtonText}>Siguiente</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // PASO: Tallas de Uniforme
  if (step === uniformStep) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Ionicons name="shirt" size={64} color="#C1272D" />
            <Text style={styles.title}>Tallas de Uniforme</Text>
            <Text style={styles.subtitle}>Paso {uniformStep} de {totalSteps} - Para tu uniforme de trabajo</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Talla de Pantalón *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 32, 34, 36..."
              value={formData.pantsSize}
              onChangeText={(text) => setFormData({ ...formData, pantsSize: text })}
              keyboardType="numeric"
              maxLength={3}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Talla de Camiseta</Text>
            <View style={styles.sizeOptionsRow}>
              {(['Chica', 'Mediana', 'Grande', 'Extra Grande'] as ShirtSize[]).map((size) => (
                <TouchableOpacity
                  key={size}
                  style={[
                    styles.sizeOption,
                    formData.shirtSize === size && styles.sizeOptionActive
                  ]}
                  onPress={() => setFormData({ ...formData, shirtSize: size })}
                >
                  <Text style={[
                    styles.sizeOptionText,
                    formData.shirtSize === size && styles.sizeOptionTextActive
                  ]}>
                    {size === 'Extra Grande' ? 'XL' : size.charAt(0)}
                  </Text>
                  <Text style={[
                    styles.sizeOptionLabel,
                    formData.shirtSize === size && styles.sizeOptionTextActive
                  ]}>
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Talla de Zapatos *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 26, 27, 28..."
              value={formData.shoeSize}
              onChangeText={(text) => setFormData({ ...formData, shoeSize: text })}
              keyboardType="numeric"
              maxLength={4}
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(dataStep)}
            >
              <Ionicons name="arrow-back" size={20} color="#666" />
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nextButton}
              onPress={() => setStep(locationStep)}
            >
              <Text style={styles.nextButtonText}>Siguiente</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // PASO: Permisos de Ubicación (Final)
  if (step === locationStep) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Ionicons name="location" size={64} color="#C1272D" />
            <Text style={styles.title}>Permisos de Checador</Text>
            <Text style={styles.subtitle}>Paso {locationStep} de {totalSteps} - Autorización de ubicación</Text>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={32} color="#2196F3" />
            <Text style={styles.infoText}>
              EntregaX necesita acceder a tu ubicación para:
            </Text>
            <View style={styles.infoList}>
              <Text style={styles.infoItem}>✓ Registrar tus entradas y salidas</Text>
              <Text style={styles.infoItem}>✓ Verificar que estés en el CEDIS</Text>
              {isDriver && <Text style={styles.infoItem}>✓ Rastreo de ruta para seguridad</Text>}
            </View>
          </View>

          {/* Resumen de datos capturados */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>📋 Resumen de tu Expediente</Text>
            <View style={styles.summaryRow}>
              <Ionicons name="person-circle" size={20} color="#4CAF50" />
              <Text style={styles.summaryText}>Foto de perfil: ✓</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="card" size={20} color="#4CAF50" />
              <Text style={styles.summaryText}>INE (frente y vuelta): ✓</Text>
            </View>
            {isDriver && (
              <View style={styles.summaryRow}>
                <Ionicons name="car" size={20} color="#4CAF50" />
                <Text style={styles.summaryText}>Licencia de conducir: ✓</Text>
              </View>
            )}
            {isDriver && formData.licenseExpiry && (
              <View style={styles.summaryRow}>
                <Ionicons name="calendar" size={20} color="#4CAF50" />
                <Text style={styles.summaryText}>Vigencia licencia: {formData.licenseExpiry}</Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Ionicons name="home" size={20} color="#4CAF50" />
              <Text style={styles.summaryText}>Dirección: {formData.address.substring(0, 30)}...</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="shirt" size={20} color="#4CAF50" />
              <Text style={styles.summaryText}>Uniforme: Pantalón {formData.pantsSize}, Camisa {formData.shirtSize}, Zapatos {formData.shoeSize}</Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(uniformStep)}
            >
              <Ionicons name="arrow-back" size={20} color="#666" />
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.locationButton, loading && styles.buttonDisabled]}
              onPress={async () => {
                const granted = await requestLocationPermission();
                if (granted) {
                  handleSaveOnboarding();
                }
              }}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={20} color="#fff" />
                  <Text style={styles.locationButtonText}>Finalizar Alta</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  // Privacy Notice
  privacyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  privacyCompany: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  privacySection: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C1272D',
    marginBottom: 4,
  },
  sectionContent: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  privacyDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 12,
    textAlign: 'right',
  },
  acceptButton: {
    backgroundColor: '#C1272D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  legalNote: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
  // Photo Capture
  photoSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  photoCapture: {
    width: '100%',
    alignItems: 'center',
  },
  photoPlaceholder: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#C1272D',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  photoSquare: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  photoCard: {
    width: '100%',
    height: 140,
  },
  capturedPhoto: {
    borderRadius: 12,
    backgroundColor: '#eee',
  },
  photoPlaceholderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C1272D',
    marginTop: 8,
    textAlign: 'center',
  },
  photoPlaceholderSubtext: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  photoOverlayText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  photoTips: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  tipItem: {
    fontSize: 13,
    color: '#666',
    marginVertical: 2,
  },
  // Photos Grid
  photosGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  photoItem: {
    flex: 1,
    alignItems: 'center',
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  // Driver Alert
  driverAlert: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  driverAlertText: {
    flex: 1,
    fontSize: 14,
    color: '#E65100',
  },
  // Form
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#333',
  },
  helperText: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
    fontStyle: 'italic',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionButtonActive: {
    backgroundColor: '#C1272D',
    borderColor: '#C1272D',
  },
  optionButtonText: {
    fontSize: 13,
    color: '#666',
  },
  optionButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  // Size Options
  sizeOptionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sizeOption: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  sizeOptionActive: {
    borderColor: '#C1272D',
    backgroundColor: '#FFF5F5',
  },
  sizeOptionText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#999',
  },
  sizeOptionLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  sizeOptionTextActive: {
    color: '#C1272D',
  },
  // Buttons
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20,
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#C1272D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
  },
  // Info Card
  infoCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#1565C0',
    marginTop: 8,
    textAlign: 'center',
  },
  infoList: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  infoItem: {
    fontSize: 14,
    color: '#1565C0',
    marginVertical: 4,
  },
  locationButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  locationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Summary
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  summaryText: {
    fontSize: 13,
    color: '#666',
  },
});
