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
  paymentStatus?: string | null;
  clientPaid?: boolean;
  clientPaidAt?: string | null;
  totalCost?: number | null;
  poboxCostUsd?: number | null;
  assignedAddress?: Address | null;
  currentBranch?: { id: number; code?: string | null; name?: string | null } | null;
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
const UnifiedWarehousePanel: React.FC = () => {
  const [barcode, setBarcode] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShipmentResponse['shipment'] | null>(null);
  const [movements, setMovements] = useState<MovementEvent[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
