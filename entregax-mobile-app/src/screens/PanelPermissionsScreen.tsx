/**
 * PanelPermissionsScreen
 * -----------------------------------------------------------
 * Gestión de "Paneles por Usuario" desde el móvil.
 * Replica únicamente la sección "Paneles por Usuario" del Panel
 * Web (la "Matriz por Rol" sigue siendo exclusiva de Web).
 *
 * Flujo:
 *   1) Lista usuarios staff (búsqueda + filtro por rol).
 *   2) Al seleccionar uno, abre modal con todos los paneles
 *      agrupados por categoría, con switches can_view / can_edit.
 *   3) Al guardar envía PUT /api/admin/panels/user/:userId con
 *      la lista COMPLETA (estrategia de reemplazo total).
 *
 * Backend: requireSuperAdmin (mismo middleware que Web).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  StatusBar,
  FlatList,
  RefreshControl,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'PanelPermissions'>;

const ORANGE = '#F05A28';
const BG = '#F4F6F8';

interface Panel {
  panel_key: string;
  panel_name: string;
  category: string;
  description?: string;
  icon?: string;
}

interface UserRow {
  id: number;
  full_name: string;
  email: string;
  role: string;
  box_id?: string | null;
  panel_count: number;
}

interface UserPermission {
  panel_key: string;
  can_view: boolean;
  can_edit: boolean;
}

const ROLES_FILTER: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'admin', label: 'Admin' },
  { key: 'director', label: 'Director' },
  { key: 'branch_manager', label: 'Operaciones CEDIS' },
  { key: 'counter_staff', label: 'Mostrador' },
  { key: 'warehouse_ops', label: 'Bodega' },
  { key: 'customer_service', label: 'Servicio Cliente' },
  { key: 'advisor', label: 'Asesor' },
  { key: 'sub_advisor', label: 'Sub Asesor' },
  { key: 'accountant', label: 'Contador' },
  { key: 'repartidor', label: 'Repartidor' },
];

const ROLE_LABEL: Record<string, string> = ROLES_FILTER.reduce((acc, r) => {
  acc[r.key] = r.label;
  return acc;
}, {} as Record<string, string>);

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  admin: { label: 'Administración', color: '#9C27B0', icon: 'shield-checkmark-outline' },
  operations: { label: 'Operaciones', color: '#2196F3', icon: 'cube-outline' },
  customer_service: { label: 'Servicio a Cliente', color: '#4CAF50', icon: 'headset-outline' },
  Contabilidad: { label: 'Contabilidad', color: '#E87722', icon: 'receipt-outline' },
};

const initials = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('');

export default function PanelPermissionsScreen({ navigation, route }: Props) {
  const { token } = route.params;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [allPanels, setAllPanels] = useState<Panel[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modal de edición
  const [editOpen, setEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userPerms, setUserPerms] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>({});
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isUserSuper, setIsUserSuper] = useState(false);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  // ------- Carga inicial -------
  const loadPanels = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/panels`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllPanels(data.panels || []);
    } catch (err) {
      console.error('[PanelPermissions] loadPanels:', err);
    }
  }, [authHeaders]);

  const loadUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (roleFilter !== 'all') params.set('role', roleFilter);
      const qs = params.toString();
      const url = `${API_URL}/api/admin/panels/users${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error('[PanelPermissions] loadUsers:', err);
      Alert.alert('Error', 'No se pudieron cargar los usuarios.');
    }
  }, [authHeaders, search, roleFilter]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadPanels(), loadUsers()]);
      setLoading(false);
    })();
  }, [loadPanels, loadUsers]);

  // Debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => {
      loadUsers();
    }, 350);
    return () => clearTimeout(t);
  }, [search, roleFilter, loadUsers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPanels(), loadUsers()]);
    setRefreshing(false);
  }, [loadPanels, loadUsers]);

  // ------- Edición -------
  const openEdit = useCallback(
    async (u: UserRow) => {
      setSelectedUser(u);
      setEditOpen(true);
      setLoadingPerms(true);
      setUserPerms({});
      setIsUserSuper(false);
      try {
        const res = await fetch(`${API_URL}/api/admin/panels/user/${u.id}`, { headers: authHeaders });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const map: Record<string, { can_view: boolean; can_edit: boolean }> = {};
        (data.permissions || []).forEach((p: UserPermission) => {
          map[p.panel_key] = { can_view: !!p.can_view, can_edit: !!p.can_edit };
        });
        setUserPerms(map);
        setIsUserSuper(!!data.isSuperAdmin);
      } catch (err) {
        console.error('[PanelPermissions] openEdit:', err);
        Alert.alert('Error', 'No se pudieron cargar los permisos del usuario.');
        setEditOpen(false);
      } finally {
        setLoadingPerms(false);
      }
    },
    [authHeaders]
  );

  const togglePerm = (panel_key: string, field: 'can_view' | 'can_edit') => {
    if (isUserSuper) return;
    setUserPerms((prev) => {
      const cur = prev[panel_key] || { can_view: false, can_edit: false };
      const next = { ...cur, [field]: !cur[field] };
      // Si quita can_view, también quita can_edit
      if (field === 'can_view' && !next.can_view) next.can_edit = false;
      // Si activa can_edit, asegura can_view
      if (field === 'can_edit' && next.can_edit) next.can_view = true;
      return { ...prev, [panel_key]: next };
    });
  };

  const allOnCategory = (cat: string, value: boolean) => {
    if (isUserSuper) return;
    setUserPerms((prev) => {
      const next = { ...prev };
      allPanels
        .filter((p) => p.category === cat)
        .forEach((p) => {
          const cur = next[p.panel_key] || { can_view: false, can_edit: false };
          next[p.panel_key] = {
            can_view: value,
            can_edit: value ? cur.can_edit : false,
          };
        });
      return next;
    });
  };

  const savePerms = async () => {
    if (!selectedUser || isUserSuper) return;
    setSaving(true);
    try {
      const permissions = allPanels.map((p) => {
        const cur = userPerms[p.panel_key] || { can_view: false, can_edit: false };
        return { panel_key: p.panel_key, can_view: !!cur.can_view, can_edit: !!cur.can_edit };
      });
      const res = await fetch(`${API_URL}/api/admin/panels/user/${selectedUser.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ permissions }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      Alert.alert('Permisos guardados', 'Los permisos se actualizaron correctamente.');
      setEditOpen(false);
      setSelectedUser(null);
      await loadUsers();
    } catch (err) {
      console.error('[PanelPermissions] savePerms:', err);
      Alert.alert('Error', 'No se pudieron guardar los permisos.');
    } finally {
      setSaving(false);
    }
  };

  // ------- Render usuario -------
  const renderUser = ({ item }: { item: UserRow }) => (
    <TouchableOpacity style={styles.userCard} onPress={() => openEdit(item)} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(item.full_name)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.userName} numberOfLines={1}>
          {item.full_name}
        </Text>
        <Text style={styles.userEmail} numberOfLines={1}>
          {item.email}
        </Text>
        <View style={styles.chipsRow}>
          <View style={[styles.chip, styles.chipRole]}>
            <Text style={styles.chipText}>{ROLE_LABEL[item.role] || item.role}</Text>
          </View>
          <View style={[styles.chip, item.panel_count > 0 ? styles.chipCount : styles.chipCountZero]}>
            <Ionicons name="grid-outline" size={11} color={item.panel_count > 0 ? '#047857' : '#64748B'} />
            <Text style={[styles.chipText, { color: item.panel_count > 0 ? '#047857' : '#64748B', marginLeft: 4 }]}>
              {item.panel_count} {item.panel_count === 1 ? 'panel' : 'paneles'}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
    </TouchableOpacity>
  );

  // ------- Render paneles por categoría -------
  const panelsByCategory = useMemo(() => {
    const map: Record<string, Panel[]> = {};
    allPanels.forEach((p) => {
      const cat = p.category || 'otros';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    return map;
  }, [allPanels]);

  const orderedCategories = useMemo(
    () => Object.keys(panelsByCategory).sort((a, b) => a.localeCompare(b)),
    [panelsByCategory]
  );

  const totalSelected = useMemo(
    () => Object.values(userPerms).filter((p) => p.can_view).length,
    [userPerms]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Permisos de Paneles</Text>
          <Text style={styles.subtitle}>Paneles por usuario</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={ORANGE} />
        </TouchableOpacity>
      </View>

      {/* Banner informativo */}
      <View style={styles.banner}>
        <Ionicons name="information-circle-outline" size={18} color="#1E40AF" />
        <Text style={styles.bannerText}>
          La <Text style={{ fontWeight: '700' }}>Matriz por Rol</Text> solo se gestiona desde el Panel Web. Aquí solo paneles por usuario.
        </Text>
      </View>

      {/* Buscador */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre o correo"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filtros por rol */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
        {ROLES_FILTER.map((r) => {
          const active = roleFilter === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              onPress={() => setRoleFilter(r.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Lista */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ORANGE} size="large" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => String(u.id)}
          renderItem={renderUser}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={42} color="#CBD5E1" />
              <Text style={styles.emptyText}>Sin usuarios para mostrar</Text>
            </View>
          }
        />
      )}

      {/* Modal de edición */}
      <Modal visible={editOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
          {/* Header modal */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditOpen(false)} style={styles.backBtn}>
              <Ionicons name="close" size={26} color="#0F172A" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {selectedUser?.full_name || 'Usuario'}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {selectedUser?.email}
              </Text>
            </View>
          </View>

          {isUserSuper && (
            <View style={[styles.banner, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
              <Ionicons name="shield-checkmark" size={18} color="#92400E" />
              <Text style={[styles.bannerText, { color: '#92400E' }]}>
                Este usuario es Super Administrador y tiene acceso total. No editable.
              </Text>
            </View>
          )}

          {loadingPerms ? (
            <View style={styles.center}>
              <ActivityIndicator color={ORANGE} size="large" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryText}>
                  <Text style={{ fontWeight: '700', color: ORANGE }}>{totalSelected}</Text> de{' '}
                  <Text style={{ fontWeight: '700' }}>{allPanels.length}</Text> paneles habilitados
                </Text>
              </View>

              {orderedCategories.map((cat) => {
                const meta = CATEGORY_LABELS[cat] || {
                  label: cat,
                  color: '#64748B',
                  icon: 'apps-outline' as keyof typeof Ionicons.glyphMap,
                };
                const panels = panelsByCategory[cat];
                const allOn = panels.every((p) => userPerms[p.panel_key]?.can_view);
                return (
                  <View key={cat} style={styles.categoryCard}>
                    <View style={styles.categoryHeader}>
                      <View style={[styles.categoryIcon, { backgroundColor: meta.color + '20' }]}>
                        <Ionicons name={meta.icon} size={16} color={meta.color} />
                      </View>
                      <Text style={styles.categoryTitle}>{meta.label}</Text>
                      <TouchableOpacity
                        onPress={() => allOnCategory(cat, !allOn)}
                        disabled={isUserSuper}
                        style={[styles.bulkBtn, isUserSuper && { opacity: 0.4 }]}
                      >
                        <Text style={styles.bulkBtnText}>{allOn ? 'Quitar todo' : 'Marcar todo'}</Text>
                      </TouchableOpacity>
                    </View>

                    {panels.map((p) => {
                      const cur = userPerms[p.panel_key] || { can_view: false, can_edit: false };
                      return (
                        <View key={p.panel_key} style={styles.panelRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.panelName} numberOfLines={2}>
                              {p.panel_name}
                            </Text>
                            <Text style={styles.panelKey} numberOfLines={1}>
                              {p.panel_key}
                            </Text>
                            {p.description ? (
                              <Text style={styles.panelDesc} numberOfLines={2}>
                                {p.description}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.switchCol}>
                            <View style={styles.switchItem}>
                              <Text style={styles.switchLabel}>Ver</Text>
                              <Switch
                                value={cur.can_view}
                                onValueChange={() => togglePerm(p.panel_key, 'can_view')}
                                disabled={isUserSuper}
                                trackColor={{ false: '#E2E8F0', true: ORANGE }}
                                thumbColor="#fff"
                              />
                            </View>
                            <View style={styles.switchItem}>
                              <Text style={styles.switchLabel}>Editar</Text>
                              <Switch
                                value={cur.can_edit}
                                onValueChange={() => togglePerm(p.panel_key, 'can_edit')}
                                disabled={isUserSuper || !cur.can_view}
                                trackColor={{ false: '#E2E8F0', true: '#9333EA' }}
                                thumbColor="#fff"
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Footer guardar */}
          {!isUserSuper && !loadingPerms && (
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={savePerms} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>Guardar permisos</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 4, marginRight: 4 },
  refreshBtn: { padding: 6 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 8,
  },
  bannerText: { color: '#1E40AF', fontSize: 12, flex: 1 },
  searchRow: { paddingHorizontal: 12, marginTop: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    height: 42,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 0 },
  filterScroll: { marginTop: 10, maxHeight: 38 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  filterChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700' },
  userName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  userEmail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  chipsRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  chipRole: { backgroundColor: '#F1F5F9' },
  chipCount: { backgroundColor: '#DCFCE7' },
  chipCountZero: { backgroundColor: '#F1F5F9' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#94A3B8', marginTop: 8 },
  summaryBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryText: { fontSize: 13, color: '#0F172A' },
  categoryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  categoryIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#0F172A' },
  bulkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  bulkBtnText: { fontSize: 11, fontWeight: '700', color: '#B91C1C' },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 10,
  },
  panelName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  panelKey: { fontSize: 10, color: '#94A3B8', marginTop: 1, fontFamily: 'Courier' },
  panelDesc: { fontSize: 11, color: '#64748B', marginTop: 3 },
  switchCol: { alignItems: 'flex-end', gap: 4 },
  switchItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  switchLabel: { fontSize: 11, color: '#475569', fontWeight: '600', minWidth: 40, textAlign: 'right' },
  modalFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  cancelBtnText: { color: '#475569', fontWeight: '700' },
  saveBtn: {
    flex: 2,
    height: 46,
    borderRadius: 10,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});
