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

const ORANGE = '#F05A28';
const BLACK = '#111111';
const SEA_COLOR = '#0097A7';
const { width } = Dimensions.get('window');

type RootStackParamList = {
  Home: { user: any; token: string };
  MaritimeDetail: { package: Package; user: any; token: string };
  DeliveryInstructions: { package: Package; packages?: Package[]; user: any; token: string };
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
      const maritimeId = normalizeMaritimeId((pkg as any).id || 0);
      let mergedPkg: any = { ...(pkg as any) };

      if (maritimeId > 0) {
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
              weight: order.weight != null ? parseFloat(order.weight) : (pkg as any).weight,
              volume: order.volume != null ? parseFloat(order.volume) : (pkg as any).volume,
              total_boxes: order.summary_boxes || order.goods_num || (pkg as any).total_boxes || 1,
              container_number: order.container_name || order.container_number || (pkg as any).container_number,
              bl_number: order.bl_number || (pkg as any).bl_number,
              delivery_address_id: order.delivery_address_id || null,
              delivery_instructions: order.delivery_instructions || null,
              national_carrier: order.national_carrier || null,
              national_shipping_cost: order.national_shipping_cost != null ? parseFloat(order.national_shipping_cost) : (pkg as any).national_shipping_cost,
              assigned_cost_mxn: order.assigned_cost_mxn != null ? parseFloat(order.assigned_cost_mxn) : (pkg as any).assigned_cost_mxn,
              saldo_pendiente: order.saldo_pendiente != null ? parseFloat(order.saldo_pendiente) : (pkg as any).saldo_pendiente,
              monto_pagado: order.monto_pagado != null ? parseFloat(order.monto_pagado) : (pkg as any).monto_pagado,
              estimated_cost: order.estimated_cost != null ? parseFloat(order.estimated_cost) : (pkg as any).estimated_cost,
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
  }, [pkg, token]);

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
    'entregax_local': 'Entregax Local',
    'entregax_local_cdmx': 'Entregax Local CDMX',
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
              <View style={styles.assignedCarrierBadge}>
                <MaterialCommunityIcons name="truck-fast" size={14} color={ORANGE} />
                <Text style={styles.assignedCarrierText}>{assignedCarrier}</Text>
              </View>
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
            >
              {address ? 'Modificar Instrucciones' : 'Asignar Dirección'}
            </Button>
          </Card.Content>
        </Card>

        {/* Desglose de Costos */}
        <Card style={styles.costsCard}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="currency-usd" size={22} color={SEA_COLOR} />
              <Text style={styles.sectionTitle}>Desglose de Costos</Text>
            </View>
            <Divider style={styles.divider} />

            {/* Costo del servicio marítimo */}
            {(assignedCost > 0 || estimatedCost > 0 || shippingCost > 0 || paidAmount > 0 || pendingAmount > 0) ? (
              <>
                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>🚢 Servicio Marítimo</Text>
                  <Text style={styles.costValue}>${Math.max(0, assignedCost - shippingCost).toFixed(2)} MXN</Text>
                </View>

                {shippingCost > 0 && (
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>🚚 Envío nacional ({assignedCarrier || 'Paquetería asignada'})</Text>
                    <Text style={styles.costValue}>${shippingCost.toFixed(2)} MXN</Text>
                  </View>
                )}

                {estimatedCost > 0 && assignedCost <= 0 && (
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>💡 Costo estimado</Text>
                    <Text style={styles.costValue}>${estimatedCost.toFixed(2)} MXN</Text>
                  </View>
                )}

                {/* Costo GEX si está contratado - desglosado */}
                {currentPkg.has_gex && currentPkg.declared_value && (
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
                )}

                {/* Monto ya pagado */}
                {paidAmount > 0 && (
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>✅ Monto Pagado</Text>
                    <Text style={[styles.costValue, { color: '#4CAF50' }]}>-${paidAmount.toFixed(2)} MXN</Text>
                  </View>
                )}

                <Divider style={styles.divider} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {pendingAmount > 0 ? 'SALDO PENDIENTE' : 'PAGADO'}
                  </Text>
                  <Text style={[
                    styles.totalValue, 
                    { color: pendingAmount > 0 ? ORANGE : '#4CAF50' }
                  ]}>
                    ${(pendingAmount > 0 ? pendingAmount : assignedCost).toFixed(2)} MXN
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.noCostsContainer}>
                <MaterialCommunityIcons name="information-outline" size={24} color="#666" />
                <Text style={styles.noCostsText}>
                  Los costos se calcularán cuando el embarque sea procesado
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Garantía extendida */}
        {currentPkg.has_gex && (
          <Card style={styles.gexCard}>
            <Card.Content style={styles.gexContent}>
              <MaterialCommunityIcons name="shield-check" size={24} color="#10B981" />
              <View style={styles.gexInfo}>
                <Text style={styles.gexTitle}>Garantía Extendida Activa</Text>
                {currentPkg.gex_folio && <Text style={styles.gexFolio}>Folio: {currentPkg.gex_folio}</Text>}
              </View>
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
    marginVertical: 16,
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
    marginBottom: 16,
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
    paddingVertical: 8,
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
    paddingVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: ORANGE,
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
