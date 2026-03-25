import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

interface Props {
  route: {
    params: {
      user: any;
      token: string;
    };
  };
  navigation: any;
}

interface TeamMember {
  id: number;
  name: string;
  email: string;
  phone: string;
  referral_code: string;
  total_clients: number;
  monthly_clients: number;
  total_revenue: number;
  monthly_revenue: number;
  commission_rate: number;
  status: 'active' | 'inactive';
  created_at: string;
}

interface TeamStats {
  totalMembers: number;
  activeMembers: number;
  totalClients: number;
  monthlyClients: number;
  teamRevenue: number;
  myCommission: number;
}

const AdvisorTeamScreen: React.FC<Props> = ({ route, navigation }) => {
  const { user, token } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState<TeamStats>({
    totalMembers: 0,
    activeMembers: 0,
    totalClients: 0,
    monthlyClients: 0,
    teamRevenue: 0,
    myCommission: 0,
  });

  const fetchTeamData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/advisor/team`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.team) {
          setTeamMembers(data.team);
          
          // Calculate stats from team data
          const active = data.team.filter((m: TeamMember) => m.status === 'active').length;
          const totalClients = data.team.reduce((sum: number, m: TeamMember) => sum + (m.total_clients || 0), 0);
          const monthlyClients = data.team.reduce((sum: number, m: TeamMember) => sum + (m.monthly_clients || 0), 0);
          const teamRevenue = data.team.reduce((sum: number, m: TeamMember) => sum + (m.total_revenue || 0), 0);
          
          setStats({
            totalMembers: data.team.length,
            activeMembers: active,
            totalClients: totalClients,
            monthlyClients: monthlyClients,
            teamRevenue: teamRevenue,
            myCommission: data.my_commission || 0,
          });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error fetching team:', errorData);
        
        if (response.status === 403) {
          Alert.alert(
            'Sin Acceso',
            'Solo los asesores líderes pueden ver esta información'
          );
          navigation.goBack();
        }
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTeamData();
  }, [fetchTeamData]);

  const callMember = (phone: string) => {
    const phoneNumber = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const whatsAppMember = (phone: string) => {
    const phoneNumber = phone.replace(/[^0-9]/g, '');
    Linking.openURL(`whatsapp://send?phone=52${phoneNumber}`);
  };

  const emailMember = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const renderMemberCard = (member: TeamMember) => (
    <View key={member.id} style={styles.memberCard}>
      <View style={styles.memberHeader}>
        <View style={styles.memberAvatar}>
          <Text style={styles.memberInitial}>
            {member.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{member.name}</Text>
          <View style={styles.memberCodeRow}>
            <Text style={styles.memberCode}>Código: {member.referral_code}</Text>
            <View style={[
              styles.statusBadge,
              { backgroundColor: member.status === 'active' ? '#E8F5E9' : '#FFEBEE' }
            ]}>
              <Text style={[
                styles.statusText,
                { color: member.status === 'active' ? '#4CAF50' : '#F44336' }
              ]}>
                {member.status === 'active' ? 'Activo' : 'Inactivo'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.memberStats}>
        <View style={styles.memberStat}>
          <Text style={styles.memberStatValue}>{member.total_clients || 0}</Text>
          <Text style={styles.memberStatLabel}>Clientes</Text>
        </View>
        <View style={styles.memberStat}>
          <Text style={styles.memberStatValue}>{member.monthly_clients || 0}</Text>
          <Text style={styles.memberStatLabel}>Este Mes</Text>
        </View>
        <View style={styles.memberStat}>
          <Text style={styles.memberStatValue}>
            ${((member.total_revenue || 0) / 1000).toFixed(1)}k
          </Text>
          <Text style={styles.memberStatLabel}>Generado</Text>
        </View>
      </View>

      <View style={styles.memberActions}>
        {member.phone && (
          <>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => callMember(member.phone)}
            >
              <Ionicons name="call" size={20} color="#4CAF50" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => whatsAppMember(member.phone)}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            </TouchableOpacity>
          </>
        )}
        {member.email && (
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => emailMember(member.email)}
          >
            <Ionicons name="mail" size={20} color="#2196F3" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F05A28" />
        <Text style={styles.loadingText}>Cargando equipo...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#F05A28']}
            tintColor="#F05A28"
          />
        }
      >
        {/* Header */}
        <View style={styles.headerCard}>
          <Ionicons name="people-circle" size={48} color="#fff" />
          <Text style={styles.headerTitle}>Mi Equipo</Text>
          <Text style={styles.headerSubtitle}>
            {stats.totalMembers} sub-asesores registrados
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={24} color="#F05A28" />
            <Text style={styles.statValue}>{stats.activeMembers}</Text>
            <Text style={styles.statLabel}>Activos</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="person-add" size={24} color="#2196F3" />
            <Text style={styles.statValue}>{stats.totalClients}</Text>
            <Text style={styles.statLabel}>Clientes Total</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={24} color="#4CAF50" />
            <Text style={styles.statValue}>{stats.monthlyClients}</Text>
            <Text style={styles.statLabel}>Este Mes</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cash" size={24} color="#9C27B0" />
            <Text style={styles.statValue}>
              ${(stats.teamRevenue / 1000).toFixed(1)}k
            </Text>
            <Text style={styles.statLabel}>Generado</Text>
          </View>
        </View>

        {/* My Commission from Team */}
        <View style={styles.commissionCard}>
          <View style={styles.commissionLeft}>
            <Ionicons name="wallet" size={32} color="#4CAF50" />
            <View style={styles.commissionInfo}>
              <Text style={styles.commissionLabel}>Mi Comisión del Equipo</Text>
              <Text style={styles.commissionValue}>
                ${stats.myCommission.toFixed(2)} MXN
              </Text>
            </View>
          </View>
        </View>

        {/* Team Members */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Miembros del Equipo</Text>
          <Text style={styles.sectionCount}>{teamMembers.length}</Text>
        </View>

        {teamMembers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>Sin Sub-Asesores</Text>
            <Text style={styles.emptyText}>
              Aún no tienes sub-asesores en tu equipo
            </Text>
          </View>
        ) : (
          teamMembers.map(renderMemberCard)
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  headerCard: {
    backgroundColor: '#9C27B0',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  commissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  commissionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commissionInfo: {
    marginLeft: 12,
  },
  commissionLabel: {
    fontSize: 14,
    color: '#666',
  },
  commissionValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionCount: {
    fontSize: 14,
    color: '#666',
    backgroundColor: '#eee',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F05A28',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberInitial: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  memberCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  memberCode: {
    fontSize: 13,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  memberStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  memberStat: {
    alignItems: 'center',
  },
  memberStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  memberStatLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  memberActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default AdvisorTeamScreen;
