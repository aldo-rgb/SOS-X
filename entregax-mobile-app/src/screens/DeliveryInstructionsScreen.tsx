// ============================================
// DELIVERY INSTRUCTIONS SCREEN
// Pantalla para asignar instrucciones de entrega a paquetes marítimos
// ============================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  Dimensions,
  FlatList,
} from 'react-native';
import {
  Appbar,
  Card,
  ActivityIndicator,
  RadioButton,
  Button,
  Divider,
  Chip,
  TextInput,
  IconButton,
} from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API_URL, Package } from '../services/api';

// ============================================
// CONFIGURACIÓN DE CAJA DE REEMPAQUE
// ============================================
const REPACK_BOX = {
  length: 40, // cm
  width: 40,  // cm
  height: 50, // cm
  volume: 80000, // cm³
  maxWeight: 50, // kg
  efficiency: 0.80, // 80% eficiencia
  maxUsableVolume: 64000, // 80000 * 0.80
  volumetricWeight: 16, // 80000 / 5000
  serviceCostUSD: 10.00, // Costo de servicio
};

// Interface para validación de reempaque
interface RepackValidation {
  isValid: boolean;
  errors: string[];
  packages: RepackPackageInfo[];
  totals: {
    weight: number;
    volume: number;
    count: number;
  };
}

interface RepackPackageInfo {
  id: number;
  tracking: string;
  isMaster: boolean;
  weight: number;
  dimensions: { length: number; width: number; height: number };
  volume: number;
  hasChildren: boolean;
  children?: RepackPackageInfo[];
  errors: string[];
  isValid: boolean;
}

const ORANGE = '#F05A28';
const BLACK = '#111111';
const SEA_COLOR = '#0097A7';

type RootStackParamList = {
  Home: { user: any; token: string };
  DeliveryInstructions: { package: Package; packages?: Package[]; user: any; token: string };
  MyAddresses: { user: any; token: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryInstructions'>;

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
  is_default: boolean;
}

// Helper para parsear dimensiones y calcular CBM
const parseDimensions = (pkg: any): { length: number; width: number; height: number; cbm: number } => {
  let length = 0, width = 0, height = 0;
  
  // Intentar obtener dimensiones de diferentes fuentes
  if (pkg.pkg_length && pkg.pkg_width && pkg.pkg_height) {
    length = parseFloat(pkg.pkg_length) || 0;
    width = parseFloat(pkg.pkg_width) || 0;
    height = parseFloat(pkg.pkg_height) || 0;
  } else if (pkg.dimensions && typeof pkg.dimensions === 'string') {
    // Parsear formato "30 × 20 × 15 cm" o "30x20x15"
    const match = pkg.dimensions.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      length = parseFloat(match[1]) || 0;
      width = parseFloat(match[2]) || 0;
      height = parseFloat(match[3]) || 0;
    }
  } else if (pkg.dimensions_obj) {
    length = pkg.dimensions_obj.length || 0;
    width = pkg.dimensions_obj.width || 0;
    height = pkg.dimensions_obj.height || 0;
  }
  
  // Calcular CBM (dimensiones en cm → m³)
  const cbm = (length * width * height) / 1000000;
  
  return { length, width, height, cbm };
};

// Helper para formatear dimensiones como texto
const formatDimensions = (pkg: any): string => {
  const { length, width, height } = parseDimensions(pkg);
  if (length > 0 && width > 0 && height > 0) {
    return `${length}×${width}×${height}`;
  }
  return '—';
};

// Helper para obtener CBM de un paquete
const getPackageCBM = (pkg: any): number => {
  // Primero intentar con volume si existe
  if (pkg.volume && pkg.volume > 0) return pkg.volume;
  
  // Si no, calcular desde dimensiones
  const { cbm } = parseDimensions(pkg);
  return cbm;
};

export default function DeliveryInstructionsScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { package: pkg, packages: multiplePackages, user, token, isChangingFromPickup } = route.params as any;
  
  // Usar múltiples paquetes si vienen, si no usar el paquete único
  // ⚠️ Memoizado para evitar nueva referencia en cada render (causaba loop de fetches y AbortError)
  const allPackages = useMemo(
    () => (multiplePackages && multiplePackages.length > 0 ? multiplePackages : [pkg]),
    [multiplePackages, pkg]
  );
  const isMultiple = allPackages.length > 1;
  
  // Función helper para detectar si un paquete es REPACK (consolidación)
  const isRepackPackage = (p: any): boolean => {
    const tracking = p.tracking_internal || p.tracking || '';
    return tracking.startsWith('US-REPACK-') || tracking.includes('-REPACK-');
  };
  
  // Detectar si hay paquetes con child_packages (multi-paquetes)
  // NOTA: Los REPACK tienen child_packages pero son 1 sola caja física
  const hasMultiPackages = allPackages.some((p: any) => 
    (p.child_packages?.length || 0) > 0 && !isRepackPackage(p)
  );
  
  // Determinar tipo de envío para mostrar ícono correcto
  const shipmentType = (pkg as any).shipment_type;
  const getShipmentIcon = (): 'boat' | 'airplane' | 'car' | 'cube' => {
    if (shipmentType === 'maritime') return 'boat';
    if (shipmentType === 'china_air') return 'airplane';
    if (shipmentType === 'dhl') return 'car';
    if (shipmentType === 'air' || shipmentType === 'usa' || shipmentType === 'pobox') return 'cube'; // PO Box USA = caja
    return 'cube'; // default = caja
  };
  const shipmentIcon = getShipmentIcon();
  
  // Verificar si ya tiene instrucciones asignadas (modo edición)
  const hasExistingInstructions = !!(pkg as any).delivery_address_id;
  
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(
    hasExistingInstructions ? (pkg as any).delivery_address_id : null
  );
  const [additionalNotes, setAdditionalNotes] = useState(
    hasExistingInstructions ? ((pkg as any).delivery_instructions || '') : ''
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [containerEta, setContainerEta] = useState<string | null>(null);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  
  // ============================================
  // ESTADOS PARA MODAL DE REEMPAQUE
  // ============================================
  const [repackModalVisible, setRepackModalVisible] = useState(false);
  const [repackLoading, setRepackLoading] = useState(false);
  const [repackValidation, setRepackValidation] = useState<RepackValidation | null>(null);
  const [packagesToRepack, setPackagesToRepack] = useState<any[]>([...allPackages]);
  const [repackSuccessVisible, setRepackSuccessVisible] = useState(false);

  // ============================================
  // OPCIONES DE PAQUETERÍA
  // ============================================
  interface CarrierOption {
    id: string;
    name: string;
    logo?: string;
    price: number;
    currency?: 'MXN' | 'USD'; // Moneda del precio (default MXN)
    estimatedDays: string;
    isExternal: boolean; // true = Skydropx, false = interno
    skydropxCarrierId?: string; // ID del carrier en Skydropx
  }

  // Pickup en Sucursal Hidalgo TX solo aplica a guías de PO Box USA
  const isPOBoxUS = !shipmentType || shipmentType === 'air' || shipmentType === 'usa' || shipmentType === 'pobox';

  // 🗺️ Helpers de zona por código postal
  // - MTY metro (AMM): C.P. que empiezan en 64, 65, 66, 67
  // - CDMX + Zona Metropolitana del Valle de México: 01-16 (CDMX) y 50-57 (Edomex metro)
  const isMtyMetroZip = (zip?: string | null): boolean => {
    const z = String(zip || '').trim();
    if (!/^\d{4,5}$/.test(z)) return false;
    const padded = z.padStart(5, '0');
    return ['64', '65', '66', '67'].includes(padded.substring(0, 2));
  };
  const isCdmxMetroZip = (zip?: string | null): boolean => {
    const z = String(zip || '').trim();
    if (!/^\d{4,5}$/.test(z)) return false;
    const padded = z.padStart(5, '0');
    const p2 = padded.substring(0, 2);
    // CDMX: 01-16 + Edomex zona conurbada 50-57
    return [
      '01','02','03','04','05','06','07','08','09',
      '10','11','12','13','14','15','16',
      '50','51','52','53','54','55','56','57'
    ].includes(p2);
  };

  // 📍 Obtener ZIP de la dirección seleccionada (se calcula después de cargar addresses)
  const selectedZip = (() => {
    if (!selectedAddressId) return null;
    const a = addresses.find(addr => addr.id === selectedAddressId);
    return a?.zip_code || null;
  })();
  const inMtyMetro = isMtyMetroZip(selectedZip);
  const inCdmxMetro = isCdmxMetroZip(selectedZip);

  // Reglas de paquetería local Entregax por tipo de envío + ZIP destino:
  //  - MTY metro      → solo Entregax Local MTY
  //  - CDMX metro     → solo Entregax Local CDMX
  //  - Fuera de ambas → ninguna local (solo Paquete Express)
  // Además se respeta la disponibilidad por shipment_type:
  //  - Marítimo: solo CDMX disponible
  //  - Aéreo China: CDMX y MTY disponibles
  //  - USA / PO Box / DHL / otros: solo MTY disponible
  const localEntregaxOptions: CarrierOption[] = (() => {
    const cdmx: CarrierOption = {
      id: 'entregax_local_cdmx',
      name: 'EntregaX Local CDMX',
      price: 0,
      estimatedDays: '1-3 días hábiles',
      isExternal: false,
    };
    const mty: CarrierOption = {
      id: 'entregax_local_mty',
      name: 'EntregaX Local MTY',
      price: 0,
      estimatedDays: '1-3 días hábiles',
      isExternal: false,
    };

    // Disponibilidad por tipo de envío
    let available: CarrierOption[];
    if (shipmentType === 'maritime') available = [cdmx];
    else if (shipmentType === 'china_air') available = [cdmx, mty];
    else available = [mty];

    // Si aún no hay ZIP seleccionado, mostramos todas las disponibles del tipo
    if (!selectedZip) return available;

    // Filtro por zona del ZIP destino
    return available.filter(opt => {
      if (opt.id === 'entregax_local_cdmx') return inCdmxMetro;
      if (opt.id === 'entregax_local_mty') return inMtyMetro;
      return true;
    });
  })();

  const CARRIER_OPTIONS: CarrierOption[] = [
    ...localEntregaxOptions,
    // 💰 Paquete Express POR COBRAR — el destinatario paga al recibir
    //    NO aplica para paquetes aéreos (china_air)
    ...(shipmentType !== 'china_air' ? [{
      id: 'paquete_express_pc',
      name: 'Por Cobrar',
      price: 0,
      currency: 'MXN' as const,
      estimatedDays: 'Pagas al recibir · 2-4 días hábiles',
      isExternal: false,
    }] : []),
    ...(isPOBoxUS ? [{
      id: 'pickup_hidalgo',
      name: 'Pick Up: Sucursal Hidalgo TX',
      price: 3,
      currency: 'USD' as const,
      estimatedDays: 'Recoger en bodega',
      isExternal: false,
    }] : []),
    // paquete_express se carga dinámicamente desde la API con cotización PQTX
  ];

  const [selectedCarrier, setSelectedCarrier] = useState<string>(localEntregaxOptions[0]?.id || 'entregax_local');
  const [loadingCarrierRates, setLoadingCarrierRates] = useState(false);
  const [carrierRates, setCarrierRates] = useState<CarrierOption[]>(CARRIER_OPTIONS);

  // 🔁 Si el carrier seleccionado deja de estar disponible (p.ej. al cambiar el ZIP), elegir el primero válido
  useEffect(() => {
    const inMetro = inMtyMetro || inCdmxMetro;
    const validIds = new Set(
      CARRIER_OPTIONS
        .filter(c => !(inMetro && (c.id === 'paquete_express' || c.id === 'paquete_express_pc')))
        .map(c => c.id)
    );
    if (!validIds.has(selectedCarrier)) {
      const fallback = [...validIds][0];
      if (fallback) setSelectedCarrier(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZip, shipmentType, inMtyMetro, inCdmxMetro]);

  // Estado para expandir paquetes master y ver sus hijos
  const [expandedPackages, setExpandedPackages] = useState<Set<number>>(new Set());

  // Toggle para expandir/colapsar un paquete master
  const togglePackageExpanded = (packageId: number) => {
    setExpandedPackages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(packageId)) {
        newSet.delete(packageId);
      } else {
        newSet.add(packageId);
      }
      return newSet;
    });
  };

  // Calcular el total real de cajas físicas
  // NOTA: REPACK = 1 caja (consolidación), Multi-guía normal = N cajas
  const getTotalBoxes = (): number => {
    return allPackages.reduce((total, pkg) => {
      // Si es REPACK, siempre es 1 caja física (aunque tenga child_packages)
      if (isRepackPackage(pkg)) {
        return total + 1;
      }
      // Si tiene child_packages (multi-guía normal), contar esos
      const childCount = pkg.child_packages?.length || 0;
      return total + (childCount > 0 ? childCount : 1);
    }, 0);
  };

  // Obtener el costo del carrier seleccionado (multiplicado por número de cajas)
  // ⚠️ En TDI Aéreo China, "Paquete Express" está INCLUIDO en el flete aéreo,
  //    por lo que el costo se descuenta a 0 en el total a pagar.
  const getSelectedCarrierCost = (): number => {
    const carrier = carrierRates.find(c => c.id === selectedCarrier);
    if (shipmentType === 'china_air' && selectedCarrier === 'paquete_express') return 0;
    const pricePerBox = carrier?.price || 0;
    return pricePerBox * getTotalBoxes();
  };

  // Costo bruto antes de descuento por inclusión (para mostrar el descuento en el resumen)
  const getSelectedCarrierGrossCost = (): number => {
    const carrier = carrierRates.find(c => c.id === selectedCarrier);
    const pricePerBox = carrier?.price || 0;
    return pricePerBox * getTotalBoxes();
  };
  const isCarrierIncludedInFreight = (): boolean =>
    shipmentType === 'china_air' && selectedCarrier === 'paquete_express';

  // Obtener la moneda del carrier seleccionado
  const getSelectedCarrierCurrency = (): string => {
    const carrier = carrierRates.find(c => c.id === selectedCarrier);
    return carrier?.currency || 'MXN';
  };

  // Función para obtener tarifas de paquetería (incluye Skydropx si está activo)
  // NOTA: Activar esta función cuando se configure SKYDROPX_ENABLED=true en el backend
  const fetchShippingRates = useCallback(async () => {
    setLoadingCarrierRates(true);
    try {
      const selectedAddress = addresses.find(a => a.id === selectedAddressId);
      if (!selectedAddress) {
        // Si no hay dirección, usar opciones locales por defecto
        setCarrierRates(CARRIER_OPTIONS);
        return;
      }
      
      // Calcular peso y dimensiones totales
      const totalWeight = allPackages.reduce((sum, p) => sum + (p.weight || 1), 0);
      const avgDimensions = {
        length: 30,
        width: 30,
        height: 30,
      };
      // Usar dimensiones del primer paquete si están disponibles
      if (allPackages.length > 0) {
        const dims = parseDimensions(allPackages[0]);
        if (dims.length > 0) avgDimensions.length = dims.length;
        if (dims.width > 0) avgDimensions.width = dims.width;
        if (dims.height > 0) avgDimensions.height = dims.height;
      }

      const quoteController = new AbortController();
      const quoteTimeout = setTimeout(() => quoteController.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(`${API_URL}/api/shipping/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            zipCode: selectedAddress.zip_code,
            city: selectedAddress.city,
            state: selectedAddress.state,
            weight: totalWeight,
            dimensions: avgDimensions,
            packageCount: allPackages.length,
          }),
          signal: quoteController.signal,
        });
      } finally {
        clearTimeout(quoteTimeout);
      }
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.options) {
          // Mapear opciones del API (incluye paquete_express con precio dinámico)
          const apiRates: CarrierOption[] = data.options
            .filter((opt: any) => opt.id !== 'entregax_local') // No duplicar entregax_local
            .map((opt: any) => ({
              id: opt.id,
              name: opt.name,
              price: opt.pricePerBox || opt.price,
              currency: opt.currency || 'MXN',
              estimatedDays: opt.estimatedDays,
              isExternal: opt.isExternal || false,
            }));
          // Combinar: opciones locales + opciones del API
          setCarrierRates([...CARRIER_OPTIONS, ...apiRates]);
          console.log(`[SHIPPING] Loaded ${apiRates.length} carrier options from API`);
        } else {
          // No hay opciones del API, mantener locales
          setCarrierRates(CARRIER_OPTIONS);
        }
      } else {
        // Si falla el API, usar opciones locales
        console.warn('[SHIPPING] API failed, using local options');
        setCarrierRates(CARRIER_OPTIONS);
      }
    } catch (error) {
      console.error('[SHIPPING] Error fetching rates:', error);
      // Usar opciones locales por defecto
      setCarrierRates(CARRIER_OPTIONS);
    } finally {
      setLoadingCarrierRates(false);
    }
  }, [addresses, selectedAddressId, allPackages, token]);

  // Cargar tarifas de paquetería cuando se selecciona dirección
  useEffect(() => {
    if (selectedAddressId) {
      fetchShippingRates();
    }
  }, [selectedAddressId, fetchShippingRates]);

  // Obtener direcciones del usuario
  const fetchAddresses = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API_URL}/api/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const data = await response.json();
      if (response.ok) {
        const addrs = data.addresses || data || [];
        setAddresses(addrs);
        // Si no hay dirección seleccionada (nueva asignación), seleccionar la default
        if (!selectedAddressId) {
          const defaultAddr = addrs.find((a: Address) => a.is_default);
          if (defaultAddr) {
            setSelectedAddressId(defaultAddr.id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching addresses:', error);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Estado para almacenar costos individuales por paquete
  const [packageCosts, setPackageCosts] = useState<{ [key: number]: number }>({});
  const [exchangeRate, setExchangeRate] = useState<number>(18.09); // TC por defecto

  // TARIFAS PO BOX USA en USD (igual que PackageDetailScreen)
  const TARIFAS_POBOX_USD: { [key: number]: number } = { 1: 39, 2: 79, 3: 750 };

  // Función para calcular nivel de tarifa basado en CBM
  const getNivelTarifa = (cbm: number): number => {
    if (cbm <= 0.05) return 1;
    if (cbm < 0.10) return 2;
    return 3;
  };

  // Calcular costo PO Box por paquete individual
  const calcularCostoPOBoxPorPaquete = (cbm: number, tc: number): number => {
    const nivel = getNivelTarifa(cbm);
    const tarifaUSD = TARIFAS_POBOX_USD[nivel];
    if (nivel === 3) {
      // Nivel 3: $750 USD/m³
      return cbm * tarifaUSD * tc;
    }
    // Nivel 1 y 2: precio fijo
    return tarifaUSD * tc;
  };

  // Calcular costo estimado basado en el tipo de envío
  const calculateCost = useCallback(async () => {
    try {
      // Detectar si es PO Box USA
      const isPOBoxUSA = shipmentType === 'usa' || 
                          (pkg as any).service_type === 'POBOX_USA' ||
                          allPackages.some(p => (p as any).service_type === 'POBOX_USA');
      
      if (isPOBoxUSA) {
        // Obtener tipo de cambio del API
        let tc = 18.09;
        try {
          const tcResponse = await fetch(`${API_URL}/api/exchange-rate`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (tcResponse.ok) {
            const tcData = await tcResponse.json();
            tc = tcData.rate || 18.09;
            setExchangeRate(tc);
          }
        } catch (e) {
          console.log('Usando TC por defecto:', tc);
        }

        // Calcular costo por cada paquete individualmente
        const costs: { [key: number]: number } = {};
        let totalCost = 0;

        for (const p of allPackages) {
          // Usar el helper para calcular CBM
          let cbm = getPackageCBM(p);
          // Para PO Box, si no hay CBM usar nivel 1 como default
          if (cbm <= 0) cbm = 0.01;
          
          const cost = calcularCostoPOBoxPorPaquete(cbm, tc);
          costs[p.id] = cost;
          totalCost += cost;
        }

        setPackageCosts(costs);
        setEstimatedCost(totalCost);
      } else {
        // Marítimo - usar endpoint original
        const totalVolume = allPackages.reduce((sum, p) => sum + getPackageCBM(p), 0);
        const totalWeight = allPackages.reduce((sum, p) => sum + (p.weight || 0), 0);
        
        const costController = new AbortController();
        const costTimeout = setTimeout(() => costController.abort(), 15000);
        let response: Response;
        try {
          response = await fetch(`${API_URL}/api/maritime/calculate-cost`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}` 
            },
            body: JSON.stringify({ volume: totalVolume, weight: totalWeight }),
            signal: costController.signal,
          });
        } finally {
          clearTimeout(costTimeout);
        }
        
        if (response.ok) {
          const data = await response.json();
          setEstimatedCost(data.estimatedCost);
          // Dividir el costo entre los paquetes
          const costPerPackage = data.estimatedCost / allPackages.length;
          const costs: { [key: number]: number } = {};
          allPackages.forEach(p => costs[p.id] = costPerPackage);
          setPackageCosts(costs);
        }
      }
    } catch (error: any) {
      // AbortError es esperado cuando el usuario navega o se re-renderiza el componente
      if (error?.name !== 'AbortError') {
        console.error('Error calculating cost:', error);
      }
    }
  }, [allPackages, token, shipmentType, pkg]);

  // ============================================
  // ALGORITMO DE REEMPAQUE
  // ============================================
  
  // Función para ordenar dimensiones (para verificar si cabe rotado)
  const sortDimensions = (l: number, w: number, h: number): number[] => {
    return [l, w, h].sort((a, b) => a - b);
  };
  
  // Verificar si un paquete cabe físicamente en la caja de reempaque
  const fitsDimensionally = (dims: { length: number; width: number; height: number }): boolean => {
    const sorted = sortDimensions(dims.length, dims.width, dims.height);
    const boxSorted = sortDimensions(REPACK_BOX.length, REPACK_BOX.width, REPACK_BOX.height);
    return sorted[0] <= boxSorted[0] && sorted[1] <= boxSorted[1] && sorted[2] <= boxSorted[2];
  };
  
  // Obtener detalles completos de un paquete (incluyendo hijos)
  const fetchPackageDetails = async (pkgId: number): Promise<RepackPackageInfo | null> => {
    try {
      // Encontrar el paquete en la lista actual
      const currentPkg = allPackages.find(p => p.id === pkgId);
      if (!currentPkg) return null;
      
      const tracking = currentPkg.tracking_internal;
      
      // Intentar obtener dimensiones del paquete actual primero
      let pkgDims = { length: 30, width: 20, height: 15 }; // Default
      
      // Parsear dimensiones si vienen como string "30 × 20 × 15 cm"
      if ((currentPkg as any).dimensions && typeof (currentPkg as any).dimensions === 'string') {
        const dimMatch = (currentPkg as any).dimensions.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/i);
        if (dimMatch) {
          pkgDims = {
            length: parseFloat(dimMatch[1]) || 30,
            width: parseFloat(dimMatch[2]) || 20,
            height: parseFloat(dimMatch[3]) || 15,
          };
        }
      } else if ((currentPkg as any).dimensions_obj) {
        pkgDims = (currentPkg as any).dimensions_obj;
      } else if ((currentPkg as any).pkg_length) {
        pkgDims = {
          length: parseFloat((currentPkg as any).pkg_length) || 30,
          width: parseFloat((currentPkg as any).pkg_width) || 20,
          height: parseFloat((currentPkg as any).pkg_height) || 15,
        };
      }
      
      // Buscar por tracking para obtener detalles completos (incluye hijos)
      try {
        const response = await fetch(`${API_URL}/api/packages/track/${tracking}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          const shipment = data.shipment;
          const children = shipment?.children || [];
          
          // Verificar si es master con hijos
          if (shipment?.master?.isMaster && children.length > 0) {
            const childInfos: RepackPackageInfo[] = [];
            let allChildrenValid = true;
            const errors: string[] = [];
            
            for (const child of children) {
              const childDims = child.dimensions || { length: 30, width: 20, height: 15 };
              const childVolume = childDims.length * childDims.width * childDims.height;
              const childFits = fitsDimensionally(childDims);
              const childErrors: string[] = [];
              
              if (!childFits) {
                childErrors.push(`Caja ${child.boxNumber} (${childDims.length}x${childDims.width}x${childDims.height} cm) no cabe en la caja de reempaque`);
                allChildrenValid = false;
              }
              
              childInfos.push({
                id: child.id,
                tracking: child.tracking,
                isMaster: false,
                weight: child.weight || 0,
                dimensions: childDims,
                volume: childVolume,
                hasChildren: false,
                errors: childErrors,
                isValid: childFits,
              });
            }
            
            if (!allChildrenValid) {
              errors.push('Una o más cajas hijas no caben en la caja de reempaque. Debe reempacar la guía completa o sacarla.');
            }
            
            const totalChildVolume = childInfos.reduce((sum, c) => sum + c.volume, 0);
            
            return {
              id: pkgId,
              tracking: tracking,
              isMaster: true,
              weight: currentPkg?.weight || 0,
              dimensions: pkgDims,
              volume: totalChildVolume,
              hasChildren: true,
              children: childInfos,
              errors,
              isValid: allChildrenValid,
            };
          }
        }
      } catch (fetchError) {
        console.log('No se pudo obtener detalles adicionales del paquete, usando datos locales');
      }
      
      // Paquete simple (sin hijos o no se pudieron obtener)
      const volume = pkgDims.length * pkgDims.width * pkgDims.height;
      const fits = fitsDimensionally(pkgDims);
      const errors: string[] = [];
      
      if (!fits) {
        errors.push(`El paquete (${pkgDims.length}x${pkgDims.width}x${pkgDims.height} cm) no cabe en la caja de reempaque (40x40x50 cm)`);
      }
      
      return {
        id: pkgId,
        tracking: tracking,
        isMaster: false,
        weight: currentPkg?.weight || 0,
        dimensions: pkgDims,
        volume,
        hasChildren: false,
        errors,
        isValid: fits,
      };
    } catch (error) {
      console.error('Error fetching package details:', error);
      return null;
    }
  };
  
  // Validar reempaque completo
  const validateRepack = async (packages: any[]): Promise<RepackValidation> => {
    const packageInfos: RepackPackageInfo[] = [];
    let totalWeight = 0;
    let totalVolume = 0;
    const allErrors: string[] = [];
    
    // Obtener información detallada de cada paquete
    for (const pkg of packages) {
      const info = await fetchPackageDetails(pkg.id);
      if (info) {
        packageInfos.push(info);
        
        if (info.hasChildren && info.children) {
          // Sumar peso y volumen de hijos
          for (const child of info.children) {
            totalWeight += child.weight;
            totalVolume += child.volume;
          }
        } else {
          totalWeight += info.weight;
          totalVolume += info.volume;
        }
        
        if (!info.isValid) {
          allErrors.push(...info.errors);
        }
      }
    }
    
    // Filtro 2: Peso total
    if (totalWeight > REPACK_BOX.maxWeight) {
      allErrors.push(`⚖️ El peso total (${totalWeight.toFixed(1)} kg) excede el límite de ${REPACK_BOX.maxWeight} kg`);
    }
    
    // Filtro 3: Volumen total
    if (totalVolume > REPACK_BOX.maxUsableVolume) {
      allErrors.push(`📦 El volumen total (${totalVolume.toLocaleString()} cm³) excede la capacidad útil de ${REPACK_BOX.maxUsableVolume.toLocaleString()} cm³`);
    }
    
    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      packages: packageInfos,
      totals: {
        weight: totalWeight,
        volume: totalVolume,
        count: packages.length,
      },
    };
  };
  
  // Abrir modal de reempaque
  const openRepackModal = async () => {
    setRepackModalVisible(true);
    setRepackLoading(true);
    setPackagesToRepack([...allPackages]);
    
    try {
      const validation = await validateRepack(allPackages);
      setRepackValidation(validation);
    } catch (error) {
      console.error('Error validating repack:', error);
      Alert.alert('Error', 'No se pudo validar el reempaque');
    } finally {
      setRepackLoading(false);
    }
  };
  
  // Remover paquete del reempaque
  const removeFromRepack = async (pkgId: number) => {
    const updated = packagesToRepack.filter(p => p.id !== pkgId);
    setPackagesToRepack(updated);
    
    if (updated.length === 0) {
      setRepackValidation(null);
      return;
    }
    
    setRepackLoading(true);
    try {
      const validation = await validateRepack(updated);
      setRepackValidation(validation);
    } finally {
      setRepackLoading(false);
    }
  };
  
  // Solicitar reempaque
  const requestRepack = async () => {
    if (!repackValidation?.isValid) {
      Alert.alert('Error', 'Por favor resuelve los errores antes de continuar');
      return;
    }
    
    setRepackLoading(true);
    try {
      const packageIds = packagesToRepack.map(p => p.id);
      
      const response = await fetch(`${API_URL}/api/packages/repack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageIds,
          repackBox: REPACK_BOX,
          totalWeight: repackValidation.totals.weight,
          totalVolume: repackValidation.totals.volume,
        }),
      });
      
      if (response.ok) {
        setRepackModalVisible(false);
        setRepackSuccessVisible(true);
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'No se pudo procesar el reempaque');
      }
    } catch (error) {
      console.error('Error requesting repack:', error);
      Alert.alert('Error', 'Error de conexión');
    } finally {
      setRepackLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
    calculateCost();
    
    // Obtener ETA del contenedor si existe (usar el primero)
    const firstPackageWithEta = allPackages.find(p => (p as any).container_eta);
    if (firstPackageWithEta) {
      setContainerEta((firstPackageWithEta as any).container_eta);
    }
  }, [fetchAddresses, calculateCost, allPackages]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAddresses();
  };

  // Guardar instrucciones de entrega para todos los paquetes
  const handleSave = async () => {
    // Solo requerir dirección si NO es pickup en sucursal
    const isPickup = selectedCarrier === 'pickup_hidalgo';
    if (!isPickup && !selectedAddressId) {
      Alert.alert('Error', 'Por favor selecciona una dirección de entrega');
      return;
    }

    setSaving(true);
    let successCount = 0;
    let errors: string[] = [];
    
    try {
      // Guardar instrucciones para cada paquete
      for (const currentPkg of allPackages) {
        try {
          // Determinar el tipo de paquete y el endpoint correcto
          const shipmentType = (currentPkg as any).shipment_type;
          let endpoint: string;
          let packageId: number;
          
          if (shipmentType === 'maritime') {
            // Órdenes marítimas tienen offset de 100000
            packageId = currentPkg.id >= 100000 ? currentPkg.id - 100000 : currentPkg.id;
            endpoint = `${API_URL}/api/maritime-api/orders/${packageId}/delivery-instructions`;
          } else {
            // USA, China Air, DHL - usar endpoint genérico
            packageId = currentPkg.id;
            const packageType = shipmentType || 'usa'; // Default a USA si no tiene tipo
            endpoint = `${API_URL}/api/packages/${packageType}/${packageId}/delivery-instructions`;
          }
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);
          let response: Response;
          try {
            response = await fetch(endpoint, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                deliveryAddressId: selectedAddressId,
                deliveryInstructions: additionalNotes,
                // Información de paquetería seleccionada
                carrier: selectedCarrier,
                carrierCost: getSelectedCarrierCost(),
                carrierName: carrierRates.find(c => c.id === selectedCarrier)?.name || localEntregaxOptions[0]?.name || 'EntregaX Local',
              }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }

          if (response.ok) {
            successCount++;
          } else {
            const errorData = await response.json().catch(() => ({}));
            errors.push(`${currentPkg.tracking_internal}: ${errorData.error || 'Error'}`);
          }
        } catch (err: any) {
          const msg = err?.name === 'AbortError' ? 'Tiempo de espera agotado' : (err?.message || 'Error de conexión');
          errors.push(`${currentPkg.tracking_internal}: ${msg}`);
        }
      }

      // Mostrar resultado
      if (successCount > 0) {
        setSavedCount(successCount);
        setSuccessModalVisible(true);
      } else {
        Alert.alert('Error', errors.join('\n'));
      }
    } catch (error) {
      console.error('Error saving instructions:', error);
      Alert.alert('Error', 'Error de conexión. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={SEA_COLOR} />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
        <Appbar.Content 
          title={hasExistingInstructions ? "Modificar Instrucciones" : "Instrucciones de Entrega"} 
          titleStyle={styles.headerTitle}
        />
      </Appbar.Header>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[SEA_COLOR]} />
        }
      >
        {/* Resumen de paquetes seleccionados */}
        <Card style={styles.packageCard}>
          <Card.Content>
            {/* Header con contador y botón de reempaque */}
            <View style={styles.packageSummaryHeader}>
              <View style={styles.packageCountBadge}>
                <Ionicons name={shipmentIcon} size={20} color="white" />
                <Text style={styles.packageCountText}>{allPackages.length}</Text>
              </View>
              <Text style={styles.packageSummaryTitle}>
                {isMultiple ? 'Paquetes Seleccionados' : 'Paquete Seleccionado'}
              </Text>
              {/* Botón de Reempaque - Solo si hay múltiples paquetes y NO hay multi-paquetes */}
              {isMultiple && !hasMultiPackages && (
                <TouchableOpacity 
                  style={styles.repackButton}
                  onPress={openRepackModal}
                >
                  <MaterialCommunityIcons name="package-variant-closed" size={24} color={ORANGE} />
                </TouchableOpacity>
              )}
            </View>
            
            {/* Lista de paquetes */}
            <View style={styles.packageList}>
              {allPackages.map((currentPkg, index) => {
                const dims = formatDimensions(currentPkg);
                const childPackages = (currentPkg as any).child_packages || [];
                const hasChildren = childPackages.length > 0;
                const isExpanded = expandedPackages.has(currentPkg.id);
                
                // Si es master, sumar CBM de los hijos; si no, calcular normal
                const cbm = hasChildren 
                  ? childPackages.reduce((sum: number, child: any) => sum + getPackageCBM(child), 0)
                  : getPackageCBM(currentPkg);
                
                // Si es master, sumar peso de los hijos
                const totalWeight = hasChildren
                  ? childPackages.reduce((sum: number, child: any) => sum + (child.weight || 0), 0)
                  : (currentPkg.weight || 0);
                
                return (
                  <View key={currentPkg.id}>
                    <TouchableOpacity 
                      style={[styles.packageListItem, hasChildren && styles.packageListItemMaster]}
                      onPress={() => hasChildren && togglePackageExpanded(currentPkg.id)}
                      activeOpacity={hasChildren ? 0.7 : 1}
                    >
                      <View style={styles.packageListItemNumber}>
                        <Text style={styles.packageListItemNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.packageListItemInfo}>
                        <View style={styles.trackingRow}>
                          <Text style={styles.packageListTracking}>{currentPkg.tracking_internal}</Text>
                          {hasChildren && (
                            <View style={styles.childCountBadge}>
                              <Text style={styles.childCountText}>{childPackages.length}</Text>
                              <Ionicons 
                                name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                                size={12} 
                                color="#fff" 
                              />
                            </View>
                          )}
                        </View>
                        <Text style={styles.packageListDescription} numberOfLines={1}>
                          {hasChildren ? '📦 Múltiple' : (dims !== '—' ? `📐 ${dims} cm` : (currentPkg.description || 'Sin dimensiones'))}
                        </Text>
                      </View>
                      <View style={styles.packageListItemStats}>
                        <Text style={styles.packageListStatText}>{totalWeight} kg</Text>
                        <Text style={styles.packageListStatText}>{cbm.toFixed(4)} m³</Text>
                      </View>
                    </TouchableOpacity>
                    
                    {/* Paquetes hijos expandidos */}
                    {hasChildren && isExpanded && (
                      <View style={styles.childPackagesContainer}>
                        {childPackages.map((child: any, childIndex: number) => {
                          const childDims = formatDimensions(child);
                          const childCbm = getPackageCBM(child);
                          return (
                            <View key={child.id || childIndex} style={styles.childPackageItem}>
                              <View style={styles.childPackageConnector} />
                              <View style={styles.childPackageContent}>
                                <Text style={styles.childPackageTracking}>
                                  {child.tracking_internal || child.tracking_courier}
                                </Text>
                                <Text style={styles.childPackageStats}>
                                  {child.weight || 0} kg • {childDims !== '—' ? childDims + ' cm' : childCbm.toFixed(4) + ' m³'}
                                </Text>
                                {child.tracking_courier && (
                                  <Text style={styles.childPackageOrigin}>
                                    📦 Origen: {child.tracking_courier}
                                  </Text>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            
            <Divider style={styles.divider} />
            
            {/* Totales - Solo peso y volumen */}
            <View style={styles.packageStats}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Peso Total</Text>
                <Text style={styles.statValue}>
                  {allPackages.reduce((sum, p) => {
                    const children = (p as any).child_packages || [];
                    if (children.length > 0) {
                      return sum + children.reduce((childSum: number, child: any) => childSum + (child.weight || 0), 0);
                    }
                    return sum + (p.weight || 0);
                  }, 0).toFixed(0)} kg
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>CBM Total</Text>
                <Text style={styles.statValue}>
                  {allPackages.reduce((sum, p) => {
                    const children = (p as any).child_packages || [];
                    if (children.length > 0) {
                      return sum + children.reduce((childSum: number, child: any) => childSum + getPackageCBM(child), 0);
                    }
                    return sum + getPackageCBM(p);
                  }, 0).toFixed(4)} m³
                </Text>
              </View>
            </View>

            {containerEta && (
              <View style={styles.etaContainer}>
                <Ionicons name="calendar-outline" size={16} color={SEA_COLOR} />
                <Text style={styles.etaText}>
                  ETA: {formatDate(containerEta)}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Selección de dirección - Solo si NO es pickup */}
        {selectedCarrier !== 'pickup_hidalgo' ? (
        <Card style={styles.addressCard}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📍 Dirección de Entrega</Text>
              <TouchableOpacity 
                onPress={() => navigation.navigate('MyAddresses', { user, token })}
                style={styles.addAddressButton}
              >
                <Ionicons name="add-circle" size={20} color={ORANGE} />
                <Text style={styles.addAddressText}>Agregar</Text>
              </TouchableOpacity>
            </View>

            {addresses.length === 0 ? (
              <View style={styles.noAddresses}>
                <Ionicons name="location-outline" size={48} color="#ccc" />
                <Text style={styles.noAddressesText}>
                  No tienes direcciones guardadas
                </Text>
                <Button
                  mode="contained"
                  onPress={() => navigation.navigate('MyAddresses', { user, token })}
                  style={styles.addFirstButton}
                  buttonColor={SEA_COLOR}
                >
                  Agregar Dirección
                </Button>
              </View>
            ) : (
              <RadioButton.Group
                onValueChange={(value) => setSelectedAddressId(parseInt(value))}
                value={selectedAddressId?.toString() || ''}
              >
                {addresses.map((address) => (
                  <TouchableOpacity
                    key={address.id}
                    style={[
                      styles.addressItem,
                      selectedAddressId === address.id && styles.addressItemSelected
                    ]}
                    onPress={() => setSelectedAddressId(address.id)}
                  >
                    <RadioButton value={address.id.toString()} color={SEA_COLOR} />
                    <View style={styles.addressContent}>
                      <View style={styles.addressHeader}>
                        <Text style={styles.addressAlias}>{address.alias}</Text>
                        {address.is_default && (
                          <View style={styles.principalBadge}>
                            <Text style={styles.principalBadgeText}>Principal</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.addressText}>
                        {address.street} {address.exterior_number}
                        {address.interior_number ? ` Int. ${address.interior_number}` : ''}
                      </Text>
                      <Text style={styles.addressText}>
                        {address.neighborhood}, {address.city}
                      </Text>
                      <Text style={styles.addressText}>
                        {address.state}, C.P. {address.zip_code}
                      </Text>
                      {address.phone && (
                        <Text style={styles.addressPhone}>📞 {address.phone}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </RadioButton.Group>
            )}
          </Card.Content>
        </Card>
        ) : (
        /* Card informativo para Pick Up en sucursal */
        <Card style={styles.addressCard}>
          <Card.Content>
            <View style={styles.pickupInfoContainer}>
              <Ionicons name="business" size={48} color={SEA_COLOR} />
              <Text style={styles.pickupTitle}>📍 Sucursal Hidalgo TX</Text>
              <Text style={styles.pickupAddress}>
                Dirección: 1860 North International Blvd. Suite 4, Hidalgo, TX
              </Text>
              <Text style={styles.pickupHours}>
                🕐 Horario: Lunes a Viernes 9:00am - 6:00pm
              </Text>
              <Text style={styles.pickupPhone}>
                📞 Tel: (956) 475-6246
              </Text>
              <Text style={styles.pickupNote}>
                Tu paquete estará listo para recoger en nuestra sucursal. 
                Te notificaremos cuando esté disponible.
              </Text>
              
              {/* Advertencia de cargo por almacenaje */}
              <View style={styles.storageWarning}>
                <View style={styles.storageWarningTextContainer}>
                  <Text style={styles.storageWarningTitle}>⚠️ Aviso de Almacenaje</Text>
                  <Text style={styles.storageWarningText}>
                    Los paquetes que permanezcan en bodega más de 15 días generarán 
                    un cargo de $3.00 USD diarios.
                  </Text>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>
        )}

        {/* Desglose de Costos PO Box - Solo cuando viene de Pick Up */}
        {isChangingFromPickup && (
          <Card style={[styles.carrierCard, { marginBottom: 12 }]}>
            <Card.Content>
              <Text style={styles.sectionTitle}>💰 Desglose de Costos</Text>
              <View style={{ marginTop: 12 }}>
                {allPackages.map((p: any, idx: number) => {
                  const poboxUsd = parseFloat(p.pobox_venta_usd) || 0;
                  const tc = parseFloat(p.tipo_cambio) || 18.08;
                  const poboxMxn = poboxUsd * tc;
                  const gexCost = parseFloat(p.gex_total_cost) || 0;
                  
                  return (
                    <View key={p.id || idx} style={{ marginBottom: idx < allPackages.length - 1 ? 12 : 0 }}>
                      {allPackages.length > 1 && (
                        <Text style={{ fontWeight: '600', marginBottom: 4, color: '#333' }}>
                          📦 {p.tracking_internal || p.tracking}
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#666', fontSize: 14 }}>📦 Servicio PO Box</Text>
                          <Text style={{ color: '#999', fontSize: 11 }}>
                            💸 ${poboxUsd.toFixed(2)} USD × TC ${tc.toFixed(2)}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: '600', color: '#333', fontSize: 14 }}>
                          ${poboxMxn.toFixed(2)} MXN
                        </Text>
                      </View>
                      {gexCost > 0 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ color: '#666', fontSize: 14 }}>🛡️ Garantía Extendida GEX</Text>
                          <Text style={{ fontWeight: '600', color: '#333', fontSize: 14 }}>
                            ${gexCost.toFixed(2)} MXN
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
                <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#666', fontSize: 14 }}>📦 Subtotal PO Box:</Text>
                    <Text style={{ fontWeight: '600', color: ORANGE, fontSize: 14 }}>
                      ${allPackages.reduce((sum: number, p: any) => {
                        const poboxUsd = parseFloat(p.pobox_venta_usd) || 0;
                        const tc = parseFloat(p.tipo_cambio) || 18.08;
                        const gexCost = parseFloat(p.gex_total_cost) || 0;
                        return sum + (poboxUsd * tc) + gexCost;
                      }, 0).toFixed(2)} MXN
                    </Text>
                  </View>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Selección de Paquetería */}
        <Card style={styles.carrierCard}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🚚 Paquetería de Entrega</Text>
              {loadingCarrierRates && (
                <ActivityIndicator size="small" color={ORANGE} />
              )}
            </View>
            <Text style={styles.carrierSubtitle}>
              Selecciona cómo quieres recibir tus paquetes
            </Text>

            <RadioButton.Group
              onValueChange={(value) => setSelectedCarrier(value)}
              value={selectedCarrier}
            >
              {carrierRates
                .filter((carrier) => {
                  // Si viene de cambiar Pick Up, ocultar la opción de Pick Up
                  if (isChangingFromPickup && carrier.id === 'pickup_hidalgo') {
                    return false;
                  }
                  // 🗺️ Si el CP destino es MTY metro o CDMX metro, ocultar Paquete Express
                  //    (la entrega local cubre la zona, no se requiere paquetería externa)
                  if ((inMtyMetro || inCdmxMetro) && (carrier.id === 'paquete_express' || carrier.id === 'paquete_express_pc')) {
                    return false;
                  }
                  return true;
                })
                .map((carrier) => {
                return (
                <TouchableOpacity
                  key={carrier.id}
                  style={[
                    styles.carrierItem,
                    selectedCarrier === carrier.id && styles.carrierItemSelected
                  ]}
                  onPress={() => setSelectedCarrier(carrier.id)}
                  activeOpacity={0.7}
                >
                  <RadioButton value={carrier.id} color={ORANGE} />
                  <View style={styles.carrierContent}>
                    <View style={styles.carrierHeader}>
                      <Text style={styles.carrierName}>{carrier.name}</Text>
                      {carrier.isExternal && (
                        <View style={styles.externalBadge}>
                          <Text style={styles.externalBadgeText}>Externo</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.carrierDays}>
                      ⏱️ {carrier.estimatedDays}
                    </Text>
                  </View>
                  <View style={styles.carrierPriceContainer}>
                    {carrier.id === 'paquete_express_pc' ? (
                      <Text style={[styles.carrierPriceFree, { color: '#E65100' }]}>POR COBRAR</Text>
                    ) : carrier.price === 0 ? (
                      <Text style={styles.carrierPriceFree}>GRATIS</Text>
                    ) : shipmentType === 'china_air' && carrier.id === 'paquete_express' ? (
                      <>
                        <Text style={[styles.carrierPrice, { textDecorationLine: 'line-through', color: '#999' }]}>
                          ${(carrier.price * getTotalBoxes()).toFixed(2)} {carrier.currency || 'MXN'}
                        </Text>
                        <Text style={[styles.carrierPriceFree, { color: '#10B981', fontSize: 13 }]}>
                          ✓ INCLUIDO
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.carrierPrice}>
                          ${(carrier.price * getTotalBoxes()).toFixed(2)} {carrier.currency || 'MXN'}
                        </Text>
                        <Text style={styles.carrierPriceDetail}>
                          ${carrier.price} x {getTotalBoxes()} {getTotalBoxes() === 1 ? 'caja' : 'cajas'}
                        </Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
                );
              })}
            </RadioButton.Group>

            {/* Resumen de costo de envío */}
            <View style={styles.carrierSummary}>
              {isChangingFromPickup && (
                <>
                  <View style={styles.carrierSummaryRow}>
                    <Text style={styles.carrierSummaryLabel}>Servicio PO Box:</Text>
                    <Text style={[styles.carrierSummaryValue, { color: '#666' }]}>
                      ${allPackages.reduce((sum: number, p: any) => {
                        const poboxUsd = parseFloat(p.pobox_venta_usd) || 0;
                        const tc = parseFloat(p.tipo_cambio) || 18.08;
                        const gexCost = parseFloat(p.gex_total_cost) || 0;
                        return sum + (poboxUsd * tc) + gexCost;
                      }, 0).toFixed(2)} MXN
                    </Text>
                  </View>
                  <View style={styles.carrierSummaryRow}>
                    <Text style={styles.carrierSummaryLabel}>Envío Nacional:</Text>
                    <Text style={[styles.carrierSummaryValue, { color: selectedCarrier === 'paquete_express_pc' ? '#E65100' : '#666', fontWeight: selectedCarrier === 'paquete_express_pc' ? '700' : 'normal' }]}>
                      {selectedCarrier === 'paquete_express_pc'
                        ? 'POR COBRAR'
                        : getSelectedCarrierCost() === 0 
                          ? 'GRATIS' 
                          : `$${getSelectedCarrierCost().toFixed(2)} ${getSelectedCarrierCurrency()}`}
                    </Text>
                  </View>
                  <View style={[styles.carrierSummaryRow, { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8, marginTop: 4 }]}>
                    <Text style={[styles.carrierSummaryLabel, { fontWeight: '700', color: '#333' }]}>TOTAL A PAGAR:</Text>
                    <Text style={[styles.carrierSummaryValue, { fontWeight: '700', color: ORANGE, fontSize: 18 }]}>
                      ${(allPackages.reduce((sum: number, p: any) => {
                        const poboxUsd = parseFloat(p.pobox_venta_usd) || 0;
                        const tc = parseFloat(p.tipo_cambio) || 18.08;
                        const gexCost = parseFloat(p.gex_total_cost) || 0;
                        return sum + (poboxUsd * tc) + gexCost;
                      }, 0) + getSelectedCarrierCost()).toFixed(2)} MXN
                    </Text>
                  </View>
                </>
              )}
              {!isChangingFromPickup && (
                <>
                  {isCarrierIncludedInFreight() && getSelectedCarrierGrossCost() > 0 && (
                    <>
                      <View style={styles.carrierSummaryRow}>
                        <Text style={styles.carrierSummaryLabel}>Paquete Express:</Text>
                        <Text style={[styles.carrierSummaryValue, { color: '#666' }]}>
                          ${getSelectedCarrierGrossCost().toFixed(2)} MXN
                        </Text>
                      </View>
                      <View style={styles.carrierSummaryRow}>
                        <Text style={[styles.carrierSummaryLabel, { color: '#10B981' }]}>Descuento (incluido en flete aéreo):</Text>
                        <Text style={[styles.carrierSummaryValue, { color: '#10B981', fontWeight: '700' }]}>
                          -${getSelectedCarrierGrossCost().toFixed(2)} MXN
                        </Text>
                      </View>
                    </>
                  )}
                  <View style={styles.carrierSummaryRow}>
                    <Text style={styles.carrierSummaryLabel}>Total:</Text>
                    <Text style={[
                      styles.carrierSummaryValue,
                      selectedCarrier === 'paquete_express_pc' && { color: '#E65100', fontWeight: '700' },
                      isCarrierIncludedInFreight() && { color: '#10B981', fontWeight: '700' },
                    ]}>
                      {selectedCarrier === 'paquete_express_pc'
                        ? 'POR COBRAR'
                        : isCarrierIncludedInFreight()
                          ? 'INCLUIDO'
                          : getSelectedCarrierCost() === 0
                            ? 'GRATIS'
                            : `$${getSelectedCarrierCost().toFixed(2)} ${getSelectedCarrierCurrency()}`}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Notas adicionales */}
        <Card style={styles.notesCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>📝 Notas Adicionales</Text>
            <TextInput
              mode="outlined"
              placeholder="Ej: Dejar en recepción, llamar antes de entregar..."
              value={additionalNotes}
              onChangeText={setAdditionalNotes}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
              outlineColor="#ddd"
              activeOutlineColor={SEA_COLOR}
            />
          </Card.Content>
        </Card>

        {/* Botón guardar */}
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving || (!selectedAddressId && selectedCarrier !== 'pickup_hidalgo')}
          style={styles.saveButton}
          buttonColor={SEA_COLOR}
          contentStyle={styles.saveButtonContent}
          labelStyle={styles.saveButtonLabel}
        >
          {saving 
            ? 'Guardando...' 
            : selectedCarrier === 'pickup_hidalgo'
              ? `📦 Confirmar Pick Up${isMultiple ? ` (${allPackages.length})` : ''}`
              : hasExistingInstructions
                ? `✏️ Actualizar Instrucciones${isMultiple ? ` (${allPackages.length})` : ''}`
                : `✅ Guardar Instrucciones${isMultiple ? ` (${allPackages.length})` : ''}`
          }
        </Button>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Modal de Éxito Mejorado */}
      <Modal
        visible={successModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSuccessModalVisible(false);
          navigation.goBack();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModal}>
            {/* Icono animado */}
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
            </View>
            
            {/* Título */}
            <Text style={styles.successTitle}>¡Instrucciones Guardadas!</Text>
            
            {/* Descripción */}
            <Text style={styles.successMessage}>
              {savedCount === 1 
                ? 'Se asignaron las instrucciones de entrega correctamente.'
                : `Se asignaron instrucciones de entrega a ${savedCount} paquetes correctamente.`}
            </Text>
            
            {/* Resumen visual */}
            <View style={styles.successSummary}>
              <View style={styles.successSummaryItem}>
                <Ionicons name={shipmentIcon} size={24} color={SEA_COLOR} />
                <Text style={styles.successSummaryText}>{savedCount} paquete{savedCount > 1 ? 's' : ''}</Text>
              </View>
              <View style={styles.successSummaryItem}>
                <Ionicons name="location" size={24} color={ORANGE} />
                <Text style={styles.successSummaryText}>1 dirección</Text>
              </View>
            </View>
            
            {/* Botón cerrar */}
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => {
                setSuccessModalVisible(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.successButtonText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============================================ */}
      {/* MODAL DE REEMPAQUE */}
      {/* ============================================ */}
      <Modal
        visible={repackModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRepackModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.repackModal}>
            {/* Header del modal */}
            <View style={styles.repackModalHeader}>
              <MaterialCommunityIcons name="package-variant-closed" size={28} color={ORANGE} />
              <Text style={styles.repackModalTitle}>Solicitar Reempaque</Text>
              <TouchableOpacity 
                onPress={() => setRepackModalVisible(false)}
                style={styles.repackCloseButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {/* Información de la caja de reempaque */}
            <View style={styles.repackBoxInfo}>
              <MaterialCommunityIcons name="cube-outline" size={40} color={SEA_COLOR} />
              <View style={styles.repackBoxDetails}>
                <Text style={styles.repackBoxTitle}>Caja de Reempaque</Text>
                <Text style={styles.repackBoxSpecs}>
                  {REPACK_BOX.length}x{REPACK_BOX.width}x{REPACK_BOX.height} cm • Máx {REPACK_BOX.maxWeight} kg
                </Text>
                <Text style={styles.repackBoxCapacity}>
                  Capacidad útil: {REPACK_BOX.maxUsableVolume.toLocaleString()} cm³ (80%)
                </Text>
              </View>
            </View>
            
            <Divider style={{ marginVertical: 12 }} />
            
            {/* Loading o contenido */}
            {repackLoading ? (
              <View style={styles.repackLoadingContainer}>
                <ActivityIndicator size="large" color={SEA_COLOR} />
                <Text style={styles.repackLoadingText}>Validando paquetes...</Text>
              </View>
            ) : repackValidation ? (
              <>
                {/* Totales */}
                <View style={styles.repackTotals}>
                  <View style={styles.repackTotalItem}>
                    <Text style={styles.repackTotalLabel}>Paquetes</Text>
                    <Text style={styles.repackTotalValue}>{packagesToRepack.length}</Text>
                  </View>
                  <View style={styles.repackTotalItem}>
                    <Text style={styles.repackTotalLabel}>Peso Total</Text>
                    <Text style={[
                      styles.repackTotalValue,
                      repackValidation.totals.weight > REPACK_BOX.maxWeight && styles.repackTotalError
                    ]}>
                      {repackValidation.totals.weight.toFixed(1)} kg
                    </Text>
                  </View>
                  <View style={styles.repackTotalItem}>
                    <Text style={styles.repackTotalLabel}>Volumen</Text>
                    <Text style={[
                      styles.repackTotalValue,
                      repackValidation.totals.volume > REPACK_BOX.maxUsableVolume && styles.repackTotalError
                    ]}>
                      {(repackValidation.totals.volume / 1000).toFixed(1)} L
                    </Text>
                  </View>
                </View>
                
                {/* Errores globales */}
                {repackValidation.errors.length > 0 && (
                  <View style={styles.repackErrorsGlobal}>
                    {repackValidation.errors.map((error, idx) => (
                      <Text key={idx} style={styles.repackErrorText}>
                        {error}
                      </Text>
                    ))}
                  </View>
                )}
                
                {/* Lista de paquetes para reempaque */}
                <Text style={styles.repackListTitle}>Paquetes a reempacar:</Text>
                <ScrollView style={styles.repackPackageList}>
                  {repackValidation.packages.map((pkgInfo) => (
                    <View 
                      key={pkgInfo.id} 
                      style={[
                        styles.repackPackageItem,
                        !pkgInfo.isValid && styles.repackPackageItemError
                      ]}
                    >
                      <View style={styles.repackPackageInfo}>
                        <View style={styles.repackPackageHeader}>
                          <Text style={styles.repackPackageTracking}>{pkgInfo.tracking}</Text>
                          {pkgInfo.hasChildren && (
                            <Chip 
                              mode="flat" 
                              style={styles.repackMasterChip}
                              textStyle={{ fontSize: 10 }}
                            >
                              Master ({pkgInfo.children?.length || 0} cajas)
                            </Chip>
                          )}
                        </View>
                        <Text style={styles.repackPackageDims}>
                          {pkgInfo.dimensions.length}x{pkgInfo.dimensions.width}x{pkgInfo.dimensions.height} cm • {pkgInfo.weight.toFixed(1)} kg
                        </Text>
                        
                        {/* Mostrar hijos si es master */}
                        {pkgInfo.hasChildren && pkgInfo.children && (
                          <View style={styles.repackChildrenContainer}>
                            {pkgInfo.children.map((child, idx) => (
                              <View 
                                key={child.id} 
                                style={[
                                  styles.repackChildItem,
                                  !child.isValid && styles.repackChildItemError
                                ]}
                              >
                                <Text style={styles.repackChildText}>
                                  └ Caja {idx + 1}: {child.dimensions.length}x{child.dimensions.width}x{child.dimensions.height} cm
                                </Text>
                                {!child.isValid && (
                                  <Ionicons name="warning" size={14} color="#f44336" />
                                )}
                              </View>
                            ))}
                          </View>
                        )}
                        
                        {/* Errores del paquete */}
                        {pkgInfo.errors.length > 0 && (
                          <View style={styles.repackPackageErrors}>
                            {pkgInfo.errors.map((error, idx) => (
                              <Text key={idx} style={styles.repackPackageErrorText}>
                                ⚠️ {error}
                              </Text>
                            ))}
                          </View>
                        )}
                      </View>
                      
                      {/* Botón para remover */}
                      <TouchableOpacity
                        style={styles.repackRemoveButton}
                        onPress={() => removeFromRepack(pkgInfo.id)}
                      >
                        <Ionicons name="close-circle" size={24} color="#f44336" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
                
                {/* Costo del servicio */}
                <View style={styles.repackCostContainer}>
                  <Text style={styles.repackCostLabel}>Costo de Consolidación:</Text>
                  <Text style={styles.repackCostValue}>${REPACK_BOX.serviceCostUSD.toFixed(2)} USD</Text>
                </View>
                
                {/* Botones de acción */}
                <View style={styles.repackActions}>
                  <Button
                    mode="outlined"
                    onPress={() => setRepackModalVisible(false)}
                    style={styles.repackCancelButton}
                    textColor="#666"
                  >
                    Cancelar
                  </Button>
                  <Button
                    mode="contained"
                    onPress={requestRepack}
                    disabled={!repackValidation.isValid || packagesToRepack.length === 0}
                    loading={repackLoading}
                    style={styles.repackConfirmButton}
                    buttonColor={repackValidation.isValid ? SEA_COLOR : '#ccc'}
                  >
                    📦 Solicitar Reempaque
                  </Button>
                </View>
              </>
            ) : (
              <Text style={styles.repackNoPackages}>No hay paquetes para reempacar</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal de éxito de reempaque */}
      <Modal
        visible={repackSuccessVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setRepackSuccessVisible(false);
          navigation.goBack();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModal}>
            <View style={styles.successIconContainer}>
              <MaterialCommunityIcons name="package-variant-closed-check" size={80} color="#4CAF50" />
            </View>
            <Text style={styles.successTitle}>¡Reempaque Solicitado!</Text>
            <Text style={styles.successMessage}>
              Se ha solicitado el reempaque de {packagesToRepack.length} paquete{packagesToRepack.length > 1 ? 's' : ''}.
              Se agregará un cargo de ${REPACK_BOX.serviceCostUSD.toFixed(2)} USD a tu cuenta.
            </Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => {
                setRepackSuccessVisible(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.successButtonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: SEA_COLOR,
  },
  headerTitle: {
    color: 'white',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  packageCard: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  // Estilos para resumen de múltiples paquetes
  packageSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  packageCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SEA_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  packageCountText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  packageSummaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
  },
  packageList: {
    gap: 8,
  },
  packageListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: SEA_COLOR,
  },
  packageListItemMaster: {
    backgroundColor: '#f0f7ff',
    borderLeftColor: ORANGE,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  childCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORANGE,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 2,
  },
  childCountText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
  },
  childPackagesContainer: {
    marginLeft: 20,
    marginTop: 4,
    marginBottom: 8,
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: ORANGE + '40',
  },
  childPackageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  childPackageConnector: {
    width: 12,
    height: 2,
    backgroundColor: ORANGE + '40',
    marginRight: 8,
  },
  childPackageContent: {
    flex: 1,
  },
  childPackageTracking: {
    fontSize: 12,
    fontWeight: '500',
    color: '#555',
  },
  childPackageStats: {
    fontSize: 11,
    color: '#888',
  },
  childPackageOrigin: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
    fontStyle: 'italic',
  },
  packageListItemNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: SEA_COLOR + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  packageListItemNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: SEA_COLOR,
  },
  packageListItemInfo: {
    flex: 1,
  },
  packageListTracking: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  packageListDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  packageListItemStats: {
    alignItems: 'flex-end',
  },
  packageListStatText: {
    fontSize: 11,
    color: '#888',
  },
  costValueSmall: {
    color: SEA_COLOR,
    fontWeight: '600',
    fontSize: 12,
  },
  packageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  packageInfo: {
    flex: 1,
  },
  packageTracking: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  packageDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  divider: {
    marginVertical: 12,
  },
  packageStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  costValue: {
    color: SEA_COLOR,
  },
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    padding: 8,
    backgroundColor: SEA_COLOR + '10',
    borderRadius: 8,
    gap: 6,
  },
  etaText: {
    color: SEA_COLOR,
    fontWeight: '600',
  },
  addressCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addAddressText: {
    color: ORANGE,
    fontWeight: '600',
  },
  noAddresses: {
    alignItems: 'center',
    padding: 24,
  },
  noAddressesText: {
    color: '#999',
    marginTop: 8,
    marginBottom: 16,
  },
  // Estilos para Pick Up en sucursal
  pickupInfoContainer: {
    alignItems: 'center',
    padding: 20,
  },
  pickupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: SEA_COLOR,
    marginTop: 12,
    marginBottom: 8,
  },
  pickupAddress: {
    fontSize: 14,
    color: BLACK,
    textAlign: 'center',
    marginBottom: 4,
  },
  pickupHours: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  pickupPhone: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  pickupNote: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  storageWarning: {
    flexDirection: 'row',
    backgroundColor: '#fff4e5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ed6c02',
    padding: 12,
    marginTop: 16,
    alignItems: 'flex-start',
  },
  storageWarningTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  storageWarningTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ed6c02',
    marginBottom: 4,
  },
  storageWarningText: {
    fontSize: 12,
    color: '#663c00',
    lineHeight: 18,
  },
  addFirstButton: {
    borderRadius: 8,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
  },
  addressItemSelected: {
    borderColor: SEA_COLOR,
    backgroundColor: SEA_COLOR + '08',
  },
  addressContent: {
    flex: 1,
    marginLeft: 4,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  addressAlias: {
    flex: 1,
    fontSize: 15,
    fontWeight: 'bold',
    color: BLACK,
    flexShrink: 1,
  },
  principalBadge: {
    backgroundColor: SEA_COLOR,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  principalBadgeText: {
    fontSize: 11,
    color: 'white',
    fontWeight: '600',
  },
  defaultChip: {
    backgroundColor: SEA_COLOR + '25',
    height: 22,
    paddingHorizontal: 4,
  },
  defaultChipText: {
    fontSize: 11,
    color: SEA_COLOR,
    fontWeight: '600',
    marginHorizontal: 2,
  },
  addressText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  addressPhone: {
    fontSize: 13,
    color: SEA_COLOR,
    marginTop: 4,
  },
  notesCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  // Estilos para selección de paquetería
  carrierCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  carrierSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  carrierItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  carrierItemSelected: {
    borderColor: SEA_COLOR,
    backgroundColor: SEA_COLOR + '08',
  },
  carrierContent: {
    flex: 1,
    marginLeft: 4,
  },
  carrierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  carrierName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: BLACK,
  },
  externalBadge: {
    backgroundColor: ORANGE + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  externalBadgeText: {
    fontSize: 10,
    color: ORANGE,
    fontWeight: '600',
  },
  carrierDays: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  carrierPriceContainer: {
    alignItems: 'flex-end',
    paddingLeft: 12,
  },
  carrierPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: SEA_COLOR,
  },
  carrierPriceFree: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
    backgroundColor: '#4CAF50' + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  carrierPriceDetail: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  carrierSummary: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  carrierSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  carrierSummaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  carrierSummaryValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: SEA_COLOR,
  },
  notesInput: {
    marginTop: 8,
    backgroundColor: 'white',
  },
  saveButton: {
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
  },
  saveButtonContent: {
    paddingVertical: 8,
  },
  saveButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomSpacer: {
    height: 32,
  },
  // Estilos para modal de éxito
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModal: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    margin: 24,
    width: Dimensions.get('window').width - 48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 8,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  successSummary: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    width: '100%',
  },
  successSummaryItem: {
    alignItems: 'center',
    gap: 6,
  },
  successSummaryText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  successButton: {
    backgroundColor: SEA_COLOR,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
  },
  successButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // ============================================
  // ESTILOS PARA MODAL DE REEMPAQUE
  // ============================================
  repackButton: {
    marginLeft: 'auto',
    padding: 8,
    backgroundColor: ORANGE + '15',
    borderRadius: 8,
  },
  repackModal: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: Dimensions.get('window').height * 0.85,
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  repackModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  repackModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BLACK,
    flex: 1,
  },
  repackCloseButton: {
    padding: 4,
  },
  repackBoxInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SEA_COLOR + '10',
    padding: 16,
    borderRadius: 12,
    gap: 16,
  },
  repackBoxDetails: {
    flex: 1,
  },
  repackBoxTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: SEA_COLOR,
  },
  repackBoxSpecs: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  repackBoxCapacity: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  repackLoadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  repackLoadingText: {
    marginTop: 12,
    color: '#666',
  },
  repackTotals: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    marginBottom: 12,
  },
  repackTotalItem: {
    alignItems: 'center',
  },
  repackTotalLabel: {
    fontSize: 12,
    color: '#888',
  },
  repackTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  repackTotalError: {
    color: '#f44336',
  },
  repackErrorsGlobal: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  repackErrorText: {
    color: '#c62828',
    fontSize: 13,
    marginBottom: 4,
  },
  repackListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  repackPackageList: {
    maxHeight: 200,
    marginBottom: 12,
  },
  repackPackageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: SEA_COLOR,
  },
  repackPackageItemError: {
    borderLeftColor: '#f44336',
    backgroundColor: '#fff8f8',
  },
  repackPackageInfo: {
    flex: 1,
  },
  repackPackageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  repackPackageTracking: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  repackMasterChip: {
    height: 20,
    backgroundColor: ORANGE + '20',
  },
  repackPackageDims: {
    fontSize: 12,
    color: '#666',
  },
  repackChildrenContainer: {
    marginTop: 8,
    paddingLeft: 8,
  },
  repackChildItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  repackChildItemError: {
    backgroundColor: '#ffebee',
    padding: 4,
    borderRadius: 4,
  },
  repackChildText: {
    fontSize: 11,
    color: '#888',
    flex: 1,
  },
  repackPackageErrors: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#ffebee',
    borderRadius: 6,
  },
  repackPackageErrorText: {
    fontSize: 11,
    color: '#c62828',
  },
  repackRemoveButton: {
    padding: 4,
  },
  repackCostContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: ORANGE + '10',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  repackCostLabel: {
    fontSize: 14,
    color: '#666',
  },
  repackCostValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: ORANGE,
  },
  repackActions: {
    flexDirection: 'row',
    gap: 12,
  },
  repackCancelButton: {
    flex: 1,
    borderRadius: 10,
    borderColor: '#ccc',
  },
  repackConfirmButton: {
    flex: 2,
    borderRadius: 10,
  },
  repackNoPackages: {
    textAlign: 'center',
    color: '#999',
    padding: 40,
  },
});
