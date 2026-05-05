/**
 * NewChatScreen - Crear nueva conversación 1-1 o de grupo.
 *
 * - Buscador de empleados (clientes excluidos en backend).
 * - Selección múltiple => grupo. Selección única => directo.
 * - Si grupo: pide título.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { searchStaff, createConversation } from '../services/chatService';

const ORANGE = '#F05A28';
const BLACK = '#111111';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  director: 'Director',
  branch_manager: 'Gerente',
  customer_service: 'Servicio Cliente',
  operaciones: 'Operaciones',
  counter_staff: 'Mostrador',
  warehouse_ops: 'Bodega',
  repartidor: 'Repartidor',
  monitoreo: 'Monitoreo',
  accountant: 'Contador',
  advisor: 'Asesor',
  asesor: 'Asesor',
  asesor_lider: 'Asesor Líder',
};

interface StaffUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  profile_photo_url?: string | null;
  branch_id?: number | null;
}

export default function NewChatScreen({ route, navigation }: any) {
  const { user, token } = route.params;
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<StaffUser[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const list = await searchStaff(token, q);
      setUsers(list.filter((u: StaffUser) => u.id !== (user.id || user.userId)));
    } catch (e: any) {
      console.warn('[NewChat] search', e?.message);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const toggleSelect = (u: StaffUser) => {
    setSelected((prev) =>
      prev.find((p) => p.id === u.id) ? prev.filter((p) => p.id !== u.id) : [...prev, u]
    );
  };

  const handleCreate = async () => {
    if (selected.length === 0) {
      Alert.alert('Selecciona', 'Elige al menos un compañero.');
      return;
    }
    const isGroup = selected.length > 1;
    if (isGroup && !groupTitle.trim()) {
      Alert.alert('Nombre del grupo', 'Asigna un nombre al grupo.');
      return;
    }
    setCreating(true);
    try {
      const result = await createConversation(token, {
        type: isGroup ? 'group' : 'direct',
        title: isGroup ? groupTitle.trim() : undefined,
        participant_ids: selected.map((s) => s.id),
      });
      const titleNav = isGroup ? groupTitle.trim() : selected[0].full_name;
      navigation.replace('ChatRoom', {
        user,
        token,
        conversationId: result.conversation_id,
        title: titleNav,
        type: isGroup ? 'group' : 'direct',
        otherUser: isGroup ? null : selected[0],
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo crear la conversación');
    } finally {
      setCreating(false);
    }
  };

  const renderUser = ({ item }: { item: StaffUser }) => {
    const isSelected = !!selected.find((s) => s.id === item.id);
    const initial = (item.full_name || '?').charAt(0).toUpperCase();
    return (
      <TouchableOpacity
        style={[styles.userRow, isSelected && styles.userRowSelected]}
        onPress={() => toggleSelect(item)}
      >
        {item.profile_photo_url ? (
          <Image source={{ uri: item.profile_photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.userName}>{item.full_name}</Text>
          <Text style={styles.userRole}>
            {ROLE_LABELS[item.role] || item.role} · {item.email}
          </Text>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
          {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
        </View>
      </TouchableOpacity>
    );
  };

  const isGroup = selected.length > 1;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
        <Appbar.Content title="Nuevo chat" titleStyle={{ color: '#fff', fontWeight: '700' }} />
        <Appbar.Action
          icon="check"
          color="#fff"
          disabled={selected.length === 0 || creating}
          onPress={handleCreate}
        />
      </Appbar.Header>

      {selected.length > 0 && (
        <View style={styles.selectedBar}>
          {selected.map((s) => (
            <View key={s.id} style={styles.chip}>
              <Text style={styles.chipText}>{s.full_name.split(' ')[0]}</Text>
              <TouchableOpacity onPress={() => toggleSelect(s)} style={{ marginLeft: 4 }}>
                <Ionicons name="close-circle" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {isGroup && (
        <TextInput
          style={styles.groupTitle}
          placeholder="Nombre del grupo"
          placeholderTextColor="#999"
          value={groupTitle}
          onChangeText={setGroupTitle}
          maxLength={80}
        />
      )}

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#666" style={{ marginLeft: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre, correo o rol…"
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ORANGE} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderUser}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: '#666' }}>Sin resultados</Text>
            </View>
          }
        />
      )}

      {creating && (
        <View style={styles.overlay}>
          <ActivityIndicator color={ORANGE} size="large" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  appbar: { backgroundColor: BLACK },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  selectedBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    backgroundColor: '#FFF8F4',
    borderBottomWidth: 1,
    borderBottomColor: '#FCE0D2',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORANGE,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    margin: 4,
  },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  groupTitle: {
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F4F5F7',
    borderRadius: 12,
    fontSize: 15,
    color: '#111',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    backgroundColor: '#F4F5F7',
    borderRadius: 12,
  },
  searchInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: '#111' },
  userRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  userRowSelected: { backgroundColor: '#FFF8F4' },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  userName: { fontSize: 15, fontWeight: '600', color: '#111' },
  userRole: { fontSize: 12, color: '#666', marginTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 68 },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
