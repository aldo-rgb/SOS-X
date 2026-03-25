// ============================================
// ADVISOR CLIENTS SCREEN
// Lista de clientes del asesor
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Linking,
} from 'react-native';
import {
  Text,
  Avatar,
  Chip,
  ActivityIndicator,
  Divider,
  IconButton,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';

interface Client {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  box_id: string;
  is_verified: boolean;
  verification_status: string;
  created_at: string;
  last_shipment_at: string | null;
  total_packages: number;
  in_transit_count: number;
  pending_payment_count: number;
  total_pending: number;
}

export default function AdvisorClientsScreen({ navigation, route }: any) {
  const { user, token, filter: initialFilter } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>(initialFilter || 'all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadClients = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      let url = `${API_URL}/api/advisor/clients?page=${currentPage}&limit=20`;
      
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (filter !== 'all') url += `&status=${filter}`;
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Error al cargar clientes');
      
      const data = await response.json();
      
      if (reset) {
        setClients(data.clients || []);
      } else {
        setClients(prev => [...prev, ...(data.clients || [])]);
      }
      
      setHasMore((data.clients || []).length === 20);
      if (reset) setPage(1);
    } catch (err) {
      console.error('Error loading clients:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, search, filter, page]);

  useEffect(() => {
    setLoading(true);
    loadClients(true);
  }, [search, filter]);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadClients(true);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
      loadClients();
    }
  };

  const callClient = (phone: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const whatsappClient = (phone: string, name: string) => {
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      const message = encodeURIComponent(`Hola ${name}, soy tu asesor de EntregaX. ¿En qué puedo ayudarte?`);
      Linking.openURL(`https://wa.me/${cleanPhone}?text=${message}`);
    }
  };

  const renderClient = ({ item }: { item: Client }) => {
    const daysAgo = item.last_shipment_at 
      ? Math.floor((Date.now() - new Date(item.last_shipment_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    return (
      <TouchableOpacity style={styles.clientCard}>
        <View style={styles.clientHeader}>
          <Avatar.Text 
            size={44} 
            label={(item.full_name || 'NN').substring(0, 2).toUpperCase()} 
            style={{ backgroundColor: item.is_verified ? ORANGE : '#9E9E9E' }}
          />
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.full_name || 'Sin nombre'}</Text>
            <Text style={styles.clientBox}>{item.box_id || 'Sin casillero'}</Text>
          </View>
          {item.is_verified ? (
            <Chip 
              icon="check-circle" 
              mode="flat" 
              textStyle={{ fontSize: 10, color: '#4CAF50' }}
              style={{ backgroundColor: '#E8F5E9', height: 24 }}
            >
              Verificado
            </Chip>
          ) : (
            <Chip 
              icon="clock" 
              mode="flat" 
              textStyle={{ fontSize: 10, color: '#FF9800' }}
              style={{ backgroundColor: '#FFF3E0', height: 24 }}
            >
              Pendiente
            </Chip>
          )}
        </View>
        
        <View style={styles.clientStats}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{item.total_packages}</Text>
            <Text style={styles.statLabel}>Envíos</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: '#2196F3' }]}>{item.in_transit_count}</Text>
            <Text style={styles.statLabel}>En Tránsito</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: item.pending_payment_count > 0 ? '#FF9800' : '#4CAF50' }]}>
              {item.pending_payment_count}
            </Text>
            <Text style={styles.statLabel}>Por Pagar</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>
              {daysAgo !== null ? (daysAgo === 0 ? 'Hoy' : `Hace ${daysAgo}d`) : 'Sin envíos'}
            </Text>
            <Text style={[styles.statLabel, { fontSize: 10 }]}>Último envío</Text>
          </View>
        </View>

        <View style={styles.clientActions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => callClient(item.phone)}
          >
            <Ionicons name="call-outline" size={20} color={ORANGE} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => whatsappClient(item.phone, item.full_name.split(' ')[0])}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => Linking.openURL(`mailto:${item.email}`)}
          >
            <Ionicons name="mail-outline" size={20} color="#2196F3" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'verified', label: 'Verificados' },
    { key: 'pending', label: 'Pendientes' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Clientes</Text>
        <Text style={styles.clientCount}>{clients.length} clientes</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre, email o casillero..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#999"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

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
      {loading && clients.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : (
        <FlatList
          data={clients}
          renderItem={renderClient}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No tienes clientes aún</Text>
              <Text style={styles.emptySubtext}>Comparte tu código de referido para ganar comisiones</Text>
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
  },
  clientCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  searchContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#333',
  },
  filtersContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
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
  clientCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 1,
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clientInfo: {
    flex: 1,
    marginLeft: 12,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  clientBox: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  clientStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  clientActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
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
