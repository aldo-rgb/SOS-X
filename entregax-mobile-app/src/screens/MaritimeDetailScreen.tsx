// ============================================
// MARITIME DETAIL SCREEN
// Pantalla de detalles de embarque marítimo
// ============================================

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  Clipboard,
  ToastAndroid,
  Platform,
  Alert,
} from 'react-native';
import {
  Appbar,
  Card,
  Divider,
  Button,
  Chip,
} from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { API_URL, Package } from '../services/api';
import { usePaymentStatus } from '../hooks/usePaymentStatus';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const SEA_COLOR = '#0097A7';
const { width } = Dimensions.get('window');

type RootStackParamList = {
  Home: { user: any; token: string };
  MaritimeDetail: { package: Package; user: any; token: string };
  DeliveryInstructions: { package: Package; packages?: Package[]; user: any; token: string };
  GEXContract: { package: Package; user: any; token: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'MaritimeDetail'>;

interface Address {
  id: number;
  alias: string;
  recipient_name?: string;
  street: string;
  exterior_number: string;
  interior_number?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zip_code: string;
  phone?: string;
}

export default function MaritimeDetailScreen({ navigation, route }: Props) {
  const { package: pkg, user, token } = route.params;
  const { gexEnabled, entregaxPaymentsEnabled } = usePaymentStatus();
  const [loading, setLoading] = useState(true);
  const [currentPkg, setCurrentPkg] = useState<any>(pkg as any);
  const [address, setAddress] = useState<Address | null>(null);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);
  const [movements, setMovements] = useState<any[]>([]);

  const normalizeMaritimeId = (id: number) => (id >= 100000 ? id - 100000 : id);

  const refreshDetail = useCallback(async () => {
    setLoading(true);
    try {
      const pkgId = (pkg as any).id || 0;
      const shipmentType = (pkg as any).shipment_type;
      let mergedPkg: any = { ...(pkg as any) };

      // 🔄 Para china_air y DHL: refetch desde el listado del cliente (no hay endpoint individual)
      if (shipmentType === 'china_air' || shipmentType === 'dhl') {
        try {
          const listRes = await fetch(`${API_URL}/api/client/packages/${user.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            const allPkgs: any[] = listData.packages || [];
            const fresh = allPkgs.find(p => p.id === pkgId);
            if (fresh) mergedPkg = { ...mergedPkg, ...fresh };
          }
        } catch (e) {
          console.warn('No se pudo refrescar listado china_air/dhl:', e);
        }
      }

      const maritimeId = normalizeMaritimeId(pkgId);

      if (shipmentType !== 'china_air' && shipmentType !== 'dhl' && maritimeId > 0) {
        const detailRes = await fetch(`${API_URL}/api/maritime-api/my-orders/${maritimeId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (detailRes.ok) {
          const detailData = await detailRes.json();
          const order = detailData?.order;
          if (order) {
            mergedPkg = {
              ...(pkg as any),
              id: maritimeId + 100000,
              tracking_internal: order.ordersn || (pkg as any).tracking_internal,
              description: order.goods_name || (pkg as any).description || 'Envío Marítimo',
              status: order.status || (pkg as any).status,
              weight: (order.summary_weight != null && parseFloat(order.summary_weight) > 0)
                ? parseFloat(order.summary_weight)
                : (order.weight != null ? parseFloat(order.weight) : (pkg as any).weight),
              volume: (order.summary_volume != null && parseFloat(order.summary_volume) > 0)
                ? parseFloat(order.summary_volume)
                : (order.volume != null ? parseFloat(order.volume) : (pkg as any).volume),
              total_boxes: order.summary_boxes || order.goods_num || (pkg as any).total_boxes || 1,
              container_number: order.container_name || order.container_number || (pkg as any).container_number,
              bl_number: order.bl_number || (pkg as any).bl_number,
              delivery_address_id: order.delivery_address_id || null,
              delivery_instructions: order.delivery_instructions || null,
              national_carrier: order.national_carrier || null,
              national_tracking: order.national_tracking || null,
              national_label_url: order.national_label_url || null,
              national_shipping_cost: order.national_shipping_cost != null ? parseFloat(order.national_shipping_cost) : (pkg as any).national_shipping_cost,
              assigned_cost_mxn: order.assigned_cost_mxn != null ? parseFloat(order.assigned_cost_mxn) : (pkg as any).assigned_cost_mxn,
              saldo_pendiente: order.saldo_pendiente != null ? parseFloat(order.saldo_pendiente) : (pkg as any).saldo_pendiente,
              monto_pagado: order.monto_pagado != null ? parseFloat(order.monto_pagado) : (pkg as any).monto_pagado,
              estimated_cost: order.estimated_cost != null ? parseFloat(order.estimated_cost) : (pkg as any).estimated_cost,
              estimated_cost_usd: order.estimated_cost_usd != null ? parseFloat(order.estimated_cost_usd) : (pkg as any).estimated_cost_usd,
              estimated_fx_rate: order.estimated_fx_rate != null ? parseFloat(order.estimated_fx_rate) : (pkg as any).estimated_fx_rate,
              estimated_category: order.estimated_category || (pkg as any).estimated_category,
              estimated_chargeable_cbm: order.estimated_chargeable_cbm != null ? parseFloat(order.estimated_chargeable_cbm) : (pkg as any).estimated_chargeable_cbm,
              estimated_rate_per_cbm_usd: order.estimated_rate_per_cbm_usd != null ? parseFloat(order.estimated_rate_per_cbm_usd) : (pkg as any).estimated_rate_per_cbm_usd,
              estimated_is_flat_fee: order.estimated_is_flat_fee != null ? !!order.estimated_is_flat_fee : (pkg as any).estimated_is_flat_fee,
              assigned_cost_usd: order.assigned_cost_usd != null ? parseFloat(order.assigned_cost_usd) : (pkg as any).assigned_cost_usd,
              registered_exchange_rate: order.registered_exchange_rate != null ? parseFloat(order.registered_exchange_rate) : (pkg as any).registered_exchange_rate,
              applied_category: order.applied_category || (pkg as any).applied_category,
              applied_chargeable_cbm: order.applied_chargeable_cbm != null ? parseFloat(order.applied_chargeable_cbm) : (pkg as any).applied_chargeable_cbm,
              applied_rate_per_cbm_usd: order.applied_rate_per_cbm_usd != null ? parseFloat(order.applied_rate_per_cbm_usd) : (pkg as any).applied_rate_per_cbm_usd,
              applied_is_flat_fee: order.applied_is_flat_fee != null ? !!order.applied_is_flat_fee : (pkg as any).applied_is_flat_fee,
              pending_classification: !!order.pending_classification,
            };
          }
        }
      }

      setCurrentPkg(mergedPkg);

      if (mergedPkg?.delivery_address_id) {
        const response = await fetch(`${API_URL}/api/addresses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok) {
          const addrs = data.addresses || data || [];
          const found = addrs.find((a: Address) => a.id === mergedPkg.delivery_address_id);
          setAddress(found || null);
        } else {
          setAddress(null);
        }
      } else {
        setAddress(null);
      }
    } catch (error) {
      console.error('Error refreshing maritime detail:', error);
    } finally {
      setLoading(false);
    }
  }, [pkg, token, user?.id]);

  useFocusEffect(
    useCallback(() => {
      refreshDetail();
    }, [refreshDetail])
  );

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'received_china':
        return { label: 'Recibido CEDIS GZ CHINA', color: '#FF9800', icon: 'package-variant' };
      case 'in_transit':
        return { label: 'Ya Zarpó', color: '#E53935', icon: 'ferry' };
      case 'at_port':
        return { label: 'En Puerto MX', color: '#2196F3', icon: 'anchor' };
      case 'customs':
        return { label: 'En Aduana', color: '#9C27B0', icon: 'file-document' };
      case 'delivered':
        return { label: 'Entregado', color: '#4CAF50', icon: 'check-circle' };
      default:
        return { label: status, color: '#999999', icon: 'package' };
    }
  };

  const statusInfo = getStatusInfo(currentPkg.status);

  const rawCarrierId = String(currentPkg?.national_carrier || '').trim();
  const CARRIER_NAMES: Record<string, string> = {
    'paquete_express': 'Paquete Express',
    'paquete_express_pc': 'Paquete Express (Por Cobrar)',
    'entregax_local': 'Entregax Local',
    'entregax_local_cdmx': 'Entregax Local CDMX',
    'entregax_local_mty': 'Entregax Local MTY',
    'fedex': 'FedEx',
    'estafeta': 'Estafeta',
    'dhl': 'DHL',
    'ups': 'UPS',
    'pickup_hidalgo': 'Recoger en Sucursal',
  };
  const assignedCarrier = rawCarrierId ? (CARRIER_NAMES[rawCarrierId] || rawCarrierId) : '';

  const shippingCost = Number((currentPkg as any)?.national_shipping_cost || 0);
  const assignedCost = Number((currentPkg as any)?.assigned_cost_mxn || 0);
  const estimatedCost = Number((currentPkg as any)?.estimated_cost || 0);
  const paidAmount = Number((currentPkg as any)?.monto_pagado || 0);
  const pendingAmount = Number((currentPkg as any)?.saldo_pendiente || 0);

  const handleEditInstructions = () => {
    navigation.navigate('DeliveryInstructions', {
      package: currentPkg,
      user,
      token,
    });
  };

  const openMovements = async () => {
    try {
      setMovementsOpen(true);
      setMovementsLoading(true);
      setMovementsError(null);

      const tracking = String(currentPkg?.tracking_internal || '').trim();
      if (!tracking) {
        setMovementsError('No se encontró tracking para consultar movimientos');
        setMovements([]);
        return;
      }

      const response = await fetch(`${API_URL}/api/packages/track/${encodeURIComponent(tracking)}/movements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        setMovementsError(data?.error || 'No se pudieron cargar los movimientos');
        setMovements([]);
        return;
      }

      setMovements(Array.isArray(data.movements) ? data.movements : []);
    } catch (error: any) {
      setMovementsError(error?.message || 'Error de conexión');
      setMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={SEA_COLOR} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction 
          onPress={() => navigation.goBack()} 
          color="white" 
          size={28}
        />
        <Appbar.Content 
          title="Detalle de Embarque" 
          titleStyle={styles.headerTitle}
        />
      </Appbar.Header>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info principal */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <View style={styles.titleRow}>
              <Text style={styles.productName}>{currentPkg.description || 'Envío Marítimo'}</Text>
              <Chip 
                mode="flat" 
                style={[styles.statusChip, { backgroundColor: statusInfo.color + '20' }]}
                textStyle={{ color: statusInfo.color, fontSize: 12 }}
                icon={() => <MaterialCommunityIcons name={statusInfo.icon as any} size={14} color={statusInfo.color} />}
              >
                {statusInfo.label}
              </Chip>
            </View>

            <Text style={styles.trackingNumber}>TRN: {currentPkg.tracking_internal}</Text>

            {assignedCarrier ? (
              <TouchableOpacity
                activeOpacity={currentPkg?.national_tracking ? 0.6 : 1}
                onPress={() => {
                  const tn = currentPkg?.national_tracking;
                  if (tn) {
                    Clipboard.setString(String(tn));
                    if (Platform.OS === 'android') {
                      ToastAndroid.show('Guía copiada al portapapeles', ToastAndroid.SHORT);
                    } else {
                      Alert.alert('Copiado', `Guía ${tn} copiada al portapapeles`);
                    }
                  }
                }}
                style={styles.assignedCarrierBadge}
              >
                <MaterialCommunityIcons name="truck-fast" size={14} color={ORANGE} />
                <Text style={styles.assignedCarrierText}>{assignedCarrier}</Text>
                {!!currentPkg?.national_tracking && (
                  <>
                    <Text style={[styles.assignedCarrierText, { fontWeight: '700', marginLeft: 6 }]}>
                      · {currentPkg.national_tracking}
                    </Text>
                    <MaterialCommunityIcons name="content-copy" size={12} color={ORANGE} style={{ marginLeft: 4 }} />
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            <View style={styles.headerButtonsRow}>
              <Button
                mode="outlined"
                onPress={openMovements}
                style={styles.movementsButton}
                textColor={SEA_COLOR}
                icon="timeline-text"
              >
                Ver Movimientos
              </Button>
            </View>
            
            <Divider style={styles.divider} />

            {/* Datos del embarque */}
            <View style={styles.dataGrid}>
              <View style={styles.dataItem}>
                <Ionicons name="scale-outline" size={20} color="#666" />
                <Text style={styles.dataLabel}>Peso</Text>
                <Text style={styles.dataValue}>{currentPkg.weight ? `${currentPkg.weight} kg` : '--'}</Text>
              </View>
              <View style={styles.dataItem}>
                <Ionicons name="cube-outline" size={20} color="#666" />
                <Text style={styles.dataLabel}>Volumen</Text>
                <Text style={styles.dataValue}>{(currentPkg as any).volume ? `${(currentPkg as any).volume} m³` : '--'}</Text>
              </View>
              <View style={styles.dataItem}>
                <Ionicons name="layers-outline" size={20} color="#666" />
                <Text style={styles.dataLabel}>Cajas</Text>
                <Text style={styles.dataValue}>{currentPkg.total_boxes || 1}</Text>
              </View>
            </View>

            {/* Contenedor y BL */}
            {((currentPkg as any).container_number || (currentPkg as any).bl_number) && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.containerInfo}>
                  {(currentPkg as any).container_number && (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="truck-cargo-container" size={18} color={SEA_COLOR} />
                      <Text style={styles.infoLabel}>Contenedor:</Text>
                      <Text style={styles.infoValue}>{(currentPkg as any).container_number}</Text>
                    </View>
                  )}
                  {(currentPkg as any).bl_number && (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="file-document-outline" size={18} color={SEA_COLOR} />
                      <Text style={styles.infoLabel}>BL:</Text>
                      <Text style={styles.infoValue}>{(currentPkg as any).bl_number}</Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Dirección de entrega */}
        <Card style={styles.addressCard}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Ionicons name="location" size={22} color={SEA_COLOR} />
              <Text style={styles.sectionTitle}>Dirección de Entrega</Text>
            </View>

            {address ? (
              <View style={styles.addressContent}>
                <Text style={styles.addressAlias}>{address.alias}</Text>
                {address.recipient_name && (
                  <Text style={styles.addressRecipient}>📦 {address.recipient_name}</Text>
                )}
                <Text style={styles.addressLine}>
                  {address.street} #{address.exterior_number}
                  {address.interior_number ? ` Int. ${address.interior_number}` : ''}
                </Text>
                {address.neighborhood && (
                  <Text style={styles.addressLine}>Col. {address.neighborhood}</Text>
                )}
                <Text style={styles.addressLine}>
                  {address.city}, {address.state} - CP {address.zip_code}
                </Text>
                {address.phone && (
                  <Text style={styles.addressPhone}>📞 {address.phone}</Text>
                )}

                {/* Instrucciones adicionales */}
                {(currentPkg as any).delivery_instructions && (
                  <View style={styles.instructionsBox}>
                    <Text style={styles.instructionsLabel}>Notas adicionales:</Text>
                    <Text style={styles.instructionsText}>{(currentPkg as any).delivery_instructions}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.noAddressContainer}>
                <MaterialCommunityIcons name="map-marker-off" size={32} color="#ccc" />
                <Text style={styles.noAddressText}>Sin dirección asignada</Text>
              </View>
            )}

            <Button
              mode="contained"
              onPress={handleEditInstructions}
              style={styles.editButton}
              buttonColor={SEA_COLOR}
              icon="pencil"
              disabled={!!(currentPkg?.national_tracking || currentPkg?.national_label_url)}
            >
              {address ? 'Modificar Instrucciones' : 'Asignar Dirección'}
            </Button>
            {!!(currentPkg?.national_tracking || currentPkg?.national_label_url) && (
              <Text style={{ marginTop: 8, fontSize: 12, color: '#888', textAlign: 'center' }}>
                🔒 La guía de última milla ya fue generada. Las instrucciones de entrega no se pueden modificar.
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Garantía extendida (visible arriba del desglose) */}
        {currentPkg.has_gex ? (
          <Card style={styles.gexCard}>
            <Card.Content style={styles.gexContent}>
              <MaterialCommunityIcons name="shield-check" size={24} color="#10B981" />
              <View style={styles.gexInfo}>
                <Text style={styles.gexTitle}>Garantía Extendida Activa</Text>
                {currentPkg.gex_folio && <Text style={styles.gexFolio}>Folio: {currentPkg.gex_folio}</Text>}
              </View>
            </Card.Content>
          </Card>
        ) : (
          // 🛡️ CTA para contratar GEX cuando aún es posible.
          // Marítimo: solo antes de zarpar (status received_china).
          // China Air: en bodega China (received_origin).
          // DHL/PO Box: en bodega/processing.
          (() => {
            const status = String(currentPkg?.status || '');
            const shipmentType = (currentPkg as any)?.shipment_type;
            const isMaritime = shipmentType === 'maritime' || !!currentPkg?.ordersn;
            const isChinaAir = shipmentType === 'china_air';
            // 🚫 Mercancía Logotipo NO permite contratar GEX en marítimo/aéreo.
            const brandKey = String((currentPkg as any)?.brand_type || '').toLowerCase();
            const merchKey = String((currentPkg as any)?.merchandise_type || '').toLowerCase();
            // Para aéreo China, el tipo viene en air_tariff_type ('L' = Logo).
            const airTariff = String((currentPkg as any)?.air_tariff_type || '').toUpperCase();
            const isLogoMerch = brandKey === 'logo' || brandKey === 'branded'
              || merchKey === 'logo' || merchKey === 'branded'
              || airTariff === 'L';
            const canContract = gexEnabled && !((isMaritime || isChinaAir) && isLogoMerch) && (
              isMaritime ? ['received_china', 'in_transit'].includes(status)
              : isChinaAir ? status === 'received_origin'
              : ['received', 'processing'].includes(status)
            );
            if (!canContract) return null;
            return (
              <Card style={[styles.gexCard, { backgroundColor: '#FFF8E1', borderColor: ORANGE, borderWidth: 1 }]}>
                <Card.Content>
                  <View style={[styles.gexContent, { marginBottom: 8 }]}>
                    <MaterialCommunityIcons name="shield-plus-outline" size={26} color={ORANGE} />
                    <View style={styles.gexInfo}>
                      <Text style={[styles.gexTitle, { color: BLACK }]}>Protege tu mercancía con GEX</Text>
                      <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                        Contrata la Garantía Extendida antes de que zarpe el contenedor.
                      </Text>
                    </View>
                  </View>
                  <Button
                    mode="contained"
                    icon="shield-check"
                    buttonColor={ORANGE}
                    textColor="#FFF"
                    onPress={() => navigation.navigate('GEXContract', { package: currentPkg as Package, user, token })}
                  >
                    Contratar Garantía Extendida
                  </Button>
                </Card.Content>
              </Card>
            );
          })()
        )}

        {/* Desglose de Costos — oculto si Pagos EntregaX está desactivado */}
        {entregaxPaymentsEnabled && (
        <Card style={styles.costsCard}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="currency-usd" size={22} color={SEA_COLOR} />
              <Text style={styles.sectionTitle}>Desglose de Costos</Text>
            </View>
            <Divider style={styles.divider} />

            {/* Costo del servicio marítimo */}
            {(() => {
              const pendingClassification = !!(currentPkg as any)?.pending_classification;
              const hasAnyCost = assignedCost > 0 || estimatedCost > 0 || shippingCost > 0 || paidAmount > 0 || pendingAmount > 0;

              // 🕐 Pendiente de clasificación: mostrar mensaje, NO costo provisional
              if (pendingClassification || !hasAnyCost) {
                return (
                  <View style={{ alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 }}>
                    <MaterialCommunityIcons name="clock-outline" size={36} color={ORANGE} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: BLACK, marginTop: 8, textAlign: 'center' }}>
                      Pendiente de recibir clasificación
                    </Text>
                    <Text style={{ fontSize: 12, color: '#666', marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
                      El costo se asignará una vez que la mercancía sea recibida y clasificada en bodega China.
                    </Text>
                  </View>
                );
              }

              return (() => {
              // El costo del servicio marítimo es:
              //   - Si ya hay cost asignado: assignedCost - shippingCost
              //   - Si solo hay estimado:    estimatedCost
              const maritimeBase = assignedCost > 0
                ? Math.max(0, assignedCost - shippingCost)
                : estimatedCost;
              const isEstimated = assignedCost <= 0 && estimatedCost > 0;
              const grandTotal = maritimeBase + shippingCost;
              const isChinaAir = (currentPkg as any).shipment_type === 'china_air';
              const isDHL = (currentPkg as any).shipment_type === 'dhl';
              const serviceLabel = isChinaAir
                ? '✈️ Servicio Aéreo China'
                : isDHL
                  ? '📦 Servicio DHL'
                  : '🚢 Servicio Marítimo';

              // Datos USD / TC (estilo web)
              const assignedUsd = Number((currentPkg as any)?.assigned_cost_usd || 0);
              const estimatedUsd = Number((currentPkg as any)?.estimated_cost_usd || 0);
              const fxFromAssigned = Number((currentPkg as any)?.registered_exchange_rate || 0);
              const fxFromEstimated = Number((currentPkg as any)?.estimated_fx_rate || 0);
              const costoUSD = assignedUsd > 0 ? assignedUsd : estimatedUsd;
              const tcToShow = fxFromAssigned > 0 ? fxFromAssigned : (fxFromEstimated > 0 ? fxFromEstimated : 0);

              // Si ya hay costo asignado, preferir applied_*; si no, usar estimated_*
              const cbm = assignedUsd > 0
                ? Number((currentPkg as any)?.applied_chargeable_cbm || 0)
                : Number((currentPkg as any)?.estimated_chargeable_cbm || 0);
              const category = assignedUsd > 0
                ? ((currentPkg as any)?.applied_category || '')
                : ((currentPkg as any)?.estimated_category || '');
              const ratePerCbm = assignedUsd > 0
                ? Number((currentPkg as any)?.applied_rate_per_cbm_usd || 0)
                : Number((currentPkg as any)?.estimated_rate_per_cbm_usd || 0);
              const isFlatFee = assignedUsd > 0
                ? !!(currentPkg as any)?.applied_is_flat_fee
                : !!(currentPkg as any)?.estimated_is_flat_fee;
              // ✈️🇨🇳 Aéreo China: usa kg × USD/kg (Logo/Sensible/Genérico)
              const airPerKg = Number((currentPkg as any)?.air_price_per_kg || 0);
              const airTariff = String((currentPkg as any)?.air_tariff_type || '').toUpperCase();
              const airTariffLabel = ({ L: 'Logo', S: 'Sensible', G: 'Genérico', F: 'Flat', SU: 'StartUp' } as Record<string, string>)[airTariff] || '';
              const weightKg = Number((currentPkg as any)?.weight || 0);
              const detailLine = isChinaAir && airPerKg > 0 && weightKg > 0
                ? `${weightKg.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg × $${airPerKg.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/kg${airTariffLabel ? ` (${airTariffLabel})` : ''}`
                : (cbm > 0 && category
                  ? (ratePerCbm > 0 && !isFlatFee
                      ? `${cbm.toFixed(2)} m³ × $${ratePerCbm.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/m³ · ${category}${isEstimated ? ' (estimado)' : ''}`
                      : `${cbm.toFixed(2)} m³ · ${category}${isEstimated ? ' (estimado)' : ''}`)
                  : '');

              return (
              <>
                {/* Costo en USD (estilo web) */}
                {costoUSD > 0 && (
                  <>
                    <View style={styles.costRow}>
                      <Text style={styles.costLabel}>
                        {serviceLabel}:
                      </Text>
                      <Text style={[styles.costValue, { color: ORANGE, fontWeight: '700', fontSize: 16 }]}>
                        ${costoUSD.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                      </Text>
                    </View>
                    {!!detailLine && (
                      <Text style={[styles.costLabel, { textAlign: 'right', fontSize: 11, color: '#888', marginBottom: 2 }]}>
                        {detailLine}
                      </Text>
                    )}
                    {tcToShow > 0 && (
                      <>
                        <Divider style={styles.divider} />
                        <View style={styles.costRow}>
                          <Text style={styles.costLabel}>💱 Tipo de cambio:</Text>
                          <Text style={styles.costValue}>${tcToShow.toFixed(2)} MXN</Text>
                        </View>
                      </>
                    )}
                  </>
                )}

                {/* Si no tenemos USD, mostrar solo MXN */}
                {costoUSD <= 0 && (
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>
                      {serviceLabel}{isEstimated ? ' (estimado)' : ''}
                    </Text>
                    <Text style={styles.costValue}>${maritimeBase.toFixed(2)} MXN</Text>
                  </View>
                )}

                {shippingCost > 0 && (
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>🚚 Envío nacional ({assignedCarrier || 'Paquetería asignada'})</Text>
                    <Text style={styles.costValue}>${shippingCost.toFixed(2)} MXN</Text>
                  </View>
                )}

                {/* Costo GEX si está contratado - desglosado */}
                {currentPkg.has_gex && currentPkg.declared_value ? (
                  <>
                    <View style={styles.costRow}>
                      <Text style={[styles.costLabel, { paddingLeft: 8 }]}>• 5% Valor Asegurado</Text>
                      <Text style={styles.costValue}>${(currentPkg.declared_value * 0.05 * 18.15).toFixed(2)} MXN</Text>
                    </View>
                    <View style={styles.costRow}>
                      <Text style={[styles.costLabel, { paddingLeft: 8 }]}>• Cargo Fijo GEX</Text>
                      <Text style={styles.costValue}>$625.00 MXN</Text>
                    </View>
                    <View style={styles.costRow}>
                      <Text style={[styles.costLabel, { fontWeight: '600' }]}>🛡️ Subtotal Garantía Extendida</Text>
                      <Text style={[styles.costValue, { color: ORANGE }]}>${((currentPkg.declared_value * 0.05 * 18.15) + 625).toFixed(2)} MXN</Text>
                    </View>
                  </>
                ) : currentPkg.has_gex ? (
                  <View style={styles.costRow}>
                    <Text style={[styles.costLabel, { fontWeight: '600' }]}>🛡️ Garantía Extendida</Text>
                    <Text style={[styles.costValue, { color: '#10B981', fontWeight: '600' }]}>Incluida</Text>
                  </View>
                ) : null}

                {/* Total en pesos (estilo web) */}
                <Divider style={styles.divider} />
                <View style={styles.costRow}>
                  <Text style={[styles.costLabel, { fontWeight: '700' }]}>
                    🇲🇽 Total en pesos:
                  </Text>
                  <Text style={[styles.costValue, { fontWeight: '700', fontSize: 18, color: ORANGE }]}>
                    ${grandTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                  </Text>
                </View>

                {/* Monto ya pagado */}
                {paidAmount > 0 && (
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>✅ Monto Pagado</Text>
                    <Text style={[styles.costValue, { color: '#4CAF50' }]}>-${paidAmount.toFixed(2)} MXN</Text>
                  </View>
                )}

                {/* Estado: solo mostrar si aporta info nueva (pago parcial o pagado total).
                    Si el saldo pendiente == grandTotal y no hay pagos, omitir para no duplicar. */}
                {!isEstimated && paidAmount > 0 && (
                  <>
                    <Divider style={styles.divider} />
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>
                        {pendingAmount > 0 ? 'SALDO PENDIENTE' : 'PAGADO'}
                      </Text>
                      <Text style={[
                        styles.totalValue,
                        { color: pendingAmount > 0 ? ORANGE : '#4CAF50' }
                      ]}>
                        ${(pendingAmount > 0 ? pendingAmount : paidAmount)
                          .toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                      </Text>
                    </View>
                  </>
                )}

                {/* Chip de Pendiente de Cotización (sin monto, no redundante) */}
                {isEstimated && (
                  <View style={{ alignSelf: 'flex-start', marginTop: 6, backgroundColor: '#FFE0B2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ color: ORANGE, fontWeight: '600', fontSize: 11 }}>Pendiente de Cotización</Text>
                  </View>
                )}
              </>
              );
            })();
            })()}
          </Card.Content>
        </Card>
        )}

        <Modal
          visible={movementsOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMovementsOpen(false)}
        >
          <View style={styles.movementsOverlay}>
            <View style={styles.movementsModal}>
              <View style={styles.movementsHeader}>
                <Text style={styles.movementsTitle}>Movimientos del Embarque</Text>
                <TouchableOpacity onPress={() => setMovementsOpen(false)}>
                  <MaterialCommunityIcons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={styles.movementsTrackingBox}>
                <Text style={styles.movementsTrackingLabel}>Tracking</Text>
                <Text style={styles.movementsTrackingValue}>{currentPkg?.tracking_internal}</Text>
              </View>

              {movementsLoading && (
                <View style={styles.movementsLoadingWrap}>
                  <ActivityIndicator color={SEA_COLOR} />
                  <Text style={styles.movementsLoadingText}>Cargando movimientos...</Text>
                </View>
              )}

              {!movementsLoading && movementsError && (
                <View style={styles.movementsErrorWrap}>
                  <Text style={styles.movementsErrorText}>❌ {movementsError}</Text>
                </View>
              )}

              {!movementsLoading && !movementsError && (
                <ScrollView style={styles.movementsList} showsVerticalScrollIndicator={false}>
                  {movements.length === 0 ? (
                    <Text style={styles.movementsEmptyText}>Aún no hay movimientos registrados para este embarque.</Text>
                  ) : (
                    movements.map((m, index) => (
                      <View key={`${m.id || index}-${index}`} style={styles.movementItem}>
                        <View style={styles.movementDot} />
                        <View style={styles.movementContent}>
                          <Text style={styles.movementStatusText}>{m.status_label || m.status || 'Movimiento'}</Text>
                          {!!m.notes && <Text style={styles.movementNotesText}>{m.notes}</Text>}
                          <Text style={styles.movementDateText}>
                            {m.created_at ? new Date(m.created_at).toLocaleString('es-MX') : 'Sin fecha'}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: SEA_COLOR,
    elevation: 0,
  },
  headerTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
  content: {
    flex: 1,
  },
  infoCard: {
    margin: 16,
    marginTop: 16,
    borderRadius: 16,
    elevation: 3,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  productName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
    flex: 1,
    marginRight: 10,
  },
  statusChip: {
    borderRadius: 20,
  },
  trackingNumber: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'monospace',
  },
  assignedCarrierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    backgroundColor: '#FFF3E0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  assignedCarrierText: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '700',
  },
  headerButtonsRow: {
    marginTop: 10,
    alignItems: 'flex-start',
  },
  movementsButton: {
    borderColor: SEA_COLOR,
    borderRadius: 10,
  },
  divider: {
    marginVertical: 8,
  },
  dataGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dataItem: {
    alignItems: 'center',
    flex: 1,
  },
  dataLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  dataValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
    marginTop: 2,
  },
  containerInfo: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  addressCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  addressContent: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  addressAlias: {
    fontSize: 16,
    fontWeight: 'bold',
    color: SEA_COLOR,
    marginBottom: 8,
  },
  addressRecipient: {
    fontSize: 14,
    color: BLACK,
    marginBottom: 4,
  },
  addressLine: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  addressPhone: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  instructionsBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  instructionsLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  instructionsText: {
    fontSize: 14,
    color: BLACK,
    fontStyle: 'italic',
  },
  noAddressContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 16,
  },
  noAddressText: {
    color: '#999',
    marginTop: 8,
    fontSize: 14,
  },
  editButton: {
    borderRadius: 8,
  },
  costsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    elevation: 2,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  costLabel: {
    fontSize: 14,
    color: '#333',
  },
  costValue: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BLACK,
    flexShrink: 1,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: ORANGE,
    flexShrink: 0,
  },
  noCostsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  noCostsText: {
    marginLeft: 12,
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  gexCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#10B98110',
    borderWidth: 1,
    borderColor: '#10B98130',
  },
  gexContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gexInfo: {
    flex: 1,
  },
  gexTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10B981',
  },
  gexFolio: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  movementsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  movementsModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxHeight: '80%',
    padding: 16,
  },
  movementsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  movementsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BLACK,
  },
  movementsTrackingBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  movementsTrackingLabel: {
    color: '#666',
    fontSize: 12,
    marginBottom: 2,
  },
  movementsTrackingValue: {
    color: BLACK,
    fontSize: 13,
    fontWeight: '700',
  },
  movementsLoadingWrap: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  movementsLoadingText: {
    color: '#666',
  },
  movementsErrorWrap: {
    paddingVertical: 16,
  },
  movementsErrorText: {
    color: '#D32F2F',
    fontSize: 13,
  },
  movementsList: {
    maxHeight: 420,
  },
  movementsEmptyText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  movementItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  movementDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: SEA_COLOR,
    marginTop: 6,
    marginRight: 10,
  },
  movementContent: {
    flex: 1,
  },
  movementStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: BLACK,
  },
  movementNotesText: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  movementDateText: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
  },
  bottomSpacer: {
    height: 30,
  },
});
