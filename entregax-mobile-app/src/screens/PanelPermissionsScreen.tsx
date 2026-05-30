/**
 * PanelPermissionsScreen — Wizard de 3 pasos
 * -----------------------------------------------------------
 *   Paso 1: seleccionar uno o varios usuarios.
 *   Paso 2: elegir la sección maestra (Administración, Operaciones,
 *           Servicio a Cliente, Contabilidad).
 *   Paso 3: marcar Ver / Editar por módulo dentro de esa sección
 *           y aplicar los cambios a todos los usuarios elegidos.
 *
 * Estrategia de guardado: el endpoint
 *   PUT /api/admin/panels/user/:userId
 * reemplaza la lista COMPLETA. Para no borrar permisos de otras
 * categorías, primero leemos los permisos actuales de cada usuario,
 * sobreescribimos sólo los panel_keys de la categoría editada y
 * enviamos la lista combinada.
 *
 * La matriz por rol y la configuración de capacidades de Cajito IA
 * siguen siendo exclusivas del Panel Web — desde el móvil sólo se
 * gestionan paneles por usuario.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
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
  panel_count: number;
}

interface UserPermission {
  panel_key: string;
  can_view: boolean;
  can_edit: boolean;
}

type WizardStep = 'users' | 'category' | 'modules';

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

interface CategoryMeta {
  key: string;
  label: string;
  description: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// Categorías disponibles para el wizard. El orden coincide con
// el Panel Web (Administración → Operaciones → Servicio → Contabilidad → Cajito).
// Cajito sale como "solo Web" porque su modelo de capacidades es distinto.
const CATEGORIES: CategoryMeta[] = [
  { key: 'admin',            label: 'Administración',     description: 'CRUDs internos, configuración y catálogos.', color: '#9C27B0', icon: 'shield-checkmark-outline' },
  { key: 'operations',       label: 'Operaciones',        description: 'Bodega, embarques, recepciones y entregas.', color: '#2196F3', icon: 'cube-outline' },
  { key: 'customer_service', label: 'Servicio a Cliente', description: 'Tickets, chat y atención post-venta.',       color: '#4CAF50', icon: 'headset-outline' },
  { key: 'Contabilidad',     label: 'Contabilidad',       description: 'Cobros, conciliaciones y reportes fiscales.', color: '#E87722', icon: 'receipt-outline' },
];

const initials = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('');

export default function PanelPermissionsScreen({ navigation, route }: Props) {
  const { token } = route.params;

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  // -------- Estado del wizard --------
  const [step, setStep] = useState<WizardStep>('users');

  // Paso 1
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [allPanels, setAllPanels] = useState<Panel[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Paso 2
  const [categoryKey, setCategoryKey] = useState<string | null>(null);

  // Paso 3
  const [moduleState, setModuleState] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>({});
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);
  // Cuando un usuario seleccionado es Super Admin, no se puede modificar.
  const [superAdminBlock, setSuperAdminBlock] = useState<string[]>([]);

  // -------- Cargas --------
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

  useEffect(() => {
    const t = setTimeout(() => loadUsers(), 350);
    return () => clearTimeout(t);
  }, [search, roleFilter, loadUsers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPanels(), loadUsers()]);
    setRefreshing(false);
  }, [loadPanels, loadUsers]);

  // -------- Paso 1 --------
  const toggleUser = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => setSelectedIds(new Set(users.map((u) => u.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.has(u.id)),
    [users, selectedIds]
  );

  // -------- Paso 2 → 3 --------
  // Si seleccionaron UN solo usuario, precargamos sus permisos actuales para
  // la categoría. Si son varios, dejamos todo OFF (el operador marca qué
  // desea APLICAR en bloque).
  const enterModules = useCallback(async (catKey: string) => {
    setCategoryKey(catKey);
    setStep('modules');
    setLoadingPerms(true);
    setSuperAdminBlock([]);
    try {
      const catPanels = allPanels.filter((p) => p.category === catKey);
      const baseState: Record<string, { can_view: boolean; can_edit: boolean }> = {};
      catPanels.forEach((p) => { baseState[p.panel_key] = { can_view: false, can_edit: false }; });

      const supers: string[] = [];

      if (selectedUsers.length === 1) {
        const u = selectedUsers[0];
        const res = await fetch(`${API_URL}/api/admin/panels/user/${u.id}`, { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          if (data.isSuperAdmin) supers.push(u.full_name);
          (data.permissions || []).forEach((p: UserPermission) => {
            if (baseState[p.panel_key]) {
              baseState[p.panel_key] = { can_view: !!p.can_view, can_edit: !!p.can_edit };
            }
          });
        }
      } else {
        const checks = await Promise.all(
          selectedUsers.map(async (u) => {
            try {
              const r = await fetch(`${API_URL}/api/admin/panels/user/${u.id}`, { headers: authHeaders });
              if (!r.ok) return null;
              const d = await r.json();
              return d.isSuperAdmin ? u.full_name : null;
            } catch { return null; }
          })
        );
        checks.forEach((n) => { if (n) supers.push(n); });
      }

      setSuperAdminBlock(supers);
      setModuleState(baseState);
    } catch (err) {
      console.error('[PanelPermissions] enterModules:', err);
      Alert.alert('Error', 'No se pudieron cargar los permisos actuales.');
    } finally {
      setLoadingPerms(false);
    }
  }, [allPanels, authHeaders, selectedUsers]);

  // -------- Paso 3 --------
  const togglePerm = (panel_key: string, field: 'can_view' | 'can_edit') => {
    setModuleState((prev) => {
      const cur = prev[panel_key] || { can_view: false, can_edit: false };
      const next = { ...cur, [field]: !cur[field] };
      if (field === 'can_view' && !next.can_view) next.can_edit = false;
      if (field === 'can_edit' && next.can_edit) next.can_view = true;
      return { ...prev, [panel_key]: next };
    });
  };

  const bulkToggle = (field: 'can_view' | 'can_edit', value: boolean) => {
    setModuleState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        const cur = next[k];
        const updated = { ...cur, [field]: value };
        if (field === 'can_view' && !value) updated.can_edit = false;
        if (field === 'can_edit' && value) updated.can_view = true;
        next[k] = updated;
      });
      return next;
    });
  };

  // Guarda los permisos de la categoría activa para todos los usuarios
  // elegidos, preservando los permisos de otras categorías.
  const applyChanges = async () => {
    if (!categoryKey) return;
    if (superAdminBlock.length === selectedUsers.length) {
      Alert.alert('Sin cambios', 'Todos los usuarios elegidos son Super Administradores y no son editables.');
      return;
    }

    const editableUsers = selectedUsers.filter((u) => !superAdminBlock.includes(u.full_name));
    const categoryPanelKeys = new Set(allPanels.filter((p) => p.category === categoryKey).map((p) => p.panel_key));

    setSaving(true);
    let okCount = 0;
    let failCount = 0;

    for (const u of editableUsers) {
      try {
        const r = await fetch(`${API_URL}/api/admin/panels/user/${u.id}`, { headers: authHeaders });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const current: Record<string, UserPermission> = {};
        (data.permissions || []).forEach((p: UserPermission) => { current[p.panel_key] = p; });

        const merged: UserPermission[] = allPanels.map((p) => {
          if (categoryPanelKeys.has(p.panel_key)) {
            const ms = moduleState[p.panel_key] || { can_view: false, can_edit: false };
            return { panel_key: p.panel_key, can_view: ms.can_view, can_edit: ms.can_edit };
          }
          const ex = current[p.panel_key];
          return { panel_key: p.panel_key, can_view: !!ex?.can_view, can_edit: !!ex?.can_edit };
        });

        const put = await fetch(`${API_URL}/api/admin/panels/user/${u.id}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ permissions: merged }),
        });
        if (!put.ok) throw new Error(`HTTP ${put.status}`);
        okCount += 1;
      } catch (err) {
        console.error(`[PanelPermissions] save user ${u.id}:`, err);
        failCount += 1;
      }
    }

    setSaving(false);

    const lines = [
      `${okCount} usuario(s) actualizado(s).`,
      failCount > 0 ? `${failCount} con error.` : null,
      superAdminBlock.length > 0 ? `${superAdminBlock.length} Super Admin omitido(s).` : null,
    ].filter(Boolean).join('\n');

    Alert.alert(failCount === 0 ? 'Permisos aplicados' : 'Aplicado con errores', lines, [
      { text: 'OK', onPress: async () => {
        setStep('users');
        setSelectedIds(new Set());
        setCategoryKey(null);
        setModuleState({});
        await loadUsers();
      } },
    ]);
  };

  // -------- Derivados --------
  const panelsForCategory = useMemo(
    () => (categoryKey ? allPanels.filter((p) => p.category === categoryKey) : []),
    [allPanels, categoryKey]
  );

  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    allPanels.forEach((p) => { m[p.category] = (m[p.category] || 0) + 1; });
    return m;
  }, [allPanels]);

  // ============== RENDER ==============

  const renderUserRow = ({ item }: { item: UserRow }) => {
    const checked = selectedIds.has(item.id);
    return (
      <TouchableOpacity style={[styles.userCard, checked && styles.userCardChecked]} onPress={() => toggleUser(item.id)} activeOpacity={0.7}>
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item.full_name)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.userName} numberOfLines={1}>{item.full_name}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
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
      </TouchableOpacity>
    );
  };

  // -------- Step 1 --------
  if (step === 'users') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Permisos de Paneles</Text>
            <Text style={styles.subtitle}>Paso 1 de 3 · Selecciona usuario(s)</Text>
          </View>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={22} color={ORANGE} />
          </TouchableOpacity>
        </View>

        <Stepper current={1} />

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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
          {ROLES_FILTER.map((r) => {
            const active = roleFilter === r.key;
            return (
              <TouchableOpacity key={r.key} onPress={() => setRoleFilter(r.key)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.massRow}>
          <TouchableOpacity onPress={selectAllVisible} style={styles.massBtn}>
            <Ionicons name="checkmark-done" size={14} color="#0F172A" />
            <Text style={styles.massBtnText}>Marcar visibles</Text>
          </TouchableOpacity>
          {selectedIds.size > 0 && (
            <TouchableOpacity onPress={clearSelection} style={[styles.massBtn, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="close" size={14} color="#B91C1C" />
              <Text style={[styles.massBtnText, { color: '#B91C1C' }]}>Limpiar ({selectedIds.size})</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={ORANGE} size="large" /></View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => String(u.id)}
            renderItem={renderUserRow}
            contentContainerStyle={{ padding: 12, paddingBottom: 110 }}
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

        <View style={styles.footer}>
          <TouchableOpacity
            disabled={selectedIds.size === 0}
            onPress={() => setStep('category')}
            style={[styles.primaryBtn, selectedIds.size === 0 && styles.primaryBtnDisabled]}
          >
            <Text style={styles.primaryBtnText}>
              Continuar {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // -------- Step 2 --------
  if (step === 'category') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('users')} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Elige una sección</Text>
            <Text style={styles.subtitle}>
              Paso 2 de 3 · {selectedUsers.length} usuario{selectedUsers.length === 1 ? '' : 's'} seleccionado{selectedUsers.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        <Stepper current={2} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedChipsWrap}>
          {selectedUsers.map((u) => (
            <View key={u.id} style={styles.selectedChip}>
              <Ionicons name="person" size={12} color="#0F172A" />
              <Text style={styles.selectedChipText} numberOfLines={1}>{u.full_name}</Text>
            </View>
          ))}
        </ScrollView>

        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {CATEGORIES.map((c) => {
            const count = categoryCounts[c.key] || 0;
            return (
              <TouchableOpacity key={c.key} style={styles.catCard} onPress={() => enterModules(c.key)} activeOpacity={0.7}>
                <View style={[styles.catIcon, { backgroundColor: c.color + '22' }]}>
                  <Ionicons name={c.icon} size={22} color={c.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.catTitle}>{c.label}</Text>
                  <Text style={styles.catDesc} numberOfLines={2}>{c.description}</Text>
                  <Text style={styles.catCount}>{count} módulo{count === 1 ? '' : 's'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
              </TouchableOpacity>
            );
          })}

          <View style={styles.cajitoNote}>
            <Ionicons name="information-circle-outline" size={16} color="#1E40AF" />
            <Text style={styles.cajitoNoteText}>
              Las capacidades de <Text style={{ fontWeight: '700' }}>Cajito (IA)</Text> se configuran únicamente en el Panel Web.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // -------- Step 3 --------
  const catMeta = CATEGORIES.find((c) => c.key === categoryKey);
  const allViewOn = panelsForCategory.length > 0 && panelsForCategory.every((p) => moduleState[p.panel_key]?.can_view);
  const allBlocked = superAdminBlock.length > 0 && superAdminBlock.length === selectedUsers.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('category')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{catMeta?.label || 'Módulos'}</Text>
          <Text style={styles.subtitle}>
            Paso 3 de 3 · {panelsForCategory.length} módulo{panelsForCategory.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      <Stepper current={3} />

      <View style={styles.modulesSummary}>
        <Text style={styles.modulesSummaryText}>
          Aplicará a <Text style={{ fontWeight: '700', color: ORANGE }}>{selectedUsers.length}</Text> usuario{selectedUsers.length === 1 ? '' : 's'}
        </Text>
        <TouchableOpacity onPress={() => bulkToggle('can_view', !allViewOn)} disabled={allBlocked} style={[styles.bulkBtn, allBlocked && { opacity: 0.4 }]}>
          <Text style={styles.bulkBtnText}>{allViewOn ? 'Quitar todo' : 'Marcar todo Ver'}</Text>
        </TouchableOpacity>
      </View>

      {superAdminBlock.length > 0 && (
        <View style={[styles.banner, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
          <Ionicons name="shield-checkmark" size={18} color="#92400E" />
          <Text style={[styles.bannerText, { color: '#92400E' }]}>
            {superAdminBlock.length === selectedUsers.length
              ? 'Todos los usuarios son Super Admin: no se pueden editar.'
              : `Se omitirán ${superAdminBlock.length} Super Admin: ${superAdminBlock.join(', ')}.`}
          </Text>
        </View>
      )}

      {loadingPerms ? (
        <View style={styles.center}><ActivityIndicator color={ORANGE} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 110 }}>
          {panelsForCategory.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={42} color="#CBD5E1" />
              <Text style={styles.emptyText}>Esta sección no tiene módulos.</Text>
            </View>
          )}
          {panelsForCategory.map((p) => {
            const cur = moduleState[p.panel_key] || { can_view: false, can_edit: false };
            return (
              <View key={p.panel_key} style={styles.panelRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.panelName} numberOfLines={2}>{p.panel_name}</Text>
                  <Text style={styles.panelKey} numberOfLines={1}>{p.panel_key}</Text>
                  {p.description ? (
                    <Text style={styles.panelDesc} numberOfLines={2}>{p.description}</Text>
                  ) : null}
                </View>
                <View style={styles.switchCol}>
                  <View style={styles.switchItem}>
                    <Text style={styles.switchLabel}>Ver</Text>
                    <Switch
                      value={cur.can_view}
                      onValueChange={() => togglePerm(p.panel_key, 'can_view')}
                      disabled={allBlocked}
                      trackColor={{ false: '#E2E8F0', true: ORANGE }}
                      thumbColor="#fff"
                    />
                  </View>
                  <View style={styles.switchItem}>
                    <Text style={styles.switchLabel}>Editar</Text>
                    <Switch
                      value={cur.can_edit}
                      onValueChange={() => togglePerm(p.panel_key, 'can_edit')}
                      disabled={allBlocked || !cur.can_view}
                      trackColor={{ false: '#E2E8F0', true: '#9333EA' }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep('category')} disabled={saving}>
          <Text style={styles.cancelBtnText}>Atrás</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { flex: 2 }, (saving || allBlocked) && styles.primaryBtnDisabled]}
          onPress={applyChanges}
          disabled={saving || allBlocked}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Aplicar a {selectedUsers.length - superAdminBlock.length}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// -------- Stepper visual de 3 puntos --------
function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const items: Array<{ n: 1 | 2 | 3; label: string }> = [
    { n: 1, label: 'Usuarios' },
    { n: 2, label: 'Sección' },
    { n: 3, label: 'Módulos' },
  ];
  return (
    <View style={styles.stepper}>
      {items.map((it, i) => {
        const active = current === it.n;
        const done = current > it.n;
        return (
          <React.Fragment key={it.n}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, (active || done) && styles.stepDotActive]}>
                {done ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : (
                  <Text style={[styles.stepNum, (active || done) && { color: '#fff' }]}>{it.n}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, active && { color: ORANGE, fontWeight: '700' }]}>{it.label}</Text>
            </View>
            {i < items.length - 1 && <View style={[styles.stepBar, done && { backgroundColor: ORANGE }]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 4, marginRight: 4 },
  refreshBtn: { padding: 6 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },

  stepper: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: ORANGE },
  stepNum: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  stepLabel: { fontSize: 10, color: '#64748B' },
  stepBar: { flex: 1, height: 2, backgroundColor: '#E2E8F0', marginHorizontal: 6 },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#DBEAFE', borderColor: '#BFDBFE', borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8,
    marginHorizontal: 12, marginTop: 10, borderRadius: 8,
  },
  bannerText: { color: '#1E40AF', fontSize: 12, flex: 1 },

  searchRow: { paddingHorizontal: 12, marginTop: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 10, height: 42, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 0 },

  filterScroll: { marginTop: 10, maxHeight: 38 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  filterChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },

  massRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 10 },
  massBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  massBtnText: { fontSize: 12, fontWeight: '700', color: '#0F172A' },

  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  userCardChecked: { borderColor: ORANGE, backgroundColor: '#FFF7F3' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700' },
  userName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  userEmail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  chipsRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipRole: { backgroundColor: '#F1F5F9' },
  chipCount: { backgroundColor: '#DCFCE7' },
  chipCountZero: { backgroundColor: '#F1F5F9' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#94A3B8', marginTop: 8 },

  selectedChipsWrap: { gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  selectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFE0D2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    maxWidth: 160,
  },
  selectedChipText: { fontSize: 11, color: '#0F172A', fontWeight: '600' },

  catCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  catIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  catTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  catDesc: { fontSize: 12, color: '#64748B', marginTop: 3 },
  catCount: { fontSize: 11, color: ORANGE, marginTop: 4, fontWeight: '700' },

  cajitoNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#DBEAFE', borderColor: '#BFDBFE', borderWidth: 1,
    borderRadius: 8, padding: 10, marginTop: 6,
  },
  cajitoNoteText: { color: '#1E40AF', fontSize: 12, flex: 1 },

  modulesSummary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  modulesSummaryText: { fontSize: 13, color: '#0F172A' },
  bulkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#FEE2E2' },
  bulkBtnText: { fontSize: 11, fontWeight: '700', color: '#B91C1C' },

  panelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderRadius: 10,
    marginBottom: 8, gap: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  panelName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  panelKey: { fontSize: 10, color: '#94A3B8', marginTop: 1, fontFamily: 'Courier' },
  panelDesc: { fontSize: 11, color: '#64748B', marginTop: 3 },
  switchCol: { alignItems: 'flex-end', gap: 4 },
  switchItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  switchLabel: { fontSize: 11, color: '#475569', fontWeight: '600', minWidth: 40, textAlign: 'right' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 10, padding: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  primaryBtn: {
    flex: 1, height: 46, borderRadius: 10, backgroundColor: ORANGE,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  primaryBtnDisabled: { backgroundColor: '#FCA98E' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn: {
    flex: 1, height: 46, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  cancelBtnText: { color: '#475569', fontWeight: '700' },
});
