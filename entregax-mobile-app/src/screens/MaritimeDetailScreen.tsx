// ============================================
// MARITIME DETAIL SCREEN
// Pantalla de detalles de embarque marítimo
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
  const [address, setAddress] = useState<Address | null>(null);

  // Obtener la dirección asignada
  useEffect(() => {
    const fetchAddress = async () => {
      if ((pkg as any).delivery_address_id) {
        try {
          const response = await fetch(`${API_URL}/api/addresses`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (response.ok) {
            const addrs = data.addresses || data || [];
            const found = addrs.find((a: Address) => a.id === (pkg as any).delivery_address_id);
            setAddress(found || null);
          }
        } catch (error) {
          console.error('Error fetching address:', error);
        }
      }
      setLoading(false);
    };

    fetchAddress();
  }, [pkg, token]);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'received_china':
        return { label: 'Recibido en China', color: '#FF9800', icon: 'package-variant' };
      case 'in_transit':
        return { label: 'Ya Zarpó', color: '#E53935', icon: 'ferry' };
      case 'at_port':
        return { label: 'En Puerto MX', color: '#2196F3', icon: 'anchor' };
      case 'customs':
        return { label: 'En Aduana', color: '#9C27B0', icon: 'file-document' };
      case 'delivered':
        return { label: 'Entregado', color: '#4CAF50', icon: 'check-circle' };
      default:
        return { label: status, color: '#999', icon: 'package' };
    }
  };

  const statusInfo = getStatusInfo(pkg.status);

  const handleEditInstructions = () => {
    navigation.navigate('DeliveryInstructions', {
      package: pkg,
      user,
      token,
    });
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
        {/* Imagen del paquete */}
        {pkg.image_url ? (
          <Image
            source={{ uri: pkg.image_url }}
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
              <Text style={styles.productName}>{pkg.description || 'Envío Marítimo'}</Text>
              <Chip 
                mode="flat" 
                style={[styles.statusChip, { backgroundColor: statusInfo.color + '20' }]}
                textStyle={{ color: statusInfo.color, fontSize: 12 }}
                icon={() => <MaterialCommunityIcons name={statusInfo.icon as any} size={14} color={statusInfo.color} />}
              >
                {statusInfo.label}
              </Chip>
            </View>

            <Text style={styles.trackingNumber}>TRN: {pkg.tracking_internal}</Text>
            
            <Divider style={styles.divider} />

            {/* Datos del embarque */}
            <View style={styles.dataGrid}>
              <View style={styles.dataItem}>
                <Ionicons name="scale-outline" size={20} color="#666" />
                <Text style={styles.dataLabel}>Peso</Text>
                <Text style={styles.dataValue}>{pkg.weight ? `${pkg.weight} kg` : '--'}</Text>
              </View>
              <View style={styles.dataItem}>
                <Ionicons name="cube-outline" size={20} color="#666" />
                <Text style={styles.dataLabel}>Volumen</Text>
                <Text style={styles.dataValue}>{(pkg as any).volume ? `${(pkg as any).volume} m³` : '--'}</Text>
              </View>
              <View style={styles.dataItem}>
                <Ionicons name="layers-outline" size={20} color="#666" />
                <Text style={styles.dataLabel}>Cajas</Text>
                <Text style={styles.dataValue}>{pkg.total_boxes || 1}</Text>
              </View>
            </View>

            {/* Contenedor y BL */}
            {((pkg as any).container_number || (pkg as any).bl_number) && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.containerInfo}>
                  {(pkg as any).container_number && (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="truck-cargo-container" size={18} color={SEA_COLOR} />
                      <Text style={styles.infoLabel}>Contenedor:</Text>
                      <Text style={styles.infoValue}>{(pkg as any).container_number}</Text>
                    </View>
                  )}
                  {(pkg as any).bl_number && (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="file-document-outline" size={18} color={SEA_COLOR} />
                      <Text style={styles.infoLabel}>BL:</Text>
                      <Text style={styles.infoValue}>{(pkg as any).bl_number}</Text>
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
                {(pkg as any).delivery_instructions && (
                  <View style={styles.instructionsBox}>
                    <Text style={styles.instructionsLabel}>Notas adicionales:</Text>
                    <Text style={styles.instructionsText}>{(pkg as any).delivery_instructions}</Text>
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

        {/* Garantía extendida */}
        {pkg.has_gex && (
          <Card style={styles.gexCard}>
            <Card.Content style={styles.gexContent}>
              <MaterialCommunityIcons name="shield-check" size={24} color="#10B981" />
              <View style={styles.gexInfo}>
                <Text style={styles.gexTitle}>Garantía Extendida Activa</Text>
                {pkg.gex_folio && <Text style={styles.gexFolio}>Folio: {pkg.gex_folio}</Text>}
              </View>
            </Card.Content>
          </Card>
        )}

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
  packageImage: {
    width: width,
    height: 220,
    backgroundColor: '#eee',
  },
  noImageContainer: {
    width: width,
    height: 180,
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
  bottomSpacer: {
    height: 30,
  },
});
