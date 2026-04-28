/**
 * WarehouseScannerScreen - Escáner Multi-Sucursal (SOLO CONSULTA) 🔎
 *
 * ⚠️ Este módulo NO da entrada ni salida a paquetes.
 * Su único propósito es escanear cualquier guía y mostrar información detallada:
 *   - Cliente, BOX, contacto
 *   - Carrier / tracking proveedor / tracking nacional
 *   - Estado actual y fechas (recibido, entregado)
 *   - Peso, cajas, dimensiones
 *   - Costos y estado de pago
 *   - Dirección de entrega asignada
 *   - Cajas hijas (multipieza)
 *   - Historial de movimientos (timeline)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Vibration,
  Modal,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

const SCAN_MODE_KEY = '@warehouse_scanner_mode';

const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const RED = '#F44336';
const BLUE = '#2196F3';
const YELLOW = '#FF9800';
const PURPLE = '#9C27B0';
const TEXT_DARK = '#222';
const TEXT_MUTED = '#666';
const BG = '#f5f5f5';

// ============================================
// TIPOS
// ============================================
interface Address {
  alias?: string;
  recipientName?: string;
  street?: string;
  exterior?: string;
  interior?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  reference?: string;
}

interface ShipmentMaster {
  id: number;
  tracking: string;
  trackingProvider?: string | null;
  trackingCourier?: string | null;
  description?: string | null;
  weight?: number | null;
  declaredValue?: number | null;
  isMaster?: boolean;
  totalBoxes?: number;
  status?: string;
  statusLabel?: string;
  receivedAt?: string | null;
  deliveredAt?: string | null;
  destinationCity?: string | null;
  destinationCountry?: string | null;
  destinationCode?: string | null;
  nationalCarrier?: string | null;
  nationalTracking?: string | null;
  paymentStatus?: string | null;
  clientPaid?: boolean;
  clientPaidAt?: string | null;
  totalCost?: number | null;
  poboxCostUsd?: number | null;
  assignedAddress?: Address | null;
  currentBranch?: {
    id: number;
    code?: string | null;
    name?: string | null;
  } | null;
}

interface ShipmentChild {
  id: number;
  tracking: string;
  boxNumber: number;
  trackingCourier?: string | null;
  weight?: number | null;
  dimensions?: { formatted?: string };
  status?: string;
}

interface ShipmentClient {
  id: number;
  name: string;
  email: string;
  boxId: string;
}

interface MovementEvent {
  id?: number | string;
  status?: string;
  // Etiquetas
  statusLabel?: string;
  status_label?: string;
  label?: string;
  // Notas / descripción
  description?: string;
  notes?: string | null;
  // Fechas
  createdAt?: string;
  created_at?: string;
  date?: string;
  // Sucursal / ubicación
  branch?: string | null;
  branch_name?: string | null;
  location?: string | null;
  warehouse_location?: string | null;
  // Usuario
  user?: string | null;
  created_by_name?: string | null;
  source?: string | null;
}

interface Props {
  navigation: any;
  route: any;
}

// ============================================
// HELPERS
// ============================================
const normalizeBarcode = (raw: string): string => {
  let v = raw.trim();
  // Remap teclado ES (Mac) por si llega un QR mal mapeado
  v = v
    .replace(/Ñ/g, ':')
    .replace(/ñ/g, ':')
    .replace(/'/g, '-')
    .replace(/¿/g, '/')
    .replace(/¡/g, '!');

  if (/^https?:[-/]/i.test(v)) {
    v = v.replace(/^(https?):-+/i, '$1://');
    v = v.replace(/([a-z]{2,}\.[a-z]{2,})-/gi, '$1/');
    v = v.replace(/track-/gi, 'track/');
  }

  const urlMatch = v.match(/(?:track|t)[/-]([A-Z0-9-]+)/i);
  if (urlMatch) v = urlMatch[1];

  v = v.toUpperCase().trim();

  const prefixMatch = v.match(/^(US|AIR|LOG|TRK)(\d+)$/);
  if (prefixMatch) v = `${prefixMatch[1]}-${prefixMatch[2]}`;

  return v;
};

const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  try {
    // México (zona Centro) está fija en UTC-6 desde 2022 (sin horario de verano).
    // Hacemos la conversión manual porque RN/iOS suele ignorar el option `timeZone`
    // de toLocaleString cuando no hay polyfill de Intl, y muestra la hora en la
    // TZ del dispositivo (UTC en simuladores, lo cual produce un desfase de +6h).
    const MX_OFFSET_MIN = -6 * 60;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const shifted = new Date(d.getTime() + MX_OFFSET_MIN * 60 * 1000);
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const dd = String(shifted.getUTCDate()).padStart(2, '0');
    const mm = months[shifted.getUTCMonth()];
    const yyyy = shifted.getUTCFullYear();
    let h = shifted.getUTCHours();
    const min = String(shifted.getUTCMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'p.m.' : 'a.m.';
    h = h % 12 || 12;
    return `${dd} ${mm} ${yyyy}, ${h}:${min} ${ampm}`;
  } catch {
    return iso;
  }
};

const fmtMoney = (n?: number | null, currency: 'MXN' | 'USD' = 'MXN'): string => {
  if (n == null || isNaN(Number(n))) return '—';
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(n));
  } catch {
    return `${currency} ${Number(n).toFixed(2)}`;
  }
};

const statusColor = (status?: string): string => {
  const s = (status || '').toLowerCase();
  if (s.includes('deliver')) return GREEN;
  if (s.includes('return')) return RED;
  if (s.includes('out_for') || s.includes('ready')) return YELLOW;
  if (s.includes('transit') || s.includes('customs')) return BLUE;
  if (s.includes('reempacado') || s.includes('processing')) return PURPLE;
  return TEXT_MUTED;
};

const STATUS_LABELS: Record<string, string> = {
  received: 'Recibido Hidalgo TX',
  received_origin: 'Recibido en China',
  received_china: 'Recibido en China',
  in_transit: 'En tránsito a MTY, N.L.',
  in_transit_mx: 'En tránsito a MX',
  in_transit_mty: 'En tránsito a MTY, N.L.',
  at_customs: 'En aduana',
  customs: 'En aduana',
  received_cedis: 'Recibido CEDIS',
  received_mty: 'Recibido MTY',
  ready_pickup: 'Listo para recoger',
  out_for_delivery: 'En ruta de entrega',
  en_ruta_entrega: 'En ruta de entrega',
  delivered: 'Entregado',
  shipped: 'Enviado',
  sent: 'Enviado',
  enviado: 'Enviado',
  processing: 'Procesando',
  reempacado: 'Reempacado',
  returned: 'Devuelto',
};

const prettyStatus = (status?: string | null): string => {
  if (!status) return '—';
  const key = String(status).toLowerCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const isEntregaXLocal = (carrier?: string | null): boolean => {
  const s = (carrier || '').toLowerCase();
  return s.includes('entregax') || s.includes('local') || s.includes('propia');
};

const lastMileLabel = (carrier?: string | null): string => {
  if (!carrier) return 'No asignada';
  const s = carrier.toLowerCase();
  if (isEntregaXLocal(carrier)) return '🚐 EntregaXa Local';
  if (s.includes('paquete') || s.includes('pqtx') || s.includes('express')) return '📦 Paquete Express';
  if (s.includes('estafeta')) return '📦 Estafeta';
  if (s.includes('fedex')) return '📦 FedEx';
  if (s.includes('dhl')) return '📦 DHL';
  if (s.includes('redpack')) return '📦 Redpack';
  return `📦 ${carrier.toUpperCase()}`;
};

const formatAddress = (a?: Address | null): string => {
  if (!a) return '';
  const parts = [
    a.street,
    a.exterior ? `#${a.exterior}` : '',
    a.interior ? `Int. ${a.interior}` : '',
    a.neighborhood,
    a.city,
    a.state,
    a.zip,
  ].filter(Boolean);
  return parts.join(', ');
};

// ============================================
// COMPONENTE
// ============================================
type InputMode = 'select' | 'camera' | 'manual';

export default function WarehouseScannerScreen({ navigation, route }: Props) {
  const token: string | undefined = route?.params?.token;
  const [permission, requestPermission] = useCameraPermissions();

  // Modo de entrada: la primera vez se le pregunta al usuario qué quiere usar.
  // Se guarda en AsyncStorage para no volver a preguntar.
  const [inputMode, setInputMode] = useState<InputMode>('select');
  const [modeLoaded, setModeLoaded] = useState(false);

  // Cargar preferencia guardada al montar; si no existe, preguntar UNA vez
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SCAN_MODE_KEY);
        if (saved === 'camera' || saved === 'manual') {
          setInputMode(saved as InputMode);
          setModeLoaded(true);
          return;
        }
      } catch {
        // ignore
      }
      // Sin preferencia: mostrar Alert nativo y guardar la elección
      setModeLoaded(true);
      Alert.alert(
        '¿Cómo quieres escanear?',
        'Elige el método de entrada para consultar guías. Se guardará como tu preferencia.',
        [
          {
            text: '📷 Cámara',
            onPress: async () => {
              if (!permission?.granted) {
                const r = await requestPermission();
                if (!r.granted) {
                  setInputMode('manual');
                  AsyncStorage.setItem(SCAN_MODE_KEY, 'manual').catch(() => {});
                  return;
                }
              }
              setInputMode('camera');
              AsyncStorage.setItem(SCAN_MODE_KEY, 'camera').catch(() => {});
            },
          },
          {
            text: '⌨️ Manual / Pistola',
            onPress: () => {
              setInputMode('manual');
              AsyncStorage.setItem(SCAN_MODE_KEY, 'manual').catch(() => {});
            },
          },
        ],
        { cancelable: false }
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistMode = async (mode: InputMode) => {
    try {
      await AsyncStorage.setItem(SCAN_MODE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const [scannerActive, setScannerActive] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    master: ShipmentMaster;
    children: ShipmentChild[];
    client: ShipmentClient;
  } | null>(null);
  const [movements, setMovements] = useState<MovementEvent[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  const [showManualInput, setShowManualInput] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');

  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  // ============================================
  // CONSULTA
  // ============================================
  const lookupTracking = useCallback(async (raw: string) => {
    const tracking = normalizeBarcode(raw);
    if (!tracking) return;

    setSearching(true);
    setScannerActive(false);
    setError(null);
    setData(null);
    setMovements([]);

    try {
      const res = await api.get(`/api/packages/track/${encodeURIComponent(tracking)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.data?.success && res.data?.shipment) {
        setData(res.data.shipment);
        Vibration.vibrate(80);
        // Cargar movimientos en paralelo
        loadMovements(tracking);
      } else {
        setError('No se encontró información para esta guía');
        Vibration.vibrate([0, 150, 80, 150]);
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setError(`Guía "${tracking}" no encontrada`);
      } else {
        setError(err?.response?.data?.error || 'Error al consultar la guía');
      }
      Vibration.vibrate([0, 150, 80, 150]);
    } finally {
      setSearching(false);
    }
  }, []);

  const loadMovements = async (tracking: string) => {
    setLoadingMovements(true);
    try {
      const res = await api.get(`/api/packages/track/${encodeURIComponent(tracking)}/movements`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const list: MovementEvent[] =
        res.data?.movements ||
        res.data?.events ||
        res.data?.history ||
        res.data?.timeline ||
        [];
      setMovements(Array.isArray(list) ? list : []);
    } catch {
      setMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  // ============================================
  // ESCANEO POR CÁMARA
  // ============================================
  const handleBarCodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const { data: code } = result;
      if (!scannerActive || searching) return;

      // Anti-rebote: ignorar mismo código por 3 segundos
      const now = Date.now();
      if (lastScanRef.current.code === code && now - lastScanRef.current.at < 3000) return;
      lastScanRef.current = { code, at: now };

      lookupTracking(code);
    },
    [scannerActive, searching, lookupTracking]
  );

  const handleManualSubmit = () => {
    if (!manualBarcode.trim()) return;
    const code = manualBarcode.trim();
    setManualBarcode('');
    setShowManualInput(false);
    lookupTracking(code);
  };

  const handleNewScan = () => {
    setData(null);
    setError(null);
    setMovements([]);
    setManualBarcode('');
    lastScanRef.current = { code: '', at: 0 };
    setScannerActive(true);
    // Mantener el modo elegido por el usuario (no volver al selector)
  };

  const pickCamera = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) return;
    }
    setInputMode('camera');
    persistMode('camera');
  };

  const pickManual = () => {
    setInputMode('manual');
    persistMode('manual');
  };

  const switchMode = () => {
    // Botón en el header para alternar entre cámara y manual
    setData(null);
    setError(null);
    setManualBarcode('');
    if (inputMode === 'camera') {
      setInputMode('manual');
      persistMode('manual');
    } else if (inputMode === 'manual') {
      if (permission?.granted) {
        setInputMode('camera');
        persistMode('camera');
      } else {
        pickCamera();
      }
    } else {
      setInputMode('select');
    }
  };

  const resetModePreference = async () => {
    Alert.alert(
      'Cambiar método de escaneo',
      'Elige el método que quieres usar:',
      [
        {
          text: '📷 Cámara',
          onPress: async () => {
            if (!permission?.granted) {
              const r = await requestPermission();
              if (!r.granted) return;
            }
            setInputMode('camera');
            persistMode('camera');
            setData(null);
            setError(null);
          },
        },
        {
          text: '⌨️ Manual',
          onPress: () => {
            setInputMode('manual');
            persistMode('manual');
            setData(null);
            setError(null);
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  // ============================================
  // RENDER
  // ============================================
  if (!permission || !modeLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted && inputMode === 'camera') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="camera-outline" size={80} color="#ccc" />
          <Text style={styles.permissionTitle}>Permiso de Cámara</Text>
          <Text style={styles.permissionText}>
            Necesitamos acceso a la cámara para escanear códigos de barras
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Permitir Cámara</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: '#666', marginTop: 12 }]}
            onPress={() => setInputMode('manual')}
          >
            <Text style={styles.permissionButtonText}>Usar Scanner Manual</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const m = data?.master;
  const client = data?.client;
  const children = data?.children || [];

  // ============================================
  // PANTALLA INICIAL: ESPERANDO ELECCIÓN DEL ALERT
  // ============================================
  if (inputMode === 'select' && !data && !error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>🔎 Escáner Multi-Sucursal</Text>
            <Text style={styles.headerSubtitle}>Solo consulta · sin entrada/salida</Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={[styles.permissionText, { marginTop: 18 }]}>
            Selecciona el método de escaneo en el cuadro de diálogo…
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={resetModePreference}>
            <Text style={styles.permissionButtonText}>Volver a preguntar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>🔎 Escáner Multi-Sucursal</Text>
          <Text style={styles.headerSubtitle}>Solo consulta · sin entrada/salida</Text>
        </View>
        <TouchableOpacity onPress={switchMode} onLongPress={resetModePreference}>
          <Ionicons
            name={inputMode === 'camera' ? 'keypad-outline' : 'camera-outline'}
            size={26}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      {/* Cámara o Manual o Resultado */}
      {!data && !error && inputMode === 'camera' ? (
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.scanner}
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'pdf417'],
            }}
            onBarcodeScanned={
              scannerActive && !searching ? handleBarCodeScanned : undefined
            }
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame}>
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
            </View>
            <View style={styles.scannerHintBox}>
              {searching ? (
                <View style={styles.scannerHintInner}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.scannerHint}>Consultando guía...</Text>
                </View>
              ) : (
                <Text style={styles.scannerHint}>
                  📷 Apunta al código de barras o QR
                </Text>
              )}
            </View>
          </View>
          <View style={styles.bottomHint}>
            <Ionicons name="information-circle-outline" size={18} color="#fff" />
            <Text style={styles.bottomHintText}>
              Acepta DHL, AIR-XXX, LOG-XXX, US-XXX, marítimos y nacionales
            </Text>
          </View>
        </View>
      ) : !data && !error && inputMode === 'manual' ? (
        <View style={styles.manualPanelContainer}>
          <View style={styles.manualPanelCard}>
            <Ionicons name="keypad" size={48} color={BLUE} />
            <Text style={styles.manualPanelTitle}>Scanner físico / Manual</Text>
            <Text style={styles.manualPanelSubtitle}>
              Escanea con la pistola o escribe la guía y presiona consultar
            </Text>
            <TextInput
              style={styles.manualPanelInput}
              value={manualBarcode}
              onChangeText={setManualBarcode}
              placeholder="Ej: 1234567890, AIR-12345..."
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={handleManualSubmit}
              editable={!searching}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, !manualBarcode.trim() && { opacity: 0.5 }]}
              onPress={handleManualSubmit}
              disabled={!manualBarcode.trim() || searching}
            >
              {searching ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="search" size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>Consultar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.bottomHint}>
            <Ionicons name="information-circle-outline" size={18} color="#fff" />
            <Text style={styles.bottomHintText}>
              Acepta DHL, AIR-XXX, LOG-XXX, US-XXX, marítimos y nacionales
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.resultScroll}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* Error */}
          {error && (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={48} color={RED} />
              <Text style={styles.errorCardTitle}>{error}</Text>
              <Text style={styles.errorCardText}>
                Verifica que el código sea correcto. Puedes intentar de nuevo.
              </Text>

              {/* Campo manual siempre disponible para reintentar sin salir */}
              <TextInput
                style={[styles.manualPanelInput, { marginTop: 4 }]}
                value={manualBarcode}
                onChangeText={setManualBarcode}
                placeholder="Escribe la guía y presiona buscar"
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleManualSubmit}
                editable={!searching}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, !manualBarcode.trim() && { opacity: 0.5 }]}
                onPress={handleManualSubmit}
                disabled={!manualBarcode.trim() || searching}
              >
                {searching ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="search" size={20} color="#fff" />
                    <Text style={styles.primaryBtnText}>Buscar guía</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={handleNewScan}>
                <Ionicons
                  name={inputMode === 'camera' ? 'scan' : 'keypad'}
                  size={18}
                  color={ORANGE}
                />
                <Text style={styles.secondaryBtnText}>
                  {inputMode === 'camera' ? 'Volver al escáner' : 'Limpiar campo'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Resultado exitoso */}
          {data && m && (
            <>
              {/* Tarjeta principal */}
              <View style={styles.mainCard}>
                <View style={styles.mainHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mainLabel}>GUÍA</Text>
                    <Text style={styles.mainTracking} selectable>
                      {m.tracking}
                    </Text>
                    {!!m.description && (
                      <Text style={styles.mainDescription} numberOfLines={2}>
                        {m.description}
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: statusColor(m.status) },
                    ]}
                  >
                    <Text style={styles.statusPillText}>
                      {m.statusLabel || prettyStatus(m.status) || 'Sin estado'}
                    </Text>
                  </View>
                </View>

                {m.isMaster && (
                  <View style={styles.multipieceBadge}>
                    <Ionicons name="cube" size={14} color={ORANGE} />
                    <Text style={styles.multipieceText}>
                      Multipieza · {m.totalBoxes || 1} cajas
                    </Text>
                  </View>
                )}
              </View>

              {/* Cliente */}
              <Section title="Cliente" icon="person">
                <Row label="BOX" value={client?.boxId || 'N/A'} bold />
              </Section>

              {/* Sucursal donde se escaneó */}
              {m.currentBranch && (
                <Section title="Sucursal actual" icon="business">
                  <Row
                    label="Sucursal"
                    value={
                      m.currentBranch.name
                        ? `${m.currentBranch.name}${m.currentBranch.code ? ` (${m.currentBranch.code})` : ''}`
                        : m.currentBranch.code || `#${m.currentBranch.id}`
                    }
                    bold
                  />
                </Section>
              )}

              {/* Carrier / tracking proveedor */}
              {!!(String(m.trackingProvider || m.trackingCourier || '').trim()) && (
                <Section title="Carrier proveedor" icon="cube">
                  <Row
                    label="Tracking proveedor"
                    value={m.trackingProvider || m.trackingCourier || '—'}
                  />
                </Section>
              )}

              {/* Última milla */}
              {(m.nationalCarrier || m.nationalTracking) && (
                <Section title="Última milla (entrega final)" icon="car">
                  <Row
                    label="Paquetería"
                    value={lastMileLabel(m.nationalCarrier)}
                    bold
                    color={isEntregaXLocal(m.nationalCarrier) ? ORANGE : BLUE}
                  />
                  {!!m.nationalTracking && (
                    <Row label="Guía nacional" value={m.nationalTracking} />
                  )}
                </Section>
              )}

              {/* Datos físicos */}
              <Section title="Datos del envío" icon="resize">
                <View style={styles.gridRow}>
                  <Cell label="Peso" value={m.weight != null ? `${Number(m.weight).toFixed(2)} kg` : '—'} />
                  <Cell label="Cajas" value={String(m.totalBoxes || 1)} />
                </View>
              </Section>

              {/* Estado de pago */}
              <Section title="Estado de pago" icon="cash">
                <View style={styles.payRow}>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: m.clientPaid ? GREEN : YELLOW,
                        alignSelf: 'flex-start',
                      },
                    ]}
                  >
                    <Text style={styles.statusPillText}>
                      {m.clientPaid ? 'PAGADO' : (m.paymentStatus || 'PENDIENTE')}
                    </Text>
                  </View>
                  {!!m.clientPaidAt && (
                    <Text style={styles.paySubtext}>{fmtDate(m.clientPaidAt)}</Text>
                  )}
                </View>
              </Section>

              {/* Fechas */}
              <Section title="Fechas" icon="time">
                <Row label="Recibido" value={fmtDate(m.receivedAt)} />
                <Row label="Entregado" value={fmtDate(m.deliveredAt)} />
              </Section>

              {/* Dirección */}
              {m.assignedAddress ? (
                <Section title="Dirección de entrega" icon="location">
                  {!!m.assignedAddress.recipientName && (
                    <Row
                      label="Destinatario"
                      value={`${m.assignedAddress.recipientName}${m.assignedAddress.phone ? ` · ${m.assignedAddress.phone}` : ''}`}
                      bold
                    />
                  )}
                  <Row label="Dirección" value={formatAddress(m.assignedAddress) || '—'} />
                  {!!m.assignedAddress.reference && (
                    <Row label="Referencia" value={m.assignedAddress.reference} />
                  )}
                </Section>
              ) : (m.destinationCity || m.destinationCountry) ? (
                <Section title="Destino" icon="location">
                  <Row
                    label="Ciudad"
                    value={[m.destinationCity, m.destinationCountry].filter(Boolean).join(', ')}
                  />
                  {!!m.destinationCode && <Row label="Código" value={m.destinationCode} />}
                </Section>
              ) : null}

              {/* Cajas hijas */}
              {children.length > 0 && (
                <Section title={`Cajas del envío (${children.length})`} icon="cube-outline">
                  {children.map((c) => (
                    <View key={c.id} style={styles.childRow}>
                      <View style={styles.childIndex}>
                        <Text style={styles.childIndexText}>{c.boxNumber}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.childTracking}>{c.tracking}</Text>
                        <Text style={styles.childMeta} numberOfLines={1}>
                          {[
                            c.trackingCourier,
                            c.weight != null ? `${Number(c.weight).toFixed(2)} kg` : null,
                            c.dimensions?.formatted,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.childStatusPill,
                          { borderColor: statusColor(c.status) },
                        ]}
                      >
                        <Text style={[styles.childStatusText, { color: statusColor(c.status) }]}>
                          {prettyStatus(c.status)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Section>
              )}

              {/* Movimientos */}
              <Section title="Historial de movimientos" icon="git-network">
                {loadingMovements && (
                  <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                    <ActivityIndicator color={ORANGE} />
                  </View>
                )}
                {!loadingMovements && movements.length === 0 && (
                  <Text style={styles.emptyText}>
                    No hay movimientos registrados para esta guía.
                  </Text>
                )}
                {movements.map((ev, i) => (
                  <View key={ev.id ?? i} style={styles.timelineRow}>
                    <View
                      style={[
                        styles.timelineDot,
                        { backgroundColor: statusColor(ev.status) },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timelineStatus}>
                        {ev.statusLabel || ev.status_label || ev.label || prettyStatus(ev.status) || 'Evento'}
                      </Text>
                      <Text style={styles.timelineDate}>
                        {fmtDate(ev.createdAt || ev.created_at || ev.date)}
                      </Text>
                      {!!(ev.branch || ev.branch_name || ev.location || ev.warehouse_location) && (
                        <Text style={styles.timelineMeta}>
                          📍 {ev.branch || ev.branch_name || ev.location || ev.warehouse_location}
                        </Text>
                      )}
                      {!!(ev.user || ev.created_by_name || ev.source === 'system') && (
                        <Text style={styles.timelineMeta}>👤 {ev.user || ev.created_by_name || 'Sistema'}</Text>
                      )}
                      {!!(ev.description || ev.notes) && (
                        <Text style={styles.timelineNotes}>
                          {ev.description || ev.notes}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </Section>

              {/* Acciones */}
              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleNewScan}>
                  <Ionicons name="scan" size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>Escanear otra guía</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Manual Input Modal */}
      <Modal visible={showManualInput} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.manualInputModal}>
            <Text style={styles.manualInputTitle}>📝 Búsqueda Manual</Text>
            <Text style={styles.manualInputSubtitle}>
              Escribe la guía a consultar
            </Text>
            <TextInput
              style={styles.manualInput}
              placeholder="Ej: US-2722344044, AIR-12345, 1234567890"
              placeholderTextColor="#999"
              value={manualBarcode}
              onChangeText={setManualBarcode}
              autoCapitalize="characters"
              autoFocus
              onSubmitEditing={handleManualSubmit}
              returnKeyType="search"
            />
            <View style={styles.manualInputButtons}>
              <TouchableOpacity
                style={[styles.manualButton, { backgroundColor: '#ccc' }]}
                onPress={() => {
                  setShowManualInput(false);
                  setManualBarcode('');
                }}
              >
                <Text style={styles.manualButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.manualButton, { backgroundColor: ORANGE }]}
                onPress={handleManualSubmit}
                disabled={!manualBarcode.trim()}
              >
                <Text style={[styles.manualButtonText, { color: '#fff' }]}>
                  Consultar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================
// SUBCOMPONENTES
// ============================================
const Section: React.FC<{
  title: string;
  icon: any;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={18} color={ORANGE} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const Row: React.FC<{
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
}> = ({ label, value, bold, color }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text
      style={[
        styles.rowValue,
        bold && { fontWeight: '700' },
        color && { color },
      ]}
      selectable
    >
      {value}
    </Text>
  </View>
);

const Cell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.cell}>
    <Text style={styles.cellLabel}>{label}</Text>
    <Text style={styles.cellValue} selectable>
      {value}
    </Text>
  </View>
);

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ORANGE,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  // Scanner
  scannerContainer: { flex: 1, position: 'relative', backgroundColor: '#000' },
  scanner: { flex: 1 },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: { width: 280, height: 280, position: 'relative' },
  cornerTL: { position: 'absolute', top: 0, left: 0, width: 40, height: 40, borderTopWidth: 4, borderLeftWidth: 4, borderColor: '#fff' },
  cornerTR: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderTopWidth: 4, borderRightWidth: 4, borderColor: '#fff' },
  cornerBL: { position: 'absolute', bottom: 0, left: 0, width: 40, height: 40, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: '#fff' },
  cornerBR: { position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderBottomWidth: 4, borderRightWidth: 4, borderColor: '#fff' },
  scannerHintBox: {
    position: 'absolute',
    bottom: 100,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 22,
  },
  scannerHintInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scannerHint: { fontSize: 15, color: '#fff', fontWeight: '500' },
  bottomHint: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  bottomHintText: { color: '#fff', fontSize: 12, flex: 1 },

  // Result
  resultScroll: { flex: 1, padding: 14 },

  // Error card
  errorCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 14,
    alignItems: 'center',
    borderLeftWidth: 5,
    borderLeftColor: RED,
  },
  errorCardTitle: { fontSize: 18, fontWeight: 'bold', color: TEXT_DARK, marginTop: 12, textAlign: 'center' },
  errorCardText: { fontSize: 14, color: TEXT_MUTED, marginTop: 8, marginBottom: 18, textAlign: 'center' },

  // Main card
  mainCard: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 14,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: ORANGE,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  mainHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  mainLabel: { fontSize: 11, color: TEXT_MUTED, fontWeight: '700', letterSpacing: 1 },
  mainTracking: { fontSize: 22, fontWeight: 'bold', color: TEXT_DARK, marginTop: 2 },
  mainDescription: { fontSize: 13, color: TEXT_MUTED, marginTop: 6 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginLeft: 8 },
  statusPillText: { color: '#fff', fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  multipieceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ORANGE + '15',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 12,
  },
  multipieceText: { fontSize: 12, fontWeight: '600', color: ORANGE },

  // Sections
  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 1 },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  sectionBody: { padding: 14 },

  // Rows
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  rowLabel: { fontSize: 12, color: TEXT_MUTED, flex: 0.4 },
  rowValue: { fontSize: 13, color: TEXT_DARK, flex: 0.6, textAlign: 'right' },

  // Grid
  gridRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  cell: { flex: 1, backgroundColor: '#f8f8f8', padding: 10, borderRadius: 8 },
  cellLabel: { fontSize: 11, color: TEXT_MUTED, fontWeight: '600' },
  cellValue: { fontSize: 15, color: TEXT_DARK, fontWeight: '700', marginTop: 2 },

  // Pago
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paySubtext: { fontSize: 12, color: TEXT_MUTED },

  // Hijos
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  childIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ORANGE + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  childIndexText: { color: ORANGE, fontWeight: '700' },
  childTracking: { fontSize: 13, fontWeight: '700', color: TEXT_DARK },
  childMeta: { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  childStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  childStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  // Timeline
  timelineRow: {
    flexDirection: 'row',
    paddingBottom: 14,
    paddingLeft: 4,
    gap: 10,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineStatus: { fontSize: 13, fontWeight: '700', color: TEXT_DARK },
  timelineDate: { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  timelineMeta: { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  timelineNotes: { fontSize: 12, color: TEXT_DARK, marginTop: 4, fontStyle: 'italic' },
  emptyText: { textAlign: 'center', color: TEXT_MUTED, paddingVertical: 14 },

  // Actions
  actionsRow: { marginTop: 4, marginBottom: 14 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ORANGE,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  secondaryBtnText: { color: ORANGE, fontWeight: '600', fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  manualInputModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  manualInputTitle: { fontSize: 20, fontWeight: 'bold', color: TEXT_DARK, textAlign: 'center' },
  manualInputSubtitle: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  manualInput: {
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
    color: TEXT_DARK,
  },
  manualInputButtons: { flexDirection: 'row', gap: 12 },
  manualButton: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  manualButtonText: { fontSize: 15, fontWeight: 'bold', color: TEXT_DARK },

  // Permission
  permissionTitle: { fontSize: 20, fontWeight: 'bold', color: TEXT_DARK, marginTop: 20 },
  permissionText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', marginTop: 8, marginBottom: 20, paddingHorizontal: 20 },
  permissionButton: { backgroundColor: ORANGE, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
  permissionButtonText: { fontSize: 16, fontWeight: 'bold', color: '#fff' },

  // Picker (selector de modo inicial)
  pickerContainer: { flex: 1, padding: 20, gap: 16 },
  pickerTitle: { fontSize: 22, fontWeight: 'bold', color: TEXT_DARK, marginTop: 12, textAlign: 'center' },
  pickerSubtitle: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', marginBottom: 12 },
  pickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    gap: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  pickerIcon: {
    width: 72,
    height: 72,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerCardTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK, marginBottom: 4 },
  pickerCardText: { fontSize: 12, color: TEXT_MUTED, lineHeight: 16 },
  pickerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginTop: 'auto',
  },
  pickerHintText: { color: TEXT_MUTED, fontSize: 12, flex: 1 },

  // Panel de entrada manual (pantalla completa)
  manualPanelContainer: { flex: 1, backgroundColor: '#1a1a1a', padding: 20, justifyContent: 'space-between' },
  manualPanelCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 40,
  },
  manualPanelTitle: { fontSize: 20, fontWeight: 'bold', color: TEXT_DARK, marginTop: 12 },
  manualPanelSubtitle: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  manualPanelInput: {
    width: '100%',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    marginBottom: 16,
    color: TEXT_DARK,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
