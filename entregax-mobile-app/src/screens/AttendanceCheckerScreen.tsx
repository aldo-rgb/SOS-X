import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import api from '../services/api';

interface AttendanceRecord {
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_address: string | null;
  check_out_address: string | null;
  status: string | null;
}

export default function AttendanceCheckerScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [locationError, setLocationError] = useState<string | null>(null);

  // Actualizar reloj cada segundo
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cargar estado de asistencia
  const loadAttendanceStatus = useCallback(async () => {
    try {
      const response = await api.get('/hr/my-attendance');
      // Backend devuelve la fila directamente o {checkedIn:false} si no hay registro
      const data = response.data;
      if (data && data.check_in_time) {
        setTodayAttendance(data);
      } else {
        setTodayAttendance(null);
      }
    } catch (error) {
      console.error('Error cargando estado de asistencia:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAttendanceStatus();
  }, [loadAttendanceStatus]);

  // Abrir ajustes del sistema para conceder permisos manualmente
  const openAppSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  // Solicitar permiso (con fallback a Ajustes si fue denegado de forma permanente)
  const ensureLocationPermission = async (): Promise<boolean> => {
    let { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') return true;

    if (canAskAgain) {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status === 'granted') {
        setLocationError(null);
        return true;
      }
      status = req.status;
      canAskAgain = req.canAskAgain;
    }

    setLocationError('Necesitas permitir el acceso a tu ubicación');
    Alert.alert(
      'Permiso de ubicación requerido',
      'Para registrar tu entrada/salida necesitamos acceder a tu ubicación. Abre Ajustes y concede el permiso.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Ajustes', onPress: openAppSettings },
      ]
    );
    return false;
  };

  // Obtener ubicación actual
  const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const ok = await ensureLocationPermission();
      if (!ok) return null;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('Error obteniendo ubicación:', error);
      setLocationError('No se pudo obtener tu ubicación. Verifica que el GPS esté activo.');
      return null;
    }
  };

  // Registrar entrada
  const handleCheckIn = async () => {
    setChecking(true);
    setLocationError(null);

    try {
      const location = await getCurrentLocation();
      if (!location) {
        setChecking(false);
        return;
      }

      const response = await api.post('/hr/check-in', {
        lat: location.latitude,
        lng: location.longitude,
      });

      Alert.alert(
        '✅ Entrada Registrada',
        response.data?.message || `Hora: ${response.data?.time || ''}`,
        [{ text: 'OK' }]
      );

      loadAttendanceStatus();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al registrar entrada';
      Alert.alert('Error', message);
    } finally {
      setChecking(false);
    }
  };

  // Registrar salida
  const handleCheckOut = async () => {
    Alert.alert(
      'Confirmar Salida',
      '¿Estás seguro de que deseas registrar tu salida?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setChecking(true);
            setLocationError(null);

            try {
              const location = await getCurrentLocation();
              if (!location) {
                setChecking(false);
                return;
              }

              const response = await api.post('/hr/check-out', {
                lat: location.latitude,
                lng: location.longitude,
              });

              Alert.alert(
                '👋 Salida Registrada',
                response.data?.message || `Hora: ${response.data?.time || ''}`,
                [{ text: 'OK' }]
              );

              loadAttendanceStatus();
            } catch (error: any) {
              const message = error.response?.data?.error || 'Error al registrar salida';
              Alert.alert('Error', message);
            } finally {
              setChecking(false);
            }
          },
        },
      ]
    );
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isCheckedIn = todayAttendance?.check_in_time && !todayAttendance?.check_out_time;
  const isCheckedOut = todayAttendance?.check_in_time && todayAttendance?.check_out_time;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#C1272D" />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Asistencia</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadAttendanceStatus();
            }}
            colors={['#C1272D']}
          />
        }
      >
        {/* Reloj */}
        <View style={styles.clockContainer}>
          <Text style={styles.time}>{formatTime(currentTime)}</Text>
          <Text style={styles.date}>{formatDate(currentTime)}</Text>
        </View>

        {/* Estado actual */}
        <View style={[
          styles.statusCard,
          isCheckedIn && styles.statusCardActive,
          isCheckedOut && styles.statusCardComplete
        ]}>
          <Ionicons
            name={isCheckedOut ? 'checkmark-done-circle' : isCheckedIn ? 'time' : 'alert-circle'}
            size={48}
            color={isCheckedOut ? '#4CAF50' : isCheckedIn ? '#2196F3' : '#FF9800'}
          />
          <Text style={styles.statusText}>
            {isCheckedOut
              ? 'Jornada Completada'
              : isCheckedIn
              ? 'Trabajando...'
              : 'Sin Registrar Entrada'
            }
          </Text>
          {isCheckedIn && !isCheckedOut && todayAttendance?.check_in_time && (
            <Text style={styles.statusDetail}>
              Entraste a las {new Date(todayAttendance.check_in_time).toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
          {isCheckedOut && todayAttendance?.check_in_time && todayAttendance?.check_out_time && (
            <Text style={styles.statusDetail}>
              Trabajaste {((new Date(todayAttendance.check_out_time).getTime() - new Date(todayAttendance.check_in_time).getTime()) / 3600000).toFixed(2)} horas hoy
            </Text>
          )}
        </View>

        {/* Botones de Check In / Check Out */}
        {!isCheckedOut && (
          <View style={styles.buttonContainer}>
            {!isCheckedIn ? (
              <TouchableOpacity
                style={[styles.checkInButton, checking && styles.buttonDisabled]}
                onPress={handleCheckIn}
                disabled={checking}
              >
                {checking ? (
                  <ActivityIndicator color="#fff" size="large" />
                ) : (
                  <>
                    <Ionicons name="finger-print" size={48} color="#fff" />
                    <Text style={styles.buttonText}>REGISTRAR ENTRADA</Text>
                    <Text style={styles.buttonSubtext}>Presiona para marcar tu entrada</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.checkOutButton, checking && styles.buttonDisabled]}
                onPress={handleCheckOut}
                disabled={checking}
              >
                {checking ? (
                  <ActivityIndicator color="#fff" size="large" />
                ) : (
                  <>
                    <Ionicons name="exit" size={48} color="#fff" />
                    <Text style={styles.buttonText}>REGISTRAR SALIDA</Text>
                    <Text style={styles.buttonSubtext}>Presiona para marcar tu salida</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Error de ubicación */}
        {locationError && (
          <TouchableOpacity style={styles.errorCard} onPress={ensureLocationPermission} activeOpacity={0.8}>
            <Ionicons name="warning" size={24} color="#C1272D" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.errorText}>{locationError}</Text>
              <Text style={styles.errorHint}>Toca para conceder permiso ▸</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Información del registro */}
        {todayAttendance && (
          <View style={styles.recordCard}>
            <Text style={styles.recordTitle}>Registro de Hoy</Text>
            
            <View style={styles.recordRow}>
              <Ionicons name="log-in" size={20} color="#4CAF50" />
              <Text style={styles.recordLabel}>Entrada:</Text>
              <Text style={styles.recordValue}>
                {todayAttendance.check_in_time
                  ? new Date(todayAttendance.check_in_time).toLocaleTimeString('es-MX')
                  : '—'}
              </Text>
            </View>

            <View style={styles.recordRow}>
              <Ionicons name="log-out" size={20} color="#F44336" />
              <Text style={styles.recordLabel}>Salida:</Text>
              <Text style={styles.recordValue}>
                {todayAttendance.check_out_time
                  ? new Date(todayAttendance.check_out_time).toLocaleTimeString('es-MX')
                  : '—'}
              </Text>
            </View>

            <View style={styles.recordRow}>
              <Ionicons name="location" size={20} color="#2196F3" />
              <Text style={styles.recordLabel}>Ubicación:</Text>
              <Text style={styles.recordValue} numberOfLines={2}>
                {todayAttendance.check_in_address || todayAttendance.check_out_address || 'Fuera de oficina'}
              </Text>
            </View>
          </View>
        )}

        {/* Nota informativa */}
        <View style={styles.noteCard}>
          <Ionicons name="information-circle" size={20} color="#666" />
          <Text style={styles.noteText}>
            Tu ubicación es verificada automáticamente al registrar entrada/salida.
            Debes estar dentro del rango establecido para personal de mostrador y almacén.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
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
  clockContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  time: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
    fontVariant: ['tabular-nums'],
  },
  date: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  statusCard: {
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  statusCardActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  statusCardComplete: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  statusDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  buttonContainer: {
    marginBottom: 24,
  },
  checkInButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  checkOutButton: {
    backgroundColor: '#F44336',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#F44336',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
  },
  buttonSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  errorCard: {
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#C1272D',
  },
  errorHint: {
    fontSize: 12,
    color: '#C1272D',
    fontWeight: '700',
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  recordCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recordTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  recordLabel: {
    fontSize: 14,
    color: '#666',
    width: 70,
  },
  recordValue: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  noteCard: {
    backgroundColor: '#ECEFF1',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
});
