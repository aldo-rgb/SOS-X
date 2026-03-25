// ============================================
// ADVISOR COMMISSIONS SCREEN
// Historial de comisiones del asesor
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {
  Text,
  Surface,
  ActivityIndicator,
  Chip,
  Divider,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const { width } = Dimensions.get('window');
const ORANGE = '#F05A28';

interface CommissionSummary {
  totalEarned: number;
  totalPending: number;
  totalPaid: number;
  thisMonth: number;
  lastMonth: number;
}

interface Commission {
  id: number;
  client_name: string;
  client_box_id: string;
  package_tracking: string;
  service_type: string;
  amount_mxn: number;
  commission_rate: number;
  commission_mxn: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export default function AdvisorCommissionsScreen({ navigation, route }: any) {
  const { user, token } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const loadCommissions = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      let url = `${API_URL}/api/advisor/commissions?page=${currentPage}&limit=20`;
      if (filter !== 'all') url += `&status=${filter}`;
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Error al cargar comisiones');
      
      const data = await response.json();
      setSummary(data.summary || null);
      
      if (reset) {
        setCommissions(data.commissions || []);
      } else {
        setCommissions(prev => [...prev, ...(data.commissions || [])]);
      }
      
      if (reset) setPage(1);
    } catch (err) {
      console.error('Error loading commissions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, filter, page]);

  useEffect(() => {
    setLoading(true);
    loadCommissions(true);
  }, [filter]);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadCommissions(true);
  };

  const getServiceIcon = (serviceType: string) => {
    switch (serviceType) {
      case 'pobox':
      case 'PO_BOX':
        return 'mail';
      case 'china_air':
      case 'AIR_CHN_MX':
        return 'airplane';
      case 'maritime':
      case 'MARITIME':
        return 'boat';
      case 'dhl':
      case 'DHL':
        return 'car';
      default:
        return 'cube';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return '#4CAF50';
      case 'pending':
        return '#FF9800';
      case 'cancelled':
        return '#f44336';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Pagada';
      case 'pending':
        return 'Pendiente';
      case 'cancelled':
        return 'Cancelada';
      default:
        return status;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const renderCommission = ({ item }: { item: Commission }) => (
    <Surface style={styles.commissionCard}>
      <View style={styles.commissionHeader}>
        <View style={[styles.serviceIcon, { backgroundColor: ORANGE + '20' }]}>
          <Ionicons name={getServiceIcon(item.service_type) as any} size={20} color={ORANGE} />
        </View>
        <View style={styles.commissionInfo}>
          <Text style={styles.clientName}>{item.client_name}</Text>
          <Text style={styles.tracking}>{item.package_tracking || 'Sin tracking'}</Text>
        </View>
        <View style={styles.commissionAmount}>
          <Text style={styles.amountLabel}>Comisión</Text>
          <Text style={styles.amount}>
            ${item.commission_mxn?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '0.00'}
          </Text>
        </View>
      </View>
      
      <View style={styles.commissionFooter}>
        <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
        <Chip 
          mode="flat" 
          textStyle={{ fontSize: 10, color: getStatusColor(item.status) }}
          style={{ backgroundColor: getStatusColor(item.status) + '20', height: 24 }}
        >
          {getStatusLabel(item.status)}
        </Chip>
      </View>
    </Surface>
  );

  const filters = [
    { key: 'all', label: 'Todas' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'paid', label: 'Pagadas' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Comisiones</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary Cards */}
      {summary && (
        <View style={styles.summaryContainer}>
          <Surface style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Ganado</Text>
            <Text style={styles.summaryValue}>
              ${summary.totalEarned?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.summaryUnit}>MXN</Text>
          </Surface>
          <Surface style={[styles.summaryCard, { backgroundColor: '#E8F5E9' }]}>
            <Text style={styles.summaryLabel}>Este Mes</Text>
            <Text style={[styles.summaryValue, { color: '#4CAF50' }]}>
              ${summary.thisMonth?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.summaryUnit}>MXN</Text>
          </Surface>
          <Surface style={[styles.summaryCard, { backgroundColor: '#FFF3E0' }]}>
            <Text style={styles.summaryLabel}>Pendiente</Text>
            <Text style={[styles.summaryValue, { color: '#FF9800' }]}>
              ${summary.totalPending?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.summaryUnit}>MXN</Text>
          </Surface>
        </View>
      )}

      {/* Filters */}
      <View style={styles.filtersContainer}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading && commissions.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : (
        <FlatList
          data={commissions}
          renderItem={renderCommission}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cash-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Sin comisiones</Text>
              <Text style={styles.emptySubtext}>
                Cuando tus clientes realicen envíos, verás tus comisiones aquí
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#111',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  summaryContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    elevation: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#666',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: ORANGE,
    marginTop: 4,
  },
  summaryUnit: {
    fontSize: 10,
    color: '#999',
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  filterChipActive: {
    backgroundColor: ORANGE,
  },
  filterText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
  },
  commissionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 1,
  },
  commissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commissionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  tracking: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  commissionAmount: {
    alignItems: 'flex-end',
  },
  amountLabel: {
    fontSize: 10,
    color: '#666',
  },
  amount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4CAF50',
  },
  commissionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  dateText: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
