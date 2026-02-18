import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';

interface Vehicle {
  id: number;
  economic_number: string;
  vehicle_type: string;
  brand: string;
  model: string;
  year: number;
  license_plates: string;
  current_mileage: number;
  photo_url: string | null;
}

interface InspectionData {
  vehicle_id: number | null;
  reported_mileage: string;
  odometer_photo_url: string;
  front_photo_url: string;
  back_photo_url: string;
  left_photo_url: string;
  right_photo_url: string;
  cabin_photo_url: string;
  is_cabin_clean: boolean;
  has_new_damage: boolean;
  damage_notes: string;
}

type PhotoField = 'odometer_photo_url' | 'front_photo_url' | 'back_photo_url' | 'left_photo_url' | 'right_photo_url' | 'cabin_photo_url';

const PHOTO_LABELS: Record<PhotoField, string> = {
  odometer_photo_url: '📸 Odómetro',
  front_photo_url: '🚗 Frente',
  back_photo_url: '🚗 Trasera',
  left_photo_url: '🚗 Lado Izquierdo',
  right_photo_url: '🚗 Lado Derecho',
  cabin_photo_url: '🪑 Cabina',
};

const STEPS = [
  { title: 'Seleccionar Vehículo', subtitle: 'Elige tu unidad asignada' },
  { title: 'Odómetro', subtitle: 'Registra el kilometraje actual' },
  { title: 'Exterior', subtitle: 'Fotos de las 4 caras del vehículo' },
  { title: 'Cabina', subtitle: 'Estado interior del vehículo' },
  { title: 'Declaración', subtitle: 'Reporte de daños o incidentes' },
];

export default function VehicleInspectionScreen({ navigation }: any) {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [alreadyInspected, setAlreadyInspected] = useState(false);
  const [inspectionData, setInspectionData] = useState<InspectionData>({
    vehicle_id: null,
    reported_mileage: '',
    odometer_photo_url: '',
    front_photo_url: '',
    back_photo_url: '',
    left_photo_url: '',
    right_photo_url: '',
    cabin_photo_url: '',
    is_cabin_clean: true,
    has_new_damage: false,
    damage_notes: '',
  });

  useEffect(() => {
    loadVehiclesAndCheckInspection();
  }, []);

  const loadVehiclesAndCheckInspection = async () => {
    setLoading(true);
    try {
      // Cargar vehículos disponibles
      const vehiclesRes = await api.get('/api/fleet/available-vehicles');
      setVehicles(vehiclesRes.data.vehicles || []);

      // Verificar si ya hizo inspección hoy
      const checkRes = await api.get('/api/fleet/inspection/check-today');
      if (checkRes.data.already_inspected) {
        setAlreadyInspected(true);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectVehicle = (vehicle: Vehicle) => {
    setInspectionData({
      ...inspectionData,
      vehicle_id: vehicle.id,
      reported_mileage: vehicle.current_mileage?.toString() || '',
    });
    setCurrentStep(1);
  };

  const takePhoto = async (field: PhotoField) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara para tomar fotos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      // En producción, aquí subirías la imagen a un servidor
      // Por ahora guardamos la URI local
      setInspectionData({
        ...inspectionData,
        [field]: result.assets[0].uri,
      });
    }
  };

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 0:
        return inspectionData.vehicle_id !== null;
      case 1:
        return inspectionData.reported_mileage !== '' && inspectionData.odometer_photo_url !== '';
      case 2:
        return (
          inspectionData.front_photo_url !== '' &&
          inspectionData.back_photo_url !== '' &&
          inspectionData.left_photo_url !== '' &&
          inspectionData.right_photo_url !== ''
        );
      case 3:
        return inspectionData.cabin_photo_url !== '';
      case 4:
        return !inspectionData.has_new_damage || inspectionData.damage_notes.trim() !== '';
      default:
        return true;
    }
  }, [currentStep, inspectionData]);

  const handleNext = () => {
    if (!canProceed()) {
      Alert.alert('Información incompleta', 'Por favor completa todos los campos requeridos');
      return;
    }
    
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // En producción, primero subirías las fotos a un servidor
      // y luego enviarías las URLs
      await api.post('/api/fleet/inspection', {
        vehicle_id: inspectionData.vehicle_id,
        reported_mileage: parseInt(inspectionData.reported_mileage),
        odometer_photo_url: inspectionData.odometer_photo_url,
        front_photo_url: inspectionData.front_photo_url,
        back_photo_url: inspectionData.back_photo_url,
        left_photo_url: inspectionData.left_photo_url,
        right_photo_url: inspectionData.right_photo_url,
        cabin_photo_url: inspectionData.cabin_photo_url,
        is_cabin_clean: inspectionData.is_cabin_clean,
        has_new_damage: inspectionData.has_new_damage,
        damage_notes: inspectionData.damage_notes,
      });

      Alert.alert(
        '✅ Inspección Completada',
        'Tu inspección diaria ha sido registrada. ¡Puedes iniciar tu ruta!',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'No se pudo enviar la inspección');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STEPS.map((step, index) => (
        <View key={index} style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              index === currentStep && styles.stepCircleActive,
              index < currentStep && styles.stepCircleCompleted,
            ]}
          >
            {index < currentStep ? (
              <MaterialIcons name="check" size={16} color="#FFF" />
            ) : (
              <Text style={[styles.stepNumber, index === currentStep && styles.stepNumberActive]}>
                {index + 1}
              </Text>
            )}
          </View>
          {index < STEPS.length - 1 && (
            <View style={[styles.stepLine, index < currentStep && styles.stepLineCompleted]} />
          )}
        </View>
      ))}
    </View>
  );

  const renderPhotoButton = (field: PhotoField, label: string) => (
    <TouchableOpacity
      style={[styles.photoButton, inspectionData[field] ? styles.photoButtonTaken : {}]}
      onPress={() => takePhoto(field)}
    >
      {inspectionData[field] ? (
        <Image source={{ uri: inspectionData[field] }} style={styles.photoPreview} />
      ) : (
        <>
          <MaterialIcons name="camera-alt" size={32} color="#F05A28" />
          <Text style={styles.photoButtonText}>{label}</Text>
        </>
      )}
      {inspectionData[field] && (
        <View style={styles.photoCheck}>
          <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
        </View>
      )}
    </TouchableOpacity>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Seleccionar Vehículo
        return (
          <View style={styles.stepContent}>
            <Text style={styles.instruction}>
              Selecciona el vehículo que usarás hoy:
            </Text>
            {vehicles.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="local-shipping" size={64} color="#DDD" />
                <Text style={styles.emptyText}>No tienes vehículos asignados</Text>
              </View>
            ) : (
              vehicles.map((vehicle) => (
                <TouchableOpacity
                  key={vehicle.id}
                  style={[
                    styles.vehicleCard,
                    inspectionData.vehicle_id === vehicle.id && styles.vehicleCardSelected,
                  ]}
                  onPress={() => selectVehicle(vehicle)}
                >
                  <View style={styles.vehicleIcon}>
                    <MaterialIcons
                      name={
                        vehicle.vehicle_type === 'Motocicleta'
                          ? 'two-wheeler'
                          : vehicle.vehicle_type === 'Tráiler'
                          ? 'local-shipping'
                          : 'directions-car'
                      }
                      size={40}
                      color="#F05A28"
                    />
                  </View>
                  <View style={styles.vehicleInfo}>
                    <Text style={styles.vehicleNumber}>{vehicle.economic_number}</Text>
                    <Text style={styles.vehicleDetails}>
                      {vehicle.brand} {vehicle.model} {vehicle.year}
                    </Text>
                    <Text style={styles.vehiclePlates}>Placas: {vehicle.license_plates}</Text>
                    <Text style={styles.vehicleMileage}>
                      Último km: {vehicle.current_mileage?.toLocaleString()}
                    </Text>
                  </View>
                  {inspectionData.vehicle_id === vehicle.id && (
                    <MaterialIcons name="check-circle" size={28} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        );

      case 1: // Odómetro
        return (
          <View style={styles.stepContent}>
            <Text style={styles.instruction}>
              Toma una foto clara del odómetro y registra el kilometraje:
            </Text>
            
            <View style={styles.mileageInput}>
              <Text style={styles.inputLabel}>Kilometraje actual:</Text>
              <TextInput
                style={styles.textInput}
                value={inspectionData.reported_mileage}
                onChangeText={(text) =>
                  setInspectionData({ ...inspectionData, reported_mileage: text.replace(/[^0-9]/g, '') })
                }
                keyboardType="numeric"
                placeholder="Ej: 45230"
              />
              <Text style={styles.kmLabel}>km</Text>
            </View>

            <View style={styles.singlePhotoContainer}>
              {renderPhotoButton('odometer_photo_url', '📸 Foto del Odómetro')}
            </View>

            <Text style={styles.hint}>
              💡 Asegúrate de que los números sean legibles en la foto
            </Text>
          </View>
        );

      case 2: // Exterior
        return (
          <View style={styles.stepContent}>
            <Text style={styles.instruction}>
              Toma fotos de las 4 caras exteriores del vehículo:
            </Text>
            
            <View style={styles.photoGrid}>
              {renderPhotoButton('front_photo_url', '🚗 Frente')}
              {renderPhotoButton('back_photo_url', '🚗 Trasera')}
              {renderPhotoButton('left_photo_url', '🚗 Lado Izquierdo')}
              {renderPhotoButton('right_photo_url', '🚗 Lado Derecho')}
            </View>

            <Text style={styles.hint}>
              💡 Incluye la placa visible en las fotos de frente y trasera
            </Text>
          </View>
        );

      case 3: // Cabina
        return (
          <View style={styles.stepContent}>
            <Text style={styles.instruction}>
              Toma una foto del interior de la cabina:
            </Text>

            <View style={styles.singlePhotoContainer}>
              {renderPhotoButton('cabin_photo_url', '🪑 Interior de Cabina')}
            </View>

            <Text style={styles.checkboxLabel}>¿La cabina está limpia y ordenada?</Text>
            <View style={styles.checkboxRow}>
              <TouchableOpacity
                style={[styles.checkboxOption, inspectionData.is_cabin_clean && styles.checkboxSelected]}
                onPress={() => setInspectionData({ ...inspectionData, is_cabin_clean: true })}
              >
                <MaterialIcons
                  name={inspectionData.is_cabin_clean ? 'check-circle' : 'radio-button-unchecked'}
                  size={24}
                  color={inspectionData.is_cabin_clean ? '#4CAF50' : '#999'}
                />
                <Text style={styles.checkboxText}>Sí, está limpia</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.checkboxOption, !inspectionData.is_cabin_clean && styles.checkboxSelected]}
                onPress={() => setInspectionData({ ...inspectionData, is_cabin_clean: false })}
              >
                <MaterialIcons
                  name={!inspectionData.is_cabin_clean ? 'check-circle' : 'radio-button-unchecked'}
                  size={24}
                  color={!inspectionData.is_cabin_clean ? '#F44336' : '#999'}
                />
                <Text style={styles.checkboxText}>No, requiere limpieza</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 4: // Declaración de daños
        return (
          <View style={styles.stepContent}>
            <Text style={styles.instruction}>
              ¿El vehículo presenta algún daño nuevo?
            </Text>

            <View style={styles.checkboxRow}>
              <TouchableOpacity
                style={[
                  styles.damageOption,
                  !inspectionData.has_new_damage && styles.damageOptionSelected,
                ]}
                onPress={() =>
                  setInspectionData({ ...inspectionData, has_new_damage: false, damage_notes: '' })
                }
              >
                <MaterialIcons name="check-circle" size={48} color="#4CAF50" />
                <Text style={styles.damageOptionText}>Sin daños nuevos</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.damageOption,
                  inspectionData.has_new_damage && styles.damageOptionSelectedDanger,
                ]}
                onPress={() => setInspectionData({ ...inspectionData, has_new_damage: true })}
              >
                <MaterialIcons name="warning" size={48} color="#F44336" />
                <Text style={styles.damageOptionText}>Reportar daño</Text>
              </TouchableOpacity>
            </View>

            {inspectionData.has_new_damage && (
              <View style={styles.damageNotesContainer}>
                <Text style={styles.inputLabel}>Describe el daño encontrado:</Text>
                <TextInput
                  style={styles.textAreaInput}
                  value={inspectionData.damage_notes}
                  onChangeText={(text) => setInspectionData({ ...inspectionData, damage_notes: text })}
                  placeholder="Ej: Rayón en puerta derecha, faro trasero roto..."
                  multiline
                  numberOfLines={4}
                />
              </View>
            )}

            <View style={styles.declarationBox}>
              <MaterialIcons name="info" size={24} color="#2196F3" />
              <Text style={styles.declarationText}>
                Al enviar esta inspección, declaro que la información proporcionada es verídica y
                refleja el estado actual del vehículo.
              </Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F05A28" />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (alreadyInspected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.completedContainer}>
          <MaterialIcons name="check-circle" size={100} color="#4CAF50" />
          <Text style={styles.completedTitle}>¡Inspección Completada!</Text>
          <Text style={styles.completedSubtitle}>
            Ya realizaste tu inspección diaria. Puedes continuar con tu ruta.
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <MaterialIcons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inspección Diaria</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Step Title */}
      <View style={styles.stepTitleContainer}>
        <Text style={styles.stepTitle}>{STEPS[currentStep].title}</Text>
        <Text style={styles.stepSubtitle}>{STEPS[currentStep].subtitle}</Text>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {renderStepContent()}
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.navigation}>
        <TouchableOpacity style={styles.navButtonSecondary} onPress={handleBack}>
          <MaterialIcons name="arrow-back" size={20} color="#666" />
          <Text style={styles.navButtonSecondaryText}>
            {currentStep === 0 ? 'Cancelar' : 'Atrás'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButtonPrimary, !canProceed() && styles.navButtonDisabled]}
          onPress={handleNext}
          disabled={!canProceed() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Text style={styles.navButtonPrimaryText}>
                {currentStep === STEPS.length - 1 ? 'Enviar Inspección' : 'Siguiente'}
              </Text>
              <MaterialIcons
                name={currentStep === STEPS.length - 1 ? 'send' : 'arrow-forward'}
                size={20}
                color="#FFF"
              />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  completedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  completedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginTop: 24,
  },
  completedSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },
  backButton: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: '#F05A28',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: '#FFF',
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: '#F05A28',
  },
  stepCircleCompleted: {
    backgroundColor: '#4CAF50',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  stepNumberActive: {
    color: '#FFF',
  },
  stepLine: {
    width: 24,
    height: 2,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 4,
  },
  stepLineCompleted: {
    backgroundColor: '#4CAF50',
  },
  stepTitleContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  stepContent: {
    padding: 16,
  },
  instruction: {
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
    lineHeight: 22,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  vehicleCardSelected: {
    borderColor: '#F05A28',
    backgroundColor: '#FFF5F2',
  },
  vehicleIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF5F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  vehicleDetails: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  vehiclePlates: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  vehicleMileage: {
    fontSize: 13,
    color: '#F05A28',
    fontWeight: '600',
    marginTop: 4,
  },
  mileageInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginHorizontal: 12,
    textAlign: 'center',
  },
  kmLabel: {
    fontSize: 16,
    color: '#666',
  },
  singlePhotoContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  photoButton: {
    width: '48%',
    aspectRatio: 4 / 3,
    backgroundColor: '#FFF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  photoButtonTaken: {
    borderColor: '#4CAF50',
    borderStyle: 'solid',
  },
  photoButtonText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  photoCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  hint: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  checkboxOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  checkboxSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8E9',
  },
  checkboxText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
  },
  damageOption: {
    flex: 1,
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginHorizontal: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  damageOptionSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  damageOptionSelectedDanger: {
    borderColor: '#F44336',
    backgroundColor: '#FFEBEE',
  },
  damageOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    textAlign: 'center',
  },
  damageNotesContainer: {
    marginTop: 24,
  },
  textAreaInput: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
    textAlignVertical: 'top',
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  declarationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  declarationText: {
    flex: 1,
    fontSize: 13,
    color: '#1976D2',
    marginLeft: 12,
    lineHeight: 20,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  navButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  navButtonSecondaryText: {
    fontSize: 16,
    color: '#666',
    marginLeft: 8,
  },
  navButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F05A28',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  navButtonDisabled: {
    backgroundColor: '#CCC',
  },
  navButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginRight: 8,
  },
});
