import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'LicenseRenewal'>;
  route: RouteProp<RootStackParamList, 'LicenseRenewal'>;
};

const ORANGE = '#F05A28';

const STEPS = ['Foto Frente', 'Foto Reverso', 'Vencimiento'];

interface PhotoAsset {
  uri: string;
  name: string;
  type: string;
}

export default function LicenseRenewalScreen({ navigation, route }: Props) {
  const { user, token } = route.params;

  const [step, setStep] = useState(0);
  const [frontPhoto, setFrontPhoto] = useState<PhotoAsset | null>(null);
  const [backPhoto, setBackPhoto] = useState<PhotoAsset | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pickPhoto = async (side: 'front' | 'back') => {
    Alert.alert(
      side === 'front' ? 'Foto Frente de Licencia' : 'Foto Reverso de Licencia',
      'Selecciona el origen de la foto',
      [
        {
          text: 'Cámara',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara para tomar la foto.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [4, 3] });
            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              const photo = { uri: asset.uri, name: `license-${side}-${Date.now()}.jpg`, type: 'image/jpeg' };
              side === 'front' ? setFrontPhoto(photo) : setBackPhoto(photo);
            }
          },
        },
        {
          text: 'Galería',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para seleccionar la foto.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true, aspect: [4, 3] });
            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              const ext = asset.uri.split('.').pop() || 'jpg';
              const photo = { uri: asset.uri, name: `license-${side}-${Date.now()}.${ext}`, type: `image/${ext}` };
              side === 'front' ? setFrontPhoto(photo) : setBackPhoto(photo);
            }
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const handleSubmit = async () => {
    if (!frontPhoto || !backPhoto || !expiryDate) {
      Alert.alert('Datos incompletos', 'Necesitas las fotos frente, reverso y la fecha de vencimiento.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(expiryDate)) {
      Alert.alert('Formato inválido', 'Ingresa la fecha en formato AAAA-MM-DD. Ejemplo: 2028-05-15');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('front_photo', { uri: frontPhoto.uri, name: frontPhoto.name, type: frontPhoto.type } as any);
      formData.append('back_photo',  { uri: backPhoto.uri,  name: backPhoto.name,  type: backPhoto.type  } as any);
      formData.append('expiry_date', expiryDate);

      const res = await fetch(`${API_URL}/api/hr/my-license`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        Alert.alert(
          '¡Licencia actualizada!',
          data.message || 'Tu licencia de conducir fue enviada correctamente. Un administrador la revisará.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', data.error || 'No se pudo actualizar la licencia. Intenta de nuevo.');
      }
    } catch (e: any) {
      Alert.alert('Error de conexión', 'Verifica tu conexión a internet e intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    if (step === 0) return !!frontPhoto;
    if (step === 1) return !!backPhoto;
    if (step === 2) return !!expiryDate;
    return false;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
        <Appbar.Content title="Renovar Licencia" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stepper */}
        <View style={styles.stepper}>
          {STEPS.map((label, idx) => (
            <View key={idx} style={styles.stepItem}>
              <View style={[styles.stepCircle, idx <= step ? styles.stepCircleActive : styles.stepCircleInactive]}>
                {idx < step ? (
                  <Ionicons name="checkmark" size={16} color="white" />
                ) : (
                  <Text style={[styles.stepNumber, idx === step ? styles.stepNumberActive : styles.stepNumberInactive]}>
                    {idx + 1}
                  </Text>
                )}
              </View>
              <Text style={[styles.stepLabel, idx === step ? styles.stepLabelActive : styles.stepLabelInactive]}>
                {label}
              </Text>
              {idx < STEPS.length - 1 && (
                <View style={[styles.stepLine, idx < step ? styles.stepLineActive : styles.stepLineInactive]} />
              )}
            </View>
          ))}
        </View>

        {/* Step content */}
        {step === 0 && (
          <View style={styles.stepContent}>
            <View style={styles.instructionCard}>
              <Ionicons name="id-card-outline" size={32} color={ORANGE} />
              <Text style={styles.instructionTitle}>Foto del Frente</Text>
              <Text style={styles.instructionText}>
                Toma o selecciona una foto clara del <Text style={styles.bold}>frente</Text> de tu nueva licencia de conducir.
                Asegúrate que los datos sean legibles.
              </Text>
            </View>

            <TouchableOpacity style={styles.photoBox} onPress={() => pickPhoto('front')} activeOpacity={0.8}>
              {frontPhoto ? (
                <Image source={{ uri: frontPhoto.uri }} style={styles.photoPreview} resizeMode="contain" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.photoPlaceholderText}>Toca para tomar foto</Text>
                </View>
              )}
            </TouchableOpacity>

            {frontPhoto && (
              <TouchableOpacity style={styles.retakeButton} onPress={() => pickPhoto('front')}>
                <Ionicons name="refresh-outline" size={16} color={ORANGE} />
                <Text style={styles.retakeText}>Cambiar foto</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepContent}>
            <View style={styles.instructionCard}>
              <Ionicons name="id-card-outline" size={32} color={ORANGE} />
              <Text style={styles.instructionTitle}>Foto del Reverso</Text>
              <Text style={styles.instructionText}>
                Toma o selecciona una foto clara del <Text style={styles.bold}>reverso</Text> de tu nueva licencia de conducir.
              </Text>
            </View>

            <TouchableOpacity style={styles.photoBox} onPress={() => pickPhoto('back')} activeOpacity={0.8}>
              {backPhoto ? (
                <Image source={{ uri: backPhoto.uri }} style={styles.photoPreview} resizeMode="contain" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.photoPlaceholderText}>Toca para tomar foto</Text>
                </View>
              )}
            </TouchableOpacity>

            {backPhoto && (
              <TouchableOpacity style={styles.retakeButton} onPress={() => pickPhoto('back')}>
                <Ionicons name="refresh-outline" size={16} color={ORANGE} />
                <Text style={styles.retakeText}>Cambiar foto</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContent}>
            <View style={styles.instructionCard}>
              <Ionicons name="calendar-outline" size={32} color={ORANGE} />
              <Text style={styles.instructionTitle}>Fecha de Vencimiento</Text>
              <Text style={styles.instructionText}>
                Ingresa la fecha de vencimiento de tu nueva licencia. Formato: <Text style={styles.bold}>AAAA-MM-DD</Text>{'\n'}
                Ejemplo: <Text style={styles.bold}>2028-05-15</Text>
              </Text>
            </View>

            <TextInput
              style={styles.dateInput}
              placeholder="2028-05-15"
              value={expiryDate}
              onChangeText={setExpiryDate}
              keyboardType="numeric"
              maxLength={10}
              placeholderTextColor="#9CA3AF"
            />

            {frontPhoto && backPhoto && expiryDate.length === 10 && (
              <View style={styles.summaryCard}>
                <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                <Text style={styles.summaryText}>
                  Todo listo. Se enviará la licencia para revisión.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Footer buttons */}
      <View style={styles.footer}>
        {step > 0 && (
          <TouchableOpacity style={styles.backButton} onPress={() => setStep(s => s - 1)} disabled={submitting}>
            <Ionicons name="arrow-back" size={18} color="#6B7280" />
            <Text style={styles.backButtonText}>Atrás</Text>
          </TouchableOpacity>
        )}

        {step < 2 ? (
          <TouchableOpacity
            style={[styles.nextButton, !canProceed() && styles.buttonDisabled]}
            onPress={() => setStep(s => s + 1)}
            disabled={!canProceed()}
          >
            <Text style={styles.nextButtonText}>Siguiente</Text>
            <Ionicons name="arrow-forward" size={18} color="white" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.submitButton, (!canProceed() || submitting) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canProceed() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color="white" />
                <Text style={styles.submitButtonText}>Enviar Licencia</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: '#111111' },
  headerTitle: { color: 'white', fontWeight: '700', fontSize: 18 },

  content: { padding: 16, paddingBottom: 120 },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 28, paddingHorizontal: 8 },
  stepItem: { alignItems: 'center', flex: 1, position: 'relative' },
  stepCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  stepCircleActive: { backgroundColor: '#F05A28' },
  stepCircleInactive: { backgroundColor: '#E5E7EB', borderWidth: 2, borderColor: '#D1D5DB' },
  stepNumber: { fontSize: 14, fontWeight: '700' },
  stepNumberActive: { color: 'white' },
  stepNumberInactive: { color: '#9CA3AF' },
  stepLabel: { fontSize: 11, marginTop: 4, textAlign: 'center' },
  stepLabelActive: { color: '#F05A28', fontWeight: '600' },
  stepLabelInactive: { color: '#9CA3AF' },
  stepLine: { position: 'absolute', top: 16, left: '60%', right: '-60%', height: 2, zIndex: 0 },
  stepLineActive: { backgroundColor: '#F05A28' },
  stepLineInactive: { backgroundColor: '#E5E7EB' },

  stepContent: { gap: 16 },

  instructionCard: {
    backgroundColor: 'white', borderRadius: 12, padding: 20,
    alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  instructionTitle: { fontSize: 18, fontWeight: '700', color: '#111111' },
  instructionText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  bold: { fontWeight: '700', color: '#111111' },

  photoBox: {
    height: 200, backgroundColor: 'white', borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB',
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { alignItems: 'center', gap: 8 },
  photoPlaceholderText: { color: '#9CA3AF', fontSize: 14 },

  retakeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  retakeText: { color: '#F05A28', fontWeight: '600', fontSize: 14 },

  dateInput: {
    backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    padding: 16, fontSize: 20, fontWeight: '600', color: '#111111', textAlign: 'center',
    letterSpacing: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },

  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#dcfce7', borderRadius: 10, padding: 14,
  },
  summaryText: { flex: 1, color: '#15803d', fontSize: 14, fontWeight: '500' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', padding: 16, gap: 12,
    backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    paddingBottom: 28,
  },
  backButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  backButtonText: { color: '#6B7280', fontWeight: '600', fontSize: 15 },
  nextButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#F05A28', borderRadius: 10, paddingVertical: 14,
  },
  nextButtonText: { color: 'white', fontWeight: '700', fontSize: 15 },
  submitButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#F05A28', borderRadius: 10, paddingVertical: 14,
  },
  submitButtonText: { color: 'white', fontWeight: '700', fontSize: 15 },
  buttonDisabled: { opacity: 0.45 },
});
