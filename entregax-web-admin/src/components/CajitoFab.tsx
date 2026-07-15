// ============================================
// CAJITO FAB — Botón flotante + chat panel anclado (no modal)
// Se muestra solo si el toggle global `cajito_enabled` está activo.
// Usa el avatar configurado en brand_assets (slot 'cajito_avatar').
// Modos: Chat (IA) | Rastrear (lookup directo con datos del escáner)
// ============================================

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Fab,
  Tooltip,
  Paper,
  Box,
  Typography,
  Avatar,
  IconButton,
  TextField,
  CircularProgress,
  Slide,
  Chip,
  Divider,
  InputAdornment,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import BuildIcon from '@mui/icons-material/Build';
import SearchIcon from '@mui/icons-material/Search';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PersonIcon from '@mui/icons-material/Person';
import PlaceIcon from '@mui/icons-material/Place';
import InventoryIcon from '@mui/icons-material/Inventory';
import HistoryIcon from '@mui/icons-material/History';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { usePaymentStatus } from '../hooks/usePaymentStatus';
import api from '../services/api';

const fmtMoney = (v: number | null | undefined, cur = 'MXN') =>
  v == null ? '—' : `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const CAJITO_GRADIENT = 'linear-gradient(135deg, #FF6F00 0%, #D32F2F 100%)';
const CAJITO_RING = '#FF6F00';
const CAJITO_SHADOW = 'rgba(255,111,0,0.45)';

const resolveUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
  if (url.startsWith('uploads/')) return `${API_BASE}/${url}`;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
};

interface ChatMsg {
  id: number;
  role: 'user' | 'cajito' | 'tool';
  text: string;
  ts: number;
  toolName?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PackageData = Record<string, any>;

const CONV_KEY = 'cajito.conversationId';

const getCurrentUser = () => {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
};

const statusLabel = (s?: string): string => {
  const map: Record<string, string> = {
    in_transit: 'En tránsito', received: 'Recibido MX', shipped: 'Enviado a destino',
    delivered: 'Entregado', ready_pickup: 'Listo para recoger', customs: 'En aduana',
    received_china: 'Recibido China', consolidated: 'Consolidado', at_port: 'En puerto',
    returned_to_warehouse: 'Devuelto a almacén', lost: 'Perdido',
  };
  return map[s || ''] || s || '—';
};

const statusColor = (s?: string): 'default' | 'success' | 'warning' | 'info' | 'error' | 'primary' => {
  const v = (s || '').toLowerCase();
  if (v === 'delivered') return 'success';
  if (v === 'shipped' || v === 'ready_pickup') return 'primary';
  if (v === 'in_transit' || v === 'received') return 'info';
  if (v === 'customs' || v === 'at_port' || v === 'consolidated') return 'warning';
  if (v === 'lost') return 'error';
  return 'default';
};

interface MovementEvent {
  id?: number;
  createdAt?: string;
  created_at?: string;
  date?: string;
  status?: string;
  statusLabel?: string;
  status_label?: string;
  label?: string;
  branch?: string;
  branch_name?: string;
  location?: string;
  user?: string;
  created_by_name?: string;
  source?: string;
  description?: string;
  notes?: string;
}

// Tarjeta de resultado de un ticket de soporte (rastreo por folio TKT-…)
function TicketLookupResult({ data }: { data: any }) {
  const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'info' | 'error' | 'default' }> = {
    resolved: { label: 'Resuelto', color: 'success' },
    closed: { label: 'Cerrado', color: 'default' },
    waiting_agent: { label: 'Con agente', color: 'warning' },
    escalated_human: { label: 'Con agente', color: 'warning' },
    in_progress: { label: 'En proceso', color: 'info' },
    open: { label: 'Abierto', color: 'info' },
    pending: { label: 'Pendiente', color: 'warning' },
  };
  const st = statusMap[String(data.status || '').toLowerCase()] || { label: data.status || '—', color: 'default' as const };
  const msgs: any[] = Array.isArray(data.messages) ? data.messages : [];
  const fmt = (d: string) => { try { return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return d; } };

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 1.5, py: 1, bgcolor: 'rgba(240,90,40,0.06)', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 16 }}>🎫</Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.3 }}>TICKET</Typography>
          <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{data.ticket_folio}</Typography>
        </Box>
        <Chip size="small" label={st.label} color={st.color} variant={st.color === 'success' ? 'filled' : 'outlined'} />
      </Box>
      <Box sx={{ p: 1.5 }}>
        {data.subject && (
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>{String(data.subject).replace(/\n+/g, ' ').slice(0, 120)}</Typography>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
          {data.client_number && <Chip size="small" variant="outlined" label={`👤 Cliente: ${data.client_number}`} sx={{ fontWeight: 700, color: '#F05A28', borderColor: '#F05A28' }} />}
          {data.client_name && <Chip size="small" variant="outlined" label={data.client_box_id ? `${data.client_name} · ${data.client_box_id}` : data.client_name} />}
          {data.advisor_name && <Chip size="small" variant="outlined" label={`Asesor: ${data.advisor_name}`} />}
          {data.department_name && <Chip size="small" variant="outlined" label={data.department_name} />}
        </Box>
        <Typography variant="caption" color="text.secondary">Creado: {fmt(data.created_at)}</Typography>

        {msgs.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Conversación</Typography>
            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: 240, overflowY: 'auto' }}>
              {msgs.map((mm, i) => {
                const mine = mm.sender_type === 'agent' || mm.sender_type === 'ai';
                return (
                  <Box key={i} sx={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', px: 1, py: 0.75, borderRadius: 1.5, bgcolor: mine ? 'rgba(240,90,40,0.12)' : 'action.hover' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: 'text.secondary' }}>
                      {mm.sender_type === 'agent' ? 'Agente' : mm.sender_type === 'ai' ? 'Cajito IA' : 'Cliente/Asesor'}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{mm.message}</Typography>
                    <Typography variant="caption" color="text.secondary">{fmt(mm.created_at)}</Typography>
                  </Box>
                );
              })}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

// Tarjeta de resultado del escáner dentro del panel de Cajito
function TrackResult({ data, tracking }: { data: PackageData; tracking: string }) {
  const m = data.shipment?.master || data.package || data;
  const client = data.shipment?.client || data.client || null;
  const children: PackageData[] = data.shipment?.children || [];

  const [movements, setMovements] = useState<MovementEvent[]>([]);
  const [loadingMov, setLoadingMov] = useState(false);

  const loadMovements = useCallback(async () => {
    setLoadingMov(true);
    try {
      const res = await api.get(`/packages/track/${encodeURIComponent(m.tracking || tracking)}/movements`);
      const list = res.data?.movements || res.data?.events || res.data?.history || res.data?.timeline || [];
      setMovements(Array.isArray(list) ? list : []);
    } catch { setMovements([]); }
    finally { setLoadingMov(false); }
  }, [m.tracking, tracking]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadMovements(); }, [loadMovements]);

  const clientPaid = m.clientPaid ?? m.client_paid ?? false;
  const paymentStatus = m.paymentStatus ?? m.payment_status ?? '';
  const paid = clientPaid || paymentStatus === 'paid';
  const clientPaidAt = m.clientPaidAt ?? m.client_paid_at ?? m.paid_at ?? null;
  const status = m.status ?? m.statusLabel ?? '';
  const destAddress = m.assignedAddress;
  const hasInstr = !!destAddress || m.needs_instructions === false;

  // "Etiquetado" = la etiqueta YA está impresa:
  //  - LOCAL (EntregaX Local/Nacional, pickup): solo cuenta national_label_url
  //    (mark-label-printed setea 'manual-printed' o URL de PDF). national_tracking
  //    NO aplica porque los locales no tienen tracking nacional; cualquier valor
  //    ahí es ruido (ej. origin tracking del courier USA filtrado por un sync).
  //  - EXTERNAL (DHL, Paquete Express, Skydropx, etc.): cuenta national_label_url
  //    O national_tracking (el waybill nacional vale como evidencia).
  // Esto debe coincidir con UnifiedWarehousePanel y con el módulo de Etiquetado.
  const _carrierForLabel = String(m.nationalCarrier || '').toLowerCase();
  const _isLocalForLabel = !_carrierForLabel || _carrierForLabel.includes('local') || _carrierForLabel.includes('entregax') || _carrierForLabel.includes('pickup') || _carrierForLabel.includes('bodega');
  const hasLabel = _isLocalForLabel
    ? !!m.nationalLabelUrl
    : !!(m.nationalLabelUrl || m.nationalTracking);

  // Para paquetería EXTERNA (Sendex, Paquete Express, etc.) el status 'delivered'
  // significa que se entregó al carrier = "Enviado", no entregado al cliente
  // final (eso lo hace la paquetería). Solo las entregas locales/EntregaX que
  // confirmamos nosotros muestran "Entregado".
  const carrierNorm = String(m.nationalCarrier || '').toLowerCase();
  const isExternalCarrier = !!carrierNorm && !(
    carrierNorm.includes('local') || carrierNorm.includes('entregax') ||
    carrierNorm.includes('pickup') || carrierNorm.includes('bodega')
  );
  const displayStatusLabel = (status === 'delivered' && isExternalCarrier) ? 'Enviado' : statusLabel(status);

  // Nombre legible de la paquetería (evita mostrar la clave cruda 'evisa_pre').
  const carrierDisplay = /evisa/.test(carrierNorm)
    ? 'eVISA PRE'
    : (m.nationalCarrier
        ? String(m.nationalCarrier).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        : '');

  const totalBoxes = m.totalBoxes ?? m.total_boxes ?? 1;

  // Roles "track-only" (asesor, sub-asesor, servicio a cliente) no deben ver el costo proveedor
  const _trRole = String(getCurrentUser()?.role || '').toLowerCase();
  const isTrackOnly = ['advisor', 'sub_advisor', 'customer_service'].includes(_trRole);

  // Costos
  const lastMileCost = m.nationalLabelCost != null ? Number(m.nationalLabelCost) : null;
  const providerCostMxn = isTrackOnly ? null : (m.poboxProviderCostMxn ?? m.poboxServiceCost ?? null);
  const providerCostUsd = isTrackOnly ? null : (m.poboxProviderCostUsd ?? m.poboxCostUsd ?? null);
  const ventaUsd = m.poboxVentaUsd != null ? Number(m.poboxVentaUsd) : null;
  const totalCost = m.totalCost != null ? Number(m.totalCost) : null;
  const importTax = (m as any).importTaxMxn != null ? Number((m as any).importTaxMxn) : null;
  const montoPagado = m.montoPagado ?? m.monto_pagado ?? null;
  const saldoPendiente = m.saldoPendiente ?? m.saldo_pendiente ?? null;
  const hasCosts = lastMileCost != null || providerCostMxn != null || ventaUsd != null || totalCost != null || (importTax != null && importTax > 0);
  // 🩹 Si la guía ya está marcada como pagada, el desglose NO debe mostrar saldo
  // pendiente fantasma (caso: costo nunca congelado → assigned_cost_mxn=0 pero
  // pagada). Cuando está pagada: pagado = total y saldo = 0.
  const dispMontoPagado = clientPaid && totalCost != null ? totalCost : (montoPagado != null ? Number(montoPagado) : null);
  const dispSaldoPendiente = clientPaid ? 0 : (saldoPendiente != null ? Number(saldoPendiente) : null);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Tracking + estado */}
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: '#FFB74D' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <InventoryIcon sx={{ color: CAJITO_RING, fontSize: 18 }} />
          <Typography variant="caption" color="text.secondary" fontWeight={600}>GUÍA</Typography>
        </Box>
        <Typography variant="subtitle1" fontWeight={700} fontFamily="monospace" sx={{ wordBreak: 'break-all', fontSize: 13 }}>
          {(m as any).airTracking || m.tracking || tracking}
        </Typography>
        {(m as any).airTracking && m.tracking && (m as any).airTracking !== m.tracking && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Interna: {m.tracking}</Typography>
        )}
        {m.tracking && m.tracking.toUpperCase() !== tracking.toUpperCase() && (
          <Typography variant="caption" color="text.secondary">Buscado: {tracking}</Typography>
        )}
        {(m.trackingCourier || m.trackingProvider) && (m.trackingCourier || m.trackingProvider) !== m.tracking && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
            📦 Guía origen: {m.originCarrier ? `${m.originCarrier} · ` : ''}{m.trackingCourier || m.trackingProvider}
          </Typography>
        )}
        {(m as any).internationalTracking && (m as any).internationalTracking !== m.tracking && (
          <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all', color: '#F57C00', fontWeight: 700 }}>
            ✈️ AWB DHL: {(m as any).internationalTracking}
          </Typography>
        )}
        {(m as any).searchedOrder?.cancelada && (
          <Box sx={{ mt: 1, p: 1, borderRadius: 1.5, bgcolor: '#FDECEA', border: '1px solid #F5C6C2' }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#C62828', fontWeight: 800 }}>
              🚫 Orden de pago {String((m as any).searchedOrder.status).toLowerCase() === 'expired' ? 'EXPIRADA' : 'CANCELADA'}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: '#C62828', fontFamily: 'monospace' }}>
              {(m as any).searchedOrder.referencia}
              {(m as any).searchedOrder.monto != null && ` · $${Number((m as any).searchedOrder.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`}
            </Typography>
            {(m as any).searchedOrder.created_at && (
              <Typography variant="caption" sx={{ display: 'block', color: '#8D6E63' }}>
                Generada: {new Date((m as any).searchedOrder.created_at).toLocaleString('es-MX')}
                {(m as any).searchedOrder.payment_method ? ` · ${(m as any).searchedOrder.payment_method}` : ''}
              </Typography>
            )}
            <Typography variant="caption" sx={{ display: 'block', color: '#5D4037', mt: 0.25 }}>
              Esta orden ya no es válida. {m.paymentOrderRef ? `Orden vigente: ${m.paymentOrderRef}` : 'Genera una nueva orden para cobrar.'}
            </Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
          <Chip label={displayStatusLabel} size="small" color={statusColor(status)} />
          {m.paymentOrderRef && (
            <Chip label={`🧾 Orden ${m.paymentOrderRef}`} size="small" color="primary" variant="outlined" />
          )}
          {m.paymentMethod && (
            <Chip
              label={(() => {
                const map: Record<string, string> = {
                  cash: '💵 Efectivo',
                  card: '💳 Tarjeta',
                  spei: '🏦 SPEI',
                  transferencia: '🏦 Transferencia',
                  transfer: '🏦 Transferencia',
                  paypal: '🅿️ PayPal',
                  credit: '🪪 Crédito',
                  wallet: '👛 Saldo a favor',
                };
                const k = String(m.paymentMethod).toLowerCase();
                return map[k] || `💰 ${m.paymentMethod}`;
              })()}
              size="small"
              variant="outlined"
              sx={{ borderColor: '#0288D1', color: '#01579B' }}
            />
          )}
          {m.eta && (
            <Chip
              label={`🚢 ETA ${fmtDate(m.eta)}${m.containerWeek ? ` · Sem ${m.containerWeek}` : ''}`}
              size="small"
              color="info"
              variant="outlined"
            />
          )}
          {m.containerNumber && (
            <Chip label={`📦 Cont. ${m.containerNumber}`} size="small" variant="outlined" />
          )}
          {m.blNumber && (
            <Chip label={`📄 BL ${m.blNumber}`} size="small" variant="outlined" />
          )}
          {totalBoxes > 1 && <Chip label={`${totalBoxes} cajas`} size="small" variant="outlined" />}
          <Chip
            label={paid ? `✅ Pagado${clientPaidAt ? ` · ${fmtDate(clientPaidAt)}` : ''}` : '⏳ Pendiente'}
            size="small"
            color={paid ? 'success' : 'warning'}
            variant="outlined"
          />
          <Chip label={hasLabel ? '🏷️ Etiquetado' : '📋 Sin etiqueta'} size="small" color={hasLabel ? 'success' : 'default'} variant="outlined" />
          <Chip label={hasInstr ? '📍 Con instrucciones' : '⚠️ Sin instrucciones'} size="small" color={hasInstr ? 'success' : 'warning'} variant="outlined" />
        </Box>
      </Paper>

      {/* Cliente */}
      {client && (
        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            <PersonIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary" fontWeight={600}>CLIENTE</Typography>
            {client.id ? (
              client.isVerified ? (
                <Chip
                  label="✅ Verificado"
                  size="small"
                  sx={{ height: 18, fontSize: 10, ml: 'auto', bgcolor: 'rgba(46,125,50,0.12)', color: '#2E7D32', fontWeight: 700, border: '1px solid rgba(46,125,50,0.3)' }}
                />
              ) : (
                <Chip
                  label="⚠️ Sin verificar"
                  size="small"
                  sx={{ height: 18, fontSize: 10, ml: 'auto', bgcolor: 'rgba(230,81,0,0.10)', color: '#E65100', fontWeight: 700, border: '1px solid rgba(230,81,0,0.3)' }}
                />
              )
            ) : null}
          </Box>
          <Typography variant="body2" fontWeight={600}>{client.name || '—'}</Typography>
          {client.boxId && <Typography variant="caption" color="text.secondary">{client.boxId}</Typography>}
          {client.email && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{client.email}</Typography>}
          {client.advisor?.name && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: CAJITO_RING, fontWeight: 600 }}>
              👤 Asesor: {client.advisor.name}
            </Typography>
          )}
        </Paper>
      )}

      {/* Contenedor asignado (solo marítimo) */}
      {(() => {
        const svc = String((m as any).serviceType || '').toUpperCase();
        const trk = String((m as any).tracking || tracking || '').toUpperCase();
        const isMaritime = svc === 'SEA_CHN_MX' || !!m.eta || !!m.blNumber || !!m.containerWeek || trk.startsWith('LOG');
        if (!isMaritime) return null;
        const cont = m.containerNumber ? String(m.containerNumber).trim() : '';
        const asignado = cont.length > 0;
        return (
          <Paper
            variant="outlined"
            sx={{
              p: 1.25,
              borderRadius: 2,
              borderColor: asignado ? '#00695C' : '#FB8C00',
              bgcolor: asignado ? 'rgba(0,105,92,0.05)' : 'rgba(251,140,0,0.05)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
              <Typography sx={{ fontSize: 15 }}>📦</Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                CONTENEDOR ASIGNADO
              </Typography>
            </Box>
            {asignado ? (
              <>
                <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ color: '#00695C', letterSpacing: 0.5 }}>
                  {cont}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                  {m.blNumber && (
                    <Chip label={`BL ${m.blNumber}`} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                  )}
                  {m.eta && (
                    <Chip label={`ETA ${fmtDate(m.eta)}${m.containerWeek ? ` · Sem ${m.containerWeek}` : ''}`} size="small" color="info" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                  )}
                </Box>
              </>
            ) : (
              <Chip
                label="Sin asignar"
                size="small"
                sx={{
                  bgcolor: 'rgba(251,140,0,0.15)',
                  color: '#E65100',
                  fontWeight: 700,
                  border: '1px solid rgba(251,140,0,0.4)',
                }}
              />
            )}
          </Paper>
        );
      })()}

      {/* Descripción + peso + medidas */}
      {(m.description || m.weight || m.length || m.width || m.height) && (
        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {m.description && (
              <Box flex={1} minWidth={120}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>CONTENIDO</Typography>
                <Typography variant="body2">{m.description}</Typography>
              </Box>
            )}
            {m.weight && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>PESO</Typography>
                <Typography variant="body2">{Number(m.weight).toFixed(2)} kg</Typography>
              </Box>
            )}
            {(m.length || m.width || m.height) && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>MEDIDAS</Typography>
                <Typography variant="body2">
                  {Number(m.length || 0).toFixed(0)}×{Number(m.width || 0).toFixed(0)}×{Number(m.height || 0).toFixed(0)} cm
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>
      )}

      {/* Foto del paquete (PO Box / MoJie China) */}
      {m.imageUrl && (
        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, borderColor: '#FFB74D' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
            <InventoryIcon sx={{ fontSize: 15, color: CAJITO_RING }} />
            <Typography variant="caption" color="text.secondary" fontWeight={600}>FOTO DEL PRODUCTO</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Box
              component="img"
              src={resolveUrl(m.imageUrl) || m.imageUrl}
              alt="Foto del paquete"
              sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1, border: '1px solid #FFE0B2', cursor: 'pointer' }}
              onClick={() => window.open(resolveUrl(m.imageUrl) || m.imageUrl, '_blank', 'noopener')}
              onError={(e) => {
                // Si la URL es http://api.mojiegrupo.com/... el navegador puede
                // bloquearla por mixed content; el botón de abajo aún sirve.
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <Box
              component="button"
              type="button"
              onClick={() => window.open(resolveUrl(m.imageUrl) || m.imageUrl, '_blank', 'noopener')}
              sx={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                px: 1.5,
                py: 0.75,
                border: `1px solid ${CAJITO_RING}`,
                color: CAJITO_RING,
                background: 'transparent',
                borderRadius: 1.5,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.03em',
                cursor: 'pointer',
                '&:hover': { background: 'rgba(255,111,0,0.08)' },
              }}
            >
              📷 VER FOTO
            </Box>
          </Box>
        </Paper>
      )}

      {/* Dirección de entrega */}
      {destAddress && (
        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, borderColor: '#A5D6A7' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            <PlaceIcon sx={{ fontSize: 15, color: '#2E7D32' }} />
            <Typography variant="caption" color="text.secondary" fontWeight={600}>DIRECCIÓN DE ENTREGA</Typography>
          </Box>
          <Typography variant="body2" fontWeight={600}>{destAddress.recipientName || client?.name || '—'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {[destAddress.street, destAddress.exterior, destAddress.interior ? `Int. ${destAddress.interior}` : null].filter(Boolean).join(' ')}
          </Typography>
          {destAddress.neighborhood && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Col. {destAddress.neighborhood}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {[destAddress.city, destAddress.state].filter(Boolean).join(', ')} C.P. {destAddress.zip || '—'}
          </Typography>
          {destAddress.phone && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>📞 {destAddress.phone}</Typography>}
        </Paper>
      )}

      {/* Paquetería asignada */}
      {(m.nationalCarrier || m.nationalTracking) && (
        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            <LocalShippingIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary" fontWeight={600}>PAQUETERÍA NACIONAL</Typography>
          </Box>
          {m.nationalCarrier && <Typography variant="body2" fontWeight={600}>{carrierDisplay}</Typography>}
          {m.nationalTracking && (
            <Typography variant="caption" fontFamily="monospace" color="primary.main">{m.nationalTracking}</Typography>
          )}
        </Paper>
      )}

      {/* Cajas hijas (resumen) */}
      {children.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>CAJAS ({children.length})</Typography>
          <Divider sx={{ my: 0.5 }} />
          {children.slice(0, 5).map((c, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
              <Typography variant="caption" fontFamily="monospace" sx={{ flex: 1, fontSize: 11 }}>
                {c.tracking || c.trackingInternal || `Caja ${c.boxNumber || i + 1}`}
              </Typography>
              <Chip label={statusLabel(c.status)} size="small" color={statusColor(c.status)} sx={{ height: 18, fontSize: 10 }} />
            </Box>
          ))}
          {children.length > 5 && (
            <Typography variant="caption" color="text.secondary">+{children.length - 5} más</Typography>
          )}
        </Paper>
      )}

      {/* Costos */}
      {hasCosts && (
        <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, borderColor: '#FFE0B2' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
            <AttachMoneyIcon sx={{ fontSize: 15, color: '#E65100' }} />
            <Typography variant="caption" color="text.secondary" fontWeight={600}>COSTOS</Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
            {lastMileCost != null && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Paquetería (última milla)</Typography>
                <Typography variant="caption" fontWeight={600} color="error.main">{fmtMoney(lastMileCost)}</Typography>
              </Box>
            )}
            {providerCostMxn != null && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Costo proveedor</Typography>
                <Typography variant="caption" fontWeight={600}>{fmtMoney(Number(providerCostMxn))}{providerCostUsd ? ` (${fmtMoney(Number(providerCostUsd), 'USD')})` : ''}</Typography>
              </Box>
            )}
            {ventaUsd != null && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Venta al cliente</Typography>
                <Typography variant="caption" fontWeight={600} color="success.main">{fmtMoney(ventaUsd, 'USD')}</Typography>
              </Box>
            )}
            {importTax != null && importTax > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Impuestos DHL</Typography>
                <Typography variant="caption" fontWeight={600}>{fmtMoney(importTax)}</Typography>
              </Box>
            )}
            {totalCost != null && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #FFE0B2', pt: 0.5, mt: 0.25 }}>
                <Typography variant="caption" fontWeight={700}>Total a cobrar</Typography>
                <Typography variant="caption" fontWeight={700} color="warning.dark">{fmtMoney(totalCost)}</Typography>
              </Box>
            )}
            {dispMontoPagado != null && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">
                  Monto pagado{clientPaidAt ? ` · ${fmtDate(clientPaidAt)}` : ''}
                </Typography>
                <Typography variant="caption" fontWeight={600} color="success.main">{fmtMoney(dispMontoPagado)}</Typography>
              </Box>
            )}
            {dispSaldoPendiente != null && dispSaldoPendiente > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Saldo pendiente</Typography>
                <Typography variant="caption" fontWeight={600} color="error.main">{fmtMoney(dispSaldoPendiente)}</Typography>
              </Box>
            )}
          </Box>
        </Paper>
      )}

      {/* Historial de movimientos */}
      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <HistoryIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary" fontWeight={600}>HISTORIAL</Typography>
          {loadingMov && <CircularProgress size={12} sx={{ color: CAJITO_RING, ml: 0.5 }} />}
        </Box>
        {!loadingMov && movements.length === 0 && (
          <Typography variant="caption" color="text.disabled">Sin movimientos registrados</Typography>
        )}
        {movements.map((ev, i) => (
          <Box key={ev.id ?? i} sx={{ display: 'flex', gap: 0.75, py: 0.4, borderBottom: i < movements.length - 1 ? '1px solid #F5F5F5' : 'none' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block' }}>
                {fmtDate(ev.createdAt || ev.created_at || ev.date)}
              </Typography>
              <Chip
                size="small"
                label={(ev.status === 'delivered' && isExternalCarrier) ? 'Enviado' : (ev.statusLabel || ev.status_label || ev.label || ev.status || '—')}
                color={statusColor(ev.status)}
                sx={{ height: 18, fontSize: 10, mb: 0.25 }}
              />
              {(ev.branch || ev.branch_name || ev.location) && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block' }}>
                  📍 {ev.branch || ev.branch_name || ev.location}
                </Typography>
              )}
              {(ev.user || ev.created_by_name) && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block' }}>
                  👤 {ev.user || ev.created_by_name || (ev.source === 'system' ? 'Sistema' : '')}
                </Typography>
              )}
              {(ev.description || ev.notes) && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block', fontStyle: 'italic' }}>
                  {ev.description || ev.notes}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

// Resultado del lookup de cliente: ficha + paquetes en tránsito + historial + órdenes de pago
function ClientLookupResult({ data }: { data: PackageData }) {
  // Caso: múltiples coincidencias → mostramos sugerencias
  if (data.multiple && Array.isArray(data.suggestions)) {
    return (
      <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, border: '1px solid #FFE0B2', bgcolor: 'white' }}>
        <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
          Se encontraron {data.suggestions.length} clientes. Refina la búsqueda:
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {data.suggestions.map((s: any) => (
            <Box key={s.id} sx={{ p: 1, borderRadius: 1, border: '1px solid #eee' }}>
              <Typography variant="body2" fontWeight={600}>{s.full_name || '(sin nombre)'}</Typography>
              <Typography variant="caption" color="text.secondary">
                {s.box_id ? `${s.box_id} · ` : ''}{s.email || ''}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    );
  }

  const client = data.client || {};
  const advisor = data.advisor || null;
  const summary = data.summary || {};
  const activePackages: PackageData[] = Array.isArray(data.activePackages) ? data.activePackages : [];
  const deliveredPackages: PackageData[] = Array.isArray(data.deliveredPackages) ? data.deliveredPackages : [];
  const paymentOrders: PackageData[] = Array.isArray(data.paymentOrders) ? data.paymentOrders : [];
  const movements: PackageData[] = Array.isArray(data.movements) ? data.movements : [];

  const [tab, setTab] = useState<'transit' | 'history' | 'payments' | 'movements'>('transit');

  const tabBtn = (key: typeof tab, label: string, count?: number) => (
    <Box
      onClick={() => setTab(key)}
      sx={{
        cursor: 'pointer', px: 1.25, py: 0.5, borderRadius: 999, fontSize: 12, fontWeight: 600,
        background: tab === key ? CAJITO_GRADIENT : 'transparent',
        color: tab === key ? 'white' : 'text.secondary',
        border: tab === key ? 'none' : '1px solid #FFD7B5',
        display: 'inline-flex', alignItems: 'center', gap: 0.5,
        '&:hover': { background: tab === key ? CAJITO_GRADIENT : '#FFF3E0' },
      }}
    >
      {label}{typeof count === 'number' ? ` · ${count}` : ''}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Ficha del cliente */}
      <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, border: '1px solid #FFE0B2', bgcolor: 'white' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
          <PersonIcon sx={{ color: CAJITO_RING, fontSize: 20 }} />
          <Typography variant="body1" fontWeight={700}>{client.full_name || '(sin nombre)'}</Typography>
          {client.box_id && (
            <Chip size="small" label={client.box_id} sx={{ bgcolor: '#FFF3E0', color: '#D84315', fontWeight: 600 }} />
          )}
          {client.is_legacy && (
            <Chip size="small" label="Legacy" sx={{ bgcolor: '#ECEFF1', color: '#455A64', fontWeight: 600 }} />
          )}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, color: 'text.secondary' }}>
          {client.email && <Typography variant="caption">📧 {client.email}</Typography>}
          {client.phone && <Typography variant="caption">📱 {client.phone}</Typography>}
          {client.id && <Typography variant="caption">ID #{client.id}</Typography>}
          {advisor && <Typography variant="caption">👤 Asesor: {advisor.full_name}</Typography>}
        </Box>

        {/* KPIs */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.75, mt: 1 }}>
          <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: '#FFF3E0', textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>En tránsito</Typography>
            <Typography variant="body2" fontWeight={700} color="#D84315">{summary.active_packages ?? 0}</Typography>
          </Box>
          <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: '#E8F5E9', textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Total guías</Typography>
            <Typography variant="body2" fontWeight={700} color="#2E7D32">{summary.total_packages ?? 0}</Typography>
          </Box>
          <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: '#FFF8E1', textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Órdenes pend.</Typography>
            <Typography variant="body2" fontWeight={700} color="#F57F17">{summary.pending_payment_orders ?? 0}</Typography>
          </Box>
          <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: '#FFEBEE', textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Saldo pend.</Typography>
            <Typography variant="body2" fontWeight={700} color="#C62828">
              {fmtMoney(summary.payment_orders_pending_mxn || summary.balance_pending_mxn || 0)}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Tabs */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {tabBtn('transit', '📦 En tránsito', activePackages.length)}
        {tabBtn('history', '🗂️ Historial', deliveredPackages.length)}
        {tabBtn('payments', '💰 Órdenes', paymentOrders.length)}
        {tabBtn('movements', '🕒 Movimientos', movements.length)}
      </Box>

      {/* Contenido por tab */}
      {tab === 'transit' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {activePackages.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              Sin paquetes en tránsito.
            </Typography>
          )}
          {activePackages.map(p => (
            <Paper key={p.id} elevation={0} sx={{ p: 1, borderRadius: 2, border: '1px solid #eee', bgcolor: 'white' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.air_guide || p.tracking_internal || p.tracking_provider || `#${p.id}`}
                  </Typography>
                  {p.air_guide && p.tracking_internal && (
                    <Typography variant="caption" color="text.secondary" fontFamily="monospace">Guía corta: {p.tracking_internal}</Typography>
                  )}
                  {!p.air_guide && p.tracking_provider && p.tracking_provider !== p.tracking_internal && (
                    <Typography variant="caption" color="text.secondary" fontFamily="monospace">{p.tracking_provider}</Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, alignItems: 'center' }}>
                  {p.container_eta && (
                    <Chip size="small" label={`🚢 ETA ${fmtDate(p.container_eta)}`} color="info" variant="outlined" sx={{ flexShrink: 0 }} />
                  )}
                  <Chip size="small" label={statusLabel(p.status)} color={statusColor(p.status)} sx={{ flexShrink: 0 }} />
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, color: 'text.secondary', flexWrap: 'wrap' }}>
                {p.service_type && <Typography variant="caption">{p.service_type}</Typography>}
                {p.container_week && <Typography variant="caption">Semana {p.container_week}</Typography>}
                {p.weight != null && <Typography variant="caption">{Number(p.weight).toFixed(2)} kg</Typography>}
                <Typography variant="caption">Creado: {fmtDate(p.created_at)}</Typography>
                {p.received_at && <Typography variant="caption">Recibido: {fmtDate(p.received_at)}</Typography>}
                {p.saldo_pendiente != null && Number(p.saldo_pendiente) > 0 && (
                  <Typography variant="caption" color="error.main" fontWeight={600}>Saldo: {fmtMoney(p.saldo_pendiente)}</Typography>
                )}
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {tab === 'history' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {deliveredPackages.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              Sin historial de entregas.
            </Typography>
          )}
          {deliveredPackages.map(p => (
            <Paper key={p.id} elevation={0} sx={{ p: 1, borderRadius: 2, border: '1px solid #eee', bgcolor: 'white' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.air_guide || p.tracking_internal || `#${p.id}`}
                  </Typography>
                  {p.air_guide && p.tracking_internal && (
                    <Typography variant="caption" color="text.secondary" fontFamily="monospace">Guía corta: {p.tracking_internal}</Typography>
                  )}
                </Box>
                <Chip size="small" label={statusLabel(p.status)} color={statusColor(p.status)} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, color: 'text.secondary', flexWrap: 'wrap' }}>
                {p.service_type && <Typography variant="caption">{p.service_type}</Typography>}
                <Typography variant="caption">
                  Entregado: {fmtDate(p.delivered_at || p.shipped_at)}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {tab === 'payments' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {paymentOrders.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              Sin órdenes de pago registradas.
            </Typography>
          )}
          {paymentOrders.map(po => {
            const st = String(po.status || '').toLowerCase();
            const color: any = ['pagada', 'paid'].includes(st) ? 'success'
              : ['cancelada', 'cancelled', 'cancelado'].includes(st) ? 'error'
              : ['pending', 'pending_payment', 'pendiente'].includes(st) ? 'warning'
              : 'default';
            return (
              <Paper key={`${po.source}-${po.id}`} elevation={0} sx={{ p: 1, borderRadius: 2, border: '1px solid #eee', bgcolor: 'white' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={700} fontFamily="monospace">
                      {po.payment_reference || `#${po.id}`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {po.source === 'advisor' ? 'Generada por asesor' : 'Generada por cliente'}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2" fontWeight={700}>{fmtMoney(po.amount)}</Typography>
                    <Chip size="small" label={po.status} color={color} sx={{ mt: 0.25 }} />
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, color: 'text.secondary', flexWrap: 'wrap' }}>
                  <Typography variant="caption">Creada: {fmtDate(po.created_at)}</Typography>
                  {po.paid_at && <Typography variant="caption">Pagada: {fmtDate(po.paid_at)}</Typography>}
                  {po.facturada && <Typography variant="caption" color="success.main">✓ Facturada</Typography>}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {tab === 'movements' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {movements.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              Sin movimientos recientes.
            </Typography>
          )}
          {movements.map(mv => (
            <Box key={mv.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 0.75, borderLeft: `3px solid ${CAJITO_RING}`, bgcolor: 'white', borderRadius: '0 6px 6px 0' }}>
              <HistoryIcon sx={{ fontSize: 16, color: CAJITO_RING, mt: 0.25 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" fontWeight={600}>
                  {statusLabel(mv.status)} {mv.branch_name ? `· ${mv.branch_name}` : ''}
                </Typography>
                {mv.tracking_internal && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} fontFamily="monospace">
                    {mv.tracking_internal}
                  </Typography>
                )}
                {mv.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{mv.description}</Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {fmtDate(mv.created_at)} {mv.created_by_name ? `· ${mv.created_by_name}` : ''}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function CajitoFab() {
  const { cajitoEnabled, cajitoAvatarUrl, loading } = usePaymentStatus();
  const [open, setOpen] = useState(false);
  // Los asesores solo tienen la versión "Rastrear guía" (sin Chat IA), por eso
  // arrancan en modo track.
  const [mode, setMode] = useState<'chat' | 'track'>(() => {
    const u = getCurrentUser();
    return ['advisor', 'sub_advisor', 'customer_service'].includes(String(u?.role || '').toLowerCase()) ? 'track' : 'chat';
  });
  const [imgError, setImgError] = useState(false);
  // Acceso por CAPACIDAD (cajito.access), no solo por rol: un admin con el permiso
  // concedido en Permisos > Cajito también debe ver el botón.
  const [hasCapAccess, setHasCapAccess] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState('Cajito está pensando…');
  const [conversationId, setConversationId] = useState<number | null>(() => {
    const raw = localStorage.getItem(CONV_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  });

  // Track state
  const [trackInput, setTrackInput] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackResult, setTrackResult] = useState<PackageData | null>(null);
  const [clientResult, setClientResult] = useState<PackageData | null>(null);
  const [ticketResult, setTicketResult] = useState<any | null>(null);
  const [trackError, setTrackError] = useState('');
  const [lastTracked, setLastTracked] = useState('');

  const listRef = useRef<HTMLDivElement | null>(null);
  const trackInputRef = useRef<HTMLInputElement | null>(null);

  const FAB_POS_KEY = 'cajito.fab.bottom';
  const [fabBottom, setFabBottom] = useState<number>(() => {
    const raw = localStorage.getItem(FAB_POS_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 8 ? n : 24;
  });
  const draggingRef = useRef<{ startY: number; startBottom: number; moved: boolean } | null>(null);

  const user = getCurrentUser();
  const isSuperAdmin = user?.role === 'super_admin';
  const _role = String(user?.role || '').toLowerCase();
  // Asesores: acceso por default solo a "Rastrear guía" (acotado a sus clientes).
  const isAdvisor = ['advisor', 'sub_advisor'].includes(_role);
  // Servicio a cliente: misma versión "Rastrear guía" por default (sin scope).
  const isCustomerService = _role === 'customer_service';
  // Roles que solo ven "Rastrear guía" (sin Chat IA) y sin costo proveedor.
  const isTrackOnly = isAdvisor || isCustomerService;

  useEffect(() => {
    if (open && mode === 'chat' && messages.length === 0) {
      const userName = user?.full_name?.split(' ')?.[0] || 'aquí';
      setMessages([{
        id: Date.now(), role: 'cajito', ts: Date.now(),
        text: isSuperAdmin
          ? `¡Hola ${userName}! Soy Cajito. Tengo acceso de SOLO LECTURA al sistema: paquetes, clientes, rutas, choferes e inventarios. Pregúntame, por ejemplo: ¿dónde está el tracking TDX-...? o muestra los paquetes recibidos hoy.`
          : `¡Hola ${userName}! Soy Cajito, asistente IA de solo lectura. Tu administrador decide qué puedo consultar desde Permisos > Cajito (IA). Pregúntame por un tracking o un cliente.`,
      }]);
    }
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    if (open && mode === 'track') {
      setTimeout(() => trackInputRef.current?.focus(), 150);
    }
  }, [open, mode]);

  // Consultar si el usuario tiene la capacidad cajito.access concedida.
  useEffect(() => {
    if (!cajitoEnabled || isSuperAdmin || isTrackOnly) return;
    let alive = true;
    api.get('/cajito/my-access')
      .then(r => { if (alive) setHasCapAccess(r.data?.access === true); })
      .catch(() => {});
    return () => { alive = false; };
  }, [cajitoEnabled, isSuperAdmin, isTrackOnly]);

  if (loading || !cajitoEnabled) return null;
  if (!isSuperAdmin && !isTrackOnly && !hasCapAccess) return null;

  const avatar = imgError ? null : resolveUrl(cajitoAvatarUrl);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    const userMsg: ChatMsg = { id: Date.now(), role: 'user', text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setThinking(true);
    setThinkingLabel('Cajito está pensando…');
    try {
      const res = await api.post('/cajito/chat', { message: text, conversationId: conversationId || undefined });
      const data = res.data || {};
      const newConvId: number | null = data.conversationId || null;
      if (newConvId && newConvId !== conversationId) {
        setConversationId(newConvId);
        localStorage.setItem(CONV_KEY, String(newConvId));
      }
      const calls: { name: string }[] = Array.isArray(data.toolCalls) ? data.toolCalls : [];
      const extras: ChatMsg[] = calls.map((c, i) => ({
        id: Date.now() + i + 1, role: 'tool', text: `Consultó: ${c.name}`, toolName: c.name, ts: Date.now(),
      }));
      setMessages((prev) => [...prev, ...extras, { id: Date.now() + 1000, role: 'cajito', text: data.reply || '(sin respuesta)', ts: Date.now() }]);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error al consultar a Cajito';
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'cajito', text: `⚠️ ${msg}`, ts: Date.now() }]);
    } finally {
      setThinking(false);
    }
  };

  const handleTrack = async () => {
    const raw = trackInput.trim();
    if (!raw || trackLoading) return;
    setTrackLoading(true);
    setTrackError('');
    setTrackResult(null);
    setClientResult(null);
    setTicketResult(null);
    setLastTracked(raw);

    // Ticket de soporte: TKT-2026-1234 → ficha del ticket.
    const isTicket = /^TKT[-\s]?\d/i.test(raw);
    if (isTicket) {
      try {
        const res = await api.get(`/cajito/ticket-lookup`, { params: { q: raw } });
        if (res.data?.success && res.data.ticket) {
          setTicketResult(res.data.ticket);
        } else {
          setTrackError('No se encontró un ticket con ese folio');
        }
      } catch (e: any) {
        setTrackError(e.response?.data?.error || 'No se encontró un ticket con ese folio');
      } finally {
        setTrackLoading(false);
      }
      return;
    }

    // Heurística: input de cliente vs. tracking de guía.
    // Casillero: S1, S2907, ETX-1234, S4008, etc. (letra(s) + dígito(s), con o sin guion).
    // Email: contiene '@'.
    // Numérico puro de 1-6 dígitos: lo tratamos como ID de cliente.
    // Si parece guía de transportista (US-..., TDX-..., TDI-..., etc.): tracking.
    // Si tiene >=3 letras consecutivas: probablemente nombre → cliente.
    // Resto largo: tracking.
    const isEmail = /@/.test(raw);
    const isClientId = /^\d{1,6}$/.test(raw);
    const isCarrierTracking = /^(US|TDX|TDI|TD|JT|UPS|FX|DHL|EX|RO|PP|CTZ)[-:]?\d/i.test(raw);
    const isCasillero = /^[A-Za-z]{1,4}-?\d{1,8}$/.test(raw) && !isCarrierTracking;
    const hasManyLetters = /[A-Za-z]{3,}/.test(raw) && !isCarrierTracking;
    const lookupAsClient = isCasillero || isEmail || isClientId || hasManyLetters;

    const tryClientLookup = async () => {
      const res = await api.get(`/cajito/client-lookup`, { params: { q: raw } });
      if (res.data?.success) {
        setClientResult(res.data);
        return true;
      }
      return false;
    };

    const tryTracking = async () => {
      const res = await api.get(`/packages/track/${encodeURIComponent(raw)}`);
      if (res.data?.success && (res.data.shipment || res.data.package)) {
        setTrackResult(res.data);
        return true;
      }
      return false;
    };

    try {
      if (lookupAsClient) {
        // Intenta cliente primero; si 404, prueba como tracking
        try {
          const ok = await tryClientLookup();
          if (!ok) await tryTracking();
        } catch (e: any) {
          if (e.response?.status === 404) {
            try {
              const ok = await tryTracking();
              if (!ok) setTrackError('No se encontró ni cliente ni guía con esa búsqueda');
            } catch (e2: any) {
              setTrackError('No se encontró cliente ni guía con esa búsqueda');
            }
          } else {
            throw e;
          }
        }
      } else {
        // Intenta tracking primero; si 404, prueba como cliente
        try {
          const ok = await tryTracking();
          if (!ok) await tryClientLookup();
        } catch (e: any) {
          if (e.response?.status === 404) {
            try {
              const ok = await tryClientLookup();
              if (!ok) setTrackError('No se encontró ni guía ni cliente con esa búsqueda');
            } catch (e2: any) {
              setTrackError('No se encontró guía ni cliente con esa búsqueda');
            }
          } else {
            throw e;
          }
        }
      }
    } catch (e: any) {
      setTrackError(e.response?.data?.error || e.message || 'Error al consultar');
    } finally {
      setTrackLoading(false);
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    localStorage.removeItem(CONV_KEY);
    setMessages([]);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = { startY: e.clientY, startBottom: fabBottom, moved: false };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag) return;
    const dy = drag.startY - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    setFabBottom(Math.max(8, Math.min(window.innerHeight - 110, drag.startBottom + dy)));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    draggingRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!drag) return;
    if (drag.moved) {
      localStorage.setItem(FAB_POS_KEY, String(fabBottom));
    } else {
      setOpen((v) => !v);
    }
  };

  return (
    <>
      {/* FAB arrastrable */}
      <Box
        title={open ? 'Cerrar Cajito' : 'Hablar con Cajito (arrastra para mover)'}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        sx={{ position: 'fixed', bottom: fabBottom, right: 24, zIndex: 1300, width: 90, height: 90, borderRadius: '50%', cursor: 'grab', touchAction: 'none', userSelect: 'none', '&:active': { cursor: 'grabbing' } }}
      >
        <Fab component="div" sx={{ width: 90, height: 90, background: avatar ? 'transparent' : CAJITO_GRADIENT, color: 'white', boxShadow: `0 8px 24px ${CAJITO_SHADOW}`, border: avatar ? `3px solid ${CAJITO_RING}` : 'none', overflow: 'hidden', p: 0, pointerEvents: 'none', '&:hover': { boxShadow: `0 12px 32px ${CAJITO_SHADOW}` } }}>
          {avatar ? (
            <Box component="img" src={avatar} alt="Cajito" onError={() => setImgError(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <SmartToyIcon sx={{ fontSize: 42 }} />
          )}
        </Fab>
      </Box>

      {/* Panel principal */}
      <Slide direction="up" in={open} mountOnEnter unmountOnExit>
        <Paper elevation={12} sx={{ position: 'fixed', bottom: 130, right: 24, width: { xs: 'calc(100vw - 48px)', sm: 380 }, maxWidth: 400, height: 580, maxHeight: 'calc(100vh - 160px)', zIndex: 1299, borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: `2px solid ${CAJITO_RING}` }}>

          {/* Header con selector de modo */}
          <Box sx={{ background: CAJITO_GRADIENT, color: 'white', p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar src={avatar || undefined} sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 44, height: 44, border: '2px solid rgba(255,255,255,0.6)' }}>
              {!avatar && <SmartToyIcon />}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={700} lineHeight={1.1}>Cajito</Typography>
              <Typography variant="caption" sx={{ opacity: 0.9 }}>Asistente IA · Solo lectura{isSuperAdmin ? ' · Super Admin' : (isAdvisor ? ' · Mis clientes' : (isCustomerService ? ' · Servicio a cliente' : ''))}</Typography>
            </Box>
            {mode === 'chat' && (
              <Tooltip title="Nueva conversación">
                <IconButton size="small" onClick={startNewConversation} sx={{ color: 'white', mr: 0.5 }}>
                  <SmartToyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Tabs de modo — asesores y servicio a cliente solo ven "Rastrear guía" */}
          <Box sx={{ display: 'flex', borderBottom: '1px solid #FFE0B2', bgcolor: 'white' }}>
            {!isTrackOnly && (
            <Box
              onClick={() => setMode('chat')}
              sx={{ flex: 1, py: 1, textAlign: 'center', cursor: 'pointer', borderBottom: mode === 'chat' ? `2px solid ${CAJITO_RING}` : '2px solid transparent', transition: 'border-color 0.15s' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                <SmartToyIcon sx={{ fontSize: 16, color: mode === 'chat' ? CAJITO_RING : 'text.secondary' }} />
                <Typography variant="caption" fontWeight={mode === 'chat' ? 700 : 400} color={mode === 'chat' ? CAJITO_RING : 'text.secondary'}>
                  Chat IA
                </Typography>
              </Box>
            </Box>
            )}
            <Box
              onClick={() => setMode('track')}
              sx={{ flex: 1, py: 1, textAlign: 'center', cursor: 'pointer', borderBottom: mode === 'track' ? `2px solid ${CAJITO_RING}` : '2px solid transparent', transition: 'border-color 0.15s' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                <SearchIcon sx={{ fontSize: 16, color: mode === 'track' ? CAJITO_RING : 'text.secondary' }} />
                <Typography variant="caption" fontWeight={mode === 'track' ? 700 : 400} color={mode === 'track' ? CAJITO_RING : 'text.secondary'}>
                  Rastrear guía
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* ── Modo CHAT ── */}
          {mode === 'chat' && (
            <>
              <Box ref={listRef} sx={{ flex: 1, overflowY: 'auto', bgcolor: '#FFF8F2', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {messages.map((m) => {
                  if (m.role === 'tool') {
                    return (
                      <Box key={m.id} sx={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary', bgcolor: '#FFF3E0', border: '1px dashed #FFB74D', borderRadius: 2, px: 1, py: 0.25 }}>
                        <BuildIcon sx={{ fontSize: 14, color: CAJITO_RING }} />
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{m.text}</Typography>
                      </Box>
                    );
                  }
                  return (
                    <Box key={m.id} sx={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', bgcolor: m.role === 'user' ? CAJITO_RING : 'white', color: m.role === 'user' ? 'white' : 'text.primary', border: m.role === 'user' ? 'none' : '1px solid #FFE0B2', borderRadius: 2, px: 1.25, py: 0.75, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</Typography>
                    </Box>
                  );
                })}
                {thinking && (
                  <Box sx={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                    <CircularProgress size={14} sx={{ color: CAJITO_RING }} />
                    <Typography variant="caption">{thinkingLabel}</Typography>
                  </Box>
                )}
              </Box>
              <Box sx={{ borderTop: '1px solid #FFE0B2', p: 1, display: 'flex', gap: 1, alignItems: 'flex-end', bgcolor: 'white' }}>
                <TextField fullWidth size="small" multiline maxRows={4} placeholder="Escribe a Cajito…" value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                />
                <IconButton onClick={handleSend} disabled={!input.trim() || thinking}
                  sx={{ background: CAJITO_GRADIENT, color: 'white', '&:hover': { background: CAJITO_GRADIENT, filter: 'brightness(1.05)' }, '&.Mui-disabled': { background: '#FFD7B5', color: 'white' } }}>
                  <SendIcon fontSize="small" />
                </IconButton>
              </Box>
            </>
          )}

          {/* ── Modo RASTREAR ── */}
          {mode === 'track' && (
            <>
              <Box sx={{ p: 1.5, bgcolor: 'white', borderBottom: '1px solid #FFE0B2' }}>
                <TextField
                  fullWidth size="small"
                  placeholder="Guía (TDX-…, US-…) o casillero (S2907, ETX-1234) o email"
                  value={trackInput}
                  inputRef={trackInputRef}
                  onChange={(e) => setTrackInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleTrack(); }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
                    endAdornment: trackLoading ? <InputAdornment position="end"><CircularProgress size={16} sx={{ color: CAJITO_RING }} /></InputAdornment> : undefined,
                  }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.75 }}>
                  <Box
                    onClick={handleTrack}
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.5, borderRadius: 1, background: CAJITO_GRADIENT, color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (!trackInput.trim() || trackLoading) ? 0.5 : 1, pointerEvents: (!trackInput.trim() || trackLoading) ? 'none' : 'auto' }}
                  >
                    <SearchIcon sx={{ fontSize: 16 }} /> Buscar
                  </Box>
                </Box>
              </Box>

              <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: '#FFF8F2', p: 1.5 }}>
                {trackError && (
                  <Box sx={{ bgcolor: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 2, p: 1.5, mb: 1 }}>
                    <Typography variant="body2" color="error.main">⚠️ {trackError}</Typography>
                    <Typography variant="caption" color="text.secondary">Buscado: {lastTracked}</Typography>
                  </Box>
                )}
                {!trackResult && !clientResult && !ticketResult && !trackError && !trackLoading && (
                  <Box sx={{ textAlign: 'center', pt: 4, color: 'text.secondary' }}>
                    <SearchIcon sx={{ fontSize: 40, mb: 1, opacity: 0.3 }} />
                    <Typography variant="body2">Busca por guía, cliente o ticket</Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Ej: US-1234..., TDX-001, S2907, ETX-1228, TKT-2026-1396, correo@…</Typography>
                  </Box>
                )}
                {ticketResult && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.75 }}>
                      <Box
                        onClick={handleTrack}
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 1, border: `1px solid ${CAJITO_RING}`, color: CAJITO_RING, cursor: 'pointer', fontSize: 12 }}
                      >
                        🔄 Actualizar
                      </Box>
                    </Box>
                    <TicketLookupResult data={ticketResult} />
                  </>
                )}
                {clientResult && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.75 }}>
                      <Box
                        onClick={handleTrack}
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 1, border: `1px solid ${CAJITO_RING}`, color: CAJITO_RING, cursor: 'pointer', fontSize: 12 }}
                      >
                        🔄 Actualizar
                      </Box>
                    </Box>
                    <ClientLookupResult data={clientResult} />
                  </>
                )}
                {trackResult && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.75 }}>
                      <Box
                        onClick={handleTrack}
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 1, border: `1px solid ${CAJITO_RING}`, color: CAJITO_RING, cursor: 'pointer', fontSize: 12 }}
                      >
                        🔄 Actualizar
                      </Box>
                    </Box>
                    <TrackResult data={trackResult} tracking={lastTracked} />
                  </>
                )}
              </Box>
            </>
          )}

        </Paper>
      </Slide>
    </>
  );
}
