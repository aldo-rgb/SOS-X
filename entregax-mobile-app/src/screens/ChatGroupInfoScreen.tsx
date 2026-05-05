// ChatGroupInfoScreen — Información del chat (grupo o directo).
// - Lista los participantes con foto, nombre y rol.
// - Permite al usuario actual ver y cambiar su propia foto de perfil
//   directamente desde aquí (cámara o galería).

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Appbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { fetchParticipants, ChatParticipant } from '../services/chatService';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#000000';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  director: 'Director',
  branch_manager: 'Gerente de Sucursal',
  monitoreo: 'Monitoreo',
  operaciones: 'Operaciones',
  warehouse_ops: 'Almacén',
  counter_staff: 'Mostrador',
  customer_service: 'Atención al Cliente',
  accountant: 'Contabilidad',
  repartidor: 'Repartidor',
  advisor: 'Asesor',
  asesor: 'Asesor',
  asesor_lider: 'Asesor Líder',
  sub_advisor: 'Sub-asesor',
};

export default function ChatGroupInfoScreen({ route, navigation }: any) {
  const { user, token, conversationId, title, type } = route.params;
  const myId = user?.id || user?.userId;

  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState<any>(null);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchParticipants(token, conversationId);
      setConversation(r.conversation);
      setParticipants(r.participants);
      const me = r.participants.find((p) => p.id === myId);
      if (me?.profile_photo_url) setMyPhoto(me.profile_photo_url);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo cargar la información');
    } finally {
      setLoading(false);
    }
  }, [token, conversationId, myId]);

  useEffect(() => { load(); }, [load]);

  const pickPhoto = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert('Permiso', 'Necesitamos acceso a la cámara');
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return Alert.alert('Permiso', 'Necesitamos acceso a la galería');
      }
      const fn = source === 'camera'
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;
      const res = await fn({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (!res.canceled && res.assets?.[0]) {
        await uploadPhoto(res.assets[0].uri);
      }
    } catch (e) {
      console.error('pickPhoto', e);
      Alert.alert('Error', 'No se pudo obtener la imagen');
    }
  };

  const uploadPhoto = async (uri: string) => {
    setUploading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const photoData = `data:image/jpeg;base64,${base64}`;
      if (photoData.length > 3 * 1024 * 1024) {
        Alert.alert('Error', 'La imagen es muy grande. Intenta una más pequeña.');
        return;
      }
      const r = await fetch(`${API_URL}/api/auth/profile-photo`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ photo: photoData }),
      });
      const data = await r.json();
      if (r.ok) {
        setMyPhoto(photoData);
        // refrescar lista para reflejar nueva foto en participantes
        load();
        Alert.alert('✅ Listo', 'Foto de perfil actualizada');
      } else {
        Alert.alert('Error', data.error || 'No se pudo actualizar');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  };

  const askPhotoSource = () => {
    Alert.alert('Foto de perfil', '¿De dónde quieres tomar la foto?', [
      { text: 'Cámara', onPress: () => pickPhoto('camera') },
      { text: 'Galería', onPress: () => pickPhoto('library') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const renderParticipant = ({ item }: { item: ChatParticipant }) => {
    const isMe = item.id === myId;
    const initial = (item.full_name || '?').charAt(0).toUpperCase();
    return (
      <View style={styles.row}>
        {item.profile_photo_url ? (
          <Image source={{ uri: item.profile_photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.name}>
            {item.full_name} {isMe && <Text style={styles.youTag}>(Tú)</Text>}
          </Text>
          <Text style={styles.role}>
            {ROLE_LABELS[item.role] || item.role}
            {(item as any).branch_name ? ` · ${(item as any).branch_name}` : ''}
            {item.participant_role === 'admin' ? ' · Admin del grupo' : ''}
          </Text>
        </View>
        {isMe && (
          <TouchableOpacity onPress={askPhotoSource} style={styles.editBtn}>
            <Ionicons name="camera" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const isGroup = (type || conversation?.type) === 'group';
  const headerTitle = title || conversation?.title || 'Información';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
        <Appbar.Content title="Información" titleStyle={{ color: '#fff', fontWeight: '700' }} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ORANGE} />
        </View>
      ) : (
        <>
          <View style={styles.heroBox}>
            <View style={styles.heroIconWrap}>
              <Ionicons
                name={isGroup ? 'people' : 'person'}
                size={36}
                color={ORANGE}
              />
            </View>
            <Text style={styles.heroTitle}>{headerTitle}</Text>
            <Text style={styles.heroSub}>
              {participants.length} {participants.length === 1 ? 'integrante' : 'integrantes'}
            </Text>
          </View>

          {/* Mi foto editable */}
          <View style={styles.myPhotoCard}>
            <TouchableOpacity onPress={askPhotoSource} disabled={uploading} style={styles.myPhotoBox}>
              {myPhoto ? (
                <Image source={{ uri: myPhoto }} style={styles.myPhoto} />
              ) : (
                <View style={[styles.myPhoto, styles.avatarFallback]}>
                  <Text style={styles.myPhotoInitial}>
                    {(user?.full_name || user?.fullName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.myPhotoBadge}>
                {uploading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="camera" size={14} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.myPhotoTitle}>Tu foto de perfil</Text>
              <Text style={styles.myPhotoHint}>
                Toca para cambiarla. Se mostrará a todos en este chat.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>
            {isGroup ? 'Integrantes del grupo' : 'Participantes'}
          </Text>
          <FlatList
            data={participants}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderParticipant}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  appbar: { backgroundColor: BLACK },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  heroBox: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  heroIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#FFF1EA', alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  heroTitle: { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center' },
  heroSub: { fontSize: 13, color: '#666', marginTop: 4 },
  myPhotoCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, padding: 14,
    backgroundColor: '#FFF8F4', borderRadius: 14,
    borderWidth: 1, borderColor: '#FCE0D2',
  },
  myPhotoBox: { width: 64, height: 64 },
  myPhoto: { width: 64, height: 64, borderRadius: 32 },
  myPhotoInitial: { color: '#fff', fontSize: 24, fontWeight: '700' },
  myPhotoBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  myPhotoTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  myPhotoHint: { fontSize: 12, color: '#666', marginTop: 2 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#666',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 18, marginBottom: 6, marginHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  youTag: { color: ORANGE, fontWeight: '700' },
  role: { fontSize: 12, color: '#666', marginTop: 2 },
  editBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center',
  },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 72 },
});
