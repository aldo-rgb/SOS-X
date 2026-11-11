/**
 * Mis Facturas — los CFDI del cliente, con su PDF y su XML.
 *
 * En el portal web esto existe desde siempre; en la app no había nada. El
 * cliente que solo usa el teléfono tenía que entrar a la web para bajar su
 * factura, o levantar un ticket (tarea 882, la propuso Christian González y la
 * validó con dos clientes).
 *
 * Son 505 facturas de 89 clientes, así que no es un caso raro.
 *
 * El XML importa tanto como el PDF: al contador se le entregan los dos, y una
 * pantalla que solo diera el PDF dejaría el trámite a medias.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const NARANJA = '#D6521C';
const NEGRO = '#1A1A1A';

interface Factura {
  id: number;
  uuid_sat: string | null;
  folio: string | null;
  serie: string | null;
  total: string | number;
  currency: string | null;
  status: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  receptor_razon_social: string | null;
  receptor_rfc: string | null;
  created_at: string;
}

// La moneda viene del timbrado como "MXN - Peso": en la tarjeta solo cabe el
// código, y "MXN - Peso" al lado del monto se lee como ruido.
const soloCodigo = (m: string | null) => String(m || 'MXN').split(/[\s-]/)[0].toUpperCase() || 'MXN';

const dinero = (n: any, moneda: string | null) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${soloCodigo(moneda)}`;

const fecha = (s: string) =>
  new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

export default function MisFacturasScreen({ route }: any) {
  const { token } = route.params || {};
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/api/fiscal/invoices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar tus facturas.');
      setFacturas(json?.facturas || []);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar tus facturas.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);

  // El enlace viene armado del servidor. Si por lo que sea no viene, se dice:
  // mandar al cliente a una pantalla en blanco es peor que avisarle.
  const abrir = async (url: string | null, que: string) => {
    if (!url) {
      Alert.alert('Sin archivo', `Esta factura todavía no tiene ${que} disponible. Escríbenos y te lo mandamos.`);
      return;
    }
    try {
      const sePuede = await Linking.canOpenURL(url);
      if (!sePuede) throw new Error('no se puede abrir');
      await Linking.openURL(url);
    } catch {
      Alert.alert('No se pudo abrir', `No pudimos abrir el ${que}. Intenta de nuevo en un momento.`);
    }
  };

  const Renglon = ({ item }: { item: Factura }) => {
    const cancelada = String(item.status || '').toLowerCase() === 'canceled';
    return (
      <View style={[s.tarjeta, cancelada && { opacity: 0.6 }]}>
        <View style={s.filaArriba}>
          <View style={{ flex: 1 }}>
            <Text style={s.folio}>
              {item.serie ? `${item.serie}-` : ''}{item.folio || `#${item.id}`}
            </Text>
            <Text style={s.fecha}>{fecha(item.created_at)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.total}>{dinero(item.total, item.currency)}</Text>
            {cancelada
              ? <View style={s.chipCancelada}><Text style={s.chipCanceladaTexto}>Cancelada</Text></View>
              : <View style={s.chipVigente}><Text style={s.chipVigenteTexto}>Vigente</Text></View>}
          </View>
        </View>

        {!!item.receptor_razon_social && (
          <Text style={s.receptor} numberOfLines={1}>
            {item.receptor_razon_social}{item.receptor_rfc ? ` · ${item.receptor_rfc}` : ''}
          </Text>
        )}

        <View style={s.botones}>
          <TouchableOpacity style={[s.boton, s.botonPdf]} onPress={() => abrir(item.pdf_url, 'PDF')}>
            <Ionicons name="document-text-outline" size={17} color="#C62828" />
            <Text style={[s.botonTexto, { color: '#C62828' }]}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.boton, s.botonXml]} onPress={() => abrir(item.xml_url, 'XML')}>
            <Ionicons name="code-slash-outline" size={17} color="#1565C0" />
            <Text style={[s.botonTexto, { color: '#1565C0' }]}>XML</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (cargando) {
    return (
      <SafeAreaView style={s.centro}>
        <ActivityIndicator size="large" color={NARANJA} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.pantalla} edges={['bottom']}>
      <FlatList
        data={facturas}
        keyExtractor={(f) => String(f.id)}
        renderItem={({ item }) => <Renglon item={item} />}
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} tintColor={NARANJA} />
        }
        ListHeaderComponent={
          error ? (
            <View style={s.aviso}>
              <Ionicons name="alert-circle-outline" size={18} color="#C62828" />
              <Text style={s.avisoTexto}>{error}</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !error ? (
            <View style={s.vacio}>
              <Ionicons name="receipt-outline" size={46} color="#CCC" />
              <Text style={s.vacioTitulo}>Todavía no tienes facturas</Text>
              <Text style={s.vacioTexto}>
                Aquí van a aparecer tus CFDI en cuanto se emitan, con su PDF y su XML para descargar.
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#F7F7F7' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F7F7' },
  tarjeta: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#ECECEC',
  },
  filaArriba: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  folio: { fontSize: 16, fontWeight: '800', color: NEGRO },
  fecha: { fontSize: 12, color: '#888', marginTop: 2 },
  total: { fontSize: 15, fontWeight: '800', color: NEGRO },
  chipVigente: { backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 4 },
  chipVigenteTexto: { fontSize: 10, fontWeight: '800', color: '#2E7D32' },
  chipCancelada: { backgroundColor: '#FFEBEE', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 4 },
  chipCanceladaTexto: { fontSize: 10, fontWeight: '800', color: '#C62828' },
  receptor: { fontSize: 12, color: '#666', marginTop: 8 },
  botones: { flexDirection: 'row', gap: 8, marginTop: 12 },
  boton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 9, borderWidth: 1,
  },
  botonPdf: { backgroundColor: '#FFF5F5', borderColor: '#FFCDD2' },
  botonXml: { backgroundColor: '#F3F8FF', borderColor: '#BBDEFB' },
  botonTexto: { fontSize: 13, fontWeight: '700' },
  aviso: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFEBEE',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  avisoTexto: { flex: 1, fontSize: 13, color: '#C62828' },
  vacio: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30 },
  vacioTitulo: { fontSize: 16, fontWeight: '700', color: '#555', marginTop: 12 },
  vacioTexto: { fontSize: 13, color: '#999', textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
