import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, ScrollView, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const GREEN = '#4CAF50';

const STATUS_LABELS: Record<string, string> = {
  in_transit: 'En tránsito',
  received_china: 'Recibido China',
  received: 'En bodega',
  received_mty: 'Recibido en MTY',
  customs: 'En aduana',
  ready_pickup: 'Listo para recoger',
  delivered: 'Entregado',
  pending: 'Pendiente',
  reempacado: 'Reempacado',
};

const FILTER_CONFIG: Record<string, { title: string; color: string; icon: string }> = {
  in_transit: { title: 'En Tránsito', color: '#2196F3', icon: 'airplane' },
  awaiting_payment: { title: 'Por Pagar', color: '#FF9800', icon: 'card' },
  missing_instructions: { title: 'Sin Instrucciones', color: '#f44336', icon: 'alert-circle' },
  unidentified: { title: 'Sin Identificar', color: '#9C27B0', icon: 'help-circle' },
};

interface Shipment {
  uid: string;
  id: number;
  tracking_number: string | null;
  status: string;
  service_type: string;
  goods_name: string | null;
  client_name: string;
  client_box_id: string;
  client_id: number;
  saldo_pendiente: number;
  client_paid: boolean;
  has_instructions: boolean;
  weight: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  children_count: number;
  is_master: boolean;
  gex_cost: number;
  national_shipping_cost: number;
  national_carrier?: string | null;
  extra_charges_total?: number;
  extra_charges_desc?: string;
  is_unidentified?: boolean;
  carrier_tracking?: string | null;
  carrier_name?: string | null;
  international_tracking?: string | null;
  child_trackings?: string[];
  in_payment_order_ref?: string | null;
}

interface AdvisorClient {
  id: number;
  fullName: string;
  boxId: string | null;
  email: string;
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
  carrier_config?: Record<string, string>;
}

const SHIPMENT_TYPE_TO_CARRIER: Record<string, string> = {
  AIR_CHN_MX: 'china_air',
  SEA_CHN_MX: 'china_sea',
  AA_DHL: 'dhl',
  POBOX_USA: 'usa_pobox',
  TDI_EXPRESS: 'tdi_express',
  tdi_express: 'tdi_express',
};

function getInitialFilters(filter: string) {
  if (filter === 'awaiting_payment') return { payment: 'pending' as const, instructions: 'all' as const };
  if (filter === 'missing_instructions') return { payment: 'all' as const, instructions: 'no' as const };
  return { payment: 'all' as const, instructions: 'all' as const };
}

export default function AdvisorPackagesScreen({ navigation, route }: any) {
  const { token, filter: routeFilter, clientId, clientName } = route.params;
  const config = FILTER_CONFIG[routeFilter] || FILTER_CONFIG.in_transit;
  const statusFilter = routeFilter === 'in_transit' ? 'in_transit' : undefined;
  const initFilters = getInitialFilters(routeFilter);

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'pending'>(initFilters.payment);
  const [instructionsFilter, setInstructionsFilter] = useState<'all' | 'yes' | 'no'>(initFilters.instructions);
  const [unidentifiedFilter, setUnidentifiedFilter] = useState(routeFilter === 'unidentified');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [clientSearch, setClientSearch] = useState('');
  const [instrEnabled, setInstrEnabled] = useState(true);

  // Filter modal
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [tempServiceFilter, setTempServiceFilter] = useState<string>('all');
  const [tempPaymentFilter, setTempPaymentFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [tempInstructionsFilter, setTempInstructionsFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [tempUnidentifiedFilter, setTempUnidentifiedFilter] = useState(false);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [selectionServiceType, setSelectionServiceType] = useState<string | null>(null);

  // Assign client modal (for unidentified packages)
  const [assignClientModal, setAssignClientModal] = useState(false);
  const [assignClientShipment, setAssignClientShipment] = useState<Shipment | null>(null);
  const [assignClientList, setAssignClientList] = useState<AdvisorClient[]>([]);
  const [assignClientSearch, setAssignClientSearch] = useState('');
  const [assignClientLoading, setAssignClientLoading] = useState(false);
  const [assignClientSaving, setAssignClientSaving] = useState(false);
  const [assignClientSelectedId, setAssignClientSelectedId] = useState<number | null>(null);

  // Instruction assignment modal
  const [instrModal, setInstrModal] = useState(false);
  const [instrShipment, setInstrShipment] = useState<Shipment | null>(null);
  const [instrAddresses, setInstrAddresses] = useState<ClientAddress[]>([]);
  const [instrLoading, setInstrLoading] = useState(false);
  const [instrSaving, setInstrSaving] = useState(false);
  const [instrSelectedId, setInstrSelectedId] = useState<number | null>(null);
  const [instrCarriers, setInstrCarriers] = useState<any[]>([]);
  const [instrCarrierKey, setInstrCarrierKey] = useState<string>('');
  const [instrCarriersLoading, setInstrCarriersLoading] = useState(false);
  // Bulk selection context for the modal
  const [instrBulkShipments, setInstrBulkShipments] = useState<Shipment[]>([]);

  // Subir guías de paquetería nacional
  const [ngShipment, setNgShipment] = useState<Shipment | null>(null);
  const [ngFiles, setNgFiles] = useState<{ uri: string; name: string; mimeType?: string }[]>([]);
  const [ngUploading, setNgUploading] = useState(false);
  const pickNationalGuides = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/png', 'image/jpeg'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const assets = (result.assets || []).map((a: any) => ({ uri: a.uri, name: a.name || 'archivo', mimeType: a.mimeType }));
      setNgFiles(prev => [...prev, ...assets]);
    } catch {
      Alert.alert('Error', 'No se pudieron seleccionar los archivos');
    }
  };
  const submitNationalGuides = async () => {
    if (!ngShipment || ngFiles.length === 0) return;
    setNgUploading(true);
    try {
      const formData = new FormData();
      ngFiles.forEach(f => formData.append('files', { uri: f.uri, name: f.name, type: f.mimeType || 'application/octet-stream' } as any));
      const ngBase = ngShipment.service_type === 'SEA_CHN_MX' ? 'maritime'
        : ngShipment.service_type === 'AA_DHL' ? 'dhl'
        : 'packages';
      const resp = await fetch(`${API_URL}/api/${ngBase}/${ngShipment.id}/national-guide`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Error ${resp.status}`);
      }
      setNgShipment(null);
      setNgFiles([]);
      Alert.alert('Listo', 'Guía subida. Ya está disponible para imprimir la etiqueta de paquetería.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo subir la guía');
    } finally {
      setNgUploading(false);
    }
  };

  // Payment order creation
  const [paymentOrderLoading, setPaymentOrderLoading] = useState(false);
  const [paymentOrderResult, setPaymentOrderResult] = useState<any>(null);

  // Price estimate & COD documents
  const [instrPriceEstimate, setInstrPriceEstimate] = useState<{ price: number; perBox: number; boxes: number; days: string } | null>(null);
  const [instrPriceLoading, setInstrPriceLoading] = useState(false);
  const [instrOcurreInfo, setInstrOcurreInfo] = useState<{ usedZip: string; nearestBranch: boolean } | null>(null);
  const [instrIsCollect, setInstrIsCollect] = useState(false);
  const [instrFacturaFiles, setInstrFacturaFiles] = useState<{ uri: string; name: string; mimeType?: string }[]>([]);
  const [instrGuiaFiles, setInstrGuiaFiles] = useState<{ uri: string; name: string; mimeType?: string }[]>([]);
  const [instrWantsFactura, setInstrWantsFactura] = useState(false);

  const activeFilterCount = [serviceFilter, paymentFilter, instructionsFilter].filter(v => v !== 'all').length + (unidentifiedFilter ? 1 : 0);

  const filteredShipments = (clientSearch.trim()
    ? shipments.filter(s => {
        const q = clientSearch.toLowerCase();
        return s.client_name.toLowerCase().includes(q) || s.client_box_id.toLowerCase().includes(q);
      })
    : shipments
  ).sort((a, b) => {
    // Items in a payment order go to the bottom
    const aInOrder = !!a.in_payment_order_ref;
    const bInOrder = !!b.in_payment_order_ref;
    if (aInOrder === bInOrder) return 0;
    return aInOrder ? 1 : -1;
  });

  const buildUrl = useCallback(() => {
    let url = `${API_URL}/api/advisor/shipments?page=1&limit=50`;
    if (statusFilter) url += `&filter=${statusFilter}`;
    if (paymentFilter !== 'all') url += `&payment=${paymentFilter}`;
    if (instructionsFilter !== 'all') url += `&instructions=${instructionsFilter}`;
    if (serviceFilter !== 'all') url += `&serviceType=${serviceFilter}`;
    if (unidentifiedFilter) url += `&unidentified=true`;
    if (clientId) url += `&clientId=${clientId}`;
    return url;
  }, [statusFilter, paymentFilter, instructionsFilter, serviceFilter, unidentifiedFilter, clientId]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(buildUrl(), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const list = (data.shipments || []).map((s: any): Shipment => ({
        uid: s.uid ?? `PKG-${s.id}`,
        id: s.id,
        tracking_number: s.tracking ?? s.tracking_number ?? null,
        status: s.status ?? '',
        service_type: s.serviceType ?? s.service_type ?? '',
        goods_name: s.goods_name ?? s.description ?? null,
        client_name: s.client_name ?? s.clientName ?? '',
        client_box_id: s.client_box_id ?? s.clientBoxId ?? '',
        client_id: s.client_id ?? s.clientId ?? 0,
        gex_cost: parseFloat(s.gexCost ?? s.gex_cost ?? 0),
        national_shipping_cost: parseFloat(s.nationalShippingCost ?? s.national_shipping_cost ?? 0),
        extra_charges_total: parseFloat(s.extraChargesTotal ?? s.extra_charges_total ?? 0),
        extra_charges_desc: s.extraChargesDesc ?? s.extra_charges_desc ?? '',
        saldo_pendiente: (parseFloat(s.saldo_pendiente ?? s.monto ?? s.amount ?? 0)) + (parseFloat(s.gexCost ?? s.gex_cost ?? 0)) + (parseFloat(s.nationalShippingCost ?? s.national_shipping_cost ?? 0)) + (parseFloat(s.extraChargesTotal ?? s.extra_charges_total ?? 0)),
        client_paid: s.client_paid ?? s.clientPaid ?? false,
        has_instructions: s.has_instructions ?? s.hasInstructions ?? false,
        weight: parseFloat(s.weight ?? 0),
        length_cm: parseFloat(s.lengthCm ?? s.length_cm ?? 0),
        width_cm: parseFloat(s.widthCm ?? s.width_cm ?? 0),
        height_cm: parseFloat(s.heightCm ?? s.height_cm ?? 0),
        children_count: parseInt(s.childrenCount ?? s.children_count ?? 0),
        is_master: s.isMaster ?? s.is_master ?? false,
        is_unidentified: s.is_unidentified ?? false,
        carrier_tracking: s.carrier_tracking ?? null,
        carrier_name: s.carrier_name ?? null,
        international_tracking: s.internationalTracking ?? s.international_tracking ?? null,
        child_trackings: Array.isArray(s.childTrackings) ? s.childTrackings : [],
        in_payment_order_ref: s.in_payment_order_ref ?? s.inPaymentOrderRef ?? null,
      }));
      setShipments(list);
    } catch (e) {
      console.error('[AdvisorPackages]', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildUrl, token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch(`${API_URL}/api/system/payment-status`)
      .then(r => r.json())
      .then(d => setInstrEnabled(d.advisor_instructions_enabled !== false))
      .catch(() => {});
  }, []);

  const openFilterModal = () => {
    setTempServiceFilter(serviceFilter);
    setTempPaymentFilter(paymentFilter);
    setTempInstructionsFilter(instructionsFilter);
    setTempUnidentifiedFilter(unidentifiedFilter);
    setFilterModalVisible(true);
  };

  const applyFilters = () => {
    setServiceFilter(tempServiceFilter);
    setPaymentFilter(tempPaymentFilter);
    setInstructionsFilter(tempInstructionsFilter);
    setUnidentifiedFilter(tempUnidentifiedFilter);
    setFilterModalVisible(false);
  };

  const clearFilters = () => {
    setTempServiceFilter('all');
    setTempPaymentFilter('all');
    setTempInstructionsFilter('all');
    setTempUnidentifiedFilter(false);
  };

  const handleLongPress = (item: Shipment) => {
    if (selectionMode) return;
    if (item.in_payment_order_ref) return;
    setSelectionMode(true);
    setSelectedUids([item.uid]);
    setSelectionServiceType(item.service_type);
  };

  const handleCardPress = (item: Shipment) => {
    if (!selectionMode) {
      navigation.navigate('AdvisorPackageDetail', {
        uid: item.uid,
        token,
        clientName: item.client_name || undefined,
        clientBoxId: item.client_box_id || undefined,
      });
      return;
    }
    if (item.in_payment_order_ref) return; // blocked — already in an order
    if (selectedUids.includes(item.uid)) {
      const next = selectedUids.filter(u => u !== item.uid);
      setSelectedUids(next);
      if (next.length === 0) {
        setSelectionMode(false);
        setSelectionServiceType(null);
      }
    } else {
      if (selectionServiceType !== null && item.service_type !== selectionServiceType) {
        Alert.alert('Tipos distintos', 'No puedes combinar diferentes tipos de servicio en la misma selección');
        return;
      }
      setSelectedUids([...selectedUids, item.uid]);
      if (selectionServiceType === null) setSelectionServiceType(item.service_type);
    }
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedUids([]);
    setSelectionServiceType(null);
  };

  const fetchPqtxEstimate = async (zipCode: string, shipment: Shipment, bulkCount?: number) => {
    setInstrPriceLoading(true);
    setInstrPriceEstimate(null);
    setInstrOcurreInfo(null);
    try {
      const boxes = bulkCount && bulkCount > 1
        ? bulkCount
        : (shipment.is_master && shipment.children_count > 0) ? shipment.children_count : 1;
      const res = await fetch(`${API_URL}/api/shipping/pqtx-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          destZipCode: zipCode,
          packageCount: boxes,
          weight: shipment.weight || 1,
          length: shipment.length_cm || 30,
          width: shipment.width_cm || 30,
          height: shipment.height_cm || 30,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setInstrPriceEstimate({ price: data.clientPrice, perBox: data.pricePerBox, boxes, days: data.estimatedDays || '2-4 días hábiles' });
        if (data.type === 'ocurre') {
          setInstrOcurreInfo({ usedZip: data.usedZip, nearestBranch: !!data.nearestBranch });
        }
      }
    } catch { /* ignore */ }
    finally { setInstrPriceLoading(false); }
  };

  // Selecciona uno o varios archivos (fotos/PDFs) y los acumula. El backend los
  // une en un solo PDF.
  const pickDocuments = async (
    setter: (updater: (prev: { uri: string; name: string; mimeType?: string }[]) => { uri: string; name: string; mimeType?: string }[]) => void
  ) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.length) {
        const add = (result.assets || []).map((a: any) => ({ uri: a.uri, name: a.name || 'archivo', mimeType: a.mimeType ?? undefined }));
        setter(prev => [...prev, ...add]);
      }
    } catch { /* user cancelled */ }
  };

  // ── Asignar Cliente (guías sin identificar) ──
  const openAssignClientModal = async (item: Shipment) => {
    setAssignClientShipment(item);
    setAssignClientSelectedId(null);
    setAssignClientSearch('');
    setAssignClientModal(true);
    setAssignClientLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/clients?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const clients: AdvisorClient[] = (data.clients || []).map((c: any) => ({
        id: c.id,
        fullName: c.full_name ?? c.fullName ?? '',
        boxId: c.box_id ?? c.boxId ?? null,
        email: c.email ?? '',
      }));
      setAssignClientList(clients);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la lista de clientes');
      setAssignClientModal(false);
    } finally {
      setAssignClientLoading(false);
    }
  };

  const saveAssignClient = async () => {
    if (!assignClientShipment || assignClientSelectedId === null) return;
    setAssignClientSaving(true);
    try {
      const res = await fetch(
        `${API_URL}/api/advisor/packages/${assignClientShipment.id}/assign-client`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: assignClientSelectedId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setAssignClientModal(false);
      Alert.alert('✅ Cliente asignado', data.message || 'Cliente asignado correctamente');
      setShipments(prev => prev.filter(s => s.id !== assignClientShipment.id));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo asignar el cliente');
    } finally {
      setAssignClientSaving(false);
    }
  };

  const handleSelectInstrCarrier = (carrier: any) => {
    const newKey = instrCarrierKey === carrier.carrier_key ? '' : carrier.carrier_key;
    setInstrCarrierKey(newKey);
    setInstrIsCollect(newKey ? (carrier.allows_collect || false) : false);
    setInstrPriceEstimate(null);
    setInstrOcurreInfo(null);
    if (newKey === 'paquete_express' && instrShipment) {
      const addr = instrAddresses.find(a => a.id === instrSelectedId);
      const bulkCount = instrBulkShipments.length > 1 ? instrBulkShipments.length : undefined;
      if (addr?.zip_code) fetchPqtxEstimate(addr.zip_code, instrShipment, bulkCount);
    }
  };

  const openInstrModal = async (item: Shipment, bulk: Shipment[] = []) => {
    setInstrShipment(item);
    setInstrBulkShipments(bulk);
    setInstrModal(true);
    setInstrSelectedId(null);
    setInstrCarrierKey('');
    setInstrCarriers([]);
    setInstrIsCollect(false);
    setInstrFacturaFiles([]);
    setInstrGuiaFiles([]);
    setInstrWantsFactura(false);
    setInstrPriceEstimate(null);
    setInstrOcurreInfo(null);
    setInstrLoading(true);
    setInstrCarriersLoading(true);
    const carrierServiceType = SHIPMENT_TYPE_TO_CARRIER[item.service_type] ?? null;
    try {
      const [addrRes, carrierRes] = await Promise.all([
        fetch(`${API_URL}/api/advisor/clients/${item.client_id}/addresses`, { headers: { Authorization: `Bearer ${token}` } }),
        carrierServiceType
          ? fetch(`${API_URL}/api/carrier-options/by-service/${carrierServiceType}?weight=${encodeURIComponent(String(item.weight || 1))}`, { headers: { Authorization: `Bearer ${token}` } })
          : Promise.resolve(null),
      ]);
      const addrData = await addrRes.json();
      const addrList = Array.isArray(addrData) ? addrData : [];
      // Ocultar direcciones EntregaX Sync (no son seleccionables como destino real)
      const filteredAddrs = addrList.filter((a: any) => !String(a?.alias || '').startsWith('EntregaX Sync'));
      setInstrAddresses(filteredAddrs);
      if (carrierRes) {
        const carrierData = await carrierRes.json();
        setInstrCarriers(carrierData?.data || []);
      }
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los datos');
    } finally {
      setInstrLoading(false);
      setInstrCarriersLoading(false);
    }
  };

  const handleSelectInstrAddress = (addr: ClientAddress) => {
    setInstrSelectedId(addr.id);
    setInstrPriceEstimate(null);
    setInstrOcurreInfo(null);
    const serviceKey = instrShipment ? SHIPMENT_TYPE_TO_CARRIER[instrShipment.service_type] : null;
    const preselected = serviceKey && addr.carrier_config?.[serviceKey] ? addr.carrier_config[serviceKey] : '';
    setInstrCarrierKey(preselected);
    const carrier = instrCarriers.find((c: any) => c.carrier_key === preselected);
    setInstrIsCollect(carrier?.allows_collect || false);
    if (preselected === 'paquete_express' && instrShipment && addr.zip_code) {
      const bulkCount = instrBulkShipments.length > 1 ? instrBulkShipments.length : undefined;
      fetchPqtxEstimate(addr.zip_code, instrShipment, bulkCount);
    }
  };

  const saveInstructions = async () => {
    if (!instrShipment || instrSelectedId === null) return;
    if (instrCarriers.length > 0 && !instrCarrierKey) {
      Alert.alert('Paquetería requerida', 'Debes seleccionar una paquetería antes de guardar');
      return;
    }
    // Paquete Express API: no permitir asignar sin cotización (evita costo $0).
    if (instrCarrierKey === 'paquete_express' && (instrPriceLoading || !instrPriceEstimate)) {
      Alert.alert(
        instrPriceLoading ? 'Calculando cotización' : 'Sin cotización',
        instrPriceLoading
          ? 'Espera a que termine de calcularse el costo de Paquete Express.'
          : 'No se pudo cotizar Paquete Express. Intenta de nuevo o elige otra paquetería.'
      );
      return;
    }
    setInstrSaving(true);
    const targets = instrBulkShipments.length > 1 ? instrBulkShipments : [instrShipment];
    try {
      const serviceKey = SHIPMENT_TYPE_TO_CARRIER[instrShipment.service_type];
      const hasFiles = instrFacturaFiles.length > 0 || instrGuiaFiles.length > 0;

      const buildRequest = (uid: string): Promise<Response> => {
        if (hasFiles || instrIsCollect) {
          const formData = new FormData();
          formData.append('addressId', String(instrSelectedId));
          if (instrCarrierKey && serviceKey) {
            formData.append('carrierKey', instrCarrierKey);
            formData.append('serviceKey', serviceKey);
          }
          // Paquete Express API: mandar el costo cotizado por caja + zip Ocurre.
          if (instrCarrierKey === 'paquete_express' && instrPriceEstimate) {
            formData.append('nationalShippingCostPerBox', String(instrPriceEstimate.perBox));
            if (instrOcurreInfo?.usedZip) formData.append('nationalDeliveryZip', String(instrOcurreInfo.usedZip));
          }
          formData.append('isCollect', String(instrIsCollect));
          formData.append('wantsFacturaPaqueteria', String(instrWantsFactura));
          instrFacturaFiles.forEach((f, i) => {
            formData.append('factura', { uri: f.uri, name: f.name || `factura-${i + 1}`, type: f.mimeType || 'application/octet-stream' } as any);
          });
          instrGuiaFiles.forEach((f, i) => {
            formData.append('guiaExterna', { uri: f.uri, name: f.name || `guia-${i + 1}`, type: f.mimeType || 'application/octet-stream' } as any);
          });
          return fetch(`${API_URL}/api/advisor/shipments/${uid}/instructions`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
        } else {
          const body: any = { addressId: instrSelectedId };
          if (instrCarrierKey && serviceKey) { body.carrierKey = instrCarrierKey; body.serviceKey = serviceKey; }
          // Paquete Express API: mandar el costo cotizado por caja + zip Ocurre.
          if (instrCarrierKey === 'paquete_express' && instrPriceEstimate) {
            body.nationalShippingCostPerBox = instrPriceEstimate.perBox;
            if (instrOcurreInfo?.usedZip) body.nationalDeliveryZip = instrOcurreInfo.usedZip;
          }
          return fetch(`${API_URL}/api/advisor/shipments/${uid}/instructions`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        }
      };

      const results = await Promise.all(targets.map(s => buildRequest(s.uid)));
      const failed: string[] = [];
      for (let i = 0; i < results.length; i++) {
        if (!results[i].ok) {
          const errData = await results[i].json().catch(() => ({}));
          failed.push(`${targets[i].tracking_number || targets[i].uid}: ${errData.error || `Error ${results[i].status}`}`);
        }
      }
      if (failed.length > 0) throw new Error(failed.join('\n'));

      setInstrModal(false);
      Alert.alert('Listo', targets.length > 1 ? `${targets.length} instrucciones asignadas correctamente` : 'Instrucciones asignadas correctamente');
      cancelSelection();
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo asignar la dirección');
    } finally {
      setInstrSaving(false);
    }
  };

  const renderItem = ({ item }: { item: Shipment }) => {
    const statusColor =
      item.status === 'in_transit' ? '#2196F3' :
      item.status === 'delivered' ? '#4CAF50' :
      item.status === 'customs' ? '#FF9800' : '#9E9E9E';
    const isSelected = selectedUids.includes(item.uid);
    const inOrder = !!item.in_payment_order_ref;

    // For DHL: show 10-digit secondary_tracking; for others: show tracking_number
    const isDHL = item.service_type === 'AA_DHL';
    const displayTracking = isDHL && item.international_tracking
      ? item.international_tracking
      : (item.tracking_number || item.uid);
    // JJD tracking shown as secondary for DHL single shipments
    const secondaryJJD = isDHL && item.international_tracking && item.tracking_number
      ? item.tracking_number
      : null;

    const isMasterWithChildren = item.children_count > 0;
    // For DHL master: children_count = total JJD count; for pkg master: children_count + 1
    const boxCount = item.children_count;
    const childTrackings = item.child_trackings ?? [];

    return (
      <TouchableOpacity
        activeOpacity={inOrder ? 1 : 0.75}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleLongPress(item)}
        style={[styles.card, isSelected && styles.cardSelected, inOrder && { backgroundColor: '#FFF8F0', borderColor: '#FFCCBC', borderWidth: 1, opacity: 0.85 }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {selectionMode && (
            <View style={styles.checkboxArea}>
              {inOrder ? (
                <Ionicons name="lock-closed" size={20} color="#FFAB40" />
              ) : (
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={isSelected ? ORANGE : '#bbb'}
                />
              )}
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.tracking} numberOfLines={1}>{displayTracking}</Text>
                {secondaryJJD && (
                  <Text style={{ fontSize: 10, color: '#999', fontFamily: 'monospace' }} numberOfLines={1}>{secondaryJJD}</Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {isMasterWithChildren && (
                  <View style={{ backgroundColor: '#E3F2FD', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ color: '#1565C0', fontSize: 10, fontWeight: '700' }}>{boxCount} cajas</Text>
                  </View>
                )}
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {STATUS_LABELS[item.status] || item.status}
                  </Text>
                </View>
                {!selectionMode && (
                  item.is_unidentified ? (
                    <TouchableOpacity
                      style={[styles.pencilBtn, { backgroundColor: '#F3E5F5' }]}
                      onPress={() => openAssignClientModal(item)}
                    >
                      <Ionicons name="person-add" size={14} color="#9C27B0" />
                    </TouchableOpacity>
                  ) : instrEnabled ? (
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <TouchableOpacity
                        style={[styles.pencilBtn, { backgroundColor: item.has_instructions ? '#E8F5E9' : '#FFF3E0' }]}
                        onPress={() => openInstrModal(item)}
                      >
                        <Ionicons name="pencil" size={14} color={item.has_instructions ? GREEN : '#FF9800'} />
                      </TouchableOpacity>
                      {item.has_instructions && (
                        <TouchableOpacity
                          style={[styles.pencilBtn, { backgroundColor: '#FFF3E0' }]}
                          onPress={() => {
                            setSelectionMode(true);
                            setSelectedUids([item.uid]);
                            setSelectionServiceType(item.service_type);
                          }}
                        >
                          <Ionicons name="cash-outline" size={14} color={ORANGE} />
                        </TouchableOpacity>
                      )}
                      {(item.service_type === 'POBOX_USA' || item.service_type === 'tdi_express' || item.service_type === 'TDI_EXPRESS' || item.service_type === 'AIR_CHN_MX' || item.service_type === 'SEA_CHN_MX' || item.service_type === 'AA_DHL' || item.service_type === 'china_sea' || item.service_type === 'china_air') && (
                        <TouchableOpacity
                          style={[styles.pencilBtn, { backgroundColor: '#ECEFF1' }]}
                          onPress={() => { setNgShipment(item); setNgFiles([]); }}
                        >
                          <Ionicons name="cloud-upload-outline" size={14} color="#1A1A1A" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : null
                )}
              </View>
            </View>
            {inOrder && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, marginBottom: 1 }}>
                <Ionicons name="lock-closed-outline" size={10} color="#E65100" style={{ marginRight: 3 }} />
                <Text style={{ fontSize: 10, color: '#E65100', fontWeight: '700' }}>En orden: {item.in_payment_order_ref}</Text>
              </View>
            )}
            {item.goods_name ? <Text style={styles.goodsName}>{item.goods_name}</Text> : null}
            {childTrackings.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginBottom: 2 }}>
                {childTrackings.map((t, i) => (
                  <View key={i} style={{ backgroundColor: '#F5F5F5', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#E0E0E0' }}>
                    <Text style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{t}</Text>
                  </View>
                ))}
              </View>
            )}
            {(item.gex_cost > 0 || item.national_shipping_cost > 0 || (item.extra_charges_total || 0) !== 0 || item.national_carrier) && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                {item.national_shipping_cost > 0 ? (
                  <Text style={{ fontSize: 10, color: '#1565C0' }}>
                    🚚 Paq. ${item.national_shipping_cost.toFixed(2)}
                    {item.national_carrier ? ` · ${item.national_carrier}` : ''}
                  </Text>
                ) : item.national_carrier ? (
                  <Text style={{ fontSize: 10, color: '#1565C0' }}>
                    🚚 {item.national_carrier} (incluido)
                  </Text>
                ) : null}
                {item.gex_cost > 0 && (
                  <Text style={{ fontSize: 10, color: '#2E7D32' }}>
                    🛡 GEX ${item.gex_cost.toFixed(2)}
                  </Text>
                )}
                {(item.extra_charges_total || 0) !== 0 && (
                  <Text style={{ fontSize: 10, color: '#C2410C' }}>
                    ➕ Cargos extra{item.extra_charges_desc ? ` (${item.extra_charges_desc})` : ''} ${Number(item.extra_charges_total).toFixed(2)}
                  </Text>
                )}
              </View>
            )}
            <View style={styles.cardFooter}>
              {item.is_unidentified ? (
                <Text style={[styles.clientName, { color: '#7B1FA2' }]} numberOfLines={1}>
                  {item.carrier_tracking ? `📦 ${item.carrier_tracking}` : 'Sin guía origen'}
                  {item.carrier_name ? ` · ${item.carrier_name}` : ''}
                </Text>
              ) : (
                <Text style={styles.clientName} numberOfLines={1}>
                  {item.client_name} · {item.client_box_id}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {item.saldo_pendiente > 0 && (
                  <Text style={styles.saldo}>${item.saldo_pendiente.toFixed(2)}</Text>
                )}
                {item.has_instructions && (
                  <View style={styles.instrBadge}>
                    <Text style={styles.instrBadgeText}>✓ Instr.</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Ionicons name={config.icon as any} size={20} color="#fff" style={{ marginLeft: 4 }} />
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{config.title}</Text>
          {clientName ? <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' }} numberOfLines={1}>{clientName}</Text> : null}
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{shipments.length}</Text>
        </View>
        {/* Select mode toggle */}
        {!selectionMode ? (
          <TouchableOpacity onPress={() => setSelectionMode(true)} style={{ padding: 8, marginLeft: 4 }}>
            <Ionicons name="checkmark-done-outline" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={cancelSelection} style={{ padding: 8, marginLeft: 4 }}>
            <Ionicons name="close-circle-outline" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={openFilterModal} style={styles.filterBtn}>
          <Ionicons name="options-outline" size={20} color="#fff" />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active filters summary */}
      {activeFilterCount > 0 && (
        <View style={styles.activeFilterBar}>
          <Ionicons name="funnel" size={12} color={ORANGE} />
          <Text style={styles.activeFilterText} numberOfLines={1}>
            {[
              serviceFilter !== 'all' && serviceFilter,
              paymentFilter === 'paid' && 'Pagado',
              paymentFilter === 'pending' && 'Pendiente',
              instructionsFilter === 'yes' && 'Con instrucciones',
              instructionsFilter === 'no' && 'Sin instrucciones',
              unidentifiedFilter && 'Sin identificar',
            ].filter(Boolean).join(' · ')}
          </Text>
          <TouchableOpacity onPress={() => { setServiceFilter('all'); setPaymentFilter('all'); setInstructionsFilter('all'); setUnidentifiedFilter(false); }}>
            <Ionicons name="close-circle" size={14} color="#999" />
          </TouchableOpacity>
        </View>
      )}

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color="#999" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por cliente o ID..."
          placeholderTextColor="#bbb"
          value={clientSearch}
          onChangeText={setClientSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {clientSearch.length > 0 && (
          <TouchableOpacity onPress={() => setClientSearch('')}>
            <Ionicons name="close-circle" size={16} color="#bbb" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredShipments}
          keyExtractor={(item) => item.uid || String(item.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[ORANGE]} />}
          contentContainerStyle={{ padding: 12, paddingBottom: selectionMode ? 90 : 12 }}
          ListEmptyComponent={<Text style={styles.empty}>No hay envíos en esta categoría.</Text>}
        />
      )}

      {/* ─── Selection action bar ─── */}
      {selectionMode && (() => {
        const selectedShipments = shipments.filter(s => selectedUids.includes(s.uid));
        const allHaveInstructions = selectedUids.length > 0 && selectedShipments.every(s => s.has_instructions);
        return (
          <View style={styles.selectionBar}>
            <TouchableOpacity onPress={cancelSelection} style={styles.selectionCancelBtn}>
              <Ionicons name="close" size={18} color="#666" />
              <Text style={styles.selectionCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Text style={styles.selectionCount}>
                {selectedUids.length} seleccionado{selectedUids.length !== 1 ? 's' : ''}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const selectable = filteredShipments.filter(s => !s.in_payment_order_ref);
                  const uniqueTypes = [...new Set(selectable.map(s => s.service_type))];
                  const doSelectAll = (type: string) => {
                    const ofType = selectable.filter(s => s.service_type === type);
                    setSelectedUids(ofType.map(s => s.uid));
                    setSelectionServiceType(type);
                  };
                  if (uniqueTypes.length <= 1) {
                    doSelectAll(uniqueTypes[0] ?? '');
                    return;
                  }
                  const SERVICE_LABELS: Record<string, string> = {
                    AIR_CHN_MX: '✈️ Aéreo China',
                    SEA_CHN_MX: '🚢 Marítimo',
                    FCL_CHN_MX: '🚢 Marítimo FCL',
                    AA_DHL: '📦 DHL MTY',
                    POBOX_USA: '📮 PO Box USA',
                    TDI_EXPRESS: '🚚 TDI Express',
                  };
                  Alert.alert(
                    '¿Qué servicio seleccionar?',
                    'Los paquetes deben ser del mismo tipo de servicio para generar una orden de pago.',
                    [
                      ...uniqueTypes.map(type => ({
                        text: `${SERVICE_LABELS[type] || type} (${selectable.filter(s => s.service_type === type).length})`,
                        onPress: () => doSelectAll(type),
                      })),
                      { text: 'Cancelar', style: 'cancel' as const },
                    ]
                  );
                }}
              >
                <Text style={{ fontSize: 11, color: ORANGE, fontWeight: '700' }}>
                  Seleccionar todos ({filteredShipments.filter(s => !s.in_payment_order_ref).length})
                </Text>
              </TouchableOpacity>
            </View>
            {instrEnabled && selectedUids.length > 0 && (
              allHaveInstructions ? (
                <TouchableOpacity
                  style={[styles.selectionActionBtn, { backgroundColor: ORANGE, opacity: paymentOrderLoading ? 0.6 : 1 }]}
                  disabled={paymentOrderLoading}
                  onPress={async () => {
                    const selected = shipments.filter(s => selectedUids.includes(s.uid));
                    if (!selected.length) return;
                    const first = selected[0];
                    const totalMxn = selected.reduce((sum, s) => sum + (s.saldo_pendiente || 0), 0);
                    if (totalMxn <= 0) {
                      Alert.alert('Sin monto', 'Las guías seleccionadas no tienen monto registrado. Asigna un monto antes de generar la orden.');
                      return;
                    }
                    setPaymentOrderLoading(true);
                    try {
                      const res = await fetch(`${API_URL}/api/advisor/payment-orders`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                          client_id: first.client_id,
                          client_name: first.client_name,
                          client_box_id: first.client_box_id,
                          package_uids: selected.map(s => s.uid),
                          trackings: selected.map(s => s.tracking_number).filter(Boolean),
                          total_mxn: totalMxn,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Error al crear orden');
                      setPaymentOrderResult(data);
                      setSelectionMode(false);
                      setSelectedUids([]);
                    } catch (e: any) {
                      Alert.alert('Error', e.message || 'No se pudo crear la orden de pago');
                    } finally {
                      setPaymentOrderLoading(false);
                    }
                  }}
                >
                  {paymentOrderLoading
                    ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 4 }} />
                    : <Ionicons name="cash-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
                  }
                  <Text style={styles.selectionActionText}>Generar Orden de Pago</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.selectionActionBtn}
                  onPress={() => {
                    const bulk = shipments.filter(s => selectedUids.includes(s.uid));
                    const first = bulk[0];
                    if (first) openInstrModal(first, bulk);
                  }}
                >
                  <Ionicons name="pencil-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.selectionActionText}>Asignar instrucciones</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        );
      })()}

      {/* ─── Filter Modal ─── */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.filterOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setFilterModalVisible(false)} />
          <View style={styles.filterSheet}>
            <View style={styles.filterHandle} />
            <View style={styles.filterSheetHeader}>
              <Text style={styles.filterSheetTitle}>Filtros</Text>
              {(tempServiceFilter !== 'all' || tempPaymentFilter !== 'all' || tempInstructionsFilter !== 'all' || tempUnidentifiedFilter) && (
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.filterClearText}>Limpiar</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Service type */}
            <Text style={styles.filterSectionTitle}>Tipo de servicio</Text>
            <View style={styles.filterChipsWrap}>
              {([
                { key: 'all',         label: 'Todos' },
                { key: 'AIR_CHN_MX',  label: '✈️ Aéreo China' },
                { key: 'SEA_CHN_MX',  label: '🚢 Marítimo' },
                { key: 'AA_DHL',      label: '📦 DHL MTY' },
                { key: 'POBOX_USA',   label: '📮 PO Box USA' },
                { key: 'TDI_EXPRESS', label: '🚚 TDI Express' },
              ] as const).map(s => {
                const active = tempServiceFilter === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTempServiceFilter(s.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Payment */}
            <Text style={styles.filterSectionTitle}>Pago</Text>
            <View style={styles.filterChipsWrap}>
              {([
                { key: 'all', label: 'Todos' },
                { key: 'paid', label: '✅ Pagado' },
                { key: 'pending', label: '🔴 Pendiente' },
              ] as const).map(s => {
                const active = tempPaymentFilter === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTempPaymentFilter(s.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Instructions */}
            <Text style={styles.filterSectionTitle}>Instrucciones</Text>
            <View style={styles.filterChipsWrap}>
              {([
                { key: 'all', label: 'Todos' },
                { key: 'yes', label: '✅ Con instrucciones' },
                { key: 'no',  label: '⚠️ Sin instrucciones' },
              ] as const).map(s => {
                const active = tempInstructionsFilter === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTempInstructionsFilter(s.key)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Identificación */}
            <Text style={styles.filterSectionTitle}>Identificación</Text>
            <View style={styles.filterChipsWrap}>
              <TouchableOpacity
                style={[styles.chip, !tempUnidentifiedFilter && styles.chipActive]}
                onPress={() => setTempUnidentifiedFilter(false)}
              >
                <Text style={[styles.chipText, !tempUnidentifiedFilter && styles.chipTextActive]}>Todos</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, tempUnidentifiedFilter && styles.chipActive]}
                onPress={() => setTempUnidentifiedFilter(true)}
              >
                <Text style={[styles.chipText, tempUnidentifiedFilter && styles.chipTextActive]}>🔍 Sin identificar</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.filterApplyBtn} onPress={applyFilters}>
              <Text style={styles.filterApplyText}>Aplicar filtros</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Modal: Asignar Instrucciones ─── */}
      <Modal visible={instrModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setInstrModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>📍 Asignar Instrucciones</Text>
              {instrBulkShipments.length > 1 ? (
                <>
                  <Text style={styles.modalSubtitle}>
                    {instrBulkShipments.length} cajas · {instrShipment?.client_name}
                  </Text>
                  <Text style={[styles.modalSubtitle, { fontSize: 11, marginTop: 2 }]} numberOfLines={2}>
                    {instrBulkShipments.map(s => s.tracking_number || s.uid).join(' · ')}
                  </Text>
                </>
              ) : (
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {instrShipment?.tracking_number || instrShipment?.uid} · {instrShipment?.client_name}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setInstrModal(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {instrLoading ? (
            <View style={styles.centerContainer}><ActivityIndicator size="large" color={ORANGE} /></View>
          ) : instrAddresses.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="location-outline" size={48} color="#ccc" />
              <Text style={{ color: '#666', marginTop: 12, textAlign: 'center', paddingHorizontal: 32 }}>
                Este cliente no tiene direcciones guardadas
              </Text>
            </View>
          ) : (
            <>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>

                {/* ── Detalles del embarque ── */}
                {instrShipment && (instrShipment.weight > 0 || instrShipment.children_count > 0 || instrShipment.goods_name || instrBulkShipments.length > 1) && (
                  <View style={{ backgroundColor: '#F8F8F8', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: ORANGE }}>
                    <Text style={{ fontWeight: '700', fontSize: 13, color: '#333', marginBottom: 6 }}>📦 Detalles del embarque</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {instrBulkShipments.length > 1 ? (
                        <View style={styles.detailChip}>
                          <Text style={styles.detailChipLabel}>Cajas</Text>
                          <Text style={styles.detailChipValue}>{instrBulkShipments.length}</Text>
                        </View>
                      ) : instrShipment.is_master && instrShipment.children_count > 0 ? (
                        <View style={styles.detailChip}>
                          <Text style={styles.detailChipLabel}>Cajas</Text>
                          <Text style={styles.detailChipValue}>{instrShipment.children_count}</Text>
                        </View>
                      ) : null}
                      {instrShipment.weight > 0 && (
                        <View style={styles.detailChip}>
                          <Text style={styles.detailChipLabel}>Peso</Text>
                          <Text style={styles.detailChipValue}>{instrShipment.weight.toFixed(2)} kg</Text>
                        </View>
                      )}
                      {instrShipment.length_cm > 0 && instrShipment.width_cm > 0 && instrShipment.height_cm > 0 && (
                        <>
                          <View style={styles.detailChip}>
                            <Text style={styles.detailChipLabel}>Medidas</Text>
                            <Text style={styles.detailChipValue}>{instrShipment.length_cm}×{instrShipment.width_cm}×{instrShipment.height_cm} cm</Text>
                          </View>
                          <View style={styles.detailChip}>
                            <Text style={styles.detailChipLabel}>Vol. m³</Text>
                            <Text style={styles.detailChipValue}>
                              {((instrShipment.length_cm * instrShipment.width_cm * instrShipment.height_cm) / 1_000_000).toFixed(4)}
                            </Text>
                          </View>
                        </>
                      )}
                      {instrShipment.goods_name && (
                        <View style={[styles.detailChip, { flex: 1, minWidth: '100%' }]}>
                          <Text style={styles.detailChipLabel}>Mercancía</Text>
                          <Text style={styles.detailChipValue} numberOfLines={1}>{instrShipment.goods_name}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* ── Direcciones ── */}
                <Text style={styles.selectLabel}>Selecciona la dirección de entrega:</Text>
                {instrAddresses.map(addr => {
                  const selected = instrSelectedId === addr.id;
                  return (
                    <TouchableOpacity key={addr.id} style={[styles.addrOption, selected && styles.addrOptionSelected]} onPress={() => handleSelectInstrAddress(addr)}>
                      <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                        {selected && <View style={styles.radioInner} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.addrAlias}>
                          {addr.alias || addr.recipient_name || 'Dirección'}
                          {addr.is_default ? '  ✓ Principal' : ''}
                        </Text>
                        {addr.recipient_name && addr.alias && (
                          <Text style={{ fontSize: 12, color: '#888' }}>Recibe: {addr.recipient_name}</Text>
                        )}
                        <Text style={styles.addrText}>
                          {addr.street} {addr.exterior_number}{addr.interior_number ? ` Int. ${addr.interior_number}` : ''}
                          {addr.colony ? `, ${addr.colony}` : ''}, {addr.city}, {addr.state} {addr.zip_code}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* ── Paquetería ── */}
                {(instrCarriersLoading || instrCarriers.length > 0) && (
                  <View style={{ marginTop: 4 }}>
                    <View style={{ borderTopWidth: 1, borderTopColor: '#eee', marginBottom: 12 }} />
                    <Text style={{ fontWeight: '700', fontSize: 14, color: ORANGE, marginBottom: 10 }}>🚚 ¿Por qué paquetería?</Text>
                    {instrCarriersLoading ? (
                      <ActivityIndicator size="small" color={ORANGE} />
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {instrCarriers.map((carrier: any) => {
                          const isSelected = instrCarrierKey === carrier.carrier_key;
                          const isUrl = carrier.icon && (carrier.icon.startsWith('/') || carrier.icon.startsWith('http'));
                          return (
                            <TouchableOpacity
                              key={carrier.carrier_key}
                              onPress={() => handleSelectInstrCarrier(carrier)}
                              style={{
                                width: 100, padding: 10, borderRadius: 10, alignItems: 'center', gap: 4,
                                borderWidth: isSelected ? 2 : 1,
                                borderColor: isSelected ? ORANGE : '#ddd',
                                backgroundColor: isSelected ? '#FFF3E0' : '#fff',
                              }}
                            >
                              {isSelected && (
                                <Ionicons name="checkmark-circle" size={14} color={ORANGE} style={{ position: 'absolute', top: 6, right: 6 }} />
                              )}
                              {isUrl
                                ? <Text style={{ fontSize: 28 }}>📦</Text>
                                : <Text style={{ fontSize: 28 }}>{carrier.icon || '📦'}</Text>
                              }
                              <Text style={{ fontSize: 11, fontWeight: isSelected ? '700' : '400', textAlign: 'center', color: '#333' }} numberOfLines={2}>
                                {carrier.name}
                              </Text>
                              {carrier.price_label && (
                                <Text style={{ fontSize: 10, color: carrier.price_label === 'GRATIS' ? '#4CAF50' : carrier.allows_collect ? '#FF9800' : '#666', fontWeight: carrier.allows_collect ? '700' : '600', textAlign: 'center' }}>
                                  {carrier.price_label}
                                </Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {/* ── Estimado de costo (Paquete Express) ── */}
                    {instrCarrierKey === 'paquete_express' && (instrPriceLoading || instrPriceEstimate) && (
                      <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        {instrPriceLoading ? (
                          <>
                            <ActivityIndicator size="small" color="#1D4ED8" />
                            <Text style={{ fontSize: 13, color: '#555' }}>Calculando costo estimado…</Text>
                          </>
                        ) : instrPriceEstimate ? (
                          <>
                            <Text style={{ fontSize: 20 }}>💰</Text>
                            <View>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: '#1D4ED8' }}>
                                Estimado: ${instrPriceEstimate.price.toFixed(2)} MXN
                              </Text>
                              {instrPriceEstimate.boxes > 1 && (
                                <Text style={{ fontSize: 11, color: '#666' }}>${instrPriceEstimate.perBox.toFixed(2)}/caja × {instrPriceEstimate.boxes} cajas</Text>
                              )}
                              <Text style={{ fontSize: 11, color: '#888' }}>{instrPriceEstimate.days}</Text>
                            </View>
                          </>
                        ) : null}
                      </View>
                    )}

                    {/* ── Aviso Ocurre ── */}
                    {instrCarrierKey === 'paquete_express' && instrOcurreInfo && !instrPriceLoading && (
                      <View style={{ marginTop: 8, padding: 12, borderRadius: 10, backgroundColor: '#E3F2FD', borderWidth: 1, borderColor: '#90CAF9' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1565C0', marginBottom: 4 }}>
                          📦 Entrega Ocurre — CP {instrOcurreInfo.usedZip}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#555' }}>
                          {instrOcurreInfo.nearestBranch
                            ? `El CP del cliente no tiene cobertura. Se usará la sucursal Paquete Express más cercana al CP ${instrOcurreInfo.usedZip}.`
                            : `El cliente deberá recoger su paquete en la sucursal Paquete Express del CP ${instrOcurreInfo.usedZip}.`}
                        </Text>
                      </View>
                    )}

                    {/* ── Documentos para paquetería por cobrar ── */}
                    {instrIsCollect && (
                      <View style={{ marginTop: 14, padding: 14, borderRadius: 10, backgroundColor: '#FFFDE7', borderWidth: 1, borderColor: '#FFB74D' }}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: ORANGE, marginBottom: 12 }}>📄 Documentos requeridos</Text>

                        {/* Factura (varias fotos/PDFs → 1 PDF) */}
                        <Text style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Factura del embarque</Text>
                        <TouchableOpacity
                          style={[styles.docPickerBtn, instrFacturaFiles.length > 0 && styles.docPickerBtnDone]}
                          onPress={() => pickDocuments(setInstrFacturaFiles)}
                        >
                          <Ionicons name="attach-outline" size={16} color={instrFacturaFiles.length > 0 ? '#2E7D32' : '#888'} />
                          <Text style={{ fontSize: 12, color: instrFacturaFiles.length > 0 ? '#2E7D32' : '#888', flex: 1 }} numberOfLines={1}>
                            {instrFacturaFiles.length > 0 ? `✓ ${instrFacturaFiles.length} archivo(s) — toca para agregar` : 'Subir factura (1 o más, PDF/imagen)'}
                          </Text>
                          {instrFacturaFiles.length > 0 && (
                            <TouchableOpacity onPress={() => setInstrFacturaFiles([])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="close-circle" size={16} color="#C62828" />
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>

                        {/* ¿Requiere factura de paquetería? */}
                        <Text style={{ fontSize: 12, color: '#666', marginTop: 12, marginBottom: 6 }}>¿Requiere factura de la paquetería?</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity style={[styles.yesNoBtn, instrWantsFactura && styles.yesNoBtnActive]} onPress={() => setInstrWantsFactura(true)}>
                            <Text style={[styles.yesNoBtnText, instrWantsFactura && { color: '#fff' }]}>Sí</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.yesNoBtn, !instrWantsFactura && { backgroundColor: '#666', borderColor: '#666' }]} onPress={() => setInstrWantsFactura(false)}>
                            <Text style={[styles.yesNoBtnText, !instrWantsFactura && { color: '#fff' }]}>No</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Guía externa (varias fotos/PDFs → 1 PDF) */}
                        <Text style={{ fontSize: 12, color: '#666', marginTop: 12, marginBottom: 6 }}>Guía de paquetería (opcional)</Text>
                        <TouchableOpacity
                          style={[styles.docPickerBtn, instrGuiaFiles.length > 0 && styles.docPickerBtnDone]}
                          onPress={() => pickDocuments(setInstrGuiaFiles)}
                        >
                          <Ionicons name="attach-outline" size={16} color={instrGuiaFiles.length > 0 ? '#2E7D32' : '#888'} />
                          <Text style={{ fontSize: 12, color: instrGuiaFiles.length > 0 ? '#2E7D32' : '#888', flex: 1 }} numberOfLines={1}>
                            {instrGuiaFiles.length > 0 ? `✓ ${instrGuiaFiles.length} archivo(s) — toca para agregar` : 'Subir guía (1 o más, PDF/imagen)'}
                          </Text>
                          {instrGuiaFiles.length > 0 && (
                            <TouchableOpacity onPress={() => setInstrGuiaFiles([])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="close-circle" size={16} color="#C62828" />
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>

              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
                {(() => {
                  // Paquete Express API requiere cotización lista antes de asignar
                  // (si no, el costo de paquetería se guardaría en 0).
                  const pqtxApi = instrCarrierKey === 'paquete_express';
                  const pqtxNotReady = pqtxApi && (instrPriceLoading || !instrPriceEstimate);
                  const blocked = instrSaving || instrSelectedId === null
                    || (instrCarriers.length > 0 && !instrCarrierKey) || pqtxNotReady;
                  return (
                    <TouchableOpacity
                      style={[styles.saveBtn, blocked && { opacity: 0.5 }]}
                      onPress={saveInstructions}
                      disabled={blocked}
                    >
                      {instrSaving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.saveBtnText}>
                            {instrCarriers.length > 0 && !instrCarrierKey
                              ? 'Selecciona paquetería'
                              : pqtxNotReady
                                ? (instrPriceLoading ? 'Calculando cotización…' : 'Cotización no disponible')
                                : 'Asignar instrucciones'}
                          </Text>
                      }
                    </TouchableOpacity>
                  );
                })()}
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* ─── Modal: Asignar Cliente ─── */}
      {/* Subir guías de paquetería nacional */}
      <Modal visible={!!ngShipment} animationType="fade" transparent onRequestClose={() => { if (!ngUploading) setNgShipment(null); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 }}>Subir guías de paquetería nacional</Text>
            <Text style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
              Sube 1 o más archivos (PDF, JPG o PNG). Se unirán en un solo PDF disponible para imprimir la etiqueta
              {ngShipment?.is_master ? ' desde la guía maestra y todas sus hijas.' : '.'}
            </Text>
            <TouchableOpacity
              onPress={pickNationalGuides}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', borderRadius: 10, paddingVertical: 11, marginBottom: 12 }}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#1A1A1A" />
              <Text style={{ marginLeft: 8, color: '#1A1A1A', fontWeight: '700' }}>Seleccionar archivos</Text>
            </TouchableOpacity>
            {ngFiles.map((f, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="document-text-outline" size={14} color="#666" />
                <Text style={{ marginLeft: 6, fontSize: 12, color: '#666', flex: 1 }} numberOfLines={1}>{f.name}</Text>
                <TouchableOpacity onPress={() => setNgFiles(prev => prev.filter((_, idx) => idx !== i))}>
                  <Ionicons name="close-circle" size={16} color="#C62828" />
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
              <TouchableOpacity onPress={() => setNgShipment(null)} disabled={ngUploading} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                <Text style={{ color: '#1A1A1A', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitNationalGuides}
                disabled={ngUploading || ngFiles.length === 0}
                style={{ backgroundColor: ngFiles.length === 0 ? '#ccc' : '#F05A28', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 }}
              >
                {ngUploading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Subir</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={assignClientModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAssignClientModal(false)}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { backgroundColor: '#7B1FA2' }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>👤 Asignar Cliente</Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                {assignClientShipment?.tracking_number || assignClientShipment?.uid}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setAssignClientModal(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Buscador */}
          <View style={[styles.searchBar, { marginTop: 12 }]}>
            <Ionicons name="search-outline" size={16} color="#999" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar cliente..."
              placeholderTextColor="#bbb"
              value={assignClientSearch}
              onChangeText={setAssignClientSearch}
              clearButtonMode="while-editing"
            />
          </View>

          {assignClientLoading ? (
            <View style={styles.centerContainer}><ActivityIndicator size="large" color="#7B1FA2" /></View>
          ) : (
            <>
              <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
                {assignClientList
                  .filter(c => {
                    const q = assignClientSearch.toLowerCase();
                    return !q || c.fullName.toLowerCase().includes(q) || (c.boxId || '').toLowerCase().includes(q);
                  })
                  .map(c => {
                    const selected = assignClientSelectedId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.addrOption, selected && { borderColor: '#7B1FA2' }]}
                        onPress={() => setAssignClientSelectedId(c.id)}
                      >
                        <View style={[styles.radioCircle, selected && { borderColor: '#7B1FA2' }]}>
                          {selected && <View style={[styles.radioInner, { backgroundColor: '#7B1FA2' }]} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.addrAlias}>{c.fullName}</Text>
                          {c.boxId ? <Text style={{ fontSize: 12, color: '#888' }}>Box: {c.boxId}</Text> : null}
                          <Text style={{ fontSize: 11, color: '#bbb' }}>{c.email}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                {assignClientList.length === 0 && (
                  <Text style={styles.empty}>No tienes clientes registrados.</Text>
                )}
              </ScrollView>

              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#7B1FA2' }, (assignClientSaving || assignClientSelectedId === null) && { opacity: 0.5 }]}
                  onPress={saveAssignClient}
                  disabled={assignClientSaving || assignClientSelectedId === null}
                >
                  {assignClientSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.saveBtnText}>Asignar cliente</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* ─── Modal: Orden de Pago Creada ─── */}
      <Modal
        visible={!!paymentOrderResult}
        transparent
        animationType="fade"
        onRequestClose={() => setPaymentOrderResult(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, overflow: 'hidden' }}>
            {/* Header */}
            <View style={{ backgroundColor: '#2e7d32', paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>✅ Orden de Pago Creada</Text>
            </View>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 20 }}>
              {/* Reference */}
              <View style={{ backgroundColor: '#FFF8F5', borderWidth: 1, borderColor: '#F05A28', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Referencia de pago</Text>
                <Text style={{ color: ORANGE, fontWeight: '800', fontSize: 20, fontFamily: 'monospace' }}>
                  {paymentOrderResult?.payment_reference}
                </Text>
              </View>
              {/* Bank info */}
              {paymentOrderResult?.bank_info && (
                <View style={{ backgroundColor: '#E3F2FD', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <Text style={{ fontWeight: '700', color: '#1565C0', fontSize: 13, marginBottom: 8 }}>🏦 Datos bancarios</Text>
                  {[
                    { label: 'Banco', value: paymentOrderResult.bank_info.banco },
                    { label: 'CLABE', value: paymentOrderResult.bank_info.clabe },
                    { label: 'Beneficiario', value: paymentOrderResult.bank_info.beneficiario },
                    { label: 'Concepto', value: paymentOrderResult.bank_info.concepto },
                  ].map(row => (
                    <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: '#555', fontSize: 12 }}>{row.label}</Text>
                      <Text style={{ color: '#111', fontWeight: '600', fontSize: 12, flex: 1, textAlign: 'right' }}>{row.value || '—'}</Text>
                    </View>
                  ))}
                </View>
              )}
              {/* Client & Amount */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12 }}>
                  <Text style={{ color: '#888', fontSize: 11 }}>Cliente</Text>
                  <Text style={{ fontWeight: '700', fontSize: 13 }} numberOfLines={2}>{paymentOrderResult?.client_name || '—'}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12 }}>
                  <Text style={{ color: '#888', fontSize: 11 }}>Monto</Text>
                  <Text style={{ fontWeight: '700', fontSize: 13, color: '#2e7d32' }}>
                    ${Number(paymentOrderResult?.total_mxn || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#888', fontSize: 11, textAlign: 'center' }}>
                Esta orden ya aparece en la app del cliente en "Mis Cuentas por Pagar".
              </Text>
            </ScrollView>
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#EEE' }}>
              <TouchableOpacity
                style={{ backgroundColor: '#2e7d32', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                onPress={() => setPaymentOrderResult(null)}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Entendido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: BLACK,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  countBadge: { backgroundColor: ORANGE, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2 },
  countText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  filterBtn: { marginLeft: 10, padding: 6, position: 'relative' },
  filterBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: ORANGE,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: BLACK,
  },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  activeFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  activeFilterText: { flex: 1, fontSize: 12, color: '#BF360C', fontWeight: '500' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f5f5f5' },
  chipActive: { backgroundColor: ORANGE },
  chipText: { fontSize: 12, color: '#666', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: ORANGE,
    backgroundColor: '#FFF8F5',
  },
  selectionCircle: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  tracking: { fontWeight: '700', fontSize: 14, color: BLACK, flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '600' },
  pencilBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  goodsName: { fontSize: 12, color: '#555', marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  clientName: { fontSize: 12, color: '#888', flex: 1 },
  saldo: { fontSize: 13, fontWeight: '700', color: '#FF9800' },
  instrBadge: { backgroundColor: '#E8F5E9', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  instrBadgeText: { fontSize: 10, color: '#2E7D32', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
  // Selection bar
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    gap: 10,
  },
  selectionCancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8 },
  selectionCancelText: { fontSize: 13, color: '#666' },
  selectionCount: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: BLACK },
  selectionActionBtn: {
    backgroundColor: ORANGE,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Filter modal
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  filterHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  filterSheetTitle: { fontSize: 17, fontWeight: '700', color: BLACK },
  filterClearText: { fontSize: 14, color: ORANGE, fontWeight: '600' },
  filterSectionTitle: { fontSize: 12, color: '#888', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  filterChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  filterApplyBtn: {
    backgroundColor: BLACK,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  filterApplyText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: {
    backgroundColor: ORANGE,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  modalClose: { padding: 8 },
  selectLabel: { fontSize: 13, color: '#666', marginBottom: 12 },
  addrOption: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 1,
  },
  addrOptionSelected: { borderColor: ORANGE },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  radioCircleSelected: { borderColor: ORANGE },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: ORANGE },
  addrAlias: { fontSize: 14, fontWeight: '700', color: '#111' },
  addrText: { fontSize: 12, color: '#666', marginTop: 3, lineHeight: 18 },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  detailChip: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e0e0e0', minWidth: 70 },
  detailChipLabel: { fontSize: 10, color: '#888', fontWeight: '600', textTransform: 'uppercase' as const },
  detailChipValue: { fontSize: 13, color: '#222', fontWeight: '700', marginTop: 1 },
  checkboxArea: { paddingRight: 10, paddingLeft: 2, justifyContent: 'center' },
  docPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  docPickerBtnDone: { borderColor: '#4CAF50', backgroundColor: '#F1F8F1' },
  yesNoBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: ORANGE },
  yesNoBtnActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  yesNoBtnText: { fontSize: 13, fontWeight: '600', color: ORANGE },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#E8E8E8',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
});
