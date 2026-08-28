// ============================================
// ADVISOR COMMISSIONS SCREEN
// Historial de comisiones del asesor
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  Surface,
  ActivityIndicator,
  Divider,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const { width } = Dimensions.get('window');
const ORANGE = '#F05A28';
const MORADO = '#7E57C2';

/**
 * Estado que le importa al asesor. En la base una comision de orden a credito
 * sigue en 'pending', pero no se le puede pagar hasta que el cliente abone,
 * asi que se muestra como estado propio y no revuelta con lo cobrable.
 */
const estadoReal = (c: { status: string; en_credito?: boolean }) =>
  c.en_credito ? 'credit' : c.status;

interface CommissionSummary {
  totalEarned: number;
  totalPending: number;
  totalCreditHold: number;
  totalPaid: number;
  thisMonth: number;
  lastMonth: number;
}

interface Commission {
  id: number;
  client_name: string;
  client_box_id: string;
  package_tracking: string;
  master_tracking?: string | null;
  service_type: string;
  amount_mxn: number;
  commission_rate: number;
  commission_mxn: number;
  status: string;
  /** Comision de una orden pagada a credito: existe pero aun no se puede cobrar. */
  en_credito: boolean;
  paid_at: string | null;
  created_at: string;
}

export default function AdvisorCommissionsScreen({ navigation, route }: any) {
  const { user, token } = route.params;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>(route.params?.serviceFilter || 'all');
  const [page, setPage] = useState(1);

  const loadCommissions = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      let url = `${API_URL}/api/advisor/commissions?page=${currentPage}&limit=20`;
      if (filter !== 'all') url += `&status=${filter}`;
      if (serviceFilter !== 'all') url += `&service_type=${encodeURIComponent(serviceFilter)}`;
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Error al cargar comisiones');
      
      const data = await response.json();

      // Backend devuelve data.totals y data.recent (no data.summary/data.commissions)
      if (data.totals) {
        const monthly = data.monthly || [];
        setSummary({
          totalEarned: data.totals.totalCommission || 0,
          totalPending: data.totals.pendingCommission || 0,
          totalCreditHold: data.totals.creditHoldCommission || 0,
          totalPaid: data.totals.paidCommission || 0,
          thisMonth: monthly[0]?.commission || 0,
          lastMonth: monthly[1]?.commission || 0,
        });
      }

      // Normalizar recent → Commission shape
      const normalize = (r: any): Commission => ({
        id: r.id,
        client_name: r.clientName || r.client_name || '',
        client_box_id: r.clientBoxId || r.client_box_id || '',
        package_tracking: r.tracking || r.package_tracking || '',
        master_tracking: r.masterTracking || r.master_tracking || null,
        service_type: r.serviceType || r.service_type || '',
        amount_mxn: r.paymentAmount ?? r.amount_mxn ?? 0,
        commission_rate: r.commissionRate ?? r.commission_rate ?? 0,
        commission_mxn: r.commissionAmount ?? r.commission_mxn ?? 0,
        status: r.status || '',
        en_credito: r.awaitingClientPayment === true || r.awaiting_client_payment === true,
        paid_at: r.paidAt ?? r.paid_at ?? null,
        created_at: r.createdAt || r.created_at || '',
      });

      let list: Commission[] = (data.recent || data.commissions || []).map(normalize);
      if (filter !== 'all') list = list.filter(c => estadoReal(c) === filter);
      if (serviceFilter !== 'all') list = list.filter(c => c.service_type === serviceFilter);

      if (reset) {
        setCommissions(list);
      } else {
        setCommissions(prev => [...prev, ...list]);
      }

      if (reset) setPage(1);
    } catch (err) {
      console.error('Error loading commissions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, filter, serviceFilter, page]);

  useEffect(() => {
    setLoading(true);
    loadCommissions(true);
  }, [filter, serviceFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadCommissions(true);
  };

  // Metadatos por tipo de servicio (los service_type REALES que devuelve el sistema).
  const SERVICE_META: Record<string, { icon: string; label: string }> = {
    pobox_usa_mx:      { icon: 'mail',              label: 'PO Box USA' },
    aereo_china_mx:    { icon: 'airplane',          label: 'Aéreo China' },
    maritimo_china_mx: { icon: 'boat',              label: 'Marítimo China' },
    tdi_express:       { icon: 'rocket',            label: 'TDI Express' },
    liberacion_aa_dhl: { icon: 'cube',              label: 'DHL Nacional' },
    nacional_mx:       { icon: 'car',               label: 'Envío Nacional' },
    gex_warranty:      { icon: 'shield-checkmark',  label: 'Garantía GEX' },
    xpay:              { icon: 'swap-horizontal',   label: 'X-Pay' },
  };
  const serviceMeta = (st: string) => SERVICE_META[st] || { icon: 'cube', label: st || 'Servicio' };
  const getServiceIcon = (serviceType: string) => serviceMeta(serviceType).icon;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return '#4CAF50';
      case 'pending':
        return '#FF9800';
      case 'credit':
        return '#7E57C2';
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
        return 'Por cobrar';
      case 'credit':
        return 'En crédito';
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
          <Text style={styles.clientName}>
            {item.client_box_id ? `${item.client_box_id} · ` : ''}{item.client_name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            <View style={{ backgroundColor: ORANGE + '18', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: ORANGE }}>{serviceMeta(item.service_type).label}</Text>
            </View>
            <Text style={styles.tracking}>{item.package_tracking || 'Sin tracking'}</Text>
          </View>
          {/* La comisión va por guía hija; el asesor busca por la de 10
              dígitos, que es la que le dio al cliente. */}
          {!!item.master_tracking && (
            <Text style={[styles.tracking, { fontSize: 10.5, color: '#9AA0A6', marginTop: 1 }]}>
              master {item.master_tracking}
            </Text>
          )}
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
        <View style={{
          backgroundColor: getStatusColor(estadoReal(item)) + '20',
          borderRadius: 12,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}>
          <Text style={{ fontSize: 11, color: getStatusColor(estadoReal(item)), fontWeight: '600' }}>
            {getStatusLabel(estadoReal(item))}
          </Text>
        </View>
      </View>
    </Surface>
  );

  const filters = [
    { key: 'all', label: 'Todas' },
    { key: 'pending', label: 'Por cobrar' },
    { key: 'credit', label: 'En crédito' },
    { key: 'paid', label: 'Pagadas' },
  ];

  const serviceFilters = [
    { key: 'all', label: 'Todos' },
    { key: 'pobox_usa_mx', label: 'PO Box' },
    { key: 'aereo_china_mx', label: 'Aéreo' },
    { key: 'tdi_express', label: 'TDX' },
    { key: 'maritimo_china_mx', label: 'Marítimo' },
    { key: 'liberacion_aa_dhl', label: 'DHL' },
    { key: 'gex_warranty', label: 'GEX' },
    { key: 'xpay', label: 'X-Pay' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Comisiones</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary Cards */}
      {summary && (
        <View style={styles.summaryContainer}>
          <TouchableOpacity style={[styles.summaryCard, { backgroundColor: '#FFF3E0' }]} onPress={() => setFilter('pending')}>
            <Text style={styles.summaryLabel}>Por Cobrar</Text>
            <Text style={[styles.summaryValue, { color: '#FF9800' }]} numberOfLines={1} adjustsFontSizeToFit>
              ${summary.totalPending?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.summaryUnit}>ya cobrable</Text>
          </TouchableOpacity>
          {/* El credito no se suma a "Por Cobrar": el asesor terminaba contando
              como suyo dinero que todavia no se le puede pagar. */}
          <TouchableOpacity style={[styles.summaryCard, { backgroundColor: '#EDE7F6' }]} onPress={() => setFilter('credit')}>
            <Text style={styles.summaryLabel}>En crédito</Text>
            <Text style={[styles.summaryValue, { color: MORADO }]} numberOfLines={1} adjustsFontSizeToFit>
              ${summary.totalCreditHold?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.summaryUnit}>aún no</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.summaryCard, { backgroundColor: '#E8F5E9' }]} onPress={() => setFilter('paid')}>
            <Text style={styles.summaryLabel}>Pagadas</Text>
            <Text style={[styles.summaryValue, { color: '#4CAF50' }]} numberOfLines={1} adjustsFontSizeToFit>
              ${summary.totalPaid?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.summaryUnit}>MXN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.summaryCard, { backgroundColor: '#fff' }]} onPress={() => setFilter('all')}>
            <Text style={styles.summaryLabel}>Este Mes</Text>
            <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
              ${summary.thisMonth?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.summaryUnit}>MXN</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Por que hay dinero que no puede cobrar todavia. Solo aparece si lo hay. */}
      {!!summary && summary.totalCreditHold > 0 && (
        <View style={styles.notaCredito}>
          <Ionicons name="information-circle" size={18} color={MORADO} style={{ marginTop: 1 }} />
          <Text style={styles.notaCreditoTxt}>
            Tienes ${summary.totalCreditHold.toLocaleString('es-MX', { minimumFractionDigits: 2 })} en
            crédito: son comisiones ya generadas de envíos que el cliente pagó con su línea de crédito.
            Se pasan solas a "Por Cobrar" cuando el cliente abona.
          </Text>
        </View>
      )}

      {/* Botón: Mis Metas (simulador gamificado de bonos y aceleradores) */}
      <TouchableOpacity activeOpacity={0.85} style={styles.goalsBtn}
        onPress={() => navigation.navigate('AdvisorGoals', { user, token })}>
        <View style={styles.goalsIcon}><Ionicons name="trophy" size={22} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.goalsTitle}>Mis Metas y Bonos</Text>
          <Text style={styles.goalsSub}>Qué te falta para cada acelerador y bono este mes</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#fff" />
      </TouchableOpacity>

      {/* Filtros por estado */}
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

      {/* Filtros por tipo de servicio */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.serviceFiltersRow}
      >
        {serviceFilters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.serviceChip, serviceFilter === f.key && styles.serviceChipActive]}
            onPress={() => setServiceFilter(f.key)}
          >
            <Text numberOfLines={1} style={[styles.serviceChipText, serviceFilter === f.key && styles.serviceChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  notaCredito: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: 12, marginBottom: 4, padding: 10, borderRadius: 10,
    backgroundColor: '#EDE7F6',
  },
  notaCreditoTxt: { flex: 1, fontSize: 11.5, color: '#4527A0', lineHeight: 16 },
  goalsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 6, padding: 14, borderRadius: 14,
    backgroundColor: ORANGE,
    shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  goalsIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  goalsTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  goalsSub: { color: '#fff', fontSize: 12, opacity: 0.92, marginTop: 1 },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    elevation: 1,
  },
  summaryLabel: {
    fontSize: 10.5,
    color: '#666',
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '800',
    color: ORANGE,
    marginTop: 4,
  },
  summaryUnit: {
    fontSize: 9.5,
    color: '#999',
    textAlign: 'center',
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
    justifyContent: 'center',
  },
  serviceFiltersRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    alignItems: 'center',
  },
  serviceChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F2F2F4',
    borderWidth: 1,
    borderColor: '#D8D8DC',
  },
  serviceChipActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  serviceChipText: {
    fontSize: 12.5,
    color: '#333333',
    fontWeight: '700',
  },
  serviceChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
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
