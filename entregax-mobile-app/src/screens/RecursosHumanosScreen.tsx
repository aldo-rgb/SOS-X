import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';

const ROLES = [
  { value: 'counter_staff', label: 'Mostrador' },
  { value: 'warehouse_ops', label: 'Bodega' },
  { value: 'repartidor', label: 'Repartidor' },
  { value: 'customer_service', label: 'Servicio al Cliente' },
  { value: 'branch_manager', label: 'Operaciones' },
  { value: 'operaciones', label: 'Operaciones' },
  { value: 'accountant', label: 'Contabilidad' },
  { value: 'director', label: 'Director' },
  { value: 'admin', label: 'Administrador' },
  { value: 'advisor', label: 'Asesor' },
  { value: 'monitoreo', label: 'Monitoreo' },
  { value: 'soporte_tecnico', label: 'Soporte Técnico' },
  { value: 'finanzas', label: 'Finanzas' },
  { value: 'abogado', label: 'Abogado' },
  { value: 'super_admin', label: 'Super Admin' },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.value, r.label]));

interface UserHR {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  role: string;
  phone?: string;
  created_at: string;
  is_active?: boolean;
  branch_name?: string;
  advisor_name?: string;
}

export default function RecursosHumanosScreen({ navigation, route }: any) {
  const { token } = route.params;
  const [tab, setTab] = useState<'lista' | 'alta'>('lista');
  const [users, setUsers] = useState<UserHR[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserHR | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [detailTab, setDetailTab] = useState(0);
  const [attendance, setAttendance] = useState<any[]>([]);

  // Alta form
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', phone: '', role: 'counter_staff',
  });
  const [saving, setSaving] = useState(false);
  const [rolePickerVisible, setRolePickerVisible] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/users', { headers: { Authorization: `Bearer ${token}` } });
      const clientRoles = ['client', 'cliente', 'Client', 'Cliente'];
      const employees = (res.data.users || []).filter((u: UserHR) => !clientRoles.includes(u.role));
      setUsers(employees);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la lista de empleados');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const rolesPresentes = Array.from(new Set(users.map(u => u.role))).sort();

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.box_id?.toLowerCase().includes(search.toLowerCase()) ||
      u.role?.toLowerCase().includes(search.toLowerCase());
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const handleCreateUser = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) {
      Alert.alert('Campos requeridos', 'Nombre, email y contraseña son obligatorios');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/auth/register', {
        fullName: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        role: form.role,
      }, { headers: { Authorization: `Bearer ${token}` } });
      Alert.alert('✅ Usuario creado', `${form.full_name} fue registrado exitosamente`);
      setForm({ full_name: '', email: '', password: '', phone: '', role: 'counter_staff' });
      setTab('lista');
      loadUsers();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Error al crear usuario';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const openProfile = async (user: UserHR) => {
    setSelectedUser(user);
    setDetailVisible(true);
    setDetailTab(0);
    setProfile(null);
    setAttendance([]);
    setProfileLoading(true);
    try {
      const [profRes, attRes] = await Promise.all([
        api.get(`/api/admin/hr/employees/${user.id}/full-profile`, { headers: { Authorization: `Bearer ${token}` } }),
        api.get(`/api/admin/hr/attendance?user_id=${user.id}&limit=30`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { records: [] } })),
      ]);
      setProfile(profRes.data);
      setAttendance(attRes.data.records || attRes.data.attendance || []);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el perfil');
    } finally {
      setProfileLoading(false);
    }
  };

  const fmtDate = (d: string) => {
    if (!d) return '—';
    const s = String(d).substring(0, 10);
    const [y, m, day] = s.split('-');
    return `${day}/${m}/${y}`;
  };

  const roleColor = (role: string) => {
    if (['super_admin', 'admin', 'director'].includes(role)) return '#dc2626';
    if (['branch_manager', 'operaciones'].includes(role)) return '#d97706';
    if (['advisor', 'asesor_lider'].includes(role)) return '#7c3aed';
    return ORANGE;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recursos Humanos</Text>
        <TouchableOpacity onPress={loadUsers} style={styles.backBtn}>
          <Ionicons name="refresh-outline" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'lista' && styles.tabActive]}
          onPress={() => setTab('lista')}
        >
          <Ionicons name="people-outline" size={16} color={tab === 'lista' ? ORANGE : '#666'} />
          <Text style={[styles.tabText, tab === 'lista' && styles.tabTextActive]}>
            Empleados ({users.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'alta' && styles.tabActive]}
          onPress={() => setTab('alta')}
        >
          <Ionicons name="person-add-outline" size={16} color={tab === 'alta' ? ORANGE : '#666'} />
          <Text style={[styles.tabText, tab === 'alta' && styles.tabTextActive]}>Alta de Usuario</Text>
        </TouchableOpacity>
      </View>

      {/* ── LISTA ── */}
      {tab === 'lista' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color="#999" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, email, Box ID, rol..."
              value={search}
              onChangeText={setSearch}
              placeholderTextColor="#aaa"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color="#aaa" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Chips de filtro por rol */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, paddingHorizontal: 12, marginBottom: 4 }} contentContainerStyle={{ alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setRoleFilter(null)}
              style={[styles.chip, !roleFilter && styles.chipActive]}
            >
              <Text style={[styles.chipText, !roleFilter && styles.chipTextActive]}>Todos</Text>
            </TouchableOpacity>
            {rolesPresentes.map(role => (
              <TouchableOpacity
                key={role}
                onPress={() => setRoleFilter(roleFilter === role ? null : role)}
                style={[styles.chip, roleFilter === role && styles.chipActive]}
              >
                <Text style={[styles.chipText, roleFilter === role && styles.chipTextActive]}>
                  {ROLE_LABELS[role] || role}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={u => String(u.id)}
              contentContainerStyle={{ padding: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userCard}
                  onPress={() => openProfile(item)}
                >
                  <View style={[styles.avatar, { backgroundColor: roleColor(item.role) }]}>
                    <Text style={styles.avatarText}>
                      {(item.full_name || '?').substring(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{item.full_name || '—'}</Text>
                    <Text style={styles.userEmail}>{item.email}</Text>
                    <View style={styles.tagRow}>
                      <View style={[styles.tag, { backgroundColor: roleColor(item.role) + '22' }]}>
                        <Text style={[styles.tagText, { color: roleColor(item.role) }]}>
                          {ROLE_LABELS[item.role] || item.role}
                        </Text>
                      </View>
                      {item.box_id && (
                        <Text style={styles.boxId}>📦 {item.box_id}</Text>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#ccc" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>No se encontraron empleados</Text>
              }
            />
          )}
        </View>
      )}

      {/* ── ALTA ── */}
      {tab === 'alta' && (
        <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Registrar Nuevo Empleado</Text>

          <Text style={styles.label}>Nombre completo *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Juan Pérez García"
            value={form.full_name}
            onChangeText={v => setForm(f => ({ ...f, full_name: v }))}
            placeholderTextColor="#aaa"
          />

          <Text style={styles.label}>Correo electrónico *</Text>
          <TextInput
            style={styles.input}
            placeholder="correo@empresa.com"
            value={form.email}
            onChangeText={v => setForm(f => ({ ...f, email: v }))}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#aaa"
          />

          <Text style={styles.label}>Contraseña inicial *</Text>
          <TextInput
            style={styles.input}
            placeholder="Mínimo 8 caracteres"
            value={form.password}
            onChangeText={v => setForm(f => ({ ...f, password: v }))}
            secureTextEntry
            placeholderTextColor="#aaa"
          />

          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            style={styles.input}
            placeholder="10 dígitos"
            value={form.phone}
            onChangeText={v => setForm(f => ({ ...f, phone: v }))}
            keyboardType="phone-pad"
            placeholderTextColor="#aaa"
          />

          <Text style={styles.label}>Rol *</Text>
          <TouchableOpacity style={styles.rolePicker} onPress={() => setRolePickerVisible(true)}>
            <Text style={styles.rolePickerText}>
              {ROLE_LABELS[form.role] || form.role}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleCreateUser}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={styles.saveBtnText}>Crear Usuario</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Modal detalle usuario con 4 tabs */}
      <Modal visible={detailVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setDetailVisible(false)}>
              <Ionicons name="close" size={26} color={BLACK} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Perfil de Empleado</Text>
            <View style={{ width: 26 }} />
          </View>

          {profileLoading ? (
            <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 60 }} />
          ) : selectedUser ? (
            <>
              {/* Cabecera del empleado */}
              <View style={styles.profileHeader}>
                <View style={[styles.detailAvatar, { backgroundColor: roleColor(selectedUser.role) }]}>
                  <Text style={styles.detailAvatarText}>{(selectedUser.full_name || '?').substring(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailName}>{selectedUser.full_name}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <View style={[styles.tag, { backgroundColor: roleColor(selectedUser.role) + '22' }]}>
                      <Text style={[styles.tagText, { color: roleColor(selectedUser.role) }]}>{ROLE_LABELS[selectedUser.role] || selectedUser.role}</Text>
                    </View>
                    {profile && (
                      <View style={[styles.tag, { backgroundColor: profile.expediente_completo ? '#dcfce7' : '#fef3c7' }]}>
                        <Text style={[styles.tagText, { color: profile.expediente_completo ? '#166534' : '#92400e' }]}>
                          {profile.expediente_completo ? '✅ Completo' : `⚠️ Incompleto (${profile.expediente_faltantes?.length || '?'})`}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {/* Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: 'white', maxHeight: 46 }} contentContainerStyle={{ paddingHorizontal: 12 }}>
                {['Expediente', 'Nómina', 'Préstamos', 'Asistencias'].map((t, i) => (
                  <TouchableOpacity key={t} onPress={() => setDetailTab(i)}
                    style={[styles.detailTabBtn, detailTab === i && styles.detailTabBtnActive]}>
                    <Text style={[styles.detailTabText, detailTab === i && styles.detailTabTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {/* ── EXPEDIENTE DIGITAL ── */}
                {detailTab === 0 && (
                  <View>
                    {[
                      { label: 'Email', value: selectedUser.email },
                      { label: 'Box ID', value: selectedUser.box_id || '—' },
                      { label: 'Teléfono', value: profile?.user?.phone || selectedUser.phone || '—' },
                      { label: 'Fecha de Alta', value: fmtDate(profile?.user?.hire_date || selectedUser.created_at) },
                      { label: 'Contacto Emergencia', value: profile?.user?.emergency_contact || '—' },
                      { label: 'Antigüedad', value: profile?.antiguedad ? `${profile.antiguedad.years}a ${profile.antiguedad.months}m` : '—' },
                      { label: 'Estado', value: selectedUser.is_active === false ? '🔴 Inactivo' : '🟢 Activo' },
                    ].map(({ label, value }) => (
                      <View key={label} style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{label}</Text>
                        <Text style={styles.detailValue}>{value}</Text>
                      </View>
                    ))}

                    <Text style={styles.sectionSubtitle}>Documentos</Text>
                    {[
                      { type: 'ine_front', label: 'INE — Anverso' },
                      { type: 'ine_back', label: 'INE — Reverso' },
                      { type: 'contract', label: 'Contrato Laboral' },
                      { type: 'comprobante_domicilio', label: 'Comprobante Domicilio' },
                      { type: 'rfc', label: 'RFC / Constancia Fiscal' },
                      { type: 'curp', label: 'CURP' },
                      { type: 'nss_constancia', label: 'Constancia NSS' },
                      { type: 'aviso_alta_imss', label: 'Aviso Alta IMSS' },
                    ].map(doc => {
                      const found = profile?.documents?.find((d: any) => d.doc_type === doc.type);
                      return (
                        <View key={doc.type} style={styles.docRow}>
                          <Ionicons name={found ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={found ? '#16a34a' : '#d1d5db'} />
                          <Text style={[styles.docLabel, { color: found ? BLACK : '#9ca3af' }]}>{doc.label}</Text>
                          {found && <Text style={styles.docDate}>{fmtDate(found.uploaded_at)}</Text>}
                          {!found && <Text style={[styles.docDate, { color: '#ef4444' }]}>Sin archivo</Text>}
                        </View>
                      );
                    })}

                    {profile?.expediente_faltantes?.length > 0 && (
                      <View style={styles.alertBox}>
                        <Text style={styles.alertTitle}>Faltantes:</Text>
                        {profile.expediente_faltantes.map((f: string) => (
                          <Text key={f} style={styles.alertItem}>• {f}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* ── NÓMINA Y SEGURO ── */}
                {detailTab === 1 && (
                  <View>
                    {profile?.payroll ? (
                      <>
                        {[
                          { label: 'Salario Bruto', value: profile.payroll.salario_bruto ? `$${parseFloat(profile.payroll.salario_bruto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—' },
                          { label: 'Salario Neto', value: profile.payroll.salario_neto ? `$${parseFloat(profile.payroll.salario_neto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—' },
                          { label: 'SDI', value: profile.payroll.sdi ? `$${parseFloat(profile.payroll.sdi).toFixed(2)}` : '—' },
                          { label: 'Tipo Contrato', value: profile.payroll.contract_type || '—' },
                          { label: 'Periodo de Pago', value: profile.payroll.payment_period || '—' },
                          { label: 'Banco', value: profile.payroll.bank_name || '—' },
                          { label: 'CLABE', value: profile.payroll.bank_clabe || '—' },
                        ].map(({ label, value }) => (
                          <View key={label} style={styles.detailRow}>
                            <Text style={styles.detailLabel}>{label}</Text>
                            <Text style={styles.detailValue}>{value}</Text>
                          </View>
                        ))}
                        <Text style={styles.sectionSubtitle}>IMSS</Text>
                        {[
                          { label: 'NSS', value: profile.payroll.nss || '—' },
                          { label: 'Estado IMSS', value: profile.payroll.imss_status || '—' },
                          { label: 'Fecha Alta IMSS', value: fmtDate(profile.payroll.imss_alta_date) },
                          { label: 'Días Vacaciones', value: `${profile.payroll.vacation_days_available || 0} disponibles / ${profile.payroll.vacation_days_taken || 0} tomados` },
                        ].map(({ label, value }) => (
                          <View key={label} style={styles.detailRow}>
                            <Text style={styles.detailLabel}>{label}</Text>
                            <Text style={styles.detailValue}>{value}</Text>
                          </View>
                        ))}
                        {profile.payroll.notes ? (
                          <View style={[styles.alertBox, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
                            <Text style={{ color: '#0369a1', fontSize: 13 }}>{profile.payroll.notes}</Text>
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <Text style={styles.empty}>Sin información de nómina registrada</Text>
                    )}
                  </View>
                )}

                {/* ── PRÉSTAMOS ── */}
                {detailTab === 2 && (
                  <View>
                    {profile?.loans?.length > 0 ? profile.loans.map((loan: any) => (
                      <View key={loan.id} style={styles.loanCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{ fontWeight: '700', fontSize: 15, color: BLACK }}>
                            ${parseFloat(loan.monto_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </Text>
                          <View style={[styles.tag, { backgroundColor: loan.status === 'activo' ? '#dcfce7' : loan.status === 'pagado' ? '#dbeafe' : '#fef3c7' }]}>
                            <Text style={[styles.tagText, { color: loan.status === 'activo' ? '#166534' : loan.status === 'pagado' ? '#1e40af' : '#92400e' }]}>
                              {loan.status}
                            </Text>
                          </View>
                        </View>
                        {loan.motivo ? <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 4 }}>{loan.motivo}</Text> : null}
                        <View style={{ flexDirection: 'row', gap: 16 }}>
                          <Text style={{ fontSize: 12, color: '#6b7280' }}>{loan.parcialidades} parcialidades • {loan.periodo}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280' }}>${parseFloat(loan.monto_por_parcialidad || 0).toFixed(2)}/pago</Text>
                        </View>
                        <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 12, color: '#16a34a' }}>Pagado: ${parseFloat(loan.pagado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
                          <Text style={{ fontSize: 12, color: '#dc2626' }}>Remanente: ${parseFloat(loan.remanente || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Text>
                        </View>
                      </View>
                    )) : (
                      <Text style={styles.empty}>Sin préstamos registrados</Text>
                    )}
                  </View>
                )}

                {/* ── ASISTENCIAS ── */}
                {detailTab === 3 && (
                  <View>
                    {attendance.length > 0 ? attendance.map((a: any, i: number) => (
                      <View key={i} style={styles.attRow}>
                        <Text style={styles.attDate}>{fmtDate(a.date || a.created_at)}</Text>
                        <View style={{ flex: 1 }}>
                          {a.check_in && <Text style={styles.attTime}>Entrada: {String(a.check_in).substring(11, 16)}</Text>}
                          {a.check_out && <Text style={styles.attTime}>Salida: {String(a.check_out).substring(11, 16)}</Text>}
                        </View>
                        <View style={[styles.tag, { backgroundColor: a.status === 'presente' ? '#dcfce7' : '#fee2e2' }]}>
                          <Text style={[styles.tagText, { color: a.status === 'presente' ? '#166534' : '#991b1b' }]}>{a.status || 'Sin estado'}</Text>
                        </View>
                      </View>
                    )) : (
                      <Text style={styles.empty}>Sin registros de asistencia</Text>
                    )}
                  </View>
                )}
              </ScrollView>
            </>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* Role picker modal */}
      <Modal visible={rolePickerVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setRolePickerVisible(false)}>
              <Ionicons name="close" size={26} color={BLACK} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Seleccionar Rol</Text>
            <View style={{ width: 26 }} />
          </View>
          <FlatList
            data={ROLES}
            keyExtractor={r => r.value}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.roleItem, form.role === item.value && styles.roleItemActive]}
                onPress={() => { setForm(f => ({ ...f, role: item.value })); setRolePickerVisible(false); }}
              >
                <Text style={[styles.roleItemText, form.role === item.value && { color: ORANGE, fontWeight: '700' }]}>
                  {item.label}
                </Text>
                {form.role === item.value && <Ionicons name="checkmark" size={20} color={ORANGE} />}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: BLACK, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, color: 'white', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: ORANGE },
  tabText: { fontSize: 13, color: '#666' },
  tabTextActive: { color: ORANGE, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  searchInput: { flex: 1, fontSize: 14, color: BLACK },
  userCard: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontWeight: '700', fontSize: 18 },
  userName: { fontSize: 15, fontWeight: '700', color: BLACK },
  userEmail: { fontSize: 12, color: '#666', marginTop: 2 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '600' },
  boxId: { fontSize: 11, color: '#999' },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
  formContainer: { padding: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: BLACK, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: 'white', borderRadius: 10, padding: 12, fontSize: 15, color: BLACK, borderWidth: 1, borderColor: '#e5e5e5' },
  rolePicker: { backgroundColor: 'white', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e5e5e5', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rolePickerText: { fontSize: 15, color: BLACK },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: BLACK },
  detailAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  detailAvatarText: { color: 'white', fontWeight: '700', fontSize: 28 },
  detailName: { fontSize: 22, fontWeight: '700', color: BLACK, textAlign: 'center', marginBottom: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  detailLabel: { fontSize: 14, color: '#666' },
  detailValue: { fontSize: 14, fontWeight: '600', color: BLACK, maxWidth: '60%', textAlign: 'right' },
  roleItem: { padding: 16, borderRadius: 10, marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roleItemActive: { backgroundColor: '#fff5f0' },
  roleItemText: { fontSize: 15, color: BLACK },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0' },
  chipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText: { fontSize: 12, color: '#555', fontWeight: '500' },
  chipTextActive: { color: 'white', fontWeight: '700' },
  profileHeader: { backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  detailTabBtn: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  detailTabBtnActive: { borderBottomColor: ORANGE },
  detailTabText: { fontSize: 13, color: '#666', fontWeight: '500' },
  detailTabTextActive: { color: ORANGE, fontWeight: '700' },
  sectionSubtitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  docLabel: { flex: 1, fontSize: 14 },
  docDate: { fontSize: 12, color: '#6b7280' },
  alertBox: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 8, padding: 12, marginTop: 12 },
  alertTitle: { fontWeight: '700', color: '#92400e', marginBottom: 4 },
  alertItem: { color: '#92400e', fontSize: 13 },
  loanCard: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  attRow: { backgroundColor: 'white', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  attDate: { fontSize: 13, fontWeight: '600', color: BLACK, width: 80 },
  attTime: { fontSize: 12, color: '#6b7280' },
});
