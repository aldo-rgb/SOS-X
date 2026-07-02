// ============================================
// ADVISOR CLIENTS SCREEN
// Lista de clientes del asesor + gestión de direcciones
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, TouchableOpacity,
  TextInput, Linking, Modal, ScrollView, Alert, Clipboard, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Avatar, Chip, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const PURPLE = '#7B1FA2';

const SERVICE_LIST = [
  { value: 'air',         label: '✈️ Aéreo China',   color: '#2196F3', serviceType: 'china_air' },
  { value: 'maritime',   label: '🚢 Marítimo China', color: '#00897B', serviceType: 'china_sea' },
  { value: 'tdi_express',label: '✈️ TDI Express',    color: '#7B1FA2', serviceType: 'tdi_express' },
  { value: 'dhl',        label: '📮 Liberación MTY', color: '#D32F2F', serviceType: 'dhl' },
  { value: 'usa',        label: '📦 PO Box USA',     color: '#F05A28', serviceType: 'usa_pobox' },
];

interface Client {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  box_id: string;
  is_verified: boolean;
  verification_status: string;
  created_at: string;
  last_shipment_at: string | null;
  total_packages: number;
  in_transit_count: number;
  pending_payment_count: number;
  total_pending: number;
}

interface ClientAddress {
  id: number;
  alias: string | null;
  recipient_name: string | null;
  street: string;
  exterior_number: string;
  interior_number: string | null;
  colony: string | null;
  city: string;
  state: string;
  zip_code: string;
  is_default: boolean;
  default_for_service: string | null;
  carrier_config?: Record<string, string> | null;
  created_by_advisor_id?: number | null;
}

interface CarrierOption {
  id?: number;
  carrier_key?: string;
  name: string;
  icon?: string | null;
}

export default function AdvisorClientsScreen({ navigation, route }: any) {
  const { user, token, filter: initialFilter, subAdvisorId, subAdvisorName } = route.params;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>(initialFilter || 'all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [instrEnabled, setInstrEnabled] = useState(true);

  // Address management modal
  const [addrModal, setAddrModal] = useState(false);
  const [addrClient, setAddrClient] = useState<Client | null>(null);
  const [addrList, setAddrList] = useState<ClientAddress[]>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [editingAddrId, setEditingAddrId] = useState<number | null>(null);
  const [editingServices, setEditingServices] = useState<string[]>([]);
  const [editingCarrierConfig, setEditingCarrierConfig] = useState<Record<string, string>>({});
  const [carriersCache, setCarriersCache] = useState<Record<string, CarrierOption[]>>({});
  const [addrSaving, setAddrSaving] = useState(false);
  const [deleteAddrConfirm, setDeleteAddrConfirm] = useState<number | null>(null);

  // Datos fiscales del cliente
  const EMPTY_FISCAL = { razon_social: '', rfc: '', codigo_postal: '', regimen_fiscal: '', uso_cfdi: 'G03' };
  const [satRegimenes, setSatRegimenes] = useState<Array<{ clave: string; descripcion: string }>>([]);
  const [satUsos, setSatUsos] = useState<Array<{ clave: string; descripcion: string }>>([]);
  const [fiscalPicker, setFiscalPicker] = useState<null | 'regimen' | 'uso'>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/fiscal/catalogos/regimenes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((d) => setSatRegimenes(d.regimenes || [])).catch(() => {});
    fetch(`${API_URL}/api/fiscal/catalogos/usos-cfdi`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((d) => setSatUsos(d.usos || [])).catch(() => {});
  }, [token]);
  const [fiscalModal, setFiscalModal] = useState(false);
  const [fiscalClient, setFiscalClient] = useState<Client | null>(null);
  const [fiscalProfiles, setFiscalProfiles] = useState<any[]>([]);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [fiscalAdding, setFiscalAdding] = useState(false);
  const [fiscalSaving, setFiscalSaving] = useState(false);
  const [fiscalForm, setFiscalForm] = useState(EMPTY_FISCAL);

  // ─── CSF (Constancia de Situación Fiscal) — gestión por asesor ───
  type CsfStatus = {
    exists: boolean;
    file_url?: string;
    issued_at?: string | null;
    valid_until?: string | null;
    is_valid?: boolean;
    days_to_expire?: number | null;
  };
  const [csfModal, setCsfModal] = useState(false);
  const [csfClient, setCsfClient] = useState<Client | null>(null);
  const [csfStatus, setCsfStatus] = useState<CsfStatus | null>(null);
  const [csfLoading, setCsfLoading] = useState(false);
  const [csfFile, setCsfFile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  const [csfManualDate, setCsfManualDate] = useState<string>('');
  const [csfNeedsManualDate, setCsfNeedsManualDate] = useState(false);
  const [csfUploading, setCsfUploading] = useState(false);
  const [csfError, setCsfError] = useState<string | null>(null);

  const loadCsf = async (clientId: number) => {
    setCsfLoading(true);
    setCsfError(null);
    try {
      const res = await fetch(`${API_URL}/api/advisor/clients/${clientId}/constancia`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCsfStatus(res.ok ? data : { exists: false });
    } catch {
      setCsfStatus({ exists: false });
    } finally {
      setCsfLoading(false);
    }
  };

  const openCsfModal = (client: Client) => {
    setCsfClient(client);
    setCsfFile(null);
    setCsfManualDate('');
    setCsfNeedsManualDate(false);
    setCsfError(null);
    setCsfStatus(null);
    setCsfModal(true);
    loadCsf(client.id);
  };

  const pickCsfFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const a = res.assets[0];
      setCsfFile({ uri: a.uri, name: a.name || 'constancia.pdf', mimeType: a.mimeType });
      setCsfError(null);
      setCsfNeedsManualDate(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo seleccionar el archivo');
    }
  };

  const submitCsf = async () => {
    if (!csfClient || !csfFile) {
      setCsfError('Selecciona el archivo de la constancia.');
      return;
    }
    setCsfUploading(true);
    setCsfError(null);
    try {
      const fd = new FormData();
      // @ts-ignore — formato requerido por React Native
      fd.append('constancia', {
        uri: csfFile.uri,
        name: csfFile.name,
        type: csfFile.mimeType || 'application/pdf',
      });
      if (csfManualDate && /^\d{4}-\d{2}-\d{2}$/.test(csfManualDate)) {
        fd.append('issued_at', csfManualDate);
      }
      const res = await fetch(`${API_URL}/api/advisor/clients/${csfClient.id}/constancia`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setCsfFile(null);
        setCsfManualDate('');
        setCsfNeedsManualDate(false);
        await loadCsf(csfClient.id);
        Alert.alert('Listo', 'Constancia subida y validada.');
      } else if (res.status === 422 && data?.needs_manual_date) {
        setCsfNeedsManualDate(true);
        setCsfError('No pudimos leer la fecha del PDF. Indícala manualmente.');
      } else if (data?.error === 'expired') {
        setCsfError(data?.message || 'La constancia tiene más de 3 meses. Descarga una más reciente del SAT.');
      } else if (data?.error === 'future_date') {
        setCsfError(data?.message || 'La fecha de emisión no puede ser futura.');
      } else {
        setCsfError(data?.message || data?.error || 'Error al subir la constancia');
      }
    } catch (e: any) {
      setCsfError(e?.message || 'Error de red al subir la constancia');
    } finally {
      setCsfUploading(false);
    }
  };

  const loadFiscalProfiles = async (clientId: number) => {
    setFiscalLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/clients/${clientId}/fiscal-profiles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
      setFiscalProfiles(profiles);
      setFiscalAdding(profiles.length === 0);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los datos fiscales');
    } finally {
      setFiscalLoading(false);
    }
  };

  const openFiscalModal = (client: Client) => {
    setFiscalClient(client);
    setFiscalProfiles([]);
    setFiscalAdding(false);
    setFiscalForm(EMPTY_FISCAL);
    setFiscalModal(true);
    loadFiscalProfiles(client.id);
  };

  const saveFiscalProfile = async () => {
    if (!fiscalClient) return;
    setFiscalSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/clients/${fiscalClient.id}/fiscal-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(fiscalForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error');
      setFiscalForm(EMPTY_FISCAL);
      setFiscalAdding(false);
      await loadFiscalProfiles(fiscalClient.id);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudieron guardar los datos fiscales');
    } finally {
      setFiscalSaving(false);
    }
  };

  const deleteFiscalProfile = async (profileId: number) => {
    if (!fiscalClient) return;
    try {
      await fetch(`${API_URL}/api/advisor/clients/${fiscalClient.id}/fiscal-profiles/${profileId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      await loadFiscalProfiles(fiscalClient.id);
    } catch {
      Alert.alert('Error', 'No se pudo eliminar');
    }
  };

  // Shipping instructions modal
  const [shipInstrModal, setShipInstrModal] = useState(false);
  const [shipInstrClient, setShipInstrClient] = useState<Client | null>(null);
  const [shipInstrServiceType, setShipInstrServiceType] = useState('china_air');
  const [shipInstrAddresses, setShipInstrAddresses] = useState<Record<string, any>>({});
  const [shipInstrLoading, setShipInstrLoading] = useState(false);

  const SHIP_INSTR_SERVICES = [
    { type: 'china_air', label: '✈️ Aéreo China' },
    { type: 'china_sea', label: '🚢 Marítimo' },
    { type: 'usa_pobox', label: '📦 PO Box USA' },
    { type: 'mx_cedis',  label: '📍 DHL MTY' },
  ];

  const openShipInstr = async (client: Client) => {
    setShipInstrClient(client);
    setShipInstrServiceType('china_air');
    setShipInstrModal(true);
    if (Object.keys(shipInstrAddresses).length === 0) {
      setShipInstrLoading(true);
      try {
        const results: Record<string, any> = {};
        await Promise.all(SHIP_INSTR_SERVICES.map(async (s) => {
          try {
            const res = await fetch(`${API_URL}/api/services/${s.type}/info`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (data?.addresses?.length > 0) results[s.type] = data.addresses[0];
          } catch { /* ignore */ }
        }));
        setShipInstrAddresses(results);
      } finally {
        setShipInstrLoading(false);
      }
    }
  };

  const formatShipInstrText = (serviceType: string, address: any, client: Client): string => {
    const suite = client.box_id || 'S-XXX';
    const name = client.full_name.toUpperCase();
    if (!address) return '';
    if (serviceType === 'usa_pobox') {
      const line = (address.address_line1 || '').replace(/\(S-Numero de Cliente\)/gi, suite);
      return `${name}\n${line}\n${address.city || ''}, ${address.state || ''} ${address.zip_code || ''}\nUSA`;
    } else if (serviceType === 'china_air' || serviceType === 'china_sea') {
      return `${address.address_line1 || ''}\n${address.address_line2 || ''}\nShipping Mark: ${suite}\n${address.contact_name || ''}\n${address.contact_phone || ''}`;
    } else {
      return `${address.address_line1 || ''}\n${address.city || ''}, ${address.state || ''} ${address.zip_code || ''}\nMéxico\nA nombre de: ${name} (${suite})`;
    }
  };

  // New address form
  const [showNewAddrForm, setShowNewAddrForm] = useState(false);
  const emptyNewAddr = { alias: '', recipientName: '', countryCode: '+52', phone: '', zipCode: '', neighborhood: '', city: '', state: '', street: '', exteriorNumber: '', interiorNumber: '', receptionHours: '', notes: '', isDefault: false };
  const [newAddr, setNewAddr] = useState(emptyNewAddr);
  const [newAddrSaving, setNewAddrSaving] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [colonyOptions, setColonyOptions] = useState<string[]>([]);
  const [showColonyPicker, setShowColonyPicker] = useState(false);
  const [showLadaPicker, setShowLadaPicker] = useState(false);
  const LADAS = [
    { code: '+52', flag: '🇲🇽', label: '+52 México' },
    { code: '+1',  flag: '🇺🇸', label: '+1 EE.UU.' },
    { code: '+86', flag: '🇨🇳', label: '+86 China' },
    { code: '+57', flag: '🇨🇴', label: '+57 Colombia' },
    { code: '+34', flag: '🇪🇸', label: '+34 España' },
    { code: '+44', flag: '🇬🇧', label: '+44 Reino Unido' },
    { code: '+49', flag: '🇩🇪', label: '+49 Alemania' },
    { code: '+33', flag: '🇫🇷', label: '+33 Francia' },
  ];

  const fetchZipData = async (cp: string) => {
    if (cp.length !== 5) return;
    setZipLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/zipcode/${cp}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      // El backend devuelve `colonies` (principal) y `neighborhoods` (alias).
      const colonies: string[] = data?.colonies || data?.neighborhoods || [];
      // Heurística: cuando Zippopotam es la fuente, lo que viene en `city`
      // suele ser la COLONIA (no la ciudad/municipio). Lo detectamos cuando
      // ese valor también aparece en la lista de colonias. En ese caso
      // dejamos que el asesor escriba el municipio a mano.
      const cityIsActuallyColony = !!data?.city && colonies.includes(data.city);
      if (data?.city || data?.state || colonies.length > 0) {
        setNewAddr(prev => ({
          ...prev,
          city: cityIsActuallyColony ? prev.city : (data.city || prev.city),
          state: data.state || prev.state,
          neighborhood: prev.neighborhood || colonies[0] || '',
        }));
        setColonyOptions(colonies);
      }
    } catch { /* silent */ } finally {
      setZipLoading(false);
    }
  };

  const saveNewAddress = async () => {
    if (!addrClient) return;
    if (!newAddr.street || !newAddr.city || !newAddr.state || !newAddr.zipCode || !newAddr.neighborhood) {
      Alert.alert('Campos requeridos', 'Completa: calle, colonia, ciudad, estado y código postal');
      return;
    }
    setNewAddrSaving(true);
    try {
      const phone = newAddr.phone ? `${newAddr.countryCode}${newAddr.phone.replace(/\D/g, '')}` : '';
      const res = await fetch(`${API_URL}/api/advisor/clients/${addrClient.id}/addresses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: newAddr.alias || 'Dirección',
          recipientName: newAddr.recipientName,
          street: newAddr.street,
          exteriorNumber: newAddr.exteriorNumber,
          interiorNumber: newAddr.interiorNumber,
          neighborhood: newAddr.neighborhood,
          city: newAddr.city,
          state: newAddr.state,
          zipCode: newAddr.zipCode,
          phone,
          receptionHours: newAddr.receptionHours,
          notes: newAddr.notes,
          isDefault: newAddr.isDefault,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Error'); }
      const r2 = await fetch(`${API_URL}/api/advisor/clients/${addrClient.id}/addresses`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r2.json();
      setAddrList(Array.isArray(data) ? data : []);
      setShowNewAddrForm(false);
      setNewAddr(emptyNewAddr);
      setColonyOptions([]);
      Alert.alert('Dirección guardada', 'La dirección fue agregada correctamente');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo guardar la dirección');
    } finally {
      setNewAddrSaving(false);
    }
  };

  const loadClients = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      let url = `${API_URL}/api/advisor/clients?page=${currentPage}&limit=20`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (filter !== 'all') url += `&status=${filter}`;
      if (subAdvisorId) url += `&subAdvisorId=${subAdvisorId}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const normalize = (c: any): Client => ({
        id: c.id,
        full_name: c.full_name ?? c.fullName ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        box_id: c.box_id ?? c.boxId ?? '',
        is_verified: c.is_verified ?? c.identityVerified ?? false,
        verification_status: c.verification_status ?? c.verificationStatus ?? '',
        created_at: c.created_at ?? c.createdAt ?? '',
        last_shipment_at: c.last_shipment_at ?? c.lastShipmentAt ?? null,
        total_packages: c.total_packages ?? c.totalPackages ?? 0,
        in_transit_count: c.in_transit_count ?? c.inTransitCount ?? 0,
        pending_payment_count: c.pending_payment_count ?? c.pendingPaymentCount ?? 0,
        total_pending: c.total_pending ?? c.pendingPaymentTotal ?? 0,
      });
      const list: Client[] = (data.clients || []).map(normalize);
      if (reset) setClients(list); else setClients(prev => [...prev, ...list]);
      setHasMore((data.clients || []).length === 20);
      if (reset) setPage(1);
    } catch (err) {
      console.error('Error loading clients:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, search, filter, page]);

  useEffect(() => { setLoading(true); loadClients(true); }, [search, filter]);

  useEffect(() => {
    fetch(`${API_URL}/api/system/payment-status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(r => r.json())
      .then(d => setInstrEnabled(d.advisor_instructions_enabled !== false))
      .catch(() => {});
  }, [token]);

  const onRefresh = () => { setRefreshing(true); setPage(1); loadClients(true); };
  const loadMore = () => { if (!loading && hasMore) { setPage(prev => prev + 1); loadClients(); } };

  // ─── Address Management ───
  const openAddressModal = async (client: Client) => {
    setAddrClient(client);
    setAddrModal(true);
    setEditingAddrId(null);
    setAddrLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/clients/${client.id}/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAddrList(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las direcciones');
    } finally {
      setAddrLoading(false);
    }
  };

  const fetchCarriers = async (serviceType: string): Promise<CarrierOption[]> => {
    if (carriersCache[serviceType]) return carriersCache[serviceType];
    try {
      const res = await fetch(`${API_URL}/api/carrier-options/by-service/${serviceType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const carriers: CarrierOption[] = data?.data || [];
      setCarriersCache(prev => ({ ...prev, [serviceType]: carriers }));
      return carriers;
    } catch {
      return [];
    }
  };

  const startEditAddress = (addr: ClientAddress) => {
    setEditingAddrId(addr.id);
    const services = addr.default_for_service
      ? addr.default_for_service.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    setEditingServices(services);
    setEditingCarrierConfig(addr.carrier_config || {});
    // Precargar paqueterías disponibles por servicio para el selector.
    SERVICE_LIST.forEach(svc => { fetchCarriers(svc.serviceType); });
  };

  const handleDeleteAddress = async (addrId: number) => {
    if (!addrClient) return;
    try {
      const res = await fetch(`${API_URL}/api/advisor/clients/${addrClient.id}/addresses/${addrId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Error', data.error || 'No se pudo eliminar'); return; }
      setAddrList(prev => prev.filter(a => a.id !== addrId));
      setDeleteAddrConfirm(null);
    } catch {
      Alert.alert('Error', 'No se pudo eliminar la dirección');
    }
  };

  const toggleService = (value: string) => {
    setEditingServices(prev => {
      const has = prev.includes(value);
      if (has) {
        // Al desmarcar el servicio, limpiar su paquetería asignada.
        setEditingCarrierConfig(cc => { const next = { ...cc }; delete next[value]; return next; });
        return prev.filter(s => s !== value);
      }
      return [...prev, value];
    });
  };

  const setServiceCarrier = (serviceValue: string, carrierKey: string) => {
    setEditingCarrierConfig(prev => {
      const next = { ...prev };
      if (!carrierKey) delete next[serviceValue];
      else next[serviceValue] = carrierKey;
      return next;
    });
  };

  const saveAddressServices = async () => {
    if (!addrClient || editingAddrId === null) return;
    setAddrSaving(true);
    try {
      const res = await fetch(
        `${API_URL}/api/advisor/clients/${addrClient.id}/addresses/${editingAddrId}/default-for-service`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ services: editingServices, carrier_config: editingCarrierConfig }),
        }
      );
      if (!res.ok) throw new Error();
      // Refresh addresses
      const r2 = await fetch(`${API_URL}/api/advisor/clients/${addrClient.id}/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r2.json();
      setAddrList(Array.isArray(data) ? data : []);
      setEditingAddrId(null);
      Alert.alert('Listo', 'Preferencias actualizadas');
    } catch {
      Alert.alert('Error', 'No se pudo guardar');
    } finally {
      setAddrSaving(false);
    }
  };

  const renderClient = ({ item }: { item: Client }) => {
    const daysAgo = item.last_shipment_at
      ? Math.floor((Date.now() - new Date(item.last_shipment_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return (
      <View style={styles.clientCard}>
        <View style={styles.clientHeader}>
          <Avatar.Text
            size={44}
            label={(item.full_name || 'NN').substring(0, 2).toUpperCase()}
            style={{ backgroundColor: item.is_verified ? ORANGE : '#9E9E9E' }}
          />
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.full_name || 'Sin nombre'}</Text>
            <Text style={styles.clientBox}>{item.box_id || 'Sin casillero'}</Text>
          </View>
          {item.is_verified
            ? <Chip icon="check-circle" mode="flat" compact textStyle={{ fontSize: 10, color: '#4CAF50', marginVertical: 0, marginHorizontal: 2 }} style={{ backgroundColor: '#E8F5E9', alignSelf: 'flex-start' }}>Verificado</Chip>
            : <Chip icon="clock" mode="flat" compact textStyle={{ fontSize: 10, color: '#FF9800', marginVertical: 0, marginHorizontal: 2 }} style={{ backgroundColor: '#FFF3E0', alignSelf: 'flex-start' }}>Pendiente</Chip>
          }
        </View>

        <View style={styles.clientStats}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{item.total_packages}</Text>
            <Text style={styles.statLabel}>Envíos</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: '#2196F3' }]}>{item.in_transit_count}</Text>
            <Text style={styles.statLabel}>En Tránsito</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: item.pending_payment_count > 0 ? '#FF9800' : '#4CAF50' }]}>
              {item.pending_payment_count}
            </Text>
            <Text style={styles.statLabel}>Por Pagar</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>
              {daysAgo !== null ? (daysAgo === 0 ? 'Hoy' : `Hace ${daysAgo}d`) : 'Sin envíos'}
            </Text>
            <Text style={[styles.statLabel, { fontSize: 10 }]}>Último envío</Text>
          </View>
        </View>

        <View style={styles.clientActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => item.phone && Linking.openURL(`tel:${item.phone}`)}>
            <Ionicons name="call-outline" size={20} color={ORANGE} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => {
            const clean = item.phone?.replace(/\D/g, '');
            const msg = encodeURIComponent(`Hola ${item.full_name.split(' ')[0]}, soy tu asesor de EntregaX. ¿En qué puedo ayudarte?`);
            if (clean) Linking.openURL(`https://wa.me/${clean}?text=${msg}`);
          }}>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#e3f2fd' }]} onPress={() => openShipInstr(item)}>
            <Ionicons name="send-outline" size={20} color="#1976d2" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#f3e5f5' }]} onPress={() => openAddressModal(item)}>
            <Ionicons name="location-outline" size={20} color={PURPLE} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#f3e5f5' }]} onPress={() => openFiscalModal(item)}>
            <Ionicons name="receipt-outline" size={20} color="#7B1FA2" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#e8f5e9' }]} onPress={() => openCsfModal(item)}>
            <Ionicons name="document-text-outline" size={20} color="#2e7d32" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'verified', label: 'Verificados' },
    { key: 'pending', label: 'Pendientes' },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{subAdvisorName ? `Clientes de ${subAdvisorName.split(' ')[0]}` : 'Mis Clientes'}</Text>
        <Text style={styles.clientCount}>{clients.length} clientes</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre, email o casillero..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#999"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filtersContainer}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && clients.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : (
        <FlatList
          data={clients}
          renderItem={renderClient}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No tienes clientes aún</Text>
              <Text style={styles.emptySubtext}>Comparte tu código de referido para ganar comisiones</Text>
            </View>
          }
        />
      )}

      {/* ─── Modal: CSF (Constancia de Situación Fiscal) ─── */}
      <Modal visible={csfModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCsfModal(false)}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { backgroundColor: '#2e7d32' }]}>
            <Text style={styles.modalTitle}>📄 Constancia Fiscal</Text>
            <TouchableOpacity onPress={() => setCsfModal(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            <Text style={{ fontWeight: '700', marginBottom: 4 }}>{csfClient?.full_name || ''}</Text>
            <Text style={{ color: '#666', marginBottom: 12, fontSize: 12 }}>
              Vigencia: 3 meses desde su emisión. Necesaria para facturar.
            </Text>

            {csfLoading ? (
              <ActivityIndicator color="#2e7d32" style={{ marginVertical: 20 }} />
            ) : (
              <View
                style={{
                  padding: 12,
                  borderRadius: 10,
                  borderWidth: 2,
                  marginBottom: 16,
                  borderColor: csfStatus?.is_valid ? '#2e7d32' : csfStatus?.exists ? '#ed6c02' : '#bdbdbd',
                  backgroundColor: csfStatus?.is_valid ? '#e8f5e9' : csfStatus?.exists ? '#fff3e0' : '#fafafa',
                }}
              >
                {csfStatus?.exists && csfStatus.is_valid ? (
                  <>
                    <Text style={{ color: '#2e7d32', fontWeight: '700' }}>
                      Vigente · hasta {new Date(csfStatus.valid_until + 'T00:00:00').toLocaleDateString('es-MX')}
                    </Text>
                    {csfStatus.days_to_expire != null && csfStatus.days_to_expire <= 14 && (
                      <Text style={{ color: '#ed6c02', marginTop: 4, fontSize: 12 }}>
                        Vence en {csfStatus.days_to_expire} día{csfStatus.days_to_expire === 1 ? '' : 's'}.
                      </Text>
                    )}
                    {csfStatus.file_url ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(csfStatus.file_url!)}
                        style={{ marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center' }}
                      >
                        <Ionicons name="cloud-download-outline" size={16} color="#2e7d32" />
                        <Text style={{ color: '#2e7d32', marginLeft: 4, fontWeight: '600' }}>Ver constancia</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                ) : csfStatus?.exists ? (
                  <Text style={{ color: '#ed6c02', fontWeight: '700' }}>
                    Expirada · venció el {new Date(csfStatus.valid_until + 'T00:00:00').toLocaleDateString('es-MX')}
                  </Text>
                ) : (
                  <Text style={{ color: '#666' }}>El cliente aún no tiene constancia subida.</Text>
                )}
              </View>
            )}

            <Text style={{ fontWeight: '700', marginBottom: 8 }}>
              {csfStatus?.exists ? 'Actualizar / Reemplazar constancia' : 'Subir constancia'}
            </Text>

            <TouchableOpacity
              onPress={pickCsfFile}
              disabled={csfUploading}
              style={{
                borderWidth: 2,
                borderColor: '#2e7d32',
                borderStyle: 'dashed',
                borderRadius: 10,
                padding: 16,
                alignItems: 'center',
                backgroundColor: 'rgba(46,125,50,0.04)',
                opacity: csfUploading ? 0.6 : 1,
              }}
            >
              <Ionicons name="document-attach-outline" size={32} color="#2e7d32" />
              <Text style={{ marginTop: 6, fontWeight: '700', color: '#1b5e20' }}>
                {csfFile ? csfFile.name : 'Toca para elegir PDF / imagen'}
              </Text>
              <Text style={{ color: '#666', marginTop: 4, fontSize: 11 }}>Máximo 15 MB</Text>
            </TouchableOpacity>

            {csfNeedsManualDate && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12, color: '#444', marginBottom: 4 }}>
                  Fecha de emisión (YYYY-MM-DD)
                </Text>
                <TextInput
                  value={csfManualDate}
                  onChangeText={setCsfManualDate}
                  placeholder="2026-06-24"
                  placeholderTextColor="#999"
                  style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 14 }}
                />
              </View>
            )}

            {csfError && (
              <View style={{ marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: csfNeedsManualDate ? '#fff8e1' : '#ffebee' }}>
                <Text style={{ color: csfNeedsManualDate ? '#b26a00' : '#c62828' }}>{csfError}</Text>
              </View>
            )}

            <TouchableOpacity
              disabled={!csfFile || csfUploading || (csfNeedsManualDate && !csfManualDate)}
              onPress={submitCsf}
              style={{
                marginTop: 16,
                backgroundColor: '#2e7d32',
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: 'center',
                opacity: (!csfFile || csfUploading || (csfNeedsManualDate && !csfManualDate)) ? 0.5 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {csfUploading ? 'Subiendo y validando…' : 'Subir y validar'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Modal: Instrucciones de Envío ─── */}
      <Modal visible={shipInstrModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShipInstrModal(false)}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { backgroundColor: '#1976d2' }]}>
            <Text style={styles.modalTitle}>📬 Instrucciones de Envío</Text>
            <TouchableOpacity onPress={() => setShipInstrModal(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {shipInstrClient && (
              <Text style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                Cliente: <Text style={{ fontWeight: '700', color: '#333' }}>{shipInstrClient.full_name}</Text>  ·  Casillero: <Text style={{ fontWeight: '700', color: '#1976d2' }}>{shipInstrClient.box_id}</Text>
              </Text>
            )}

            {/* Selector de servicio */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Tipo de servicio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {SHIP_INSTR_SERVICES.map((s) => (
                  <TouchableOpacity
                    key={s.type}
                    onPress={() => setShipInstrServiceType(s.type)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: shipInstrServiceType === s.type ? '#1976d2' : '#f0f0f0',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: shipInstrServiceType === s.type ? '#fff' : '#555' }}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {shipInstrLoading ? (
              <ActivityIndicator color="#1976d2" style={{ marginTop: 20 }} />
            ) : shipInstrClient && (() => {
              const address = shipInstrAddresses[shipInstrServiceType];
              const suite = shipInstrClient.box_id || 'S-XXX';
              const name = shipInstrClient.full_name.toUpperCase();

              const renderAddressText = () => {
                if (!address) return <Text style={{ color: '#999', fontSize: 13 }}>No hay dirección configurada para este servicio.</Text>;
                if (shipInstrServiceType === 'usa_pobox') {
                  const line = (address.address_line1 || '').replace(/\(S-Numero de Cliente\)/gi, suite);
                  return (
                    <Text style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 22, color: '#222' }}>
                      <Text style={{ fontWeight: '700' }}>{name}{'\n'}</Text>
                      {line}{'\n'}
                      {address.city}, {address.state} {address.zip_code}{'\n'}
                      <Text style={{ color: '#1976d2', fontWeight: '700' }}>USA</Text>
                    </Text>
                  );
                } else if (shipInstrServiceType === 'china_air' || shipInstrServiceType === 'china_sea') {
                  return (
                    <Text style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 22, color: '#222' }}>
                      {address.address_line1}{'\n'}
                      {address.address_line2 ? address.address_line2 + '\n' : ''}
                      <Text style={{ fontWeight: '700', color: ORANGE }}>📦 Shipping Mark: {suite}{'\n'}</Text>
                      👤 {address.contact_name || ''}{'\n'}
                      📞 {address.contact_phone || ''}
                    </Text>
                  );
                } else {
                  return (
                    <Text style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 22, color: '#222' }}>
                      {address.address_line1}{'\n'}
                      {address.city}, {address.state} {address.zip_code}{'\n'}
                      México{'\n'}
                      <Text style={{ fontWeight: '700', color: ORANGE }}>📦 A nombre de: {name} ({suite})</Text>
                    </Text>
                  );
                }
              };

              const instrMap: Record<string, string> = {
                china_air: `Incluye siempre el Shipping Mark: ${suite} en cada caja. Tamaño máx: 1.2 m unilateral. Peso máx: 60 kg por caja.\n\nTiempo estimado: 10-15 días hábiles.`,
                china_sea: `Incluye siempre el Shipping Mark: ${suite} en cada caja. Tamaño máx: 1.2 m unilateral. Peso máx: 60 kg por caja.\n\nTiempo estimado: 30-45 días.`,
                usa_pobox: `Usa esta dirección como destino en tus compras en línea. Incluye siempre tu casillero ${suite} en el campo Suite/Apt.\n\nTiempo estimado: 5-7 días hábiles.`,
                mx_cedis: `Envía directamente al CEDIS MTY. Incluye en el destinatario: ${name} (${suite}).\n\nTiempo estimado: 2-3 días hábiles.`,
              };

              return (
                <>
                  {/* Dirección */}
                  <View style={{ backgroundColor: '#e3f2fd', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#90caf9' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#1976d2', textTransform: 'uppercase', marginBottom: 8 }}>Dirección de envío</Text>
                    {renderAddressText()}
                  </View>

                  {/* Instrucciones */}
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginBottom: 6 }}>Instrucciones</Text>
                  <Text style={{ fontSize: 13, color: '#444', lineHeight: 20, marginBottom: 20 }}>{instrMap[shipInstrServiceType]}</Text>
                </>
              );
            })()}
          </ScrollView>

          {/* Actions */}
          <View style={{ padding: 16, paddingBottom: 24 + insets.bottom, gap: 10, borderTopWidth: 1, borderColor: '#eee' }}>
            {shipInstrClient && shipInstrAddresses[shipInstrServiceType] && (
              <TouchableOpacity
                style={{ backgroundColor: '#1976d2', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onPress={() => {
                  const addr = shipInstrAddresses[shipInstrServiceType];
                  const text = shipInstrClient ? formatShipInstrText(shipInstrServiceType, addr, shipInstrClient) : '';
                  Clipboard.setString(text);
                  Alert.alert('Copiado', 'Dirección copiada al portapapeles');
                }}
              >
                <Ionicons name="copy-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Copiar dirección</Text>
              </TouchableOpacity>
            )}
            {shipInstrClient && (
              <TouchableOpacity
                style={{ backgroundColor: '#25D366', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onPress={() => {
                  if (!shipInstrClient) return;
                  const addr = shipInstrAddresses[shipInstrServiceType];
                  const svcLabel = SHIP_INSTR_SERVICES.find(s => s.type === shipInstrServiceType)?.label || '';
                  const addrText = addr ? formatShipInstrText(shipInstrServiceType, addr, shipInstrClient) : '(dirección no disponible)';
                  const msg = encodeURIComponent(`Hola ${shipInstrClient.full_name.split(' ')[0]}, aquí están tus instrucciones de envío para *${svcLabel}*:\n\n📍 *Dirección:*\n${addrText}\n\nRecuerda incluir siempre tu casillero *${shipInstrClient.box_id}* en cada paquete.`);
                  const clean = shipInstrClient.phone?.replace(/\D/g, '');
                  if (clean) Linking.openURL(`https://wa.me/${clean}?text=${msg}`);
                  else Linking.openURL(`https://wa.me/?text=${msg}`);
                }}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Enviar por WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Modal: Gestión de Direcciones ─── */}
      <Modal visible={addrModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (showNewAddrForm) { setShowNewAddrForm(false); } else { setAddrModal(false); } }}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, showNewAddrForm ? { backgroundColor: PURPLE } : {}]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {showNewAddrForm && (
                <TouchableOpacity onPress={() => setShowNewAddrForm(false)} style={{ padding: 4, marginRight: 4 }}>
                  <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
              )}
              <View>
                <Text style={styles.modalTitle}>{showNewAddrForm ? '📍 Nueva dirección' : '📍 Direcciones'}</Text>
                <Text style={styles.modalSubtitle}>{addrClient?.full_name}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!showNewAddrForm && (
                <TouchableOpacity
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  onPress={() => { setShowNewAddrForm(true); setNewAddr(emptyNewAddr); setColonyOptions([]); }}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Agregar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { setShowNewAddrForm(false); setAddrModal(false); setDeleteAddrConfirm(null); }} style={styles.modalClose}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {addrLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={PURPLE} />
            </View>
          ) : addrList.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="location-outline" size={48} color="#ccc" />
              <Text style={{ color: '#666', marginTop: 12, textAlign: 'center', paddingHorizontal: 32 }}>
                Este cliente no tiene direcciones guardadas
              </Text>
              <TouchableOpacity
                style={{ marginTop: 20, backgroundColor: PURPLE, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                onPress={() => { setShowNewAddrForm(true); setNewAddr(emptyNewAddr); setColonyOptions([]); }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Agregar primera dirección</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {addrList.map(addr => {
                const isEditing = editingAddrId === addr.id;
                const services = addr.default_for_service
                  ? addr.default_for_service.split(',').map(s => s.trim()).filter(Boolean)
                  : [];
                return (
                  <View key={addr.id} style={styles.addrCard}>
                    <View style={styles.addrCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.addrAlias}>{addr.alias || addr.recipient_name || 'Dirección'}</Text>
                          {addr.is_default && (
                            <View style={styles.defaultBadge}>
                              <Text style={styles.defaultBadgeText}>Principal</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.addrText}>
                          {addr.street} {addr.exterior_number}{addr.interior_number ? ` Int. ${addr.interior_number}` : ''}
                          {addr.colony ? `, ${addr.colony}` : ''}, {addr.city}, {addr.state} {addr.zip_code}
                        </Text>
                        {services.length > 0 && !isEditing && (
                          <View style={styles.serviceChips}>
                            {services.map(svc => {
                              const found = SERVICE_LIST.find(s => s.value === svc);
                              return (
                                <View key={svc} style={[styles.svcChip, { backgroundColor: (found?.color || '#666') + '22' }]}>
                                  <Text style={[styles.svcChipText, { color: found?.color || '#666' }]}>
                                    {found?.label || svc}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {instrEnabled && (
                          <TouchableOpacity
                            style={[styles.editBtn, isEditing && { backgroundColor: '#7B1FA2' }]}
                            onPress={() => isEditing ? setEditingAddrId(null) : startEditAddress(addr)}
                          >
                            <Ionicons name={isEditing ? 'close' : 'pencil'} size={16} color={isEditing ? '#fff' : PURPLE} />
                          </TouchableOpacity>
                        )}
                        {(addr.created_by_advisor_id == null || Number(addr.created_by_advisor_id) === Number(user.id)) && (
                          deleteAddrConfirm === addr.id ? (
                            <View style={{ flexDirection: 'row', gap: 4 }}>
                              <TouchableOpacity
                                style={{ backgroundColor: '#D32F2F', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}
                                onPress={() => handleDeleteAddress(addr.id)}
                              >
                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Sí, borrar</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{ backgroundColor: '#eee', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}
                                onPress={() => setDeleteAddrConfirm(null)}
                              >
                                <Text style={{ color: '#333', fontSize: 11 }}>No</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={[styles.editBtn, { borderColor: '#D32F2F' }]}
                              onPress={() => setDeleteAddrConfirm(addr.id)}
                            >
                              <Ionicons name="trash-outline" size={16} color="#D32F2F" />
                            </TouchableOpacity>
                          )
                        )}
                      </View>
                    </View>

                    {isEditing && (
                      <View style={styles.editPanel}>
                        <Text style={styles.editPanelTitle}>Servicios predeterminados:</Text>
                        {SERVICE_LIST.map(svc => {
                          const checked = editingServices.includes(svc.value);
                          const carriers = carriersCache[svc.serviceType] || [];
                          const selectedKey = editingCarrierConfig[svc.value] || '';
                          return (
                            <View key={svc.value}>
                              <TouchableOpacity
                                style={[styles.svcRow, checked && { backgroundColor: svc.color + '15' }]}
                                onPress={() => toggleService(svc.value)}
                              >
                                <View style={[styles.checkbox, checked && { backgroundColor: svc.color, borderColor: svc.color }]}>
                                  {checked && <Ionicons name="checkmark" size={12} color="#fff" />}
                                </View>
                                <Text style={[styles.svcRowText, checked && { color: svc.color, fontWeight: '600' }]}>
                                  {svc.label}
                                </Text>
                              </TouchableOpacity>
                              {checked && carriers.length > 0 && (
                                <View style={styles.carrierPickerWrap}>
                                  <Text style={styles.carrierPickerLabel}>Paquetería:</Text>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
                                    <TouchableOpacity
                                      style={[styles.carrierChip, !selectedKey && { backgroundColor: svc.color, borderColor: svc.color }]}
                                      onPress={() => setServiceCarrier(svc.value, '')}
                                    >
                                      <Text style={[styles.carrierChipText, !selectedKey && { color: '#fff' }]}>Sin default</Text>
                                    </TouchableOpacity>
                                    {carriers.map(c => {
                                      const key = c.carrier_key || String(c.id);
                                      const isSel = selectedKey === key;
                                      const isUrl = !!c.icon && (c.icon.startsWith('/') || c.icon.startsWith('http'));
                                      return (
                                        <TouchableOpacity
                                          key={key}
                                          style={[styles.carrierChip, isSel && { backgroundColor: svc.color, borderColor: svc.color }]}
                                          onPress={() => setServiceCarrier(svc.value, key)}
                                        >
                                          {isUrl
                                            ? <Image source={{ uri: c.icon!.startsWith('http') ? c.icon! : `${API_URL}${c.icon}` }} style={styles.carrierChipIcon} />
                                            : <Text style={{ fontSize: 13 }}>{c.icon || '🚛'}</Text>}
                                          <Text style={[styles.carrierChipText, isSel && { color: '#fff' }]} numberOfLines={1}>{c.name}</Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </ScrollView>
                                </View>
                              )}
                            </View>
                          );
                        })}
                        <TouchableOpacity
                          style={[styles.saveBtn, addrSaving && { opacity: 0.6 }]}
                          onPress={saveAddressServices}
                          disabled={addrSaving}
                        >
                          {addrSaving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.saveBtnText}>Guardar preferencias</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
          {/* ─── Formulario Nueva Dirección (inline, mismo modal) ─── */}
          {showNewAddrForm && (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">

            {/* Alias */}
            <View style={nf.field}>
              <Text style={nf.label}>Alias</Text>
              <TextInput style={nf.input} placeholder="Ej: Casa, Oficina, Bodega..." value={newAddr.alias} onChangeText={v => setNewAddr(p => ({ ...p, alias: v }))} />
            </View>

            {/* Destinatario */}
            <View style={nf.field}>
              <Text style={nf.label}>Nombre del destinatario</Text>
              <TextInput style={nf.input} placeholder="Nombre completo" value={newAddr.recipientName} onChangeText={v => setNewAddr(p => ({ ...p, recipientName: v }))} />
            </View>

            {/* Teléfono con lada desplegable */}
            <View style={nf.field}>
              <Text style={nf.label}>Teléfono</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[nf.input, { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }]}
                  onPress={() => setShowLadaPicker(p => !p)}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>
                    {LADAS.find(l => l.code === newAddr.countryCode)?.flag ?? '🌎'} {newAddr.countryCode}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#666" />
                </TouchableOpacity>
                <TextInput style={[nf.input, { flex: 1 }]} placeholder="10 dígitos" keyboardType="numeric" maxLength={10} value={newAddr.phone} onChangeText={v => setNewAddr(p => ({ ...p, phone: v.replace(/\D/g, '') }))} />
              </View>
              {showLadaPicker && (
                <View style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginTop: 4, backgroundColor: '#fff', overflow: 'hidden' }}>
                  {LADAS.map(l => (
                    <TouchableOpacity
                      key={l.code}
                      style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: newAddr.countryCode === l.code ? PURPLE + '15' : '#fff' }}
                      onPress={() => { setNewAddr(p => ({ ...p, countryCode: l.code })); setShowLadaPicker(false); }}
                    >
                      <Text style={{ fontSize: 20 }}>{l.flag}</Text>
                      <Text style={{ fontSize: 14, color: newAddr.countryCode === l.code ? PURPLE : '#333', fontWeight: newAddr.countryCode === l.code ? '700' : '400' }}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={nf.divider}><Text style={nf.dividerText}>📍 Dirección</Text></View>

            {/* C.P. — auto-fill */}
            <View style={nf.field}>
              <Text style={nf.label}>Código Postal *</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[nf.input, { flex: 1 }]}
                  placeholder="5 dígitos"
                  keyboardType="numeric"
                  maxLength={5}
                  value={newAddr.zipCode}
                  onChangeText={v => {
                    const cp = v.replace(/\D/g, '');
                    setNewAddr(p => ({ ...p, zipCode: cp }));
                    if (cp.length === 5) fetchZipData(cp);
                  }}
                />
                {zipLoading && <ActivityIndicator size="small" color={PURPLE} />}
              </View>
            </View>

            {/* Colonia — picker si hay opciones */}
            <View style={nf.field}>
              <Text style={nf.label}>Colonia *</Text>
              {colonyOptions.length > 0 ? (
                <>
                  <TouchableOpacity style={[nf.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setShowColonyPicker(p => !p)}>
                    <Text style={{ color: newAddr.neighborhood ? '#111' : '#aaa', fontSize: 15 }}>{newAddr.neighborhood || 'Selecciona la colonia'}</Text>
                    <Ionicons name="chevron-down" size={16} color="#666" />
                  </TouchableOpacity>
                  {showColonyPicker && (
                    <View style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, maxHeight: 180, marginTop: 4 }}>
                      <ScrollView nestedScrollEnabled>
                        {colonyOptions.map(c => (
                          <TouchableOpacity key={c} style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
                            onPress={() => { setNewAddr(p => ({ ...p, neighborhood: c })); setShowColonyPicker(false); }}>
                            <Text style={{ fontSize: 14, color: '#333' }}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </>
              ) : (
                <TextInput style={nf.input} placeholder="Ingresa el C.P. para ver colonias" value={newAddr.neighborhood} onChangeText={v => setNewAddr(p => ({ ...p, neighborhood: v }))} />
              )}
            </View>

            {/* Ciudad y Estado */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[nf.field, { flex: 1 }]}>
                <Text style={nf.label}>Ciudad *</Text>
                <TextInput style={nf.input} placeholder="Ciudad" value={newAddr.city} onChangeText={v => setNewAddr(p => ({ ...p, city: v }))} />
              </View>
              <View style={[nf.field, { flex: 1 }]}>
                <Text style={nf.label}>Estado *</Text>
                <TextInput style={[nf.input, colonyOptions.length > 0 && newAddr.state ? { backgroundColor: '#f5f5f5', color: '#666' } : {}]} placeholder="Estado" value={newAddr.state} onChangeText={v => setNewAddr(p => ({ ...p, state: v }))} editable={!(colonyOptions.length > 0 && !!newAddr.state)} />
              </View>
            </View>

            {/* Calle + Números */}
            <View style={nf.field}>
              <Text style={nf.label}>Calle *</Text>
              <TextInput style={nf.input} placeholder="Nombre de la calle" value={newAddr.street} onChangeText={v => setNewAddr(p => ({ ...p, street: v }))} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[nf.field, { flex: 1 }]}>
                <Text style={nf.label}>No. Exterior *</Text>
                <TextInput style={nf.input} placeholder="123" value={newAddr.exteriorNumber} onChangeText={v => setNewAddr(p => ({ ...p, exteriorNumber: v }))} />
              </View>
              <View style={[nf.field, { flex: 1 }]}>
                <Text style={nf.label}>No. Interior</Text>
                <TextInput style={nf.input} placeholder="Opcional" value={newAddr.interiorNumber} onChangeText={v => setNewAddr(p => ({ ...p, interiorNumber: v }))} />
              </View>
            </View>

            <View style={nf.divider}><Text style={nf.dividerText}>🕐 Entrega (opcional)</Text></View>

            {/* Horario de entrega */}
            <View style={nf.field}>
              <Text style={nf.label}>Horario de recepción</Text>
              <TextInput style={nf.input} placeholder="Ej: Lun-Vie 9:00-18:00, Sáb 10:00-14:00" value={newAddr.receptionHours} onChangeText={v => setNewAddr(p => ({ ...p, receptionHours: v }))} />
            </View>

            <View style={nf.divider}><Text style={nf.dividerText}>📝 Notas (opcional)</Text></View>

            {/* Notas */}
            <View style={nf.field}>
              <Text style={nf.label}>Notas / Referencia</Text>
              <TextInput style={[nf.input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]} placeholder="Indicaciones especiales, referencias, etc." multiline value={newAddr.notes} onChangeText={v => setNewAddr(p => ({ ...p, notes: v }))} />
            </View>

            {/* Dirección principal toggle */}
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: newAddr.isDefault ? PURPLE + '15' : '#f5f5f5', borderRadius: 10, marginBottom: 8 }}
              onPress={() => setNewAddr(p => ({ ...p, isDefault: !p.isDefault }))}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: PURPLE, backgroundColor: newAddr.isDefault ? PURPLE : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {newAddr.isDefault && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={{ fontSize: 14, color: '#333', fontWeight: '500' }}>Establecer como dirección principal</Text>
            </TouchableOpacity>

            {/* Botones */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 32 }}>
              <TouchableOpacity style={{ flex: 1, borderWidth: 1.5, borderColor: '#ccc', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }} onPress={() => setShowNewAddrForm(false)}>
                <Text style={{ color: '#666', fontWeight: '600', fontSize: 15 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[{ flex: 2, backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' }, newAddrSaving && { opacity: 0.6 }]} onPress={saveNewAddress} disabled={newAddrSaving}>
                {newAddrSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Guardar dirección</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
          )}
        </View>
      </Modal>

      {/* Datos fiscales del cliente */}
      <Modal visible={fiscalModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!fiscalSaving) setFiscalModal(false); }}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', flex: 1, paddingRight: 12 }} numberOfLines={1}>🧾 Datos fiscales — {fiscalClient?.full_name}</Text>
            <TouchableOpacity onPress={() => { if (!fiscalSaving) setFiscalModal(false); }} hitSlop={20}>
              <Ionicons name="close" size={28} color="#111" />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {fiscalLoading ? (
              <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
            ) : fiscalAdding ? (
              <>
                <Text style={{ fontWeight: '600', color: '#666', marginBottom: 8 }}>
                  {fiscalProfiles.length > 0 ? 'Nuevos datos fiscales' : 'Datos fiscales del cliente'}
                </Text>
                {[
                  { k: 'razon_social', label: 'Razón social' },
                  { k: 'rfc', label: 'RFC', upper: true },
                  { k: 'codigo_postal', label: 'Código postal' },
                ].map((fld) => (
                  <TextInput
                    key={fld.k}
                    placeholder={fld.label}
                    value={(fiscalForm as any)[fld.k]}
                    onChangeText={(tx) => setFiscalForm((p) => ({ ...p, [fld.k]: fld.upper ? tx.toUpperCase() : tx }))}
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 14 }}
                  />
                ))}
                <TouchableOpacity onPress={() => setFiscalPicker('regimen')} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: fiscalForm.regimen_fiscal ? '#111' : '#999', flex: 1 }} numberOfLines={1}>
                    {fiscalForm.regimen_fiscal ? `${fiscalForm.regimen_fiscal} — ${satRegimenes.find(r => r.clave === fiscalForm.regimen_fiscal)?.descripcion || ''}` : 'Régimen fiscal'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#888" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setFiscalPicker('uso')} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: '#111', flex: 1 }} numberOfLines={1}>
                    {`${fiscalForm.uso_cfdi} — ${satUsos.find(u => u.clave === fiscalForm.uso_cfdi)?.descripcion || 'Uso CFDI'}`}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#888" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveFiscalProfile}
                  disabled={fiscalSaving || !fiscalForm.razon_social || !fiscalForm.rfc || !fiscalForm.codigo_postal || !fiscalForm.regimen_fiscal}
                  style={{ backgroundColor: PURPLE, borderRadius: 8, paddingVertical: 14, alignItems: 'center', opacity: (fiscalSaving || !fiscalForm.razon_social || !fiscalForm.rfc || !fiscalForm.codigo_postal || !fiscalForm.regimen_fiscal) ? 0.5 : 1 }}>
                  {fiscalSaving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar datos fiscales</Text>}
                </TouchableOpacity>
                {fiscalProfiles.length > 0 && (
                  <TouchableOpacity onPress={() => setFiscalAdding(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#666' }}>Cancelar</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontWeight: '600', color: '#666' }}>Datos fiscales registrados</Text>
                  <TouchableOpacity onPress={() => { setFiscalForm(EMPTY_FISCAL); setFiscalAdding(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="add-circle-outline" size={20} color={PURPLE} />
                    <Text style={{ color: PURPLE, fontWeight: '600' }}>Agregar</Text>
                  </TouchableOpacity>
                </View>
                {fiscalProfiles.length === 0 ? (
                  <Text style={{ color: '#888', marginTop: 12 }}>Este cliente no tiene datos fiscales registrados.</Text>
                ) : fiscalProfiles.map((p) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E0E0E0' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700' }} numberOfLines={1}>{p.razon_social}</Text>
                      <Text style={{ color: '#666', fontSize: 12 }}>{p.rfc} · CP {p.codigo_postal} · Rég. {p.regimen_fiscal} · {p.uso_cfdi}</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteFiscalProfile(p.id)} hitSlop={12}>
                      <Ionicons name="trash-outline" size={18} color="#999" />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Picker régimen / uso CFDI */}
      <Modal visible={fiscalPicker !== null} transparent animationType="slide" onRequestClose={() => setFiscalPicker(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <Text style={{ fontSize: 16, fontWeight: '700' }}>{fiscalPicker === 'regimen' ? 'Régimen fiscal' : 'Uso CFDI'}</Text>
              <TouchableOpacity onPress={() => setFiscalPicker(null)} hitSlop={20}><Ionicons name="close" size={26} color="#111" /></TouchableOpacity>
            </View>
            <ScrollView>
              {(fiscalPicker === 'regimen' ? satRegimenes : satUsos).map((o) => (
                <TouchableOpacity key={o.clave}
                  onPress={() => { setFiscalForm((p) => ({ ...p, [fiscalPicker === 'regimen' ? 'regimen_fiscal' : 'uso_cfdi']: o.clave })); setFiscalPicker(null); }}
                  style={{ paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' }}>
                  <Text style={{ fontSize: 14 }}><Text style={{ fontWeight: '700' }}>{o.clave}</Text> — {o.descripcion}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#111', paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backButton: { padding: 8, marginRight: 8 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', flex: 1 },
  clientCount: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  searchContainer: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12 },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: '#333' },
  filtersContainer: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f5f5f5' },
  filterChipActive: { backgroundColor: ORANGE },
  filterText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  listContent: { padding: 16 },
  clientCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1 },
  clientHeader: { flexDirection: 'row', alignItems: 'center' },
  clientInfo: { flex: 1, marginLeft: 12 },
  clientName: { fontSize: 16, fontWeight: '600', color: '#111' },
  clientBox: { fontSize: 13, color: '#666', marginTop: 2 },
  clientStats: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '700', color: '#111' },
  statLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  clientActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 8 },
  actionButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#666', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#999', marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
  // Modal styles
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: { backgroundColor: PURPLE, paddingTop: 20, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  modalClose: { padding: 8 },
  // Address card styles
  addrCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, elevation: 1 },
  addrCardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  addrAlias: { fontSize: 15, fontWeight: '700', color: '#111' },
  addrText: { fontSize: 12, color: '#666', marginTop: 3, lineHeight: 18 },
  defaultBadge: { backgroundColor: '#E8F5E9', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 10, color: '#2E7D32', fontWeight: '600' },
  serviceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  svcChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  svcChipText: { fontSize: 10, fontWeight: '600' },
  editBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3e5f5', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  editPanel: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  editPanelTitle: { fontSize: 13, fontWeight: '600', color: PURPLE, marginBottom: 8 },
  svcRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, marginBottom: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  svcRowText: { fontSize: 14, color: '#333' },
  carrierPickerWrap: { marginLeft: 30, marginBottom: 8, marginTop: 2 },
  carrierPickerLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  carrierChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  carrierChipText: { fontSize: 12, color: '#444', maxWidth: 130 },
  carrierChipIcon: { width: 16, height: 16, resizeMode: 'contain' },
  saveBtn: { backgroundColor: PURPLE, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// Estilos del formulario de nueva dirección
const nf = StyleSheet.create({
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 2 },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fff',
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
    marginTop: 4,
  },
  dividerText: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
});
