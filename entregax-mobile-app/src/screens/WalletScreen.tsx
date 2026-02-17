// ============================================
// PANTALLA MI MONEDERO - WALLET B2B
// Sistema financiero con CLABE virtual y crédito
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
  Modal,
  TextInput,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../services/api';

// Colores
const SEA_COLOR = '#0097A7';
const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const RED = '#F44336';
const YELLOW = '#FF9800';

interface WalletStatus {
  wallet_balance: number;
  virtual_clabe: string | null;
  has_credit: boolean;
  credit_limit: number;
  used_credit: number;
  available_credit: number;
  credit_days: number;
  is_credit_blocked: boolean;
  pending_invoices: CreditInvoice[];
  total_pending: number;
}

interface CreditInvoice {
  id: number;
  invoice_number: string;
  amount: number;
  amount_paid: number;
  pending_amount: number;
  due_date: string;
  status: string;
  is_overdue: boolean;
}

interface Transaction {
  id: number;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  reference_id: string;
  created_at: string;
}

export default function WalletScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const fetchWalletData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('Error', 'Sesión expirada, inicia sesión nuevamente');
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      const [walletRes, txRes] = await Promise.all([
        fetch(`${API_URL}/api/wallet/status`, { headers }),
        fetch(`${API_URL}/api/wallet/transactions?limit=20`, { headers }),
      ]);

      const walletData = await walletRes.json();
      const txData = await txRes.json();

      if (walletRes.ok) {
        setWallet(walletData);
      }
      if (txRes.ok) {
        setTransactions(txData.transactions || []);
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

  const copyClabe = () => {
    if (wallet?.virtual_clabe) {
      Clipboard.setString(wallet.virtual_clabe);
      Alert.alert('✅ Copiado', 'CLABE copiada al portapapeles');
    }
  };

  const handlePayCredit = async () => {
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Ingresa un monto válido');
      return;
    }

    if (!wallet || amount > wallet.wallet_balance) {
      Alert.alert('Error', 'Saldo insuficiente en monedero');
      return;
    }

    if (amount > wallet.used_credit) {
      Alert.alert('Error', 'El monto excede tu deuda actual');
      return;
    }

    try {
      setPaying(true);
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/wallet/pay-credit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      });

      const data = await response.json();
      if (response.ok) {
        Alert.alert('✅ Éxito', `Se aplicaron $${amount.toFixed(2)} MXN a tu línea de crédito`);
        setShowPayModal(false);
        setPayAmount('');
        fetchWalletData();
      } else {
        Alert.alert('Error', data.error || 'Error al procesar pago');
      }
    } catch (error: any) {
      Alert.alert('Error', 'Error de conexión');
    } finally {
      setPaying(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit_spei':
        return { name: 'arrow-down-circle', color: GREEN };
      case 'deposit_card':
        return { name: 'card', color: GREEN };
      case 'payment_wallet':
        return { name: 'arrow-up-circle', color: RED };
      case 'payment_credit':
        return { name: 'trending-up', color: ORANGE };
      case 'credit_settlement':
        return { name: 'checkmark-circle', color: SEA_COLOR };
      case 'refund':
        return { name: 'refresh-circle', color: YELLOW };
      default:
        return { name: 'swap-horizontal', color: '#666' };
    }
  };

  const getTransactionLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      deposit_spei: 'Depósito SPEI',
      deposit_card: 'Pago con Tarjeta',
      deposit_cash: 'Depósito Efectivo',
      payment_wallet: 'Pago con Monedero',
      payment_credit: 'Uso de Crédito',
      credit_settlement: 'Pago de Crédito',
      refund: 'Devolución',
      adjustment: 'Ajuste',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={SEA_COLOR} />
          <Text style={styles.loadingText}>Cargando tu monedero...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mi Monedero</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[SEA_COLOR]} />
        }
      >
        {/* Alerta de bloqueo */}
        {wallet?.is_credit_blocked && (
          <View style={styles.blockedBanner}>
            <Ionicons name="warning" size={24} color="#fff" />
            <Text style={styles.blockedText}>
              Tu cuenta está bloqueada por adeudos vencidos. Fondea tu monedero para regularizarte.
            </Text>
          </View>
        )}

        {/* Tarjeta de Saldo */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Saldo Disponible</Text>
          <Text style={styles.balanceAmount}>
            {formatCurrency(wallet?.wallet_balance || 0)}
          </Text>
          <View style={styles.clabeContainer}>
            <Text style={styles.clabeLabel}>CLABE para fondear (STP/SPEI):</Text>
            <TouchableOpacity style={styles.clabeBox} onPress={copyClabe}>
              <Text style={styles.clabeNumber}>{wallet?.virtual_clabe || 'Generando...'}</Text>
              <Ionicons name="copy-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.clabeNote}>
              💡 Transferencias reflejadas en 5 min, 24/7
            </Text>
          </View>
        </View>

        {/* Tarjeta de Crédito (si tiene) */}
        {wallet?.has_credit && (
          <View style={styles.creditCard}>
            <View style={styles.creditHeader}>
              <Ionicons name="card" size={24} color={SEA_COLOR} />
              <Text style={styles.creditTitle}>Línea de Crédito</Text>
              {wallet.is_credit_blocked && (
                <View style={styles.blockedBadge}>
                  <Text style={styles.blockedBadgeText}>BLOQUEADA</Text>
                </View>
              )}
            </View>

            <View style={styles.creditStats}>
              <View style={styles.creditStat}>
                <Text style={styles.creditStatLabel}>Límite</Text>
                <Text style={styles.creditStatValue}>
                  {formatCurrency(wallet.credit_limit)}
                </Text>
              </View>
              <View style={styles.creditStat}>
                <Text style={styles.creditStatLabel}>Usado</Text>
                <Text style={[styles.creditStatValue, { color: RED }]}>
                  {formatCurrency(wallet.used_credit)}
                </Text>
              </View>
              <View style={styles.creditStat}>
                <Text style={styles.creditStatLabel}>Disponible</Text>
                <Text style={[styles.creditStatValue, { color: GREEN }]}>
                  {formatCurrency(wallet.available_credit)}
                </Text>
              </View>
            </View>

            {/* Barra de uso */}
            <View style={styles.creditBar}>
              <View
                style={[
                  styles.creditBarFill,
                  {
                    width: `${Math.min((wallet.used_credit / wallet.credit_limit) * 100, 100)}%`,
                    backgroundColor: wallet.used_credit > wallet.credit_limit * 0.8 ? RED : SEA_COLOR,
                  },
                ]}
              />
            </View>

            <Text style={styles.creditDays}>
              Plazo de pago: {wallet.credit_days} días
            </Text>

            {/* Botón pagar crédito */}
            {wallet.used_credit > 0 && (
              <TouchableOpacity
                style={styles.payCreditButton}
                onPress={() => setShowPayModal(true)}
              >
                <Ionicons name="wallet" size={20} color="#fff" />
                <Text style={styles.payCreditText}>Pagar Saldo de Crédito</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Facturas Pendientes */}
        {wallet?.pending_invoices && wallet.pending_invoices.length > 0 && (
          <View style={styles.invoicesCard}>
            <Text style={styles.sectionTitle}>📋 Facturas Pendientes</Text>
            {wallet.pending_invoices.map((inv) => (
              <View
                key={inv.id}
                style={[styles.invoiceRow, inv.is_overdue && styles.invoiceOverdue]}
              >
                <View>
                  <Text style={styles.invoiceNumber}>{inv.invoice_number}</Text>
                  <Text style={styles.invoiceDate}>
                    Vence: {formatDate(inv.due_date)}
                    {inv.is_overdue && ' ⚠️ VENCIDA'}
                  </Text>
                </View>
                <Text style={[styles.invoiceAmount, inv.is_overdue && { color: RED }]}>
                  {formatCurrency(inv.pending_amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Historial de Movimientos */}
        <View style={styles.transactionsCard}>
          <Text style={styles.sectionTitle}>📊 Últimos Movimientos</Text>
          {transactions.length === 0 ? (
            <Text style={styles.emptyText}>No hay movimientos aún</Text>
          ) : (
            transactions.map((tx) => {
              const icon = getTransactionIcon(tx.type);
              return (
                <View key={tx.id} style={styles.transactionRow}>
                  <View style={[styles.txIcon, { backgroundColor: icon.color + '20' }]}>
                    <Ionicons name={icon.name as any} size={24} color={icon.color} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txType}>{getTransactionLabel(tx.type)}</Text>
                    <Text style={styles.txDesc}>{tx.description}</Text>
                    <Text style={styles.txDate}>{formatDate(tx.created_at)}</Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      { color: tx.amount > 0 ? GREEN : RED },
                    ]}
                  >
                    {tx.amount > 0 ? '+' : ''}
                    {formatCurrency(tx.amount)}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Modal Pagar Crédito */}
      <Modal visible={showPayModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Pagar Línea de Crédito</Text>
            <Text style={styles.modalSubtitle}>
              Deuda actual: {formatCurrency(wallet?.used_credit || 0)}
            </Text>
            <Text style={styles.modalSubtitle}>
              Saldo monedero: {formatCurrency(wallet?.wallet_balance || 0)}
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Monto a pagar"
              keyboardType="numeric"
              value={payAmount}
              onChangeText={setPayAmount}
            />

            <TouchableOpacity
              style={styles.quickAmountBtn}
              onPress={() => setPayAmount(String(wallet?.used_credit || 0))}
            >
              <Text style={styles.quickAmountText}>Pagar todo ({formatCurrency(wallet?.used_credit || 0)})</Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowPayModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handlePayCredit}
                disabled={paying}
              >
                {paying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirmar Pago</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  blockedBanner: {
    backgroundColor: RED,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  blockedText: {
    flex: 1,
    color: '#fff',
    fontWeight: '600',
  },
  balanceCard: {
    backgroundColor: SEA_COLOR,
    margin: 16,
    borderRadius: 16,
    padding: 20,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  clabeContainer: {
    marginTop: 16,
  },
  clabeLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginBottom: 8,
  },
  clabeBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
  },
  clabeNumber: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  clabeNote: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  creditCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  creditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  creditTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  blockedBadge: {
    backgroundColor: RED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  blockedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  creditStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  creditStat: {
    alignItems: 'center',
  },
  creditStatLabel: {
    color: '#666',
    fontSize: 12,
  },
  creditStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  creditBar: {
    height: 8,
    backgroundColor: '#eee',
    borderRadius: 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  creditBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  creditDays: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  payCreditButton: {
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 10,
    marginTop: 16,
  },
  payCreditText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  invoicesCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  invoiceOverdue: {
    backgroundColor: '#FFF3E0',
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  invoiceNumber: {
    fontWeight: '600',
  },
  invoiceDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  invoiceAmount: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  transactionsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  txIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txType: {
    fontWeight: '600',
    fontSize: 14,
  },
  txDesc: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  txDate: {
    color: '#999',
    fontSize: 11,
    marginTop: 2,
  },
  txAmount: {
    fontWeight: 'bold',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    marginTop: 16,
    textAlign: 'center',
  },
  quickAmountBtn: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  quickAmountText: {
    color: SEA_COLOR,
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#666',
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: SEA_COLOR,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
});
