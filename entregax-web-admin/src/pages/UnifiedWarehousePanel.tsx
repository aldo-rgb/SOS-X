/**
 * UnifiedWarehousePanel - Escáner Multi-Sucursal (SOLO CONSULTA) 🔎
 *
 * ⚠️ Este panel NO da entrada ni salida a paquetes.
 * Su único propósito es escanear cualquier guía (DHL, AIR, LOG, US, marítimo,
 * nacional, etc.) y mostrar información detallada del envío:
 *   - Cliente, BOX, contacto
 *   - Tipo de servicio / carrier
 *   - Estado actual y fechas (recibido, entregado)
 *   - Peso, dimensiones, valor declarado
 *   - Costos y estado de pago
 *   - Dirección de entrega
 *   - Tracking nacional / courier
 *   - Cajas hijas (multipieza) y línea de tiempo de movimientos
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScannerBreakdown, fmtMXN } from '../utils/packageCosts';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Alert,
  Chip,
  Grid,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from '@mui/material';
import {
  QrCodeScanner as ScannerIcon,
  Search as SearchIcon,
  Person as PersonIcon,
  Inventory2 as PackageIcon,
  LocalShipping as ShippingIcon,
  LocalShipping as LocalShippingIcon,
  Place as PlaceIcon,
  Payments as PaymentsIcon,
  Scale as ScaleIcon,
  Straighten as RulerIcon,
  History as HistoryIcon,
  Error as ErrorIcon,
  CheckCircle as CheckIcon,
  AccessTime as ClockIcon,
  ContentCopy as CopyIcon,
  Store as StoreIcon,
  DirectionsCar as DeliveryIcon,
  ArrowBack as ArrowBackIcon,
  Draw as SignatureIcon,
  Close as CloseIcon,
  SupportAgent as AdvisorIcon,
} from '@mui/icons-material';
import api from '../services/api';

// =============== Tipos =================
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
  originCarrier?: string | null;
  description?: string | null;
  weight?: number | null;
  declaredValue?: number | null;
  isMaster?: boolean;
  totalBoxes?: number;
  status?: string;
  statusLabel?: string;
  receivedAt?: string | null;
  deliveredAt?: string | null;
  deliveryRecipientName?: string | null;
  deliverySignature?: string | null;
  deliveryPhoto?: string | null;
  deliveryNotes?: string | null;
  driverName?: string | null;
  vehicleNumber?: string | null;
  vehiclePlates?: string | null;
  destinationCity?: string | null;
  destinationCountry?: string | null;
  destinationCode?: string | null;
  nationalCarrier?: string | null;
  nationalTracking?: string | null;
  nationalLabelUrl?: string | null;
  internationalTracking?: string | null;
  paymentStatus?: string | null;
  clientPaid?: boolean;
  clientPaidAt?: string | null;
  consolidationId?: number | null;
  missingOnArrival?: boolean;
  isLost?: boolean;
  totalCost?: number | null;
  poboxCostUsd?: number | null;
  nationalLabelCost?: number | null;
  nationalLabelCostPerBox?: number | null;
  pqtxShipment?: {
    totalGuia: number;
    envíosEnGuia: number;
    costoProrrateado: number;
  } | null;
  pqtxApiTotal?: number | null;
  poboxServiceCost?: number | null;       // VENTA MXN (precio cobrado al cliente)
  poboxProviderCostMxn?: number | null;   // COSTO INTERNO MXN (lo que paga el proveedor)
  poboxProviderCostUsd?: number | null;   // COSTO INTERNO USD
  poboxVentaUsd?: number | null;
  poboxVentaMxn?: number | null;
  poboxTarifaNivel?: number | null;
  registeredExchangeRate?: number | null;
  // GEX (paquetería garantizada) — visible solo si fue contratada
  hasGex?: boolean;
  gexTotalCost?: number | null;
  gexInsuranceCost?: number | null;
  gexFixedCost?: number | null;
  declaredValueMxn?: number | null;
  gexFolio?: string | null;
  assignedCostMxn?: number | null;
  montoPagado?: number | null;
  saldoPendiente?: number | null;
  assignedAddress?: Address | null;
  currentBranch?: { id: number; code?: string | null; name?: string | null } | null;
  boxDimensions?: Array<{
    box_number: number;
    weight?: number | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    captured_at?: string | null;
  }>;
  scannedBox?: {
    boxNumber: number;
    tracking: string;
    masterTracking?: string | null;
    weight?: number | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    captured: boolean;
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
  imageUrl?: string | null;
  // 💰 Tarifa PO Box por hija (para desglose en scanner multisucursal)
  poboxTarifaNivel?: number | null;
  poboxVentaUsd?: number | null;
  poboxServiceCost?: number | null;
}

interface ShipmentClient {
  id: number;
  name: string;
  email: string;
  boxId: string;
  advisor?: { id: number; name: string } | null;
}

interface ShipmentResponse {
  success: boolean;
  shipment: {
    master: ShipmentMaster;
    children: ShipmentChild[];
    client: ShipmentClient;
  };
}

// Contenedor marítimo (subset que mostramos en el scanner multi-sucursal)
interface MaritimeContainer {
  id: number;
  container_number?: string | null;
  bl_number?: string | null;
  so_number?: string | null;
  reference_code?: string | null;
  status?: string | null;
  type?: string | null;
  eta?: string | null;
  vessel_name?: string | null;
  voyage_number?: string | null;
  port_of_loading?: string | null;
  port_of_discharge?: string | null;
  place_of_delivery?: string | null;
  consignee?: string | null;
  shipper?: string | null;
  carrier?: string | null;
  carrier_name?: string | null;
  total_weight_kg?: number | string | null;
  total_cbm?: number | string | null;
  total_packages?: number | null;
  final_cost_mxn?: number | string | null;
  shipment_count?: number | string | null;
  route_code?: string | null;
  route_name?: string | null;
  client_box_id?: string | null;
  client_name?: string | null;
  monitor_name?: string | null;
  received_at?: string | null;
  actual_arrival?: string | null;
  actual_departure?: string | null;
  planned_departure?: string | null;
  laden_on_board?: string | null;
  last_tracking_event?: string | null;
  last_tracking_date?: string | null;
  last_tracking_location?: string | null;
  mj_container_id?: number | string | null;
  week_number?: string | null;
}

interface MovementEvent {
  id?: number | string;
  status?: string;
  // Etiquetas (camel y snake)
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

// =============== Helpers =================
const normalizeBarcode = (raw: string): string => {
  let v = raw.trim();
  // Re-mapear caracteres por layout de teclado ES (Mac) cuando un QR llega mal
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

  // Si es URL .../track/CODIGO o .../t/CODIGO, extraer solo el código
  const urlMatch = v.match(/(?:track|t)[/-]([A-Z0-9-]+)/i);
  if (urlMatch) v = urlMatch[1];

  v = v.toUpperCase().trim();

  // Detectar guías FedEx de 34 dígitos puros y extraer últimos 12
  if (/^\d{34}$/.test(v)) {
    return v.slice(-12);
  }

  // Hijas PO Box: formato canónico US-{10 dígitos}-{4 dígitos}.
  // El QR a veces llega sin guiones y SIN los ceros del sufijo
  // ("US491748132005" -> US-4917481320-0005). El código de barras
  // mete comillas en lugar de guiones y deja el sufijo sin padding
  // ("US'4917481320'04" -> US-4917481320-04 -> US-4917481320-0004).
  // Reconstruimos el formato canónico:
  const usJoined = v.match(/^US(\d{10})(\d{1,4})$/); // sin guiones, hija
  if (usJoined) {
    return `US-${usJoined[1]}-${usJoined[2].padStart(4, '0')}`;
  }
  const usDashedShort = v.match(/^US-(\d{10})-(\d{1,3})$/); // guiones, sufijo corto
  if (usDashedShort) {
    return `US-${usDashedShort[1]}-${usDashedShort[2].padStart(4, '0')}`;
  }

  // Auto-insertar guion si viene pegado (US2722344044 -> US-2722344044, master)
  const prefixMatch = v.match(/^(US|AIR|LOG|TRK)(\d+)$/);
  if (prefixMatch) v = `${prefixMatch[1]}-${prefixMatch[2]}`;

  return v;
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const fmtMoney = (n?: number | null, currency = 'MXN') => {
  if (n == null || isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(n));
};
// Marcar como usado por si se usa en otros lados (suprime warning si no)
void fmtMoney;

const isEntregaXLocal = (carrier?: string | null): boolean => {
  const s = (carrier || '').toLowerCase();
  return s.includes('entregax') || s.includes('local') || s.includes('propia');
};

const lastMileLabel = (carrier?: string | null): string => {
  if (!carrier) return 'No asignada';
  const s = carrier.toLowerCase();
  if (isEntregaXLocal(carrier)) return '🚐 EntregaX Local';
  if (s.includes('paquete') || s.includes('pqtx') || s.includes('express')) return '📦 Paquete Express';
  if (s.includes('estafeta')) return '📦 Estafeta';
  if (s.includes('fedex')) return '📦 FedEx';
  if (s.includes('dhl')) return '📦 DHL';
  if (s.includes('redpack')) return '📦 Redpack';
  return `📦 ${carrier.toUpperCase()}`;
};

const statusColor = (status?: string): 'default' | 'success' | 'warning' | 'info' | 'error' | 'primary' => {
  const s = (status || '').toLowerCase();
  if (s.includes('deliver')) return 'success';
  if (s.includes('return')) return 'error';
  if (s.includes('out_for') || s.includes('ready')) return 'warning';
  if (s.includes('transit') || s.includes('customs')) return 'info';
  if (s.includes('reempacado') || s.includes('processing')) return 'primary';
  return 'default';
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

// =============== Componente =================
const UnifiedWarehousePanel: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const navigate = useNavigate();
  const [barcode, setBarcode] = useState('');
  const [lastSearched, setLastSearched] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShipmentResponse['shipment'] | null>(null);
  const [movements, setMovements] = useState<MovementEvent[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [containers, setContainers] = useState<MaritimeContainer[]>([]);
  const [signaturePreview, setSignaturePreview] = useState<{ url: string; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Roles autorizados a ver costos (paquetería + servicio)
  const canViewCosts = (() => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return false;
      const u = JSON.parse(userStr);
      const role = String(u.role || '').toLowerCase().replace(/\s+/g, '_');
      return ['super_admin', 'admin', 'director', 'customer_service'].includes(role);
    } catch {
      return false;
    }
  })();

  // Costo del servicio (PO Box) solo visible para super_admin / admin
  const canViewServiceCost = (() => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return false;
      const u = JSON.parse(userStr);
      const role = String(u.role || '').toLowerCase().replace(/\s+/g, '_');
      return ['super_admin', 'admin'].includes(role);
    } catch {
      return false;
    }
  })();

  const fmtMoney = (v: number | null | undefined, currency: 'MXN' | 'USD' = 'MXN') => {
    if (v == null || isNaN(Number(v))) return '—';
    return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async () => {
    const tracking = normalizeBarcode(barcode);
    if (!tracking) return;

    setLastSearched(tracking);
    setSearching(true);
    setError(null);
    setData(null);
    setMovements([]);
    setContainers([]);

    try {
      const res = await api.get(`/packages/track/${encodeURIComponent(tracking)}`);
      if (res.data?.success && res.data?.shipment) {
        setData(res.data.shipment);
        // Cargar movimientos en paralelo (no bloqueante)
        loadMovements(tracking);
      } else {
        // Sin match como paquete → intentar como contenedor marítimo (JS / BL / nº contenedor)
        const found = await tryContainerSearch(tracking);
        if (!found) setError('No se encontró información para esta guía');
      }
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      if (e.response?.status === 404) {
        // Fallback: buscar como contenedor marítimo antes de declarar 404
        const found = await tryContainerSearch(tracking);
        if (!found) {
          setError(`Guía "${tracking}" no encontrada en el sistema`);
        }
      } else {
        setError(e.response?.data?.error || 'Error al consultar la guía');
      }
    } finally {
      setSearching(false);
      // Auto-seleccionar input para siguiente consulta
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  };

  // Intenta resolver el código como contenedor marítimo (JS, BL, container_number, ordersn, etc.)
  // Devuelve true si encontró al menos un contenedor.
  const tryContainerSearch = async (q: string): Promise<boolean> => {
    try {
      const res = await api.get('/maritime/containers', { params: { search: q } });
      const list: MaritimeContainer[] = Array.isArray(res.data) ? res.data : [];
      if (list.length > 0) {
        setContainers(list);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const loadMovements = async (tracking: string) => {
    setLoadingMovements(true);
    try {
      const res = await api.get(`/packages/track/${encodeURIComponent(tracking)}/movements`);
      const list: MovementEvent[] =
        res.data?.movements ||
        res.data?.events ||
        res.data?.history ||
        res.data?.timeline ||
        [];
      setMovements(Array.isArray(list) ? list : []);
    } catch {
      // Silencioso: los movimientos son auxiliares
      setMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  const handleClear = () => {
    setBarcode('');
    setData(null);
    setError(null);
    setMovements([]);
    setContainers([]);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const copy = (text?: string | null) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const m = data?.master;
  const client = data?.client;
  const children = data?.children || [];

  return (
    <Box p={3} sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Button
        variant="outlined"
        startIcon={<ArrowBackIcon />}
        onClick={() => onBack ? onBack() : navigate(-1)}
        sx={{ mb: 2, borderColor: '#F05A28', color: '#F05A28', '&:hover': { borderColor: '#d44a1f', bgcolor: 'rgba(240,90,40,0.05)' } }}
      >
        Atrás
      </Button>
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 2,
          bgcolor: 'primary.main',
          color: 'white',
          backgroundImage: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <SearchIcon sx={{ fontSize: 44 }} />
          <Box flex={1}>
            <Typography variant="h5" fontWeight="bold">
              Consulta Multi-Sucursal
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Escanea o escribe cualquier guía para ver toda su información. Este módulo es
              <strong> solo de consulta</strong> — no genera entradas ni salidas.
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Buscador */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <ScannerIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
          <TextField
            inputRef={inputRef}
            fullWidth
            variant="outlined"
            placeholder="Escanea o escribe la guía (DHL, AIR, LOG, US, contenedor / BL / JS, ordersn marítimo…)"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            disabled={searching}
            autoFocus
            sx={{
              '& .MuiInputBase-input': {
                fontSize: '1.4rem',
                fontWeight: 'bold',
                textAlign: 'center',
                letterSpacing: 1.5,
              },
            }}
          />
          <Button
            variant="contained"
            size="large"
            onClick={handleSearch}
            disabled={!barcode.trim() || searching}
            startIcon={searching ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
            sx={{ px: 3, py: 1.8, minWidth: 160 }}
          >
            {searching ? 'Buscando...' : 'Consultar'}
          </Button>
          {(data || error) && (
            <Button variant="outlined" size="large" onClick={handleClear} sx={{ py: 1.8 }}>
              Limpiar
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" icon={<ErrorIcon />} sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight="bold">
            {error}
          </Typography>
          <Typography variant="body2">
            Verifica que el código sea correcto. Acepta guías internas (TRN, US, LOG, AIR), DHL,
            marítimo (ordersn) y nacionales.
          </Typography>
        </Alert>
      )}

      {/* Sin resultado todavía */}
      {!data && !error && !searching && containers.length === 0 && (
        <Alert severity="info" icon={<ScannerIcon />}>
          <Typography variant="body2">
            <strong>Tip:</strong> coloca el cursor en el cuadro de búsqueda y dispara el escáner.
            El sistema detectará automáticamente el tipo de guía y mostrará toda la información.
            También puedes rastrear contenedores marítimos por <strong>JS</strong>, <strong>BL</strong> o
            <strong> número de contenedor</strong>.
          </Typography>
        </Alert>
      )}

      {/* Resultado: contenedor(es) marítimo(s) */}
      {!data && containers.length > 0 && (
        <Stack spacing={2}>
          <Alert severity="success" icon={<ShippingIcon />}>
            <Typography variant="body2">
              Se encontró <strong>{containers.length}</strong>{' '}
              {containers.length === 1 ? 'contenedor marítimo' : 'contenedores marítimos'} para
              "<strong>{lastSearched}</strong>". Haz clic en "Ver detalle" para abrir el costeo
              marítimo del contenedor.
            </Typography>
          </Alert>
          {containers.map((c) => {
            const num = (n?: number | string | null) =>
              n == null || n === '' ? '—' : Number(n).toLocaleString('es-MX');
            return (
              <Paper
                key={c.id}
                elevation={3}
                sx={{ p: 3, borderLeft: 6, borderColor: 'info.main' }}
              >
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={2}
                      flexWrap="wrap"
                    >
                      <ShippingIcon sx={{ fontSize: 36, color: 'info.main' }} />
                      <Box flex={1} minWidth={0}>
                        <Typography variant="overline" color="text.secondary">
                          Contenedor marítimo
                        </Typography>
                        <Typography
                          variant="h5"
                          fontWeight="bold"
                          fontFamily="monospace"
                          sx={{ wordBreak: 'break-all' }}
                        >
                          {c.container_number || c.bl_number || `#${c.id}`}
                        </Typography>
                        {c.reference_code && (
                          <Typography variant="caption" color="text.secondary">
                            Ref: {c.reference_code}
                          </Typography>
                        )}
                      </Box>
                      <Stack alignItems="flex-end" spacing={1}>
                        <Chip
                          label={c.status || 'Sin estado'}
                          color={statusColor(c.status || '')}
                          sx={{ fontWeight: 'bold' }}
                        />
                        {c.type && (
                          <Chip
                            label={c.type}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 700 }}
                          />
                        )}
                        {c.week_number && (
                          <Chip
                            label={`Semana ${c.week_number}`}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        )}
                      </Stack>
                    </Stack>
                  </Grid>

                  <Grid size={12}>
                    <Divider />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      Container #
                    </Typography>
                    <Typography fontWeight={700} fontFamily="monospace">
                      {c.container_number || '—'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      BL
                    </Typography>
                    <Typography fontWeight={700} fontFamily="monospace">
                      {c.bl_number || '—'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      SO / JS
                    </Typography>
                    <Typography fontWeight={700} fontFamily="monospace">
                      {c.so_number || c.mj_container_id || '—'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      Ruta
                    </Typography>
                    <Typography fontWeight={700}>
                      {c.route_code || c.route_name || '—'}
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      <ShippingIcon fontSize="inherit" /> Vessel
                    </Typography>
                    <Typography fontWeight={700}>
                      {c.vessel_name || '—'}
                      {c.voyage_number ? ` · V/${c.voyage_number}` : ''}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      <PlaceIcon fontSize="inherit" /> POL → POD
                    </Typography>
                    <Typography fontWeight={700}>
                      {(c.port_of_loading || '—') + ' → ' + (c.port_of_discharge || '—')}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      <ClockIcon fontSize="inherit" /> ETA
                    </Typography>
                    <Typography fontWeight={700}>{fmtDate(c.eta)}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      <ClockIcon fontSize="inherit" /> Llegada real
                    </Typography>
                    <Typography fontWeight={700}>
                      {fmtDate(c.actual_arrival || c.received_at)}
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Typography variant="overline" color="text.secondary">
                      <ScaleIcon fontSize="inherit" /> Peso total
                    </Typography>
                    <Typography fontWeight={700}>
                      {num(c.total_weight_kg)} kg
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Typography variant="overline" color="text.secondary">
                      <RulerIcon fontSize="inherit" /> CBM
                    </Typography>
                    <Typography fontWeight={700}>{num(c.total_cbm)}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Typography variant="overline" color="text.secondary">
                      <PackageIcon fontSize="inherit" /> Envíos / paquetes
                    </Typography>
                    <Typography fontWeight={700}>
                      {num(c.shipment_count)}
                      {c.total_packages ? ` · ${num(c.total_packages)} pkts` : ''}
                    </Typography>
                  </Grid>

                  {(c.consignee || c.shipper || c.client_name) && (
                    <Grid size={12}>
                      <Divider sx={{ my: 1 }} />
                      <Grid container spacing={2}>
                        {c.shipper && (
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <Typography variant="overline" color="text.secondary">
                              Shipper
                            </Typography>
                            <Typography fontWeight={700}>{c.shipper}</Typography>
                          </Grid>
                        )}
                        {c.consignee && (
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <Typography variant="overline" color="text.secondary">
                              Consignee
                            </Typography>
                            <Typography fontWeight={700}>{c.consignee}</Typography>
                          </Grid>
                        )}
                        {c.client_name && (
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <Typography variant="overline" color="text.secondary">
                              <PersonIcon fontSize="inherit" /> Cliente
                            </Typography>
                            <Typography fontWeight={700}>
                              {c.client_name}
                              {c.client_box_id ? ` · ${c.client_box_id}` : ''}
                            </Typography>
                          </Grid>
                        )}
                      </Grid>
                    </Grid>
                  )}

                  {c.last_tracking_event && (
                    <Grid size={12}>
                      <Divider sx={{ my: 1 }} />
                      <Stack direction="row" spacing={1} alignItems="center">
                        <HistoryIcon fontSize="small" color="info" />
                        <Box>
                          <Typography variant="overline" color="text.secondary">
                            Último evento de tracking
                          </Typography>
                          <Typography fontWeight={700}>
                            {c.last_tracking_event}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {fmtDate(c.last_tracking_date)}
                            {c.last_tracking_location ? ` · ${c.last_tracking_location}` : ''}
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>
                  )}

                  <Grid size={12}>
                    <Divider sx={{ my: 1 }} />
                    <Stack direction="row" spacing={2}>
                      <Button
                        variant="outlined"
                        startIcon={<CopyIcon />}
                        onClick={() => copy(c.container_number || c.bl_number || '')}
                      >
                        Copiar #
                      </Button>
                    </Stack>
                  </Grid>
                </Grid>
              </Paper>
            );
          })}
        </Stack>
      )}

      {/* Resultado */}
      {data && m && (
        <Stack spacing={3}>
          {/* Caja escaneada (LOG marítimo con sufijo) — se muestra ANTES del master */}
          {m.scannedBox && (
            <Paper sx={{ p: 3, border: '2px solid', borderColor: m.scannedBox.captured ? 'success.main' : 'warning.main', bgcolor: m.scannedBox.captured ? '#E8F5E9' : '#FFF3E0' }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
                <Box sx={{ width: 44, height: 44, borderRadius: 1, bgcolor: m.scannedBox.captured ? 'success.main' : 'warning.main', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900 }}>
                  {m.scannedBox.boxNumber}
                </Box>
                <Box flex={1}>
                  <Typography variant="overline" color="text.secondary">Caja escaneada</Typography>
                  <Typography variant="h6" fontFamily="monospace" fontWeight={800}>{m.scannedBox.tracking}</Typography>
                  <Typography variant="caption" color={m.scannedBox.captured ? 'success.dark' : 'warning.dark'} fontWeight={700}>
                    {m.scannedBox.captured ? '✓ Medidas capturadas' : '⚠ Sin medidas capturadas'}
                  </Typography>
                </Box>
              </Stack>
              {m.scannedBox.captured && (
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="overline" color="text.secondary">Peso</Typography>
                    <Typography variant="h6" fontWeight={800}>{m.scannedBox.weight != null ? `${Number(m.scannedBox.weight).toFixed(2)} kg` : '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="overline" color="text.secondary">Largo</Typography>
                    <Typography variant="h6" fontWeight={800}>{m.scannedBox.length != null ? `${m.scannedBox.length} cm` : '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="overline" color="text.secondary">Ancho</Typography>
                    <Typography variant="h6" fontWeight={800}>{m.scannedBox.width != null ? `${m.scannedBox.width} cm` : '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Typography variant="overline" color="text.secondary">Alto</Typography>
                    <Typography variant="h6" fontWeight={800}>{m.scannedBox.height != null ? `${m.scannedBox.height} cm` : '—'}</Typography>
                  </Grid>
                </Grid>
              )}
            </Paper>
          )}

          {/* Tarjeta principal */}
          <Paper elevation={3} sx={{ p: 3, borderLeft: 6, borderColor: 'primary.main' }}>
            <Grid container spacing={2}>
              {/* Tracking + estado */}
              <Grid size={12}>
                <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
                  <PackageIcon sx={{ fontSize: 36, color: 'primary.main' }} />
                  <Box flex={1} minWidth={0}>
                    <Typography variant="overline" color="text.secondary">
                      Guía consultada
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="h4" fontWeight="bold" sx={{ wordBreak: 'break-all' }}>
                        {lastSearched && lastSearched.toUpperCase() !== m.tracking?.toUpperCase()
                          ? lastSearched
                          : m.tracking}
                      </Typography>
                      <Tooltip title="Copiar">
                        <Button size="small" onClick={() => copy(lastSearched || m.tracking)} sx={{ minWidth: 0 }}>
                          <CopyIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                    </Stack>
                    {lastSearched && lastSearched.toUpperCase() !== m.tracking?.toUpperCase() && (
                      <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                        Interno: {m.tracking}
                      </Typography>
                    )}
                    {m.description && (
                      <Typography variant="body2" color="text.secondary">
                        {m.description}
                      </Typography>
                    )}
                  </Box>
                  <Stack alignItems="flex-end" spacing={1}>
                    {(() => {
                      // Si el paquete (o su master) está marcado como faltante/perdido,
                      // priorizamos ese estado por encima del status técnico de la BD
                      // (que puede decir 'received_mty' por transiciones masivas en bloque).
                      if (m.isLost) {
                        return (
                          <Chip
                            label="⚠️ PERDIDA"
                            color="error"
                            sx={{ fontWeight: 'bold', fontSize: '0.95rem', py: 2 }}
                          />
                        );
                      }
                      if (m.missingOnArrival) {
                        return (
                          <Chip
                            label={
                              m.currentBranch?.name
                                ? `⏳ RETRASADA — NO LLEGÓ A MTY · ${m.currentBranch.name}`
                                : '⏳ RETRASADA — NO LLEGÓ A MTY'
                            }
                            color="warning"
                            sx={{ fontWeight: 'bold', fontSize: '0.95rem', py: 2 }}
                          />
                        );
                      }
                      return (
                        <Chip
                          icon={<CheckIcon />}
                          label={
                            m.status === 'shipped'
                              ? '📮 Enviado a destino'
                              : m.currentBranch?.name
                                ? `${m.statusLabel || m.status || 'Sin estado'} · ${m.currentBranch.name}`
                                : (m.statusLabel || m.status || 'Sin estado')
                          }
                          color={statusColor(m.status)}
                          sx={{ fontWeight: 'bold', fontSize: '0.95rem', py: 2 }}
                        />
                      );
                    })()}
                    {/* 📋 Evidencia de entrega: solo cuando el envío está entregado */}
                    {m.status === 'delivered' && (m.deliveryRecipientName || m.deliverySignature || m.deliveryPhoto || m.deliveredAt) && (
                      <Paper
                        elevation={0}
                        sx={{
                          p: 1.5,
                          mt: 0.5,
                          width: '100%',
                          maxWidth: 320,
                          border: '1px solid',
                          borderColor: 'success.light',
                          borderRadius: 2,
                          bgcolor: 'success.50',
                        }}
                      >
                        <Stack spacing={1}>
                          <Typography variant="caption" fontWeight={700} color="success.dark" sx={{ letterSpacing: 0.5 }}>
                            ✅ EVIDENCIA DE ENTREGA
                          </Typography>
                          {m.deliveredAt && (
                            <Typography variant="caption" color="text.secondary">
                              <ClockIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.5 }} />
                              {new Date(m.deliveredAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                            </Typography>
                          )}
                          {m.deliveryRecipientName && (
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <PersonIcon sx={{ fontSize: 16, color: 'success.main' }} />
                              <Box>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1 }}>
                                  Recibido por
                                </Typography>
                                <Typography variant="body2" fontWeight={700}>
                                  {m.deliveryRecipientName}
                                </Typography>
                              </Box>
                            </Stack>
                          )}
                          {m.driverName && (
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <LocalShippingIcon sx={{ fontSize: 16, color: 'success.main' }} />
                              <Box>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1 }}>
                                  Repartidor
                                </Typography>
                                <Typography variant="body2" fontWeight={700}>
                                  {m.driverName}
                                  {m.vehicleNumber && (
                                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                                      · {m.vehicleNumber}{m.vehiclePlates ? ` (${m.vehiclePlates})` : ''}
                                    </Typography>
                                  )}
                                </Typography>
                              </Box>
                            </Stack>
                          )}
                          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                            {m.deliverySignature && (
                              <Tooltip title="Ver firma" arrow>
                                <Box
                                  onClick={() =>
                                    setSignaturePreview({
                                      url: m.deliverySignature as string,
                                      title: `Firma de ${m.deliveryRecipientName || 'receptor'}`,
                                    })
                                  }
                                  sx={{
                                    width: 80,
                                    height: 50,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1,
                                    bgcolor: 'background.paper',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    p: 0.25,
                                    transition: 'transform 0.15s ease',
                                    '&:hover': { transform: 'scale(1.05)', boxShadow: 2 },
                                  }}
                                >
                                  <Box
                                    component="img"
                                    src={m.deliverySignature}
                                    alt="firma"
                                    sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                  />
                                </Box>
                              </Tooltip>
                            )}
                            {m.deliveryPhoto && (
                              <Tooltip title="Ver foto de entrega" arrow>
                                <Box
                                  onClick={() =>
                                    setSignaturePreview({
                                      url: m.deliveryPhoto as string,
                                      title: 'Foto de entrega',
                                    })
                                  }
                                  sx={{
                                    width: 50,
                                    height: 50,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1,
                                    bgcolor: 'background.paper',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    transition: 'transform 0.15s ease',
                                    '&:hover': { transform: 'scale(1.05)', boxShadow: 2 },
                                  }}
                                >
                                  <Box
                                    component="img"
                                    src={m.deliveryPhoto}
                                    alt="foto"
                                    sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
                                  />
                                </Box>
                              </Tooltip>
                            )}
                            {!m.deliverySignature && !m.deliveryPhoto && (
                              <Typography variant="caption" color="text.disabled" fontStyle="italic">
                                Sin firma ni foto registrada
                              </Typography>
                            )}
                          </Stack>
                          {m.deliveryNotes && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                              "{m.deliveryNotes}"
                            </Typography>
                          )}
                        </Stack>
                      </Paper>
                    )}
                    <Chip
                      label={m.assignedAddress ? '✅ Con instrucciones' : '⚠️ Sin instrucciones'}
                      size="small"
                      color={m.assignedAddress ? 'success' : 'warning'}
                      variant="outlined"
                      sx={{ fontWeight: 700 }}
                    />
                    {(() => {
                      const carrierNorm = String(m.nationalCarrier || '').toLowerCase();
                      const isLocal = !carrierNorm || carrierNorm.includes('local') || carrierNorm.includes('entregax') || carrierNorm.includes('pickup');
                      if (isLocal) {
                        // Entrega local: la "etiqueta" es el PDF impreso desde el navegador.
                        // No hay flag en BD → si tiene instrucciones asignadas = lista para imprimir.
                        if (!m.assignedAddress) return null;
                        return (
                          <Chip
                            label="🏠 Etiqueta Local"
                            size="small"
                            color="info"
                            variant="outlined"
                            sx={{ fontWeight: 700 }}
                          />
                        );
                      }
                      // Paquetería externa: verificar si ya se generó guía nacional
                      const hasLabel = !!(m.nationalLabelUrl || m.nationalTracking);
                      return (
                        <Chip
                          label={hasLabel ? '🏷️ Con etiqueta' : '📋 Sin etiqueta'}
                          size="small"
                          color={hasLabel ? 'success' : 'default'}
                          variant="outlined"
                          sx={{ fontWeight: 700 }}
                        />
                      );
                    })()}
                    {m.isMaster && (
                      <Chip
                        label={`Multipieza · ${m.totalBoxes || 1} cajas`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    )}
                    {m.consolidationId && (
                      <Chip
                        label={`Consolidación #${m.consolidationId}`}
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ fontWeight: 700 }}
                      />
                    )}
                  </Stack>
                </Stack>
              </Grid>

              <Grid size={12}>
                <Divider />
              </Grid>

              {/* Cliente */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <PersonIcon color="action" />
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Cliente
                    </Typography>
                    <Typography variant="body1" fontWeight="bold">
                      {client?.name || 'Sin cliente'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      BOX: <strong>{client?.boxId || 'N/A'}</strong>
                      {client?.email ? ` · ${client.email}` : ''}
                    </Typography>
                  </Box>
                </Stack>
              </Grid>

              {/* Asesor asignado */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <AdvisorIcon color="action" />
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Asesor asignado
                    </Typography>
                    <Typography variant="body1" fontWeight="bold">
                      {client?.advisor?.name || '—'}
                    </Typography>
                  </Box>
                </Stack>
              </Grid>

              {/* Carrier / tracking provider */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <ShippingIcon color="action" />
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Carrier proveedor
                    </Typography>
                    <Typography variant="body1" fontWeight={m.originCarrier ? 700 : 400}>
                      {m.originCarrier || '—'}
                    </Typography>
                    {(m.trackingProvider || m.trackingCourier) && (
                      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                        {m.trackingProvider || m.trackingCourier}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </Grid>

              {/* AWB / Guía Master internacional */}
              {!!m.internationalTracking && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <ShippingIcon color="primary" />
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        AWB / Guía master
                      </Typography>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="body1" fontWeight="bold" sx={{ wordBreak: 'break-all' }}>
                          {m.internationalTracking}
                        </Typography>
                        <Tooltip title="Copiar AWB">
                          <Button
                            size="small"
                            onClick={() => copy(m.internationalTracking!)}
                            sx={{ minWidth: 0, p: 0.5 }}
                          >
                            <CopyIcon fontSize="small" />
                          </Button>
                        </Tooltip>
                      </Stack>
                    </Box>
                  </Stack>
                </Grid>
              )}

              {/* Sucursal donde se escaneó */}
              {m.currentBranch && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <StoreIcon color="warning" />
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Sucursal actual
                      </Typography>
                      <Typography variant="body1" fontWeight="bold">
                        {m.currentBranch.name || m.currentBranch.code || `#${m.currentBranch.id}`}
                      </Typography>
                      {!!m.currentBranch.code && !!m.currentBranch.name && (
                        <Typography variant="caption" color="text.secondary">
                          Código: {m.currentBranch.code}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Grid>
              )}

              {/* Última milla (paquetería final) */}
              {(m.nationalCarrier || m.nationalTracking) && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <DeliveryIcon
                      sx={{
                        color: isEntregaXLocal(m.nationalCarrier) ? 'warning.main' : 'info.main',
                      }}
                    />
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Última milla (entrega final)
                      </Typography>
                      <Typography
                        variant="body1"
                        fontWeight="bold"
                        sx={{
                          color: isEntregaXLocal(m.nationalCarrier) ? 'warning.main' : 'info.main',
                        }}
                      >
                        {lastMileLabel(m.nationalCarrier)}
                      </Typography>
                      {!!m.nationalTracking && (
                        <Typography variant="body2" color="text.secondary">
                          Guía: <strong>{m.nationalTracking}</strong>
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Grid>
              )}

              {/* Peso */}
              <Grid size={{ xs: 6, md: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <ScaleIcon fontSize="small" color="action" />
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Peso
                    </Typography>
                    <Typography variant="body1" fontWeight="bold">
                      {m.weight != null ? `${Number(m.weight).toFixed(2)} kg` : '—'}
                    </Typography>
                  </Box>
                </Stack>
              </Grid>

              {/* Cajas */}
              <Grid size={{ xs: 6, md: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <RulerIcon fontSize="small" color="action" />
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Cajas
                    </Typography>
                    <Typography variant="body1" fontWeight="bold">
                      {m.totalBoxes || 1}
                    </Typography>
                  </Box>
                </Stack>
              </Grid>

              {/* Pago */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <PaymentsIcon color="action" />
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Estado de pago
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        size="small"
                        label={m.clientPaid ? 'PAGADO' : (m.paymentStatus || 'PENDIENTE')}
                        color={m.clientPaid ? 'success' : 'warning'}
                      />
                      {m.clientPaidAt && (
                        <Typography variant="caption" color="text.secondary">
                          {fmtDate(m.clientPaidAt)}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </Grid>

              {/* Costos (solo super_admin / admin / director / customer_service) */}
              {canViewCosts && (
                m.nationalLabelCost != null ||
                m.poboxServiceCost != null ||
                m.poboxVentaUsd != null ||
                m.poboxCostUsd != null ||
                m.assignedCostMxn != null ||
                m.totalCost != null
              ) && (
                <Grid size={12}>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', borderColor: 'warning.light' }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                      <PaymentsIcon color="warning" />
                      <Typography variant="subtitle2" fontWeight="bold" color="warning.dark">
                        Costos internos (uso administrativo)
                      </Typography>
                    </Stack>
                    <Grid container spacing={2}>
                      {(m.nationalLabelCost != null || !!m.scannedBox) && (
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Typography variant="overline" color="text.secondary">
                            Costo paquetería (última milla)
                          </Typography>
                          {m.scannedBox ? (
                            <>
                              <Typography variant="body1" fontWeight="bold" color="warning.dark">
                                Revisar guía master
                              </Typography>
                              <Typography variant="caption" color="text.secondary" display="block">
                                ⚠ Esta guía es hija de un master múltiple. El costo de paquetería se aplica al master completo.
                              </Typography>
                              {(m.scannedBox?.masterTracking || m.tracking) && (
                                <Typography variant="caption" color="text.secondary" display="block" fontFamily="monospace">
                                  Master: {m.scannedBox?.masterTracking || m.tracking}
                                </Typography>
                              )}
                            </>
                          ) : (() => {
                            const total = Number(m.nationalLabelCost) || 0;
                            const boxes = Number(m.totalBoxes) || 1;
                            const perBox = boxes > 0 ? total / boxes : total;
                            return (
                              <>
                                <Typography variant="body1" fontWeight="bold" color="error.main">
                                  {fmtMoney(total, 'MXN')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                  📦 {boxes} caja{boxes !== 1 ? 's' : ''} × {fmtMoney(perBox, 'MXN')}
                                </Typography>
                                {m.nationalCarrier && (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    {lastMileLabel(m.nationalCarrier)}
                                  </Typography>
                                )}
                              </>
                            );
                          })()}
                        </Grid>
                      )}
                      {canViewServiceCost && (m.poboxProviderCostMxn != null || m.poboxServiceCost != null || m.pqtxApiTotal != null) && (
                        <Grid size={{ xs: 6, md: 3 }}>
                          {(m.poboxProviderCostMxn != null || m.poboxServiceCost != null) && (
                            <>
                              <Typography variant="overline" color="text.secondary">
                                Costo del servicio (proveedor)
                              </Typography>
                              <Typography variant="body1" fontWeight="bold">
                                {fmtMoney(m.poboxProviderCostMxn ?? m.poboxServiceCost ?? 0, 'MXN')}
                              </Typography>
                              {(m.poboxProviderCostUsd ?? m.poboxCostUsd) != null && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  ({fmtMoney(m.poboxProviderCostUsd ?? m.poboxCostUsd ?? 0, 'USD')})
                                </Typography>
                              )}
                            </>
                          )}
                          {m.pqtxApiTotal != null && (
                            <Box sx={{ mt: (m.poboxProviderCostMxn != null || m.poboxServiceCost != null) ? 1.5 : 0 }}>
                              <Typography variant="overline" color="text.secondary">
                                Costo paquetería (API)
                              </Typography>
                              {m.scannedBox ? (
                                <>
                                  <Typography variant="body1" fontWeight="bold" color="warning.dark">
                                    Consulta guía master
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    ⚠ Esta guía es hija de un master múltiple. El costo API se aplica al master completo.
                                  </Typography>
                                  {(m.scannedBox?.masterTracking || m.tracking) && (
                                    <Typography variant="caption" color="text.secondary" display="block" fontFamily="monospace">
                                      Master: {m.scannedBox?.masterTracking || m.tracking}
                                    </Typography>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Typography variant="body1" fontWeight="bold" color="error.main">
                                    {fmtMoney(m.pqtxApiTotal, 'MXN')}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    Total real cobrado por Paquete Express
                                  </Typography>
                                  {m.registeredExchangeRate != null && Number(m.registeredExchangeRate) > 0 && (
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                      💱 Tipo de cambio asignado: <strong>${Number(m.registeredExchangeRate).toFixed(2)} MXN/USD</strong>
                                    </Typography>
                                  )}
                                  {m.hasGex && Number(m.gexTotalCost ?? 0) > 0 && (
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                      🛡️ GEX contratado: <strong>{fmtMoney(Number(m.gexTotalCost), 'MXN')}</strong>
                                      {m.gexFolio ? ` (folio ${m.gexFolio})` : ''}
                                    </Typography>
                                  )}
                                </>
                              )}
                            </Box>
                          )}
                        </Grid>
                      )}
                      {(m.poboxVentaUsd != null || m.poboxServiceCost != null) && (
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Typography variant="overline" color="text.secondary">
                            Venta al cliente (PO Box)
                          </Typography>
                          {(() => {
                            // Desglose REAL por hija (suma de pobox_venta_usd y pobox_service_cost)
                            const childRows = (children || []).filter(c => (c.poboxVentaUsd ?? 0) > 0 || (c.poboxServiceCost ?? 0) > 0);
                            const totalUsdReal = childRows.reduce((s, c) => s + Number(c.poboxVentaUsd || 0), 0);
                            const totalMxnReal = childRows.reduce((s, c) => s + Number(c.poboxServiceCost || 0), 0);
                            const tc = Number(m.registeredExchangeRate) || 0;
                            // Fallback a totales del master si no hay datos por hija
                            const totalUsd = totalUsdReal > 0 ? totalUsdReal : (Number(m.poboxVentaUsd) || 0);
                            const totalMxn = totalMxnReal > 0 ? totalMxnReal : (Number(m.poboxServiceCost) || (tc > 0 ? totalUsd * tc : 0));
                            // Agrupar por nivel para resumen "6×N1 + 2×N2"
                            const byLevel = new Map<string, { qty: number; unitUsd: number; subtotalUsd: number }>();
                            childRows.forEach(c => {
                              const lvl = c.poboxTarifaNivel != null ? `N${c.poboxTarifaNivel}` : '?';
                              const unit = Number(c.poboxVentaUsd || 0);
                              const cur = byLevel.get(lvl) || { qty: 0, unitUsd: unit, subtotalUsd: 0 };
                              cur.qty += 1;
                              cur.unitUsd = unit; // asume tarifa fija por nivel
                              cur.subtotalUsd += unit;
                              byLevel.set(lvl, cur);
                            });
                            const summary = Array.from(byLevel.entries())
                              .map(([lvl, v]) => `${v.qty}×${lvl} $${v.unitUsd.toFixed(2)} = $${v.subtotalUsd.toFixed(2)}`)
                              .join(' + ');
                            return (
                              <>
                                <Typography variant="body1" fontWeight="bold" color="success.main">
                                  {fmtMoney(totalMxn, 'MXN')}
                                </Typography>
                                {summary && (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    💵 {summary} = <strong>${totalUsd.toFixed(2)} USD</strong>
                                  </Typography>
                                )}
                                {tc > 0 && (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    × TC ${tc.toFixed(2)} = <strong>{fmtMoney(totalUsd * tc, 'MXN')}</strong>
                                  </Typography>
                                )}
                                {childRows.length > 0 && (
                                  <Box sx={{ mt: 1, pl: 1, borderLeft: '2px solid', borderColor: 'success.light' }}>
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600, mb: 0.25 }}>
                                      Desglose por guía hija:
                                    </Typography>
                                    {childRows.map(c => (
                                      <Typography key={c.id} variant="caption" color="text.secondary" display="block" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                        {c.tracking} · N{c.poboxTarifaNivel ?? '?'} · ${Number(c.poboxVentaUsd || 0).toFixed(2)} USD · {fmtMoney(Number(c.poboxServiceCost || 0), 'MXN')}
                                      </Typography>
                                    ))}
                                  </Box>
                                )}
                              </>
                            );
                          })()}
                        </Grid>
                      )}
                      {m.totalCost != null && Number(m.totalCost) > 0 && (
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Typography variant="overline" color="text.secondary">
                            Costo total GEX
                          </Typography>
                          <Typography variant="body1" fontWeight="bold">
                            {fmtMoney(m.totalCost, 'MXN')}
                          </Typography>
                          {m.gexFolio && (
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontFamily: 'monospace' }}>
                              Folio: {m.gexFolio}
                            </Typography>
                          )}
                          {(() => {
                            const declaredUsd = Number(m.declaredValue) || 0;
                            const tc = Number(m.registeredExchangeRate) || 0;
                            const insuredMxn = m.gexInsuranceCost != null
                              ? Number(m.gexInsuranceCost)
                              : (declaredUsd * 0.05 * tc);
                            const declaredMxn = m.declaredValueMxn != null
                              ? Number(m.declaredValueMxn)
                              : (declaredUsd * tc);
                            const fixedMxn = m.gexFixedCost != null
                              ? Number(m.gexFixedCost)
                              : Math.max(0, Number(m.totalCost) - insuredMxn);
                            return (
                              <Box sx={{ mt: 0.5, pl: 1, borderLeft: '2px solid', borderColor: 'warning.light' }}>
                                {declaredUsd > 0 && (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    💵 Valor declarado: <strong>${declaredUsd.toFixed(2)} USD</strong>
                                    {declaredMxn > 0 ? ` (${fmtMoney(declaredMxn, 'MXN')})` : ''}
                                  </Typography>
                                )}
                                {insuredMxn > 0 && (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    🛡️ 5% Valor asegurado: <strong>{fmtMoney(insuredMxn, 'MXN')}</strong>
                                  </Typography>
                                )}
                                {fixedMxn > 0 && (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    📜 Póliza GEX (fija): <strong>{fmtMoney(fixedMxn, 'MXN')}</strong>
                                  </Typography>
                                )}
                              </Box>
                            );
                          })()}
                        </Grid>
                      )}
                      {/* Total a cobrar al cliente — usa helper canónico (pobox_service_cost prioritario).
                          Si se escaneó una hija (m.scannedBox presente), muestra costos POR CAJA. */}
                      {(() => {
                        const scannedIsChild = !!m.scannedBox;
                        // Si es hija, el cobro se gestiona en el master: no mostrar totales por caja.
                        if (scannedIsChild) return null;
                        const breakdown = getScannerBreakdown(m, scannedIsChild, children);
                        const { poboxServiceMxn, nationalShippingMxn, gexMxn, totalMxn, paidMxn, pendingMxn } = breakdown;
                        if (totalMxn <= 0) return null;
                        const perBoxLabel = '';
                        return (
                          <>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <Typography variant="overline" color="text.secondary">
                                {scannedIsChild ? `Total por caja escaneada${perBoxLabel}` : 'Total a cobrar al cliente'}
                              </Typography>
                              <Typography variant="body1" fontWeight="bold" color="primary.main">
                                {fmtMXN(totalMxn)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" display="block">
                                Servicio PO Box {fmtMXN(poboxServiceMxn)}
                                {nationalShippingMxn > 0 ? ` + Paquetería ${fmtMXN(nationalShippingMxn)}` : ''}
                                {gexMxn > 0 ? ` + GEX ${fmtMXN(gexMxn)}` : ''}
                              </Typography>
                            </Grid>
                            {!scannedIsChild && (
                              <>
                                <Grid size={{ xs: 6, md: 3 }}>
                                  <Typography variant="overline" color="text.secondary">
                                    Monto pagado
                                  </Typography>
                                  <Typography variant="body1" fontWeight="bold" color="success.dark">
                                    {fmtMXN(paidMxn)}
                                  </Typography>
                                </Grid>
                                <Grid size={{ xs: 6, md: 3 }}>
                                  <Typography variant="overline" color="text.secondary">
                                    Saldo pendiente
                                  </Typography>
                                  <Typography variant="body1" fontWeight="bold" color={pendingMxn > 0 ? 'error.main' : 'success.main'}>
                                    {fmtMXN(pendingMxn)}
                                  </Typography>
                                </Grid>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </Grid>
                  </Paper>
                </Grid>
              )}

              {/* Fechas */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <ClockIcon color="action" />
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Fechas
                    </Typography>
                    <Typography variant="body2">
                      Recibido: <strong>{fmtDate(m.receivedAt)}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Entregado: <strong>{fmtDate(m.deliveredAt)}</strong>
                    </Typography>
                  </Box>
                </Stack>
              </Grid>

              {/* Dirección */}
              {m.assignedAddress && (
                <Grid size={12}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <PlaceIcon color="action" />
                    <Box flex={1}>
                      <Typography variant="overline" color="text.secondary">
                        Dirección de entrega
                      </Typography>
                      {m.assignedAddress.recipientName && (
                        <Typography variant="body2" fontWeight="bold">
                          {m.assignedAddress.recipientName}
                          {m.assignedAddress.phone ? ` · ${m.assignedAddress.phone}` : ''}
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        {formatAddress(m.assignedAddress) || '—'}
                      </Typography>
                      {m.assignedAddress.reference && (
                        <Typography variant="caption" color="text.secondary">
                          Ref: {m.assignedAddress.reference}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Grid>
              )}

              {/* Destino (cuando no hay dirección asignada) */}
              {!m.assignedAddress && (m.destinationCity || m.destinationCountry) && (
                <Grid size={12}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <PlaceIcon color="action" />
                    <Typography variant="body2">
                      Destino:{' '}
                      <strong>
                        {[m.destinationCity, m.destinationCountry].filter(Boolean).join(', ')}
                      </strong>
                      {m.destinationCode ? ` (${m.destinationCode})` : ''}
                    </Typography>
                  </Stack>
                </Grid>
              )}
            </Grid>
          </Paper>

          {/* Tabla de medidas por caja (LOG marítimo) */}
          {Array.isArray(m.boxDimensions) && m.boxDimensions.length > 0 && (
            <Paper sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6">
                  Medidas y peso por caja
                </Typography>
                <Chip
                  size="small"
                  label={`${m.boxDimensions.length}/${m.totalBoxes || m.boxDimensions.length} capturadas`}
                  color={m.boxDimensions.length === (m.totalBoxes || 0) ? 'success' : 'warning'}
                />
              </Stack>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Caja</TableCell>
                      <TableCell align="right">Peso (kg)</TableCell>
                      <TableCell align="right">Largo (cm)</TableCell>
                      <TableCell align="right">Ancho (cm)</TableCell>
                      <TableCell align="right">Alto (cm)</TableCell>
                      <TableCell align="right">Vol. (cm³)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...m.boxDimensions].sort((a, b) => (a.box_number || 0) - (b.box_number || 0)).map((b) => {
                      const vol = (b.length && b.width && b.height) ? Number(b.length) * Number(b.width) * Number(b.height) : null;
                      const isScanned = m.scannedBox?.boxNumber === b.box_number;
                      return (
                        <TableRow key={b.box_number} hover selected={isScanned}>
                          <TableCell>
                            <Typography fontWeight={isScanned ? 900 : 600}>
                              {isScanned ? '➜ ' : ''}{b.box_number}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{b.weight != null ? Number(b.weight).toFixed(2) : '—'}</TableCell>
                          <TableCell align="right">{b.length ?? '—'}</TableCell>
                          <TableCell align="right">{b.width ?? '—'}</TableCell>
                          <TableCell align="right">{b.height ?? '—'}</TableCell>
                          <TableCell align="right">{vol != null ? vol.toLocaleString('es-MX') : '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              {/* Totales */}
              {(() => {
                const total = m.boxDimensions.reduce((acc, b) => {
                  acc.weight += b.weight ? Number(b.weight) : 0;
                  if (b.length && b.width && b.height) acc.volume += Number(b.length) * Number(b.width) * Number(b.height);
                  return acc;
                }, { weight: 0, volume: 0 });
                return (
                  <Stack direction="row" spacing={3} sx={{ mt: 2, pt: 2, borderTop: '1px dashed', borderColor: 'divider' }}>
                    <Typography variant="body2"><strong>Peso total capturado:</strong> {total.weight.toFixed(2)} kg</Typography>
                    <Typography variant="body2"><strong>Volumen total:</strong> {total.volume.toLocaleString('es-MX')} cm³ ({(total.volume / 1_000_000).toFixed(3)} m³)</Typography>
                  </Stack>
                );
              })()}
            </Paper>
          )}

          {/* Cajas hijas (multipieza) */}
          {children.length > 0 && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Cajas del envío ({children.length})
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Tracking</TableCell>
                      <TableCell>Courier</TableCell>
                      <TableCell align="right">Peso</TableCell>
                      <TableCell>Dimensiones</TableCell>
                      <TableCell>Estado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {children.map((c) => (
                      <TableRow key={c.id} hover>
                        <TableCell>{c.boxNumber}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="bold">
                            {c.tracking}
                          </Typography>
                        </TableCell>
                        <TableCell>{c.trackingCourier || '—'}</TableCell>
                        <TableCell align="right">
                          {c.weight != null ? `${Number(c.weight).toFixed(2)} kg` : '—'}
                        </TableCell>
                        <TableCell>{c.dimensions?.formatted || '—'}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={c.status || '—'}
                            color={statusColor(c.status)}
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* Línea de tiempo de movimientos */}
          <Paper sx={{ p: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} mb={2}>
              <HistoryIcon color="primary" />
              <Typography variant="h6">Historial de movimientos</Typography>
              {loadingMovements && <CircularProgress size={18} />}
            </Stack>
            {!loadingMovements && movements.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No hay movimientos registrados para esta guía.
              </Typography>
            )}
            {movements.length > 0 && (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Estado / Evento</TableCell>
                      <TableCell>Sucursal / Ubicación</TableCell>
                      <TableCell>Usuario</TableCell>
                      <TableCell>Notas</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {movements.map((ev, i) => (
                      <TableRow key={ev.id ?? i} hover>
                        <TableCell>{fmtDate(ev.createdAt || ev.created_at || ev.date)}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={ev.statusLabel || ev.status_label || ev.label || ev.status || '—'}
                            color={statusColor(ev.status)}
                          />
                        </TableCell>
                        <TableCell>
                          {ev.branch || ev.branch_name || ev.location || ev.warehouse_location || '—'}
                        </TableCell>
                        <TableCell>{ev.user || ev.created_by_name || (ev.source === 'system' ? 'Sistema' : '—')}</TableCell>
                        <TableCell>{ev.description || ev.notes || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Stack>
      )}

      {/* 🖋️ Modal de preview de firma/foto de entrega */}
      <Dialog
        open={!!signaturePreview}
        onClose={() => setSignaturePreview(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
          <SignatureIcon color="success" />
          {signaturePreview?.title || 'Evidencia de entrega'}
          <IconButton
            onClick={() => setSignaturePreview(null)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {signaturePreview && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                bgcolor: 'grey.50',
                borderRadius: 1,
                p: 2,
                minHeight: 200,
              }}
            >
              <Box
                component="img"
                src={signaturePreview.url}
                alt="evidencia"
                sx={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default UnifiedWarehousePanel;
