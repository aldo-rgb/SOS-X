// ============================================
// PACKAGE DETAIL SCREEN
// Pantalla de detalles de paquete PO Box USA
// ============================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from 'react-native';
import {
  Appbar,
  Card,
  Divider,
  Button,
  Chip,
} from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { API_URL, Package } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const PURPLE = '#9C27B0';
const { width } = Dimensions.get('window');

type RootStackParamList = {
  Home: { user: any; token: string };
  PackageDetail: { package: Package; user: any; token: string };
  GEXContract: { package: Package; user: any; token: string; childPackages?: ChildPackage[] };
};

type Props = NativeStackScreenProps<RootStackParamList, 'PackageDetail'>;

// Interface para paquetes hijos
interface ChildPackage {
  id: number;
  tracking: string;
  trackingCourier?: string;
  boxNumber: number;
  weight: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
    formatted?: string;
  };
  status: string;
  imageUrl?: string;
}

interface PackageDetails {
  id: number;
  tracking_internal: string;
  tracking_provider?: string;
  description?: string;
  weight?: number;
  dimensions?: string | {
    length?: number;
    width?: number;
    height?: number;
  };
  cbm?: number;
  declared_value?: number;
  status: string;
  carrier?: string;
  national_carrier?: string;
  national_tracking?: string;
  image_url?: string;
  has_gex?: boolean;
  gex_folio?: string;
  gex_insurance_cost?: number;
  gex_fixed_cost?: number;
  gex_total_cost?: number;
  // Multi-guía
  is_master?: boolean;
  total_boxes?: number;
  // Costos
  assigned_cost_mxn?: number;
  saldo_pendiente?: number;
  monto_pagado?: number;
  pobox_service_cost?: number;
  pobox_cost_usd?: number;
  pobox_venta_usd?: number;
  pobox_tarifa_nivel?: number;
  registered_exchange_rate?: number;
  national_shipping_cost?: number;
  // Fechas
  created_at?: string;
  updated_at?: string;
}

interface PackageMovement {
  id: number;
  status: string;
  status_label?: string;
  notes?: string | null;
  created_at: string;
  created_by_name?: string | null;
}

// 💰 Tarifas PO Box por nivel (USD)
const TARIFAS_POBOX_USD: Record<number, number> = { 1: 39, 2: 79, 3: 750 };

export default function PackageDetailScreen({ navigation, route }: Props) {
  const { package: pkg, user, token } = route.params;
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<PackageDetails | null>(null);
  const [childPackages, setChildPackages] = useState<ChildPackage[]>([]);
  const [selectedChildImage, setSelectedChildImage] = useState<string | null>(null);
  const [showChildren, setShowChildren] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);
  const [movements, setMovements] = useState<PackageMovement[]>([]);

  // 📦 Detectar si es un paquete REPACK (consolidación física = 1 caja)
  const isRepackPackage = (): boolean => {
    const tracking = details?.tracking_internal || pkg.tracking_internal || '';
    return tracking.includes('REPACK') || tracking.startsWith('US-REPACK');
  };

  // 🚚 Detectar si es Pick Up (el cliente recoge en sucursal, no paga servicio PO Box)
  const isPickUpService = (): boolean => {
    const carrier = details?.carrier || (pkg as any).carrier || '';
    return carrier.toLowerCase().includes('pick up') || carrier.toLowerCase().includes('pickup');
  };

  // ✅ Detectar si ya está pagado
  const isPaid = (): boolean => {
    return (details?.saldo_pendiente ?? 0) <= 0 && (details?.monto_pagado ?? 0) > 0;
  };

  // Determinar si es multi-guía
  const isMultiPackage = (pkg as any).is_master && ((pkg as any).total_boxes || 1) > 1;

  // 💰 Calcular costo PO Box correcto.
  // ⚠️ El backend ya calcula el precio real según la tabla pobox_tarifas_volumen
  // (basado en CBM por caja). NO debemos recalcular con tarifas hardcoded.
  // Preferimos siempre los valores del backend (pobox_venta_mxn, pobox_venta_usd).
  const calcularCostoPOBox = () => {
    if (!details) return { costoMxn: 0, costoTotal: 0, saldo: 0, totalBoxes: 1, precioUnitarioUsd: 39, tc: 18.09, nivel: 1 };

    // 🎯 Cantidad de cajas (informativo)
    let totalBoxes: number;
    if (isRepackPackage()) {
      totalBoxes = 1;
    } else {
      totalBoxes = childPackages.length > 0
        ? childPackages.length
        : (details.total_boxes || (pkg as any).total_boxes || 1);
    }

    const tc = Number(details.registered_exchange_rate) || 18.09;
    const nivel = details.pobox_tarifa_nivel || 1;

    // ✅ Costo PO Box en MXN: usar valor del backend
    const ventaMxnBackend = Number((details as any).pobox_venta_mxn) || 0;
    const ventaUsdBackend = Number((details as any).pobox_venta_usd) || 0;

    let costoPoboxMxn = ventaMxnBackend;
    let costoPoboxUsd = ventaUsdBackend;

    // Fallback solo si el backend no devolvió el dato (paquetes legacy)
    if (costoPoboxMxn <= 0) {
      const precioUnitarioFallback = TARIFAS_POBOX_USD[nivel] || 39;
      costoPoboxUsd = totalBoxes * precioUnitarioFallback;
      costoPoboxMxn = costoPoboxUsd * tc;
    } else if (costoPoboxUsd <= 0) {
      // Derivar USD desde MXN si solo viene MXN
      costoPoboxUsd = tc > 0 ? costoPoboxMxn / tc : 0;
    }

    // Precio unitario USD = total USD / cajas (para mostrar el desglose)
    const precioUnitarioUsd = totalBoxes > 0 ? costoPoboxUsd / totalBoxes : costoPoboxUsd;

    const gexTotal = Number((details as any).gex_total_cost) || 0;
    const nationalShipping = Number(details.national_shipping_cost) || 0;
    const costoTotal = costoPoboxMxn + nationalShipping + gexTotal;
    const saldo = costoTotal - (Number(details.monto_pagado) || 0);

    console.log('💰 calcularCostoPOBox:', { totalBoxes, tc, nivel, precioUnitarioUsd, costoPoboxMxn, ventaMxnBackend, gexTotal, nationalShipping, costoTotal, saldo });

    return { costoMxn: costoPoboxMxn, costoTotal, saldo, totalBoxes, precioUnitarioUsd, tc, nivel };
  };

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        console.log('📦 Fetching package details for ID:', pkg.id);
        console.log('📦 API_URL:', API_URL);
        const response = await fetch(`${API_URL}/api/packages/${pkg.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        console.log('📦 Response status:', response.status);
        console.log('📦 Response data:', JSON.stringify(data, null, 2));
        if (response.ok) {
          const packageData = data.package || data;
          console.log('📦 assigned_cost_mxn:', packageData.assigned_cost_mxn);
          console.log('📦 saldo_pendiente:', packageData.saldo_pendiente);
          setDetails(packageData);
        } else {
          // Si no hay endpoint de detalle, usar los datos del paquete con los costos que ya trae
          console.log('📦 Using fallback data from pkg');
          console.log('📦 pkg.assigned_cost_mxn:', (pkg as any).assigned_cost_mxn);
          console.log('📦 pkg.saldo_pendiente:', (pkg as any).saldo_pendiente);
          setDetails({
            ...pkg,
            assigned_cost_mxn: (pkg as any).assigned_cost_mxn || 0,
            saldo_pendiente: (pkg as any).saldo_pendiente || 0,
            monto_pagado: (pkg as any).monto_pagado || 0,
            is_master: (pkg as any).is_master,
            total_boxes: (pkg as any).total_boxes,
          } as any);
        }
        
        // Si es multi-guía, obtener los paquetes hijos
        if (isMultiPackage) {
          await fetchChildPackages();
        }
      } catch (error) {
        console.error('Error fetching package details:', error);
        setDetails({
          ...pkg,
          assigned_cost_mxn: (pkg as any).assigned_cost_mxn || 0,
          saldo_pendiente: (pkg as any).saldo_pendiente || 0,
          monto_pagado: (pkg as any).monto_pagado || 0,
        } as any);
      } finally {
        setLoading(false);
      }
    };
    
    // Obtener paquetes hijos para multi-guía
    const fetchChildPackages = async () => {
      try {
        const response = await fetch(`${API_URL}/api/packages/track/${pkg.tracking_internal}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.shipment?.children && data.shipment.children.length > 0) {
            setChildPackages(data.shipment.children);
          }
        }
      } catch (error) {
        console.error('Error fetching child packages:', error);
      }
    };

    fetchDetails();
  }, [pkg.id, token, isMultiPackage]);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'received':
        return { label: 'En Bodega', color: '#FF9800', icon: 'package-variant' };
      case 'processing':
        return { label: 'Procesando', color: PURPLE, icon: 'cog' };
      case 'in_transit':
        return { label: 'En Tránsito', color: ORANGE, icon: 'truck-delivery' };
      case 'shipped':
        return { label: 'Enviado', color: '#00BCD4', icon: 'airplane' };
      case 'delivered':
        return { label: 'Entregado', color: '#4CAF50', icon: 'check-circle' };
      default:
        return { label: status, color: '#999', icon: 'package' };
    }
  };

  const statusInfo = details ? getStatusInfo(details.status) : { label: '', color: '#999', icon: 'package' };

  const getMovementStatusLabel = (status: string, statusLabel?: string) => {
    if (statusLabel) return statusLabel;
    return getStatusInfo(status).label;
  };

  const openMovements = async () => {
    try {
      setMovementsOpen(true);
      setMovementsLoading(true);
      setMovementsError(null);

      const response = await fetch(`${API_URL}/api/packages/${pkg.id}/movements`, {
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

  // Contratar GEX para master + hijas
  const handleContractGEX = () => {
    navigation.navigate('GEXContract', {
      package: pkg,
      user,
      token,
      childPackages: childPackages.length > 0 ? childPackages : undefined,
    });
  };

  // Calcular peso total (master + hijas)
  const getTotalWeight = () => {
    if (childPackages.length > 0) {
      return childPackages.reduce((sum, child) => sum + (child.weight || 0), 0);
    }
    return details?.weight || 0;
  };

  // Calcular volumen CBM
  const getCBM = () => {
    // Usar CBM del backend si existe
    if (details?.cbm) return details.cbm;
    // Sino calcular desde dimensiones
    if (!details?.dimensions) return 0;
    
    let length = 0, width = 0, height = 0;
    
    if (typeof details.dimensions === 'string') {
      // Parsear formato "LxWxH" como "54x64x84"
      const parts = details.dimensions.toLowerCase().replace(/cm/g, '').trim().split(/x/);
      if (parts.length === 3) {
        length = parseFloat(parts[0]) || 0;
        width = parseFloat(parts[1]) || 0;
        height = parseFloat(parts[2]) || 0;
      }
    } else {
      length = details.dimensions.length || 0;
      width = details.dimensions.width || 0;
      height = details.dimensions.height || 0;
    }
    
    return (length * width * height) / 1000000; // cm³ a m³
  };

  // Calcular total a pagar (saldo pendiente)
  const calculateTotal = () => {
    return details?.saldo_pendiente || details?.assigned_cost_mxn || 0;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ORANGE} />
      </View>
    );
  }

  if (!details) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={styles.header}>
          <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
          <Appbar.Content title="Detalle del Paquete" titleStyle={styles.headerTitle} />
        </Appbar.Header>
        <View style={styles.errorContainer}>
          <Text>No se encontraron detalles del paquete</Text>
        </View>
      </View>
    );
  }

  const cbm = getCBM();
  const total = calculateTotal();

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" size={28} />
        <Appbar.Content title="Detalle del Paquete" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Imagen del paquete - Solo mostrar para paquetes individuales (no multi/repack) */}
        {!isMultiPackage && details.image_url && (
          <Image
            source={{ uri: details.image_url }}
            style={styles.packageImage}
            resizeMode="cover"
          />
        )}
        {!isMultiPackage && !details.image_url && (
          <View style={styles.noImageContainer}>
            <MaterialCommunityIcons name="camera-off" size={48} color="#ccc" />
            <Text style={styles.noImageText}>Sin foto disponible</Text>
          </View>
        )}

        {/* Info principal */}
        <Card style={styles.infoCard}>
          <Card.Content>
            <View style={styles.titleRow}>
              <View style={styles.titleInfo}>
                <View style={styles.trackingRowDetail}>
                  <Text style={styles.trackingNumber}>{details.tracking_internal}</Text>
                  {/* Badge de Multi-Guía */}
                  {isMultiPackage && (
                    <View style={styles.multiPackageBadge}>
                      <Ionicons name="layers" size={14} color="#fff" />
                      <Text style={styles.multiPackageText}>
                        {(pkg as any).total_boxes || 2} cajas
                      </Text>
                    </View>
                  )}
                </View>
                {details.tracking_provider && (
                  <Text style={styles.providerTracking}>
                    Tracking: {details.tracking_provider}
                  </Text>
                )}
              </View>
              <Chip
                style={[styles.statusChip, { backgroundColor: statusInfo.color }]}
                textStyle={styles.statusChipText}
              >
                {statusInfo.label}
              </Chip>
            </View>

            <Divider style={styles.divider} />

            <TouchableOpacity style={styles.movementsButton} onPress={openMovements}>
              <MaterialCommunityIcons name="history" size={18} color="#1976D2" />
              <Text style={styles.movementsButtonText}>Ver Movimientos</Text>
            </TouchableOpacity>

            {/* Descripción */}
            {details.description && (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="text-box-outline" size={20} color="#666" />
                <Text style={styles.infoLabel}>Descripción:</Text>
                <Text style={styles.infoValue}>{details.description}</Text>
              </View>
            )}

            {/* Peso */}
            {details.weight && (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="scale" size={20} color="#666" />
                <Text style={styles.infoLabel}>Peso:</Text>
                <Text style={styles.infoValue}>{details.weight} kg</Text>
              </View>
            )}

            {/* Dimensiones */}
            {details.dimensions && (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="cube-outline" size={20} color="#666" />
                <Text style={styles.infoLabel}>Dimensiones:</Text>
                <Text style={styles.infoValue}>
                  {(() => {
                    // Si es string en formato "LxWxH", formatearlo bien
                    if (typeof details.dimensions === 'string') {
                      const formatted = details.dimensions.replace(/x/gi, '×');
                      return formatted.includes('cm') ? formatted : `${formatted} cm`;
                    }
                    // Si es objeto con length/width/height
                    return `${details.dimensions.length || 0}×${details.dimensions.width || 0}×${details.dimensions.height || 0} cm`;
                  })()}
                </Text>
              </View>
            )}

            {/* CBM */}
            {cbm > 0 && (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="cube-scan" size={20} color="#666" />
                <Text style={styles.infoLabel}>Volumen (CBM):</Text>
                <Text style={styles.infoValue}>{cbm.toFixed(4)} m³</Text>
              </View>
            )}

            {/* Valor declarado */}
            {details.declared_value && (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="currency-usd" size={20} color="#666" />
                <Text style={styles.infoLabel}>Valor Declarado:</Text>
                <Text style={styles.infoValue}>${details.declared_value} USD</Text>
              </View>
            )}

            {/* Carrier - solo mostrar si es una paquetería real (no ubicación de bodega) */}
            {details.carrier && !['BODEGA', 'RACK', 'PISO', 'TARIMA'].includes(details.carrier?.toUpperCase?.()) && (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="truck" size={20} color="#666" />
                <Text style={styles.infoLabel}>Paquetería:</Text>
                <Text style={styles.infoValue}>{details.national_carrier || details.carrier}</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* ============================================ */}
        {/* SECCIÓN DE GUÍAS HIJAS (MULTI-GUÍA) */}
        {/* ============================================ */}
        {isMultiPackage && (
          <Card style={styles.childrenCard}>
            <Card.Content>
              <TouchableOpacity 
                style={styles.childrenHeader}
                onPress={() => setShowChildren(!showChildren)}
              >
                <View style={styles.childrenTitleRow}>
                  <Ionicons name="layers" size={22} color={PURPLE} />
                  <Text style={styles.childrenTitle}>
                    📦 Guías Incluidas ({(pkg as any).total_boxes || childPackages.length})
                  </Text>
                </View>
                <Ionicons 
                  name={showChildren ? "chevron-up" : "chevron-down"} 
                  size={24} 
                  color={PURPLE} 
                />
              </TouchableOpacity>
              
              {/* Resumen total */}
              <View style={styles.childrenSummary}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Peso Total</Text>
                  <Text style={styles.summaryValue}>{getTotalWeight().toFixed(1)} kg</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Cajas</Text>
                  <Text style={styles.summaryValue}>{(pkg as any).total_boxes || childPackages.length}</Text>
                </View>
              </View>

              {/* Lista de guías hijas */}
              {showChildren && childPackages.length > 0 && (
                <View style={styles.childrenList}>
                  {childPackages.map((child, index) => (
                    <View key={child.id} style={styles.childItem}>
                      <View style={styles.childNumber}>
                        <Text style={styles.childNumberText}>{child.boxNumber || index + 1}</Text>
                      </View>
                      <View style={styles.childInfo}>
                        <Text style={styles.childTracking}>{child.tracking}</Text>
                        {child.trackingCourier && (
                          <Text style={styles.childCourierTracking}>📦 {child.trackingCourier}</Text>
                        )}
                        <View style={styles.childStats}>
                          <Text style={styles.childStat}>⚖️ {child.weight || '--'} kg</Text>
                          {child.dimensions && (
                            <Text style={styles.childStat}>
                              📐 {child.dimensions.formatted || 
                                `${child.dimensions.length}×${child.dimensions.width}×${child.dimensions.height} cm`}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.childActions}>
                        {/* Miniatura de foto del paquete hijo */}
                        {child.imageUrl && (
                          <TouchableOpacity 
                            style={styles.childPhotoThumbnail}
                            onPress={() => setSelectedChildImage(child.imageUrl!)}
                          >
                            <Image 
                              source={{ uri: child.imageUrl }} 
                              style={styles.childThumbnailImage}
                            />
                            <View style={styles.childPhotoOverlay}>
                              <Ionicons name="expand" size={14} color="#fff" />
                            </View>
                          </TouchableOpacity>
                        )}
                        <View style={[styles.childStatusBadge, { backgroundColor: getStatusInfo(child.status).color + '20' }]}>
                          <Text style={[styles.childStatusText, { color: getStatusInfo(child.status).color }]}>
                            {getStatusInfo(child.status).label}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              
              {/* Si no hay hijos cargados pero sabemos que es master */}
              {showChildren && childPackages.length === 0 && (
                <View style={styles.childrenLoading}>
                  <Text style={styles.childrenLoadingText}>
                    Esta guía contiene {(pkg as any).total_boxes} cajas.
                  </Text>
                </View>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Servicios Contratados */}
        <Card style={styles.servicesCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>🛡️ Servicios Contratados</Text>
            <Divider style={styles.divider} />

            {/* GEX */}
            <View style={styles.serviceRow}>
              <View style={styles.serviceInfo}>
                <MaterialCommunityIcons 
                  name={details.has_gex ? "shield-check" : "shield-off-outline"} 
                  size={24} 
                  color={details.has_gex ? "#4CAF50" : "#f44336"} 
                />
                <View style={styles.serviceText}>
                  <Text style={styles.serviceName}>
                    Garantía Extendida GEX
                  </Text>
                  {details.has_gex ? (
                    <Text style={styles.serviceStatus}>
                      ✅ Contratada{details.gex_folio ? ` - Folio: ${details.gex_folio}` : ''}
                      {isMultiPackage && (isRepackPackage() 
                        ? ` • 1 caja con ${(pkg as any).total_boxes} paquetes dentro cubierta por GEX`
                        : ` • ${(pkg as any).total_boxes} cajas cubiertas`
                      )}
                    </Text>
                  ) : (
                    <Text style={[styles.serviceStatus, { color: '#f44336' }]}>
                      ❌ Sin Garantía
                      {isMultiPackage && (isRepackPackage()
                        ? ` • 1 caja con ${(pkg as any).total_boxes} paquetes sin cobertura`
                        : ` • ${(pkg as any).total_boxes} cajas sin cobertura`
                      )}
                    </Text>
                  )}
                </View>
              </View>
              {!details.has_gex && ['received', 'processing'].includes(details.status) && (
                <Button
                  mode="contained"
                  onPress={handleContractGEX}
                  style={styles.contractButton}
                  labelStyle={styles.contractButtonLabel}
                  compact
                >
                  Contratar
                </Button>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Costos */}
        <Card style={styles.costsCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>💰 Desglose de Costos</Text>
            <Divider style={styles.divider} />

            {/* 🚚 Si es Pick Up - mostrar solo el costo de Pick Up, NO servicio PO Box */}
            {isPickUpService() ? (
              <>
                {/* Para Pick Up: mostrar costo de envío nacional o el monto pagado */}
                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>🚚 Pick Up ({details.carrier})</Text>
                  <Text style={styles.costValue}>
                    ${(details.national_shipping_cost || details.monto_pagado || 0).toFixed(2)} MXN
                  </Text>
                </View>
                {/* Si ya está pagado, mostrar confirmación */}
                {isPaid() && (
                  <View style={styles.costRow}>
                    <Text style={[styles.costLabel, { color: '#4CAF50', fontWeight: '600' }]}>✅ Pagado</Text>
                    <Text style={[styles.costValue, { color: '#4CAF50' }]}>
                      ${(details.monto_pagado || 0).toFixed(2)} MXN
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <>
                {/* Precio de Venta del servicio PO Box con desglose USD y TC (solo si NO es Pick Up) */}
                {(details.pobox_venta_usd ?? details.assigned_cost_mxn ?? 0) > 0 && (
                  <>
                    <View style={styles.costRow}>
                      <Text style={styles.costLabel}>📦 Servicio PO Box</Text>
                      <Text style={styles.costValue}>
                        ${calcularCostoPOBox().costoMxn.toFixed(2)} MXN
                      </Text>
                    </View>
                    {/* 🎯 DESGLOSE POR CAJA para multi-guía */}
                    <View style={[styles.costRow, { paddingLeft: 16, marginTop: -4 }]}>
                      <Text style={[styles.costLabel, { fontSize: 12, color: '#666' }]}>
                        {(() => {
                          const { totalBoxes, precioUnitarioUsd, tc, nivel } = calcularCostoPOBox();
                          if (totalBoxes > 1) {
                            return `💵 ${totalBoxes} cajas × $${precioUnitarioUsd.toFixed(2)} USD × TC $${tc.toFixed(2)} (Nivel ${nivel})`;
                          }
                          return `💵 $${precioUnitarioUsd.toFixed(2)} USD × TC $${tc.toFixed(2)} (Nivel ${nivel})`;
                        })()}
                      </Text>
                    </View>
                  </>
                )}

                {/* Costo GEX si está contratado - desglosado */}
                {details.has_gex && (details.gex_total_cost || details.declared_value) && (
                  <>
                    <View style={styles.costRow}>
                      <Text style={[styles.costLabel, { paddingLeft: 8 }]}>• 5% Valor Asegurado (${(details.declared_value || 0).toFixed(2)} USD)</Text>
                      <Text style={styles.costValue}>${(Number(details.gex_insurance_cost) || (Number(details.declared_value) || 0) * 0.05 * (Number(details.registered_exchange_rate) || 18.09)).toFixed(2)} MXN</Text>
                    </View>
                    <View style={styles.costRow}>
                      <Text style={[styles.costLabel, { paddingLeft: 8 }]}>• Cargo Fijo GEX</Text>
                      <Text style={styles.costValue}>${(Number(details.gex_fixed_cost) || 625).toFixed(2)} MXN</Text>
                    </View>
                    <View style={styles.costRow}>
                      <Text style={[styles.costLabel, { fontWeight: '600' }]}>🛡️ Subtotal Garantía Extendida</Text>
                      <Text style={[styles.costValue, { color: ORANGE }]}>${(Number(details.gex_total_cost) || ((Number(details.declared_value) || 0) * 0.05 * (Number(details.registered_exchange_rate) || 18.09) + (Number(details.gex_fixed_cost) || 625))).toFixed(2)} MXN</Text>
                    </View>
                  </>
                )}

                {/* Costo de envío nacional (Estafeta, FedEx, etc.) - solo si NO es Pick Up */}
                {(details.national_shipping_cost ?? 0) > 0 && (
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>🚚 Envío Nacional ({details.national_carrier || 'Paquetería'})</Text>
                    <Text style={styles.costValue}>${(details.national_shipping_cost || 0).toFixed(2)} MXN</Text>
                  </View>
                )}

                {/* Monto ya pagado */}
                {(details.monto_pagado ?? 0) > 0 && (
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>✅ Monto Pagado</Text>
                    <Text style={[styles.costValue, { color: '#4CAF50' }]}>-${(details.monto_pagado || 0).toFixed(2)} MXN</Text>
                  </View>
                )}
              </>
            )}

            {/* Si no hay costos aún (y no es Pick Up pagado) */}
            {(details.assigned_cost_mxn ?? 0) === 0 && !isPaid() && (
              <View style={styles.noCostsContainer}>
                <MaterialCommunityIcons name="information-outline" size={24} color="#666" />
                <Text style={styles.noCostsText}>
                  Los costos se calcularán cuando el paquete sea procesado
                </Text>
              </View>
            )}

            {/* Saldo Pendiente / Total a Pagar */}
            {((details.assigned_cost_mxn ?? 0) > 0 || isPaid()) && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {isPaid() ? '✅ PAGADO' : 'SALDO PENDIENTE'}
                  </Text>
                  {isPaid() ? (
                    <Text style={[styles.totalValue, { color: '#4CAF50' }]}>
                      Completado
                    </Text>
                  ) : (
                    <Text style={[styles.totalValue, { color: ORANGE }]}>
                      ${(details.saldo_pendiente ?? details.assigned_cost_mxn ?? 0).toFixed(2)} MXN
                    </Text>
                  )}
                </View>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Fechas */}
        <Card style={styles.datesCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>📅 Fechas</Text>
            <Divider style={styles.divider} />

            {details.created_at && (
              <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>Recibido:</Text>
                <Text style={styles.dateValue}>
                  {new Date(details.created_at).toLocaleDateString('es-MX', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            )}

            {details.updated_at && details.updated_at !== details.created_at && (
              <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>Última actualización:</Text>
                <Text style={styles.dateValue}>
                  {new Date(details.updated_at).toLocaleDateString('es-MX', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal de movimientos de la guía */}
      <Modal
        visible={movementsOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setMovementsOpen(false)}
      >
        <View style={styles.movementsOverlay}>
          <View style={styles.movementsModal}>
            <View style={styles.movementsHeader}>
              <Text style={styles.movementsTitle}>Movimientos de la Guía</Text>
              <TouchableOpacity onPress={() => setMovementsOpen(false)}>
                <Ionicons name="close-circle" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.movementsTrackingBox}>
              <Text style={styles.movementsTrackingLabel}>Guía</Text>
              <Text style={styles.movementsTrackingValue}>{details?.tracking_internal || pkg.tracking_internal}</Text>
            </View>

            {movementsLoading && (
              <View style={styles.movementsLoadingWrap}>
                <ActivityIndicator size="large" color={ORANGE} />
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
                  <Text style={styles.movementsEmptyText}>Aún no hay movimientos registrados para esta guía.</Text>
                ) : (
                  movements.map((m, index) => (
                    <View key={`${m.id}-${index}`} style={styles.movementItem}>
                      <View style={styles.movementDot} />
                      <View style={styles.movementContent}>
                        <Text style={styles.movementStatusText}>{getMovementStatusLabel(m.status, m.status_label)}</Text>
                        {!!m.notes && <Text style={styles.movementNotesText}>{m.notes}</Text>}
                        <Text style={styles.movementDateText}>
                          {new Date(m.created_at).toLocaleString('es-MX', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                        {!!m.created_by_name && (
                          <Text style={styles.movementUserText}>Por: {m.created_by_name}</Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal para mostrar foto del paquete hijo */}
      <Modal
        visible={!!selectedChildImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedChildImage(null)}
      >
        <TouchableOpacity 
          style={styles.imageModalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedChildImage(null)}
        >
          <View style={styles.imageModalContent}>
            <TouchableOpacity 
              style={styles.imageModalClose}
              onPress={() => setSelectedChildImage(null)}
            >
              <Ionicons name="close-circle" size={36} color="#fff" />
            </TouchableOpacity>
            {selectedChildImage && (
              <Image
                source={{ uri: selectedChildImage }}
                style={styles.imageModalImage}
                resizeMode="contain"
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: BLACK,
    elevation: 4,
  },
  headerTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
  content: {
    flex: 1,
  },
  packageImage: {
    width: width,
    height: 200,
    backgroundColor: '#e0e0e0',
  },
  noImageContainer: {
    width: width,
    height: 150,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImageText: {
    color: '#999',
    marginTop: 8,
    fontSize: 14,
  },
  infoCard: {
    margin: 16,
    marginTop: -20,
    borderRadius: 12,
    elevation: 4,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  titleInfo: {
    flex: 1,
    flexShrink: 1,
  },
  trackingNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BLACK,
  },
  providerTracking: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  statusChip: {
    marginLeft: 8,
  },
  statusChipText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  divider: {
    marginVertical: 12,
    backgroundColor: '#e0e0e0',
  },
  movementsButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1976D2',
    backgroundColor: '#E3F2FD',
    marginBottom: 12,
  },
  movementsButtonText: {
    color: '#1976D2',
    fontSize: 13,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    marginRight: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
    flex: 1,
  },
  servicesCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  serviceInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    flexShrink: 1,
  },
  serviceText: {
    marginLeft: 12,
    flex: 1,
    flexShrink: 1,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
    flexWrap: 'wrap',
  },
  serviceStatus: {
    fontSize: 12,
    color: '#4CAF50',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  contractButton: {
    backgroundColor: ORANGE,
    borderRadius: 8,
    flexShrink: 0,
    minWidth: 90,
  },
  contractButtonLabel: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  costsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: '#E3F2FD',
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
  datesCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  dateLabel: {
    fontSize: 14,
    color: '#666',
  },
  dateValue: {
    fontSize: 14,
    color: BLACK,
  },
  // ============================================
  // ESTILOS PARA MULTI-GUÍA / GUÍAS HIJAS
  // ============================================
  trackingRowDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  multiPackageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PURPLE,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
    flexShrink: 0,
  },
  multiPackageText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
  },
  childrenCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: '#F3E5F5',
  },
  childrenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
  },
  childrenTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  childrenTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PURPLE,
  },
  childrenSummary: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 24,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
  },
  childrenList: {
    gap: 8,
  },
  childItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: PURPLE,
  },
  childNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PURPLE + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  childNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: PURPLE,
  },
  childInfo: {
    flex: 1,
  },
  childTracking: {
    fontSize: 13,
    fontWeight: '600',
    color: BLACK,
    marginBottom: 2,
  },
  childCourierTracking: {
    fontSize: 11,
    color: ORANGE,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  childStats: {
    flexDirection: 'row',
    gap: 12,
  },
  childStat: {
    fontSize: 11,
    color: '#666',
  },
  childStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  childStatusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  childrenLoading: {
    padding: 16,
    alignItems: 'center',
  },
  childrenLoadingText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  // ============================================
  // ESTILOS PARA FOTO DE PAQUETES HIJOS
  // ============================================
  childActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  childPhotoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PURPLE + '15',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PURPLE + '30',
  },
  childPhotoThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: PURPLE,
    position: 'relative',
  },
  childThumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  childPhotoOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderTopLeftRadius: 6,
    padding: 2,
  },
  movementsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  movementsModal: {
    height: '75%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  movementsHeader: {
    backgroundColor: ORANGE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  movementsTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  movementsTrackingBox: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  movementsTrackingLabel: {
    color: '#777',
    fontSize: 12,
  },
  movementsTrackingValue: {
    color: ORANGE,
    fontWeight: 'bold',
    fontSize: 17,
  },
  movementsLoadingWrap: {
    paddingTop: 40,
    alignItems: 'center',
  },
  movementsLoadingText: {
    marginTop: 8,
    color: '#666',
  },
  movementsErrorWrap: {
    margin: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#ef5350',
  },
  movementsErrorText: {
    color: '#c62828',
    fontSize: 13,
  },
  movementsList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  movementsEmptyText: {
    color: '#777',
    textAlign: 'center',
    marginTop: 24,
  },
  movementItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  movementDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ORANGE,
    marginTop: 6,
    marginRight: 10,
  },
  movementContent: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 10,
  },
  movementStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#222',
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
  movementUserText: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
    fontStyle: 'italic',
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageModalClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  imageModalImage: {
    width: '100%',
    height: 400,
    resizeMode: 'contain',
  },
});
