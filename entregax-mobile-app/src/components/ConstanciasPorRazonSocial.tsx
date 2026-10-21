/**
 * ConstanciasPorRazonSocial — una constancia por cada razón social a la que
 * factura el cliente, no una sola por cliente (tarea 879).
 *
 * El defecto que arregla: la constancia se guardaba en un único renglón por
 * cliente, así que quien factura a varias razones sociales solo podía tener
 * una y cada carga pisaba la anterior. La orden XP992718 salió con la
 * constancia de otra empresa y la factura se emitió mal.
 *
 * Al subir, el backend lee el RFC impreso DENTRO del PDF y rechaza el archivo
 * si no es el de la razón social elegida. Es la única comprobación que ve el
 * CONTENIDO: separar el almacén por RFC asegura de dónde sale el archivo, no
 * qué dice.
 *
 * Un solo componente para los dos roles, igual que en la web: sin clientId
 * gestiona las del usuario logueado; con clientId, el asesor o el staff en
 * nombre de un cliente.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Linking, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';

type Constancia = {
  tiene: boolean;
  constancia_url: string | null;
  issued_at: string | null;
  valid_until: string | null;
  vigente: boolean;
  dias_para_vencer: number | null;
};
type RazonSocial = {
  id: number;
  razon_social: string;
  rfc: string;
  constancia: Constancia;
};

type Props = {
  token: string;
  /** undefined = las del usuario logueado */
  clientId?: number;
  oscuro?: boolean;
  onChange?: () => void;
};

const ConstanciasPorRazonSocial: React.FC<Props> = ({ token, clientId, oscuro = true, onChange }) => {
  const base = clientId
    ? `${API_URL}/api/advisor/clients/${clientId}/razones-sociales`
    : `${API_URL}/api/fiscal/razones-sociales`;

  const [lista, setLista] = useState<RazonSocial[]>([]);
  const [cargando, setCargando] = useState(false);
  const [elegida, setElegida] = useState<RazonSocial | null>(null);
  const [archivo, setArchivo] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    try {
      const res = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      setLista(Array.isArray(data?.profiles) ? data.profiles : []);
    } catch { setLista([]); } finally { setCargando(false); }
  }, [base, token]);

  useEffect(() => { void cargar(); }, [cargar]);

  const escoger = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setArchivo({ uri: a.uri, name: a.name || 'constancia.pdf', type: a.mimeType || 'application/pdf' });
    setError(null);
  };

  const subir = async () => {
    if (!elegida || !archivo) { setError('Selecciona el archivo de la constancia.'); return; }
    setSubiendo(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('constancia', { uri: archivo.uri, name: archivo.name, type: archivo.type } as any);
      // Con FormData va fetch crudo y SIN Content-Type: el helper de api
      // serializa el cuerpo a JSON y fuerza application/json, con lo que el
      // archivo nunca llega.
      const res = await fetch(`${base}/${elegida.id}/constancia`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd as any,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.message || data?.error || 'No se pudo subir la constancia'); return; }
      if (data?.aviso) Alert.alert('Constancia guardada', data.aviso);
      setElegida(null); setArchivo(null);
      await cargar();
      onChange?.();
    } catch (e: any) {
      setError(e?.message || 'Error de red al subir la constancia');
    } finally { setSubiendo(false); }
  };

  // Con una sola razón social el panel de arriba basta.
  if (!cargando && lista.length <= 1) return null;

  const faltan = lista.filter(x => !x.constancia?.tiene).length;
  const C = oscuro
    ? { fondo: '#101010', borde: '#2a2a2a', texto: '#f2f2f2', suave: '#9a9a9a' }
    : { fondo: '#ffffff', borde: '#e3e6ea', texto: '#0f1115', suave: '#6b7280' };

  return (
    <View style={[s.caja, { backgroundColor: C.fondo, borderColor: C.borde }]}>
      <View style={s.encabezado}>
        <Ionicons name="receipt-outline" size={18} color={ORANGE} />
        <Text style={[s.titulo, { color: C.texto }]}>Constancia por razón social</Text>
        {faltan > 0 && (
          <View style={s.pill}><Text style={s.pillTexto}>{faltan} sin constancia</Text></View>
        )}
      </View>
      <Text style={[s.ayuda, { color: C.suave }]}>
        Este cliente factura a {lista.length} razones sociales y cada una necesita la suya. La orden
        sale con la de su razón social; si falta, sale sin constancia antes que con la equivocada.
      </Text>

      {cargando ? (
        <ActivityIndicator color={ORANGE} style={{ marginVertical: 12 }} />
      ) : lista.map((x) => {
        const c = x.constancia || ({} as Constancia);
        return (
          <View key={x.id} style={[s.renglon, { borderColor: c.tiene ? '#2e7d32' : '#FFB74D',
            backgroundColor: c.tiene ? 'rgba(46,125,50,0.10)' : 'rgba(255,183,77,0.12)' }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[s.razon, { color: C.texto }]}>{x.razon_social}</Text>
              <Text style={[s.rfc, { color: C.suave }]}>{x.rfc}</Text>
              {c.tiene && (
                <Text style={{ fontSize: 10, color: c.vigente ? '#2e7d32' : '#c62828', fontWeight: '700', marginTop: 2 }}>
                  {c.vigente
                    ? `Vigente${c.dias_para_vencer != null ? ` · ${c.dias_para_vencer} días` : ''}`
                    : 'Vencida'}
                </Text>
              )}
            </View>
            {c.tiene && !!c.constancia_url && (
              <TouchableOpacity onPress={() => Linking.openURL(c.constancia_url!)} style={{ paddingHorizontal: 6 }}>
                <Ionicons name="eye-outline" size={18} color="#2e7d32" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.boton}
              onPress={() => { setElegida(x); setArchivo(null); setError(null); }}>
              <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
              <Text style={s.botonTexto}>{c.tiene ? 'Reemplazar' : 'Subir'}</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <Modal visible={!!elegida} transparent animationType="slide" onRequestClose={() => { if (!subiendo) setElegida(null); }}>
        <View style={s.fondoModal}>
          <View style={[s.modal, { backgroundColor: oscuro ? '#151515' : '#fff' }]}>
            <Text style={[s.modalTitulo, { color: C.texto }]}>Constancia de {elegida?.razon_social}</Text>
            <View style={s.nota}>
              <Ionicons name="information-circle-outline" size={16} color="#1565c0" />
              <Text style={s.notaTexto}>
                Tiene que ser la constancia del RFC {elegida?.rfc}. Si el documento está a nombre de otra
                empresa no se guarda: revisamos el RFC impreso dentro del archivo.
              </Text>
            </View>
            <TouchableOpacity style={[s.selector, { borderColor: C.borde }]} onPress={escoger} disabled={subiendo}>
              <Ionicons name="document-attach-outline" size={18} color={ORANGE} />
              <Text numberOfLines={1} style={[s.selectorTexto, { color: C.texto }]}>
                {archivo ? archivo.name : 'Elegir archivo (PDF, JPG o PNG)'}
              </Text>
            </TouchableOpacity>
            {!!error && <Text style={s.error}>{error}</Text>}
            <View style={s.acciones}>
              <TouchableOpacity onPress={() => { if (!subiendo) { setElegida(null); setArchivo(null); setError(null); } }} disabled={subiendo}>
                <Text style={{ color: C.suave, fontWeight: '600', padding: 10 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.boton, { opacity: !archivo || subiendo ? 0.5 : 1, paddingHorizontal: 16, paddingVertical: 10 }]}
                onPress={subir} disabled={!archivo || subiendo}>
                <Text style={s.botonTexto}>{subiendo ? 'Subiendo…' : 'Subir y validar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 14 },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  titulo: { fontSize: 14, fontWeight: '700' },
  pill: { backgroundColor: '#FFF4E5', borderWidth: 1, borderColor: '#FFB74D', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  pillTexto: { fontSize: 10, color: '#8A4B00', fontWeight: '700' },
  ayuda: { fontSize: 11, lineHeight: 15, marginTop: 5 },
  renglon: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 9, padding: 9, marginTop: 9 },
  razon: { fontSize: 13, fontWeight: '700' },
  rfc: { fontSize: 11, marginTop: 1 },
  boton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ORANGE, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  botonTexto: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fondoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 30 },
  modalTitulo: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  nota: { flexDirection: 'row', gap: 7, backgroundColor: 'rgba(21,101,192,0.12)', borderRadius: 9, padding: 10, marginBottom: 12 },
  notaTexto: { flex: 1, fontSize: 11, lineHeight: 15, color: '#1565c0' },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 9, padding: 14 },
  selectorTexto: { flex: 1, fontSize: 12, fontWeight: '600' },
  error: { color: '#ff6b6b', fontSize: 12, marginTop: 10, lineHeight: 16 },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16 },
});

export default ConstanciasPorRazonSocial;
