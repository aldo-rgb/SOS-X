// ============================================
// PANTALLA DE REFERIDOS
// Compartir código y ver referidos
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Share,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../services/api';

// Colores
const SEA_COLOR = '#0097A7';
const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const YELLOW = '#FF9800';

interface ReferidoData {
  codigo: string;
  share_link: string;
  share_message: string;
  bonos: {
    al_referir: number;
    al_registrarse: number;
    moneda: string;
    condicion: string;
  };
}

interface MisReferidos {
  codigo: string;
  estadisticas: {
    total_referidos: number;
    validados: number;
    pendientes: number;
    rechazados: number;
    total_ganado: number;
  };
  referidos: Array<{
    id: number;
    nombre: string;
    estado: string;
    fecha_registro: Date;
    bono_ganado: number;
  }>;
}

export default function ReferidosScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [referidoData, setReferidoData] = useState<ReferidoData | null>(null);
  const [misReferidos, setMisReferidos] = useState<MisReferidos | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('Error', 'Sesión expirada');
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      // Obtener código y datos del programa
      const [codigoRes, referidosRes] = await Promise.all([
        fetch(`${API_URL}/api/referidos/mi-codigo`, { headers }),
        fetch(`${API_URL}/api/referidos/mis-referidos`, { headers }),
      ]);

      if (codigoRes.ok) {
        const data = await codigoRes.json();
        if (data.success) {
          setReferidoData(data.data);
        }
      }

      if (referidosRes.ok) {
        const data = await referidosRes.json();
        if (data.success) {
          setMisReferidos(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching referral data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const copyCode = () => {
    if (referidoData?.codigo) {
      Clipboard.setString(referidoData.codigo);
      Alert.alert('✅ Copiado', 'Tu código ha sido copiado al portapapeles');
    }
  };

  const shareCode = async () => {
    if (!referidoData) return;

    try {
      await Share.share({
        message: referidoData.share_message,
        title: '¡Te invito a EntregaX!',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const formatDate = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'validado':
        return { bg: GREEN, text: 'Completado', icon: 'checkmark-circle' };
      case 'registrado':
      case 'primer_pago':
        return { bg: YELLOW, text: 'Pendiente', icon: 'time' };
      case 'rechazado':
        return { bg: '#F44336', text: 'No válido', icon: 'close-circle' };
      default:
        return { bg: '#999', text: estado, icon: 'help-circle' };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={SEA_COLOR} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stats = misReferidos?.estadisticas;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SEA_COLOR} />
        }
      >
        {/* Header con código */}
        <LinearGradient
          colors={[ORANGE, '#E64A19']}
          style={styles.headerCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.giftIcon}>
            <Ionicons name="gift" size={40} color="#FFF" />
          </View>
          <Text style={styles.headerTitle}>¡Gana $500 por cada amigo!</Text>
          <Text style={styles.headerSubtitle}>
            Comparte tu código y gana cuando hagan su primer envío
          </Text>
          
          {/* Código para compartir */}
          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>Tu código de referido</Text>
            <TouchableOpacity style={styles.codeBox} onPress={copyCode} activeOpacity={0.8}>
              <Text style={styles.codeText}>{referidoData?.codigo || '---'}</Text>
              <Ionicons name="copy-outline" size={24} color={ORANGE} />
            </TouchableOpacity>
          </View>

          {/* Botón compartir */}
          <TouchableOpacity style={styles.shareButton} onPress={shareCode}>
            <Ionicons name="share-social" size={20} color="#FFF" />
            <Text style={styles.shareButtonText}>Compartir con amigos</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Estadísticas */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_referidos || 0}</Text>
            <Text style={styles.statLabel}>Invitados</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.validados || 0}</Text>
            <Text style={styles.statLabel}>Completados</Text>
          </View>
          <View style={[styles.statCard, styles.statCardHighlight]}>
            <Text style={[styles.statValue, { color: GREEN }]}>
              ${(stats?.total_ganado || 0).toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>Ganado</Text>
          </View>
        </View>

        {/* Cómo funciona */}
        <View style={styles.howItWorksCard}>
          <Text style={styles.sectionTitle}>¿Cómo funciona?</Text>
          
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Comparte tu código</Text>
              <Text style={styles.stepDescription}>
                Envía tu código {referidoData?.codigo} a familiares y amigos
              </Text>
            </View>
          </View>

          <View style={styles.stepLine} />

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Se registran con tu código</Text>
              <Text style={styles.stepDescription}>
                Tus amigos crean su cuenta usando tu código de referido
              </Text>
            </View>
          </View>

          <View style={styles.stepLine} />

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Hacen su primer envío</Text>
              <Text style={styles.stepDescription}>
                {referidoData?.bonos.condicion || 'Al hacer su primer envío de más de $1,000'}
              </Text>
            </View>
          </View>

          <View style={styles.stepLine} />

          <View style={styles.step}>
            <View style={[styles.stepNumber, { backgroundColor: GREEN }]}>
              <Ionicons name="checkmark" size={16} color="#FFF" />
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>¡Tú ganas!</Text>
              <Text style={styles.stepDescription}>
                Ganas ${referidoData?.bonos.al_referir || 500} MXN de saldo a favor cuando tu amigo haga su primer envío
              </Text>
            </View>
          </View>
        </View>

        {/* Lista de referidos */}
        {misReferidos && misReferidos.referidos.length > 0 && (
          <View style={styles.referidosListCard}>
            <Text style={styles.sectionTitle}>Tus Referidos</Text>
            
            {misReferidos.referidos.map((ref) => {
              const badge = getEstadoBadge(ref.estado);
              return (
                <View key={ref.id} style={styles.referidoItem}>
                  <View style={styles.referidoAvatar}>
                    <Text style={styles.referidoInitial}>
                      {ref.nombre?.charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>
                  <View style={styles.referidoInfo}>
                    <Text style={styles.referidoName}>{ref.nombre}</Text>
                    <Text style={styles.referidoDate}>{formatDate(ref.fecha_registro)}</Text>
                  </View>
                  <View style={[styles.estadoBadge, { backgroundColor: `${badge.bg}20` }]}>
                    <Ionicons name={badge.icon as any} size={14} color={badge.bg} />
                    <Text style={[styles.estadoText, { color: badge.bg }]}>{badge.text}</Text>
                  </View>
                  {ref.bono_ganado > 0 && (
                    <Text style={styles.bonoGanado}>+${ref.bono_ganado}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Mensaje si no tiene referidos */}
        {(!misReferidos || misReferidos.referidos.length === 0) && (
          <View style={styles.emptyReferidos}>
            <Ionicons name="people-outline" size={48} color="#CCC" />
            <Text style={styles.emptyTitle}>Aún no tienes referidos</Text>
            <Text style={styles.emptySubtitle}>
              Comparte tu código y empieza a ganar con cada amigo que invite
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={shareCode}>
              <Ionicons name="share-social" size={18} color="#FFF" />
              <Text style={styles.emptyButtonText}>Invitar amigos ahora</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Términos y condiciones */}
        <View style={styles.termsSection}>
          <Text style={styles.termsTitle}>Términos del programa</Text>
          <Text style={styles.termsText}>
            • Los bonos se acreditan cuando el referido completa su primer envío de más de ${referidoData?.bonos.condicion ? '' : '$1,000 MXN'}{'\n'}
            • El saldo a favor no tiene fecha de expiración mientras mantengas actividad{'\n'}
            • Puedes usar tu saldo para pagar total o parcialmente tus envíos{'\n'}
            • EntregaX se reserva el derecho de modificar los términos del programa
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },

  // Header card
  headerCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  giftIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  codeContainer: {
    width: '100%',
    marginBottom: 16,
  },
  codeLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  codeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: ORANGE,
    letterSpacing: 4,
    marginRight: 12,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  shareButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statCardHighlight: {
    borderWidth: 2,
    borderColor: GREEN,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },

  // How it works
  howItWorksCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: SEA_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  stepDescription: {
    fontSize: 13,
    color: '#666',
  },
  stepLine: {
    width: 2,
    height: 24,
    backgroundColor: '#E0E0E0',
    marginLeft: 13,
    marginVertical: 8,
  },

  // Referidos list
  referidosListCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  referidoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  referidoAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SEA_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  referidoInitial: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  referidoInfo: {
    flex: 1,
  },
  referidoName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  referidoDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  estadoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  estadoText: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 4,
  },
  bonoGanado: {
    fontSize: 14,
    fontWeight: 'bold',
    color: GREEN,
    marginLeft: 8,
  },

  // Empty state
  emptyReferidos: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORANGE,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  emptyButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },

  // Terms
  termsSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  termsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  termsText: {
    fontSize: 12,
    color: '#999',
    lineHeight: 20,
  },
});
