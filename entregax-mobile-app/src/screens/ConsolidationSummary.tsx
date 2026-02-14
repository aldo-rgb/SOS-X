import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Text, Button, Card, Divider, Appbar, Checkbox, IconButton } from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Package, API_URL } from '../services/api';

// Colores de marca
const ORANGE = '#F05A28';
const BLACK = '#111111';

type RootStackParamList = {
  Login: undefined;
  Home: { user: any; token: string };
  ConsolidationSummary: { selectedIds: number[]; packages: Package[]; token: string; user: any };
};

type ConsolidationSummaryProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ConsolidationSummary'>;
  route: RouteProp<RootStackParamList, 'ConsolidationSummary'>;
};

export default function ConsolidationSummary({ route, navigation }: ConsolidationSummaryProps) {
  const { packages, token, user } = route.params;
  const [loading, setLoading] = useState(false);
  
  // Estado para manejar la selección de guías
  const [selectedTrackings, setSelectedTrackings] = useState<Set<number>>(new Set(packages.map(p => p.id)));
  
  // Estado para controlar qué paquetes están expandidos (mostrar guías hijas)
  const [expandedPackages, setExpandedPackages] = useState<Set<number>>(new Set());

  // Habilitar LayoutAnimation en Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Identificar si hay una guía master (is_master = true o la primera con total_boxes > 1)
  const masterPackage = packages.find(p => p.is_master) || (packages.length > 1 ? packages[0] : null);
  const isMasterSelected = masterPackage ? selectedTrackings.has(masterPackage.id) : false;

  // Calcular totales basados en seleccionados
  const selectedPackages = packages.filter(p => selectedTrackings.has(p.id));
  const totalWeight = selectedPackages.reduce((sum, p) => sum + parseFloat(String(p.weight || 0)), 0).toFixed(2);
  // Sumar el total_boxes de cada paquete seleccionado (si no tiene, cuenta como 1)
  const totalBultos = selectedPackages.reduce((sum, p) => sum + (p.total_boxes || 1), 0);

  // Función para seleccionar/deseleccionar una guía
  const toggleTracking = (pkg: Package) => {
    const newSelected = new Set(selectedTrackings);
    
    // Si es la master, seleccionar/deseleccionar todas
    if (masterPackage && pkg.id === masterPackage.id) {
      if (isMasterSelected) {
        // Deseleccionar todas
        newSelected.clear();
      } else {
        // Seleccionar todas
        packages.forEach(p => newSelected.add(p.id));
      }
    } else {
      // Toggle individual
      if (newSelected.has(pkg.id)) {
        newSelected.delete(pkg.id);
        // Si deseleccionamos una hija, también deseleccionar la master
        if (masterPackage) newSelected.delete(masterPackage.id);
      } else {
        newSelected.add(pkg.id);
        // Verificar si ahora están todas seleccionadas para marcar la master
        const allOthersSelected = packages.filter(p => p.id !== masterPackage?.id).every(p => newSelected.has(p.id));
        if (allOthersSelected && masterPackage) {
          newSelected.add(masterPackage.id);
        }
      }
    }
    
    setSelectedTrackings(newSelected);
  };

  // Función para expandir/colapsar las guías hijas
  const toggleExpand = (pkgId: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newExpanded = new Set(expandedPackages);
    if (newExpanded.has(pkgId)) {
      newExpanded.delete(pkgId);
    } else {
      newExpanded.add(pkgId);
    }
    setExpandedPackages(newExpanded);
  };

  // Generar guías hijas basadas en total_boxes
  const generateChildTrackings = (pkg: Package) => {
    const totalBoxes = pkg.total_boxes || 1;
    const children = [];
    for (let i = 1; i <= totalBoxes; i++) {
      children.push({
        boxNumber: i,
        tracking: `${pkg.tracking_internal}-${i}/${totalBoxes}`,
        weight: pkg.weight ? (parseFloat(String(pkg.weight)) / totalBoxes).toFixed(2) : '--',
      });
    }
    return children;
  };

  // Lógica de confirmación - LLAMADA REAL AL BACKEND
  const handleConfirmOrder = async () => {
    if (selectedTrackings.size === 0) {
      Alert.alert("Error", "Selecciona al menos una guía para enviar");
      return;
    }
    
    setLoading(true);
    
    try {
      // Extraemos solo los IDs de los paquetes SELECCIONADOS
      const packageIds = Array.from(selectedTrackings);

      // LLAMADA REAL AL BACKEND
      const response = await fetch(`${API_URL}/consolidations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          packageIds: packageIds,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        Alert.alert(
          "¡Orden Recibida! 🚀",
          `Tu solicitud #${result.orderId} ha sido creada. Prepararemos tu envío.`,
          [{ text: "Entendido", onPress: () => navigation.navigate('Home', { user, token }) }]
        );
      } else {
        Alert.alert("Error", result.error || "No se pudo procesar");
      }

    } catch (error) {
      console.error('Error al crear consolidación:', error);
      Alert.alert("Error de Conexión", "Revisa tu conexión a internet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
        <Appbar.Content title="Confirmar Orden" titleStyle={styles.appbarTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <Text variant="headlineSmall" style={styles.headline}>
          📦 Resumen de Consolidación
        </Text>

        {/* LISTA DE GUÍAS/TRACKINGS */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Guías a Enviar ({packages.length})
            </Text>
            <Text style={styles.hintText}>
              {masterPackage ? '👆 Toca la guía MASTER para seleccionar todas' : ''}
            </Text>
            
            {packages.map((pkg, index) => {
              const isSelected = selectedTrackings.has(pkg.id);
              const isMaster = masterPackage && pkg.id === masterPackage.id;
              const hasMultipleBoxes = (pkg.total_boxes || 1) > 1;
              const isExpanded = expandedPackages.has(pkg.id);
              const childTrackings = hasMultipleBoxes ? generateChildTrackings(pkg) : [];
              
              return (
                <View key={pkg.id}>
                  <View style={[
                    styles.trackingItem,
                    isMaster && styles.masterItem,
                    isSelected && styles.trackingItemSelected
                  ]}>
                    <Checkbox
                      status={isSelected ? 'checked' : 'unchecked'}
                      onPress={() => toggleTracking(pkg)}
                      color={ORANGE}
                    />
                    <TouchableOpacity 
                      style={styles.trackingInfo}
                      onPress={() => hasMultipleBoxes ? toggleExpand(pkg.id) : toggleTracking(pkg)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.trackingHeader}>
                        <Text style={[styles.trackingDescription, isMaster && styles.masterText]}>
                          {pkg.description}
                        </Text>
                        {isMaster && (
                          <View style={styles.masterBadge}>
                            <Text style={styles.masterBadgeText}>MASTER</Text>
                          </View>
                        )}
                        {hasMultipleBoxes && (
                          <View style={styles.boxCountBadge}>
                            <Text style={styles.boxCountText}>{pkg.total_boxes} bultos</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.trackingNumber}>
                        TRN: {pkg.tracking_internal} | {pkg.weight || '--'} kg
                      </Text>
                      {pkg.tracking_provider && (
                        <Text style={styles.providerTracking}>
                          Guía Proveedor: {pkg.tracking_provider}
                        </Text>
                      )}
                      {hasMultipleBoxes && (
                        <Text style={styles.expandHint}>
                          {isExpanded ? '▲ Ocultar guías hijas' : '▼ Ver guías hijas'}
                        </Text>
                      )}
                    </TouchableOpacity>
                    {hasMultipleBoxes && (
                      <IconButton
                        icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={24}
                        onPress={() => toggleExpand(pkg.id)}
                        iconColor={ORANGE}
                      />
                    )}
                  </View>
                  
                  {/* GUÍAS HIJAS EXPANDIBLES */}
                  {isExpanded && hasMultipleBoxes && (
                    <View style={styles.childTrackingsContainer}>
                      {childTrackings.map((child, childIndex) => (
                        <View key={child.boxNumber} style={styles.childTrackingItem}>
                          <View style={styles.childConnector}>
                            <View style={styles.connectorLine} />
                            <View style={styles.connectorDot} />
                          </View>
                          <View style={styles.childTrackingInfo}>
                            <Text style={styles.childTrackingNumber}>
                              📦 Bulto {child.boxNumber} de {pkg.total_boxes}
                            </Text>
                            <Text style={styles.childTrackingDetail}>
                              Guía: {child.tracking}
                            </Text>
                            <Text style={styles.childTrackingWeight}>
                              Peso estimado: {child.weight} kg
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                  
                  {index < packages.length - 1 && <Divider style={styles.itemDivider} />}
                </View>
              );
            })}
          </Card.Content>
        </Card>

        {/* TARJETA DE TOTALES */}
        <Card style={styles.totalsCard}>
          <Card.Content>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Número de Bultos:</Text>
              <Text style={styles.rowValue}>{totalBultos}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Peso Total:</Text>
              <Text style={styles.rowValue}>{totalWeight} kg</Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.rowLabelMuted}>Tipo de Servicio:</Text>
              <Text style={styles.rowValueOrange}>
                {selectedPackages[0]?.service_type === 'POBOX_USA' || selectedPackages[0]?.warehouse_location === 'usa_pobox'
                  ? 'TRASLADO A MÉXICO' 
                  : selectedPackages[0]?.service_type === 'SEA_CHN_MX' || selectedPackages[0]?.warehouse_location === 'china_sea'
                    ? 'MARÍTIMO CHINA → MÉXICO'
                    : 'AÉREO TODO INCLUIDO'}
              </Text>
            </View>
            <Text style={styles.disclaimer}>
              *El costo final se calculará al procesar el envío.
            </Text>
          </Card.Content>
        </Card>

        {/* INFO ADICIONAL */}
        <Card style={[styles.card, { marginTop: 16 }]}>
          <Card.Content>
            <Text variant="titleSmall" style={{ marginBottom: 8 }}>📋 Información Importante</Text>
            <Text style={styles.infoText}>
              • Tu envío saldrá en el próximo vuelo disponible
            </Text>
            <Text style={styles.infoText}>
              • Recibirás notificación cuando despegue
            </Text>
            <Text style={styles.infoText}>
              • Tiempo estimado de entrega: 3-5 días hábiles
            </Text>
          </Card.Content>
        </Card>

      </ScrollView>

      {/* BOTÓN FINAL DE CONFIRMACIÓN */}
      <View style={styles.footer}>
        <Button 
          mode="contained" 
          onPress={handleConfirmOrder} 
          loading={loading}
          disabled={loading}
          buttonColor={ORANGE}
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
        >
          {loading ? 'PROCESANDO...' : 'CONFIRMAR ENVÍO'}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F4F6F8' 
  },
  appbar: {
    backgroundColor: BLACK,
    elevation: 0,
  },
  appbarTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  headline: {
    fontWeight: 'bold',
    marginBottom: 20,
    color: BLACK,
  },
  card: { 
    backgroundColor: 'white',
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: 5,
    fontWeight: '600',
  },
  hintText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  trackingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  trackingItemSelected: {
    backgroundColor: 'rgba(240, 90, 40, 0.05)',
  },
  masterItem: {
    backgroundColor: 'rgba(240, 90, 40, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
    marginLeft: -4,
    paddingLeft: 8,
  },
  trackingInfo: {
    flex: 1,
    marginLeft: 8,
  },
  trackingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  trackingDescription: {
    fontWeight: '500',
    fontSize: 14,
    color: BLACK,
  },
  masterText: {
    fontWeight: '700',
    color: ORANGE,
  },
  masterBadge: {
    backgroundColor: ORANGE,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  masterBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  boxCountBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  boxCountText: {
    color: '#1976D2',
    fontSize: 10,
    fontWeight: 'bold',
  },
  expandHint: {
    fontSize: 11,
    color: ORANGE,
    marginTop: 6,
    fontWeight: '500',
  },
  childTrackingsContainer: {
    marginLeft: 40,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 8,
  },
  childTrackingItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  childConnector: {
    width: 20,
    alignItems: 'center',
    marginRight: 8,
  },
  connectorLine: {
    position: 'absolute',
    width: 2,
    height: '100%',
    backgroundColor: '#DDD',
    left: 9,
    top: 0,
  },
  connectorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ORANGE,
    marginTop: 5,
  },
  childTrackingInfo: {
    flex: 1,
  },
  childTrackingNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: BLACK,
  },
  childTrackingDetail: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  childTrackingWeight: {
    fontSize: 11,
    color: '#888',
    marginTop: 1,
  },
  trackingNumber: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  providerTracking: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  itemDivider: {
    marginVertical: 4,
  },
  listTitle: {
    fontWeight: '500',
    fontSize: 14,
  },
  listDescription: {
    fontSize: 12,
    color: '#666',
  },
  checkIcon: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  totalsCard: {
    marginTop: 16,
    backgroundColor: BLACK,
    borderRadius: 12,
  },
  row: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 8,
  },
  rowLabel: {
    color: 'white',
    fontSize: 15,
  },
  rowValue: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
  },
  rowLabelMuted: {
    color: '#aaa',
    fontSize: 14,
  },
  rowValueOrange: {
    color: ORANGE,
    fontWeight: 'bold',
    fontSize: 14,
  },
  divider: {
    backgroundColor: '#444',
    marginVertical: 12,
  },
  disclaimer: {
    color: '#777',
    fontSize: 11,
    marginTop: 8,
  },
  infoText: {
    color: '#555',
    fontSize: 13,
    marginBottom: 6,
  },
  footer: { 
    padding: 16,
    paddingBottom: 30,
    backgroundColor: 'white',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonContent: {
    height: 55,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
