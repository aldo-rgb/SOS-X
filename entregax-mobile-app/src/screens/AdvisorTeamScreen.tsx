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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const { width } = Dimensions.get('window');
const ORANGE = '#F05A28';
const BLACK  = '#111111';
const BG     = '#F4F4F6';
const RED    = '#C62828';

interface Props {
  route: { params: { user: any; token: string } };
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
  blocked?: boolean;
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
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [activeTab, setActiveTab]   = useState<'team' | 'rates'>('team');
  const [stats, setStats] = useState<TeamStats>({
    totalMembers: 0, activeMembers: 0, totalClients: 0,
    monthlyClients: 0, teamRevenue: 0, myCommission: 0,
  });

  const fetchTeamData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/advisor/team`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.team) {
          setTeamMembers(data.team);
          const active = data.team.filter((m: TeamMember) => m.status === 'active').length;
          setStats({
            totalMembers: data.team.length,
            activeMembers: active,
            totalClients: data.team.reduce((s: number, m: TeamMember) => s + (m.total_clients || 0), 0),
            monthlyClients: data.team.reduce((s: number, m: TeamMember) => s + (m.monthly_clients || 0), 0),
            teamRevenue: data.team.reduce((s: number, m: TeamMember) => s + (m.total_revenue || 0), 0),
            myCommission: data.my_commission || 0,
          });
        }
      } else if (response.status === 403) {
        Alert.alert('Sin Acceso', 'Solo los asesores líderes pueden ver esta información');
        navigation.goBack();
      }
    } catch (err) {
      console.error('Error fetching team data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchTeamData(); }, [fetchTeamData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchTeamData(); }, [fetchTeamData]);

  const handlePayCommissions = () => Alert.alert('Pagar Comisiones', '¿Confirmas el pago de comisiones del equipo?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Confirmar', style: 'default', onPress: () => {} },
  ]);

  const handleAssignRate = () => Alert.alert('Asignar Tarifa', 'Funcionalidad disponible próximamente.');

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={s.loadingText}>Cargando equipo...</Text>
      </View>
    );
  }

  const renderMemberCard = (member: TeamMember) => (
    <View key={member.id} style={s.memberCard}>
      {/* Accent bar top */}
      <View style={[s.memberCardBar, { backgroundColor: member.blocked ? RED : ORANGE }]} />

      <View style={s.memberHeader}>
        <View style={[s.memberAvatar, { backgroundColor: member.blocked ? RED : ORANGE }]}>
          <Text style={s.memberInitial}>{member.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.memberName}>{member.name}</Text>
            {member.blocked && (
              <View style={s.blockedBadge}><Text style={s.blockedText}>BLOQUEADO</Text></View>
            )}
          </View>
          <Text style={s.memberCode}>Código: {member.referral_code}</Text>
        </View>
        {/* Status dot */}
        <View style={[s.statusDot, { backgroundColor: member.status === 'active' ? '#4CAF50' : '#9E9E9E' }]} />
      </View>

      <View style={s.memberStats}>
        {[
          { value: member.total_clients || 0, label: 'Clientes' },
          { value: member.monthly_clients || 0, label: 'Este Mes' },
          { value: `$${((member.total_revenue || 0) / 1000).toFixed(1)}k`, label: 'Generado' },
        ].map((st, i) => (
          <View key={i} style={s.memberStat}>
            <Text style={s.memberStatValue}>{st.value}</Text>
            <Text style={s.memberStatLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

      <View style={s.memberFooter}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {member.phone && (
            <>
              <TouchableOpacity style={s.iconBtn} onPress={() => Linking.openURL(`tel:${member.phone.replace(/[^0-9+]/g, '')}`)}>
                <Ionicons name="call" size={18} color="#4CAF50" />
              </TouchableOpacity>
              <TouchableOpacity style={s.iconBtn} onPress={() => Linking.openURL(`whatsapp://send?phone=52${member.phone.replace(/[^0-9]/g, '')}`)}>
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              </TouchableOpacity>
            </>
          )}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('AdvisorClients', { user, token, subAdvisorId: member.id })}>
          <Text style={s.detailsBtn}>Ver Detalles →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRatesTab = () => (
    <View style={s.emptyState}>
      <Ionicons name="pricetag-outline" size={56} color="#ccc" />
      <Text style={s.emptyTitle}>Tarifas del Equipo</Text>
      <Text style={s.emptyText}>Administra las tarifas asignadas a tu equipo de asesores.</Text>
      <TouchableOpacity style={s.ghostBtn} onPress={handleAssignRate}>
        <Text style={s.ghostBtnText}>Asignar Tarifa</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>

      {/* ── TABS ── */}
      <View style={s.tabBar}>
        {(['team', 'rates'] as const).map(tab => (
          <TouchableOpacity key={tab} style={s.tabItem} onPress={() => setActiveTab(tab)}>
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === 'team' ? 'Asesores' : 'Tarifas'}
            </Text>
            {activeTab === tab && <View style={s.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} tintColor={ORANGE} />}
      >
        {/* ── KPI CARD ── */}
        <View style={s.kpiCard}>
          <View style={s.kpiGrid}>
            {[
              { label: 'Ventas del mes', value: `$${(stats.teamRevenue / 1000).toFixed(1)}k` },
              { label: 'Comisiones', value: `$${stats.myCommission.toFixed(0)}` },
              { label: 'Sub-Asesores', value: `${stats.totalMembers}` },
              { label: 'Clientes equipo', value: `${stats.totalClients}` },
            ].map((kpi, i) => (
              <View key={i} style={s.kpiItem}>
                <Text style={s.kpiLabel}>{kpi.label}</Text>
                <Text style={s.kpiValue}>{kpi.value}</Text>
              </View>
            ))}
          </View>
          {/* Botones de acción */}
          <View style={s.kpiActions}>
            <TouchableOpacity style={s.primaryBtn} onPress={handlePayCommissions}>
              <Ionicons name="wallet" size={16} color="#fff" />
              <Text style={s.primaryBtnText}>Pagar Comisiones</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={handleAssignRate}>
              <Text style={s.ghostBtnText}>Asignar Tarifa</Text>
            </TouchableOpacity>
          </View>
        </View>

        {activeTab === 'team' ? (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Miembros del Equipo</Text>
              <View style={s.countBadge}><Text style={s.countBadgeText}>{teamMembers.length}</Text></View>
            </View>
            {teamMembers.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="people-outline" size={56} color="#ccc" />
                <Text style={s.emptyTitle}>Sin Sub-Asesores</Text>
                <Text style={s.emptyText}>Aún no tienes sub-asesores en tu equipo</Text>
              </View>
            ) : (
              teamMembers.map(renderMemberCard)
            )}
          </>
        ) : renderRatesTab()}
      </ScrollView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: BG },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#aaa', fontSize: 15 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  tabText:       { fontSize: 14, fontWeight: '600', color: '#9E9E9E' },
  tabTextActive: { color: BLACK },
  tabIndicator:  { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 3, backgroundColor: ORANGE, borderRadius: 2 },

  // KPI card
  kpiCard: {
    backgroundColor: BLACK,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
  },
  kpiItem:  { width: (width - 72) / 2 },
  kpiLabel: { color: '#888', fontSize: 11, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase' },
  kpiValue: { color: ORANGE, fontSize: 28, fontWeight: '900', marginTop: 2 },

  // Buttons
  kpiActions:     { flexDirection: 'row', gap: 10 },
  primaryBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ghostBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: BLACK, borderRadius: 10, paddingVertical: 12 },
  ghostBtnText:   { color: BLACK, fontWeight: '700', fontSize: 13 },

  // Section
  sectionRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionTitle:{ fontSize: 14, fontWeight: '800', color: '#888', letterSpacing: 1.5, textTransform: 'uppercase' },
  countBadge:  { backgroundColor: '#E8E8E8', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  countBadgeText: { fontSize: 13, color: '#666', fontWeight: '600' },

  // Member card
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  memberCardBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  memberHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14, marginTop: 6 },
  memberAvatar:  { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  memberInitial: { fontSize: 18, fontWeight: '800', color: '#fff' },
  memberName:    { fontSize: 15, fontWeight: '700', color: BLACK },
  memberCode:    { fontSize: 12, color: '#888', marginTop: 2 },
  statusDot:     { width: 10, height: 10, borderRadius: 5 },

  blockedBadge: { backgroundColor: RED, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  blockedText:  { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  memberStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  memberStat:       { alignItems: 'center' },
  memberStatValue:  { fontSize: 18, fontWeight: '800', color: BLACK },
  memberStatLabel:  { fontSize: 11, color: '#888', marginTop: 2 },

  memberFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  iconBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  detailsBtn: { color: ORANGE, fontSize: 13, fontWeight: '700' },

  // Empty
  emptyState: { alignItems: 'center', padding: 40, backgroundColor: '#fff', borderRadius: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginTop: 14 },
  emptyText:  { fontSize: 13, color: '#888', marginTop: 6, textAlign: 'center', lineHeight: 19 },
});

export default AdvisorTeamScreen;
