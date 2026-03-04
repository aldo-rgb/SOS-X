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
const { width } = Dimensions.get('window');

type RootStackParamList = {
  Home: { user: any; token: string };
  PackageDetail: { package: Package; user: any; token: string };
  GEXContract: { package: Package; user: any; token: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'PackageDetail'>;

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
  image_url?: string;
  has_gex?: boolean;
  gex_folio?: string;
  // Costos
  assigned_cost_mxn?: number;
  saldo_pendiente?: number;
  monto_pagado?: number;
  // Fechas
  created_at?: string;
  updated_at?: string;
}

export default function PackageDetailScreen({ navigation, route }: Props) {
  const { package: pkg, user, token } = route.params;
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<PackageDetails | null>(null);

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
          } as any);
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

    fetchDetails();
  }, [pkg.id, token]);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'received':
        return { label: 'En Bodega', color: '#FF9800', icon: 'package-variant' };
      case 'processing':
        return { label: 'Procesando', color: '#9C27B0', icon: 'cog' };
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

  const handleContractGEX = () => {
    navigation.navigate('GEXContract', {
      package: pkg,
      user,
      token,
    });
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
        {/* Imagen del paquete */}
        {details.image_url ? (
          <Image
            source={{ uri: details.image_url }}
            style={styles.packageImage}
            resizeMode="cover"
          />
        ) : (
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
                <Text style={styles.trackingNumber}>{details.tracking_internal}</Text>
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

            {/* Carrier */}
            {details.carrier && (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="truck" size={20} color="#666" />
                <Text style={styles.infoLabel}>Paquetería:</Text>
                <Text style={styles.infoValue}>{details.carrier}</Text>
              </View>
            )}
          </Card.Content>
        </Card>

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
                  <Text style={styles.serviceName}>Garantía Extendida GEX</Text>
                  {details.has_gex ? (
                    <Text style={styles.serviceStatus}>✅ Contratada{details.gex_folio ? ` - Folio: ${details.gex_folio}` : ''}</Text>
                  ) : (
                    <Text style={[styles.serviceStatus, { color: '#f44336' }]}>❌ Sin Garantía</Text>
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

            {/* Costo del servicio PO Box */}
            {(details.assigned_cost_mxn ?? 0) > 0 && (
              <View style={styles.costRow}>
                <Text style={styles.costLabel}>📦 Servicio PO Box</Text>
                <Text style={styles.costValue}>
                  ${(() => {
                    const gexRate = 0.05; // 5%
                    const gexExchange = 18.15;
                    const gexFixedFee = 625; // Cuota fija al cliente
                    const gexCost = details.has_gex && details.declared_value 
                      ? (details.declared_value * gexRate * gexExchange) + gexFixedFee
                      : 0;
                    return ((details.assigned_cost_mxn || 0) - gexCost).toFixed(2);
                  })()} MXN
                </Text>
              </View>
            )}

            {/* Costo GEX si está contratado - desglosado */}
            {details.has_gex && details.declared_value && (
              <>
                <View style={styles.costRow}>
                  <Text style={[styles.costLabel, { paddingLeft: 8 }]}>• 5% Valor Asegurado</Text>
                  <Text style={styles.costValue}>${(details.declared_value * 0.05 * 18.15).toFixed(2)} MXN</Text>
                </View>
                <View style={styles.costRow}>
                  <Text style={[styles.costLabel, { paddingLeft: 8 }]}>• Cargo Fijo GEX</Text>
                  <Text style={styles.costValue}>$625.00 MXN</Text>
                </View>
                <View style={styles.costRow}>
                  <Text style={[styles.costLabel, { fontWeight: '600' }]}>🛡️ Subtotal Garantía Extendida</Text>
                  <Text style={[styles.costValue, { color: ORANGE }]}>${((details.declared_value * 0.05 * 18.15) + 625).toFixed(2)} MXN</Text>
                </View>
              </>
            )}

            {/* Monto ya pagado */}
            {(details.monto_pagado ?? 0) > 0 && (
              <View style={styles.costRow}>
                <Text style={styles.costLabel}>✅ Monto Pagado</Text>
                <Text style={[styles.costValue, { color: '#4CAF50' }]}>-${(details.monto_pagado || 0).toFixed(2)} MXN</Text>
              </View>
            )}

            {/* Si no hay costos aún */}
            {(details.assigned_cost_mxn ?? 0) === 0 && (
              <View style={styles.noCostsContainer}>
                <MaterialCommunityIcons name="information-outline" size={24} color="#666" />
                <Text style={styles.noCostsText}>
                  Los costos se calcularán cuando el paquete sea procesado
                </Text>
              </View>
            )}

            {/* Saldo Pendiente / Total a Pagar */}
            {(details.assigned_cost_mxn ?? 0) > 0 && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {(details.saldo_pendiente ?? details.assigned_cost_mxn ?? 0) > 0 ? 'SALDO PENDIENTE' : 'PAGADO'}
                  </Text>
                  <Text style={[
                    styles.totalValue, 
                    { color: (details.saldo_pendiente ?? details.assigned_cost_mxn ?? 0) > 0 ? ORANGE : '#4CAF50' }
                  ]}>
                    ${(details.saldo_pendiente ?? details.assigned_cost_mxn ?? 0).toFixed(2)} MXN
                  </Text>
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
  },
  titleInfo: {
    flex: 1,
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
    alignItems: 'center',
  },
  serviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  serviceText: {
    marginLeft: 12,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  serviceStatus: {
    fontSize: 12,
    color: '#4CAF50',
  },
  contractButton: {
    backgroundColor: ORANGE,
    borderRadius: 8,
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
});
