/**
 * Videos de un ticket o una tarea, en la app.
 *
 * Es la pantalla que más importa de esta función: el CEDIS graba con el
 * celular, y hasta hoy esos videos salían por WhatsApp y nunca volvían al
 * sistema.
 *
 * Dos decisiones que se ven raras hasta que se sabe por qué:
 *
 * 1. El archivo NO pasa por la API. Se pide una URL firmada y se sube DIRECTO
 *    a S3 con uploadAsync. Un video de 30s pesa 60-90MB: por la API se cargaba
 *    entero en memoria del servidor y viajaba dos veces.
 *
 * 2. Debajo de cada video hay una tira de cuadros. No es adorno: nadie puede
 *    "ver" un MP4 —ni Cajito— pero los cuadros sí se leen, y a los 30 días el
 *    video se borra y los cuadros se quedan.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Alert, Modal, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { API_URL } from '../services/api';

const MAX_MB = 200;
const MORADO = '#6D28D9';

type Cuadro = { segundo: number; url: string | null };
type Video = {
  id: number; key: string; file_name: string; url: string | null; purgado: boolean;
  size_bytes: number | null; duracion: number | null; cuadros: Cuadro[];
  frames_status: string; subio: string | null; dias_restantes: number;
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function VideosAdjuntos({ scope, refId, token, onCambio }: {
  scope: 'ticket' | 'task'; refId: number; token: string; onCambio?: () => void;
}) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [avance, setAvance] = useState(0);
  const [verUrl, setVerUrl] = useState<string | null>(null);
  const reintento = useRef<any>(null);
  const H = { Authorization: `Bearer ${token}` };

  const player = useVideoPlayer(verUrl || '', p => { if (verUrl) { p.loop = false; p.play(); } });

  const cargar = useCallback(async () => {
    if (!refId || !token) return;
    try {
      const r = await fetch(`${API_URL}/api/uploads/videos?scope=${scope}&ref_id=${refId}`, { headers: H });
      if (!r.ok) return;
      const d = await r.json();
      const lista: Video[] = d?.videos || [];
      setVideos(lista);
      if (reintento.current) { clearTimeout(reintento.current); reintento.current = null; }
      // Mientras salen los cuadros se vuelve a preguntar; al terminar, se deja
      // de molestar al servidor.
      if (lista.some(v => v.frames_status === 'pendiente')) {
        reintento.current = setTimeout(() => { cargar(); }, 6000);
      }
    } catch { /* la sección simplemente no muestra videos */ }
  }, [scope, refId, token]);

  useEffect(() => { cargar(); return () => { if (reintento.current) clearTimeout(reintento.current); }; }, [cargar]);

  const elegir = async (desdeCamara: boolean) => {
    try {
      const perm = desdeCamara
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permiso', desdeCamara ? 'Se necesita la cámara.' : 'Se necesita acceso a los videos.'); return; }

      const res = desdeCamara
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 120 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
      if (res.canceled || !res.assets?.[0]) return;
      await subir(res.assets[0]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo abrir el video');
    }
  };

  const subir = async (a: any) => {
    const nombre = a.fileName || `video-${Date.now()}.mp4`;
    const tipo = a.mimeType || 'video/mp4';
    let bytes = Number(a.fileSize || 0);
    if (!bytes) {
      try { const i: any = await FileSystem.getInfoAsync(a.uri); bytes = Number(i?.size || 0); } catch { /* seguimos sin tamaño */ }
    }
    if (bytes && bytes > MAX_MB * 1024 * 1024) {
      Alert.alert('Video muy pesado',
        `Pesa ${(bytes / 1024 / 1024).toFixed(0)} MB y el máximo son ${MAX_MB} MB. Graba uno más corto o recórtalo.`);
      return;
    }

    setSubiendo(true); setAvance(0);
    try {
      const pre = await fetch(`${API_URL}/api/uploads/video-url`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, ref_id: refId, file_name: nombre, mime: tipo, size: bytes || undefined }),
      });
      const pd = await pre.json();
      if (!pre.ok || !pd?.uploadUrl) throw new Error(pd?.error || 'No se pudo preparar la subida');

      // Directo a S3. La URL firmada ya trae el permiso, así que NO va el token
      // de la API: mandarlo sería filtrarlo a un tercero.
      const up = await FileSystem.uploadAsync(pd.uploadUrl, a.uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': pd.contentType || tipo },
      });
      if (up.status < 200 || up.status >= 300) throw new Error(`S3 respondió ${up.status}`);
      setAvance(100);

      const reg = await fetch(`${API_URL}/api/uploads/video-registrar`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, ref_id: refId, key: pd.key, file_name: nombre, mime: tipo }),
      });
      if (!reg.ok) { const rd = await reg.json().catch(() => ({})); throw new Error(rd?.error || 'No se pudo registrar'); }

      await cargar();
      onCambio?.();
    } catch (e: any) {
      Alert.alert('No se subió el video', e?.message || 'Intenta de nuevo con mejor señal.');
    } finally { setSubiendo(false); setAvance(0); }
  };

  return (
    <View style={s.caja}>
      <View style={s.encabezado}>
        <Ionicons name="videocam" size={16} color={MORADO} />
        <Text style={s.titulo}>Videos{videos.length > 0 ? ` (${videos.length})` : ''}</Text>
        <View style={{ flex: 1 }} />
        {subiendo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ActivityIndicator size="small" color={MORADO} />
            <Text style={s.chico}>Subiendo{avance ? ` ${avance}%` : '…'}</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity style={s.btn} onPress={() => elegir(true)}>
              <Ionicons name="camera-outline" size={15} color={MORADO} />
              <Text style={s.btnTxt}>Grabar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btn} onPress={() => elegir(false)}>
              <Ionicons name="folder-outline" size={15} color={MORADO} />
              <Text style={s.btnTxt}>Elegir</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {videos.length === 0 && !subiendo && (
        <Text style={s.chico}>
          Hasta {MAX_MB} MB. Se guardan 30 días; los cuadros que se le sacan se quedan.
        </Text>
      )}

      {videos.map(v => (
        <View key={v.id} style={s.tarjeta}>
          <View style={s.fila}>
            <Text style={s.nombre} numberOfLines={1}>{v.file_name}</Text>
            {v.duracion != null && <Text style={s.chico}>{mmss(v.duracion)}</Text>}
          </View>
          {v.subio && <Text style={s.chico}>subió {v.subio}</Text>}

          {v.purgado ? (
            <Text style={s.aviso}>El video ya se depuró. Quedan los cuadros.</Text>
          ) : (
            <View style={s.fila}>
              <TouchableOpacity style={s.verBtn} onPress={() => v.url && setVerUrl(v.url)}>
                <Ionicons name="play-circle" size={18} color="#fff" />
                <Text style={s.verTxt}>Ver video</Text>
              </TouchableOpacity>
              <Text style={[s.chico, { marginLeft: 8 }]}>se borra en {v.dias_restantes} d</Text>
            </View>
          )}

          {v.frames_status === 'pendiente' && (
            <View style={[s.fila, { marginTop: 6 }]}>
              <ActivityIndicator size="small" color="#6B7280" />
              <Text style={[s.chico, { marginLeft: 6 }]}>Sacando los cuadros…</Text>
            </View>
          )}

          {v.cuadros.length > 0 && (
            <>
              <Text style={[s.chico, { marginTop: 6 }]}>
                {v.cuadros.length} cuadros — es lo que puede leer Cajito.
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                {v.cuadros.map((c, i) => c.url ? (
                  <View key={i} style={{ marginRight: 6, alignItems: 'center' }}>
                    <Image source={{ uri: c.url }} style={s.cuadro} />
                    <Text style={s.mini}>{mmss(c.segundo)}</Text>
                  </View>
                ) : null)}
              </ScrollView>
            </>
          )}
        </View>
      ))}

      <Modal visible={!!verUrl} animationType="slide" onRequestClose={() => setVerUrl(null)}>
        <View style={s.reproductor}>
          <TouchableOpacity style={s.cerrar} onPress={() => setVerUrl(null)}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {!!verUrl && (
            <VideoView player={player} style={{ width: '100%', height: '70%' }}
                       allowsFullscreen contentFit="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  caja: { marginTop: 12, paddingHorizontal: 2 },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  titulo: { fontSize: 13, fontWeight: '800', color: '#4C1D95' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4,
         borderRadius: 8, borderWidth: 1, borderColor: '#C4B5FD', marginLeft: 6 },
  btnTxt: { fontSize: 12, color: MORADO, fontWeight: '700' },
  tarjeta: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, marginBottom: 10, backgroundColor: '#FAFAFA' },
  fila: { flexDirection: 'row', alignItems: 'center' },
  nombre: { flex: 1, fontSize: 12, fontWeight: '700', color: '#374151' },
  chico: { fontSize: 11, color: '#6B7280' },
  mini: { fontSize: 9, color: '#6B7280' },
  aviso: { fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginTop: 4 },
  verBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: MORADO,
            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginTop: 6 },
  verTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cuadro: { width: 104, height: 68, borderRadius: 6, backgroundColor: '#E5E7EB' },
  reproductor: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  cerrar: { position: 'absolute', top: Platform.OS === 'ios' ? 54 : 20, right: 18, zIndex: 2, padding: 6 },
});
