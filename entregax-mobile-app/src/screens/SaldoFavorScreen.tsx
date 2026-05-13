// ============================================
// PANTALLA SALDO A FAVOR - MONEDERO DIGITAL B2C
// Sistema de billetera con bonos de referidos
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
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getSecure } from '../services/secureStorage';
import { API_URL } from '../services/api';

// Colores
const SEA_COLOR = '#0097A7';
const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const YELLOW = '#FF9800';

interface WalletSaldo {
  saldo_disponible: number;
  saldo_pendiente: number;
  saldo_total: number;
  moneda: string;
  formatted: {
    disponible: string;
    pendiente: string;
    total: string;
  };
}

interface Transaccion {
  id: number;
  tipo: 'ingreso' | 'egreso' | 'pendiente' | 'liberacion' | 'expiracion';
  monto: number;
  saldo_anterior: number;
  saldo_posterior: number;
  concepto: string;
  referencia_tipo?: string;
  fecha_movimiento: string;
}

interface WalletResumen {
  saldo: WalletSaldo | null;
  ultimasTransacciones: Transaccion[];
  estadisticas: {
    total_ingresos: number;
    total_egresos: number;
    transacciones_este_mes: number;
  };
}

export default function SaldoFavorScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resumen, setResumen] = useState<WalletResumen | null>(null);
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  const fetchWalletData = useCallback(async () => {
    try {
      const token = await getSecure('token');
      if (!token) {
        Alert.alert('Error', 'Sesión expirada');
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      // Obtener resumen de billetera
      const resumenRes = await fetch(`${API_URL}/api/billetera/resumen`, { headers });
      
      if (resumenRes.ok) {
        const data = await resumenRes.json();
        if (data.success) {
          setResumen(data.data);
        }
      }

      // Obtener todas las transacciones
      const txRes = await fetch(`${API_URL}/api/billetera/transacciones?limit=50`, { headers });
      
      if (txRes.ok) {
        const txData = await txRes.json();
        if (txData.success) {
          setTransacciones(txData.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching wallet:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWalletData();
  };

  const formatMoney = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (tipo: string) => {
    switch (tipo) {
      case 'ingreso':
      case 'liberacion':
        return { name: 'arrow-down-circle', color: GREEN };
      case 'egreso':
        return { name: 'arrow-up-circle', color: ORANGE };
      case 'pendiente':
        return { name: 'time', color: YELLOW };
      case 'expiracion':
        return { name: 'close-circle', color: '#999' };
      default:
        return { name: 'swap-horizontal', color: SEA_COLOR };
    }
  };

  const renderTransaction = ({ item }: { item: Transaccion }) => {
    const icon = getTransactionIcon(item.tipo);
    const isPositive = item.tipo === 'ingreso' || item.tipo === 'liberacion';
    
    return (
      <View style={styles.transactionItem}>
        <View style={[styles.transactionIcon, { backgroundColor: `${icon.color}20` }]}>
          <Ionicons name={icon.name as any} size={24} color={icon.color} />
        </View>
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionConcept} numberOfLines={1}>
            {item.concepto}
          </Text>
          <Text style={styles.transactionDate}>{formatDate(item.fecha_movimiento)}</Text>
        </View>
        <Text style={[styles.transactionAmount, { color: isPositive ? GREEN : ORANGE }]}>
          {isPositive ? '+' : '-'}{formatMoney(item.monto)}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={SEA_COLOR} />
          <Text style={styles.loadingText}>Cargando saldo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const saldo = resumen?.saldo;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SEA_COLOR} />
        }
      >
        {/* Header con saldo */}
        <LinearGradient
          colors={[SEA_COLOR, '#00838F']}
          style={styles.balanceCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.balanceLabel}>Saldo Disponible</Text>
          <Text style={styles.balanceAmount}>
            {saldo ? formatMoney(saldo.saldo_disponible) : '$0.00'}
          </Text>
          <Text style={styles.balanceCurrency}>{saldo?.moneda || 'MXN'}</Text>
          
          {saldo && saldo.saldo_pendiente > 0 && (
            <View style={styles.pendingBadge}>
              <Ionicons name="time-outline" size={14} color="#FFF" />
              <Text style={styles.pendingText}>
                {formatMoney(saldo.saldo_pendiente)} pendiente
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* Info cards */}
        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <Ionicons name="trending-up" size={24} color={GREEN} />
            <Text style={styles.infoValue}>
              {formatMoney(resumen?.estadisticas.total_ingresos || 0)}
            </Text>
            <Text style={styles.infoLabel}>Total Ganado</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="cart-outline" size={24} color={ORANGE} />
            <Text style={styles.infoValue}>
              {formatMoney(resumen?.estadisticas.total_egresos || 0)}
            </Text>
            <Text style={styles.infoLabel}>Usado</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="receipt-outline" size={24} color={SEA_COLOR} />
            <Text style={styles.infoValue}>
              {resumen?.estadisticas.transacciones_este_mes || 0}
            </Text>
            <Text style={styles.infoLabel}>Este Mes</Text>
          </View>
        </View>

        {/* Botón de referidos */}
        <TouchableOpacity 
          style={styles.referralBanner}
          onPress={() => navigation.navigate('Referidos')}
        >
          <LinearGradient
            colors={[ORANGE, '#E64A19']}
            style={styles.referralGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.referralContent}>
              <View style={styles.referralIcon}>
                <Ionicons name="gift" size={32} color="#FFF" />
              </View>
              <View style={styles.referralInfo}>
                <Text style={styles.referralTitle}>¡Gana $500 por cada amigo!</Text>
                <Text style={styles.referralSubtitle}>
                  Invita amigos y gana cuando hagan su primer envío
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#FFF" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Sección de transacciones */}
        <View style={styles.transactionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Historial de Movimientos</Text>
            {transacciones.length > 5 && (
              <TouchableOpacity onPress={() => setShowAllTransactions(!showAllTransactions)}>
                <Text style={styles.seeAllText}>
                  {showAllTransactions ? 'Ver menos' : 'Ver todo'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {transacciones.length === 0 ? (
            <View style={styles.emptyTransactions}>
              <Ionicons name="wallet-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>Aún no tienes movimientos</Text>
              <Text style={styles.emptySubtext}>
                Invita amigos y gana saldo cuando hagan su primer envío
              </Text>
            </View>
          ) : (
            <View>
              {(showAllTransactions ? transacciones : transacciones.slice(0, 5)).map((tx) => (
                <View key={tx.id}>
                  {renderTransaction({ item: tx })}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Información de cómo usar el saldo */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>¿Cómo usar mi saldo?</Text>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark-circle" size={20} color={GREEN} />
            <Text style={styles.infoText}>
              Se aplica automáticamente al pagar tus envíos
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark-circle" size={20} color={GREEN} />
            <Text style={styles.infoText}>
              Puedes elegir cuánto saldo aplicar en cada compra
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark-circle" size={20} color={GREEN} />
            <Text style={styles.infoText}>
              Tu saldo no expira mientras tengas actividad
            </Text>
          </View>
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
  
  // Balance card
  balanceCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 4,
  },
  balanceAmount: {
    color: '#FFF',
    fontSize: 42,
    fontWeight: 'bold',
  },
  balanceCurrency: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    marginTop: 4,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  pendingText: {
    color: '#FFF',
    fontSize: 12,
    marginLeft: 4,
  },
  
  // Info cards
  infoCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  
  // Referral banner
  referralBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  referralGradient: {
    padding: 16,
  },
  referralContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  referralIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  referralInfo: {
    flex: 1,
  },
  referralTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  referralSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },
  
  // Transactions section
  transactionsSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  seeAllText: {
    color: SEA_COLOR,
    fontSize: 14,
    fontWeight: '500',
  },
  
  // Transaction item
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionConcept: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: '#999',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Empty state
  emptyTransactions: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  
  // Info section
  infoSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    flex: 1,
  },
});
