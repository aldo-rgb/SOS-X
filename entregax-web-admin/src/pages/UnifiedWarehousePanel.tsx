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
} from '@mui/material';
import {
  QrCodeScanner as ScannerIcon,
  Search as SearchIcon,
  Person as PersonIcon,
  Inventory2 as PackageIcon,
  LocalShipping as ShippingIcon,
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
  description?: string | null;
  weight?: number | null;
  declaredValue?: number | null;
  isMaster?: boolean;
  totalBoxes?: number;
  status?: string;
  statusLabel?: string;
  receivedAt?: string | null;
  deliveredAt?: string | null;
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
}

interface ShipmentResponse {
  success: boolean;
  shipment: {
    master: ShipmentMaster;
    children: ShipmentChild[];
    client: ShipmentClient;
  };
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

  // Auto-insertar guion si viene pegado (US2722344044 -> US-2722344044)
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
  if (isEntregaXLocal(carrier)) return '🚐 EntregaXa Local';
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
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShipmentResponse['shipment'] | null>(null);
  const [movements, setMovements] = useState<MovementEvent[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
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

    setSearching(true);
    setError(null);
    setData(null);
    setMovements([]);

    try {
      const res = await api.get(`/packages/track/${encodeURIComponent(tracking)}`);
      if (res.data?.success && res.data?.shipment) {
        setData(res.data.shipment);
        // Cargar movimientos en paralelo (no bloqueante)
        loadMovements(tracking);
      } else {
        setError('No se encontró información para esta guía');
      }
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      if (e.response?.status === 404) {
        setError(`Guía "${tracking}" no encontrada en el sistema`);
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
              Escáner Multi-Sucursal · Consulta
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Escanea cualquier guía para ver toda su información. Este módulo es
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
            placeholder="Escanea o escribe la guía (DHL, AIR-XXXX, LOG-XXXX, US-XXXX, ordersn marítimo...)"
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
      {!data && !error && !searching && (
        <Alert severity="info" icon={<ScannerIcon />}>
          <Typography variant="body2">
            <strong>Tip:</strong> coloca el cursor en el cuadro de búsqueda y dispara el escáner.
            El sistema detectará automáticamente el tipo de guía y mostrará toda la información.
          </Typography>
        </Alert>
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
                        {m.tracking}
                      </Typography>
                      <Tooltip title="Copiar">
                        <Button size="small" onClick={() => copy(m.tracking)} sx={{ minWidth: 0 }}>
                          <CopyIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                    </Stack>
                    {m.description && (
                      <Typography variant="body2" color="text.secondary">
                        {m.description}
                      </Typography>
                    )}
                  </Box>
                  <Stack alignItems="flex-end" spacing={1}>
                    <Chip
                      icon={<CheckIcon />}
                      label={
                        m.currentBranch?.name
                          ? `${m.statusLabel || m.status || 'Sin estado'} · ${m.currentBranch.name}`
                          : (m.statusLabel || m.status || 'Sin estado')
                      }
                      color={statusColor(m.status)}
                      sx={{ fontWeight: 'bold', fontSize: '0.95rem', py: 2 }}
                    />
                    {m.isMaster && (
                      <Chip
                        label={`Multipieza · ${m.totalBoxes || 1} cajas`}
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

              {/* Carrier / tracking provider */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <ShippingIcon color="action" />
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Carrier proveedor
                    </Typography>
                    <Typography variant="body1">
                      {m.trackingProvider || m.trackingCourier || '—'}
                    </Typography>
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
                              {m.tracking && (
                                <Typography variant="caption" color="text.secondary" display="block" fontFamily="monospace">
                                  Master: {m.tracking}
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
                        <Grid size={{ xs: 6, md: 3 }}>
                          <Typography variant="overline" color="text.secondary">
                            Costo total GEX
                          </Typography>
                          <Typography variant="body1" fontWeight="bold">
                            {fmtMoney(m.totalCost, 'MXN')}
                          </Typography>
                        </Grid>
                      )}
                      {/* Total a cobrar al cliente — usa helper canónico (pobox_service_cost prioritario).
                          Si se escaneó una hija (m.scannedBox presente), muestra costos POR CAJA. */}
                      {(() => {
                        const scannedIsChild = !!m.scannedBox;
                        const breakdown = getScannerBreakdown(m, scannedIsChild, children);
                        const { poboxServiceMxn, nationalShippingMxn, gexMxn, totalMxn, paidMxn, pendingMxn, boxCount } = breakdown;
                        if (totalMxn <= 0) return null;
                        const perBoxLabel = scannedIsChild ? ` · por caja (de ${boxCount})` : '';
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
    </Box>
  );
};

export default UnifiedWarehousePanel;
