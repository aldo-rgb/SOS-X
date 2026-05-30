/**
 * UsersAdminScreen
 * -----------------------------------------------------------
 * Gestión de usuarios — solo Super Admin.
 * Replica las funciones de la página "Clientes" del Panel Web:
 * listado con búsqueda y filtro por rol, ver detalles, editar
 * datos (nombre, correo, rol, casillero, asesor), cambiar
 * contraseña y resetear a Entregax123 forzando cambio.
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'UsersAdmin'>;

const ORANGE = '#F05A28';
const BG = '#F4F6F8';

interface UserRow {
  id: number;
  full_name: string;
  email: string;
  role: string;
  box_id?: string | null;
  phone?: string | null;
  created_at?: string;
  advisor_id?: number | null;
  is_active?: boolean;
}

interface Advisor { id: number; full_name: string; }

const ROLES_FILTER: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'client', label: 'Clientes' },
  { key: 'advisor', label: 'Asesores' },
  { key: 'sub_advisor', label: 'Sub-Asesor' },
  { key: 'counter_staff', label: 'Mostrador' },
  { key: 'warehouse_ops', label: 'Bodega' },
  { key: 'branch_manager', label: 'Operaciones' },
  { key: 'repartidor', label: 'Repartidor' },
  { key: 'customer_service', label: 'Servicio Cliente' },
  { key: 'accountant', label: 'Contador' },
  { key: 'director', label: 'Director' },
  { key: 'admin', label: 'Admin' },
  { key: 'super_admin', label: 'Super Admin' },
];

const ROLE_LABEL: Record<string, string> = ROLES_FILTER.reduce((acc, r) => {
  acc[r.key] = r.label; return acc;
}, {} as Record<string, string>);

const initials = (name: string) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('');

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
  } catch { return ''; }
};

export default function UsersAdminScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [detailUser, setDetailUser] = useState<UserRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ full_name: string; email: string; role: string; box_id: string; advisor_id: number | null }>({
    full_name: '', email: '', role: '', box_id: '', advisor_id: null,
  });
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [advisorPickerOpen, setAdvisorPickerOpen] = useState(false);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [uRes, aRes] = await Promise.all([
        fetch(`${API_URL}/api/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/admin/advisors`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const uData = await uRes.json();
      setUsers(uData.users || uData || []);
      if (aRes.ok) {
        const aData = await aRes.json();
        setAdvisors(aData.advisors || aData || []);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.box_id || '').toLowerCase().includes(q) ||
        String(u.id).includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const openDetail = (u: UserRow) => {
    setDetailUser(u);
    setEditing(false);
  };

  const startEdit = () => {
    if (!detailUser) return;
    setEditForm({
      full_name: detailUser.full_name || '',
      email: detailUser.email || '',
      role: detailUser.role || 'client',
      box_id: detailUser.box_id || '',
      advisor_id: detailUser.advisor_id ?? null,
    });
    setNewPassword('');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!detailUser) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${detailUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: editForm.full_name,
          email: editForm.email,
          role: editForm.role,
          box_id: editForm.box_id,
          advisor_id: editForm.advisor_id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      Alert.alert('✅ Actualizado', 'Usuario actualizado correctamente');
      setEditing(false);
      setDetailUser(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo actualizar');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!detailUser) return;
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Contraseña inválida', 'Debe tener al menos 6 caracteres');
      return;
    }
    setBusy('pwd');
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${detailUser.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword, requireChange: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewPassword('');
      Alert.alert('✅ Contraseña', 'Actualizada correctamente');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo cambiar la contraseña');
    } finally {
      setBusy(null);
    }
  };

  const resetPassword = () => {
    if (!detailUser) return;
    Alert.alert(
      '🔐 Resetear a Entregax123',
      `El usuario deberá cambiar su contraseña en el próximo inicio de sesión. ¿Confirmar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Resetear', style: 'destructive', onPress: async () => {
          setBusy('reset');
          try {
            const res = await fetch(`${API_URL}/api/admin/users/${detailUser.id}/password`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ newPassword: 'Entregax123', requireChange: true }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            Alert.alert('🔐 Reseteada', 'Contraseña: Entregax123 (cambio obligatorio).');
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'No se pudo resetear');
          } finally {
            setBusy(null);
          }
        }},
      ]
    );
  };

  const renderRow = ({ item }: { item: UserRow }) => (
    <TouchableOpacity style={styles.row} onPress={() => openDetail(item)} activeOpacity={0.7}>
      <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials(item.full_name)}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{item.full_name || 'Sin nombre'}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{item.email}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {!!item.box_id && (
            <View style={styles.boxChip}><Text style={styles.boxChipTxt}>{item.box_id}</Text></View>
          )}
          <View style={styles.roleChip}><Text style={styles.roleChipTxt}>{ROLE_LABEL[item.role] || item.role}</Text></View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Usuarios</Text>
          <Text style={styles.headerSubtitle}>{filtered.length} de {users.length} · Super Admin</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search + role filter */}
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#888" />
          <TextInput
            placeholder="Buscar por nombre, email, casillero o ID"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholderTextColor="#999"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
          {ROLES_FILTER.map(r => {
            const active = roleFilter === r.key;
            return (
              <TouchableOpacity key={r.key} onPress={() => setRoleFilter(r.key)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipTxt, active && { color: '#fff' }]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => String(u.id)}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ORANGE} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={42} color="#999" />
              <Text style={{ color: '#888', marginTop: 8 }}>Sin resultados</Text>
            </View>
          }
        />
      )}

      {/* Detail / Edit Modal */}
      <Modal visible={!!detailUser} animationType="slide" transparent onRequestClose={() => setDetailUser(null)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{editing ? 'Editar Usuario' : 'Detalles del Usuario'}</Text>
              <TouchableOpacity onPress={() => { setDetailUser(null); setEditing(false); }} hitSlop={10}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            {detailUser && (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
                {!editing ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <View style={[styles.avatar, { width: 56, height: 56 }]}>
                        <Text style={[styles.avatarTxt, { fontSize: 20 }]}>{initials(detailUser.full_name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 17, fontWeight: '700', color: '#222' }}>{detailUser.full_name}</Text>
                        <View style={styles.roleChip}><Text style={styles.roleChipTxt}>{ROLE_LABEL[detailUser.role] || detailUser.role}</Text></View>
                      </View>
                    </View>
                    <Field label="ID de Usuario" value={`#${detailUser.id}`} />
                    {!!detailUser.box_id && <Field label="Casillero" value={detailUser.box_id} mono />}
                    <Field label="Correo Electrónico" value={detailUser.email} />
                    {!!detailUser.phone && <Field label="Teléfono" value={detailUser.phone} />}
                    {!!detailUser.created_at && <Field label="Registrado" value={formatDate(detailUser.created_at)} />}

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                      <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={() => setDetailUser(null)}>
                        <Text style={styles.btnOutlineTxt}>Cerrar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={startEdit}>
                        <Ionicons name="create-outline" size={16} color="#fff" />
                        <Text style={styles.btnPrimaryTxt}>Editar</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Input label="Nombre Completo" value={editForm.full_name} onChange={(v) => setEditForm(p => ({ ...p, full_name: v }))} />
                    <Input label="Correo Electrónico" value={editForm.email} onChange={(v) => setEditForm(p => ({ ...p, email: v }))} keyboardType="email-address" />

                    <LabelInput label="Rol" onPress={() => setRolePickerOpen(true)}>
                      <Text style={styles.inputTxt}>{ROLE_LABEL[editForm.role] || editForm.role || 'Selecciona…'}</Text>
                      <Ionicons name="chevron-down" size={18} color="#888" />
                    </LabelInput>

                    <Input label="Casillero" value={editForm.box_id} onChange={(v) => setEditForm(p => ({ ...p, box_id: v }))} hint="Modificable solo por Super Admin" />

                    <LabelInput label="Asesor Asignado" onPress={() => setAdvisorPickerOpen(true)}>
                      <Text style={styles.inputTxt}>
                        {advisors.find(a => a.id === editForm.advisor_id)?.full_name || 'Sin asignar'}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color="#888" />
                    </LabelInput>

                    {/* Password management */}
                    <View style={styles.pwdBlock}>
                      <Text style={styles.pwdTitle}>🔐  Gestión de Contraseña</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.input, { flex: 1, flexDirection: 'row', alignItems: 'center' }]}>
                          <TextInput
                            placeholder="Nueva contraseña"
                            value={newPassword}
                            onChangeText={setNewPassword}
                            secureTextEntry={!showPassword}
                            style={{ flex: 1, fontSize: 14, color: '#222' }}
                            placeholderTextColor="#999"
                            autoCapitalize="none"
                          />
                          <TouchableOpacity onPress={() => setShowPassword(s => !s)} hitSlop={10}>
                            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color="#888" />
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          style={[styles.btn, styles.btnPrimary, { paddingHorizontal: 14 }]}
                          onPress={changePassword}
                          disabled={busy === 'pwd'}
                        >
                          {busy === 'pwd' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryTxt}>Cambiar</Text>}
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnGhostDanger, { marginTop: 10 }]}
                        onPress={resetPassword}
                        disabled={busy === 'reset'}
                      >
                        {busy === 'reset' ? <ActivityIndicator color="#C62828" size="small" /> : (
                          <>
                            <Ionicons name="refresh-circle-outline" size={16} color="#C62828" />
                            <Text style={styles.btnGhostDangerTxt}>Resetear a Entregax123</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                      <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={() => setEditing(false)}>
                        <Text style={styles.btnOutlineTxt}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={saveEdit} disabled={saving}>
                        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryTxt}>Guardar Cambios</Text>}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Role picker */}
      <PickerModal
        visible={rolePickerOpen}
        title="Selecciona el rol"
        onClose={() => setRolePickerOpen(false)}
        options={ROLES_FILTER.filter(r => r.key !== 'all').map(r => ({ id: r.key, label: r.label }))}
        selectedId={editForm.role}
        onSelect={(id) => { setEditForm(p => ({ ...p, role: String(id) })); setRolePickerOpen(false); }}
      />

      {/* Advisor picker */}
      <PickerModal
        visible={advisorPickerOpen}
        title="Asesor asignado"
        onClose={() => setAdvisorPickerOpen(false)}
        options={[{ id: 0, label: 'Sin asignar' }, ...advisors.map(a => ({ id: a.id, label: a.full_name }))]}
        selectedId={editForm.advisor_id ?? 0}
        onSelect={(id) => { setEditForm(p => ({ ...p, advisor_id: id === 0 ? null : Number(id) })); setAdvisorPickerOpen(false); }}
      />
    </SafeAreaView>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <Text style={[styles.fieldVal, mono && { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) }]}>{value}</Text>
    </View>
  );
}

function Input({ label, value, onChange, hint, keyboardType }: { label: string; value: string; onChange: (v: string) => void; hint?: string; keyboardType?: any }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        placeholderTextColor="#999"
        autoCapitalize="none"
        keyboardType={keyboardType}
      />
      {!!hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

function LabelInput({ label, children, onPress }: { label: string; children: React.ReactNode; onPress: () => void }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <TouchableOpacity style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={onPress}>
        {children}
      </TouchableOpacity>
    </View>
  );
}

function PickerModal({ visible, title, onClose, options, selectedId, onSelect }: {
  visible: boolean; title: string; onClose: () => void;
  options: Array<{ id: string | number; label: string }>;
  selectedId: string | number;
  onSelect: (id: string | number) => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={[styles.modalCard, { maxHeight: '70%' }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => String(o.id)}
            renderItem={({ item }) => {
              const active = item.id === selectedId;
              return (
                <TouchableOpacity style={styles.pickerItem} onPress={() => onSelect(item.id)}>
                  <Text style={[styles.pickerItemTxt, active && { color: ORANGE, fontWeight: '700' }]}>{item.label}</Text>
                  {active && <Ionicons name="checkmark" size={18} color={ORANGE} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  header: { backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  headerBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },

  toolbar: { backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#DDD' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F4F6F8', margin: 12, marginBottom: 0, paddingHorizontal: 12, borderRadius: 10, height: 40 },
  searchInput: { flex: 1, fontSize: 14, color: '#222' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F0F0F0' },
  filterChipActive: { backgroundColor: ORANGE },
  filterChipTxt: { fontSize: 12, color: '#444', fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 10, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#222' },
  rowMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  roleChip: { backgroundColor: '#E8EAF6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  roleChipTxt: { fontSize: 11, color: '#3F51B5', fontWeight: '600' },
  boxChip: { backgroundColor: '#222', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  boxChipTxt: { fontSize: 11, color: '#fff', fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#222' },

  fieldLbl: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  fieldVal: { fontSize: 14, color: '#222' },
  fieldHint: { fontSize: 11, color: '#888', marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#222', backgroundColor: '#fff', minHeight: 42 },
  inputTxt: { fontSize: 14, color: '#222' },

  pwdBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#EEE', paddingTop: 14, marginTop: 8 },
  pwdTitle: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 8 },

  btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnPrimary: { backgroundColor: ORANGE },
  btnPrimaryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnOutline: { borderWidth: 1, borderColor: '#DDD', backgroundColor: '#fff' },
  btnOutlineTxt: { color: '#444', fontWeight: '600', fontSize: 14 },
  btnGhostDanger: { borderWidth: 1, borderColor: '#F4CCCC', backgroundColor: '#FFF4F4' },
  btnGhostDangerTxt: { color: '#C62828', fontWeight: '700', fontSize: 13 },

  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  pickerItemTxt: { fontSize: 14, color: '#222' },
});
