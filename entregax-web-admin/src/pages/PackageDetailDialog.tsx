import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  IconButton,
  Tooltip,
  Grid,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PersonIcon from '@mui/icons-material/Person';
import StoreIcon from '@mui/icons-material/Store';
import ScaleIcon from '@mui/icons-material/Scale';
import PaymentsIcon from '@mui/icons-material/Payments';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import api from '../services/api';

interface PackageDetailDialogProps {
  tracking: string | null;
  onClose: () => void;
}

const lastMileLabel = (carrier?: string | null) => {
  if (!carrier) return 'N/A';
  const map: Record<string, string> = {
    paquete_express: 'Paquete Express',
    dhl: 'DHL',
    fedex: 'FedEx',
    estafeta: 'Estafeta',
    redpack: 'Redpack',
    ups: 'UPS',
  };
  return map[carrier.toLowerCase()] || carrier;
};

const fmtMoney = (val: number | null | undefined, currency = 'MXN') =>
  val == null ? '—' : `$${Number(val).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export default function PackageDetailDialog({ tracking, onClose }: PackageDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<any>(null);

  useEffect(() => {
    if (!tracking) return;
    setLoading(true);
    setError(null);
    setShipment(null);
    api.get(`/packages/track/${encodeURIComponent(tracking)}`)
      .then((res) => {
        if (res.data?.success && res.data?.shipment) {
          setShipment(res.data.shipment);
        } else {
          setError('No se encontró información para esta guía');
        }
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Error al consultar la guía');
      })
      .finally(() => setLoading(false));
  }, [tracking]);

  const m = shipment?.master;
  const client = shipment?.client;

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const statusColor = (status?: string) => {
    if (!status) return 'default';
    if (status.includes('entregad') || status.includes('delivered')) return 'success';
    if (status.includes('transit') || status.includes('tránsito')) return 'info';
    if (status.includes('pend') || status.includes('esperand')) return 'warning';
    return 'default';
  };

  return (
    <Dialog open={!!tracking} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocalShippingIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Detalle de Guía
          </Typography>
          {tracking && (
            <Typography variant="body1" fontFamily="monospace" fontWeight={700} color="primary" sx={{ ml: 1 }}>
              {tracking}
            </Typography>
          )}
          <Tooltip title="Copiar guía">
            <IconButton size="small" onClick={() => copy(tracking || '')} sx={{ ml: 0.5 }}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ minHeight: 300 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {m && (
          <Box>
            {/* Status + Consolidación */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              {m.statusLabel && (
                <Chip
                  label={`${m.statusLabel}${m.currentBranch?.name ? ` · ${m.currentBranch.name}` : ''}`}
                  color={statusColor(m.statusLabel) as any}
                  icon={<LocalShippingIcon />}
                  sx={{ fontWeight: 700 }}
                />
              )}
              {m.consolidationId && (
                <Chip label={`Consolidación #${m.consolidationId}`} variant="outlined" size="small" />
              )}
              {m.missingOnArrival && (
                <Chip label="⚠ No llegó en consolidación" color="warning" size="small" />
              )}
              {m.isLost && (
                <Chip label="Extraviada" color="error" size="small" />
              )}
            </Box>

            <Divider sx={{ mb: 2 }} />

            <Grid container spacing={2}>
              {/* Cliente */}
              {client && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <PersonIcon color="action" sx={{ mt: 0.3 }} />
                    <Box>
                      <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                        Cliente
                      </Typography>
                      <Typography variant="body1" fontWeight={700}>{client.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        BOX: {client.boxId} · {client.email}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              )}

              {/* Sucursal */}
              {m.currentBranch?.name && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <StoreIcon color="action" sx={{ mt: 0.3 }} />
                    <Box>
                      <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                        Sucursal actual
                      </Typography>
                      <Typography variant="body1" fontWeight={700}>{m.currentBranch.name}</Typography>
                      {m.currentBranch.code && (
                        <Typography variant="caption" color="text.secondary">Código: {m.currentBranch.code}</Typography>
                      )}
                    </Box>
                  </Box>
                </Grid>
              )}

              {/* Carrier proveedor */}
              {(m.trackingProvider || m.internationalTracking) && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <LocalShippingIcon color="action" sx={{ mt: 0.3 }} />
                    <Box>
                      <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                        Carrier proveedor
                      </Typography>
                      <Typography variant="body1" fontWeight={700} fontFamily="monospace">
                        {m.trackingProvider || m.internationalTracking}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              )}

              {/* Última milla */}
              {(m.nationalCarrier || m.nationalTracking) && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <DirectionsCarIcon color="action" sx={{ mt: 0.3 }} />
                    <Box>
                      <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                        Última milla (entrega final)
                      </Typography>
                      <Typography variant="body1" fontWeight={700} color="primary">
                        {lastMileLabel(m.nationalCarrier)}
                      </Typography>
                      {m.nationalTracking && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                            Guía: {m.nationalTracking}
                          </Typography>
                          <Tooltip title="Copiar guía última milla">
                            <IconButton size="small" onClick={() => copy(m.nationalTracking)}>
                              <ContentCopyIcon sx={{ fontSize: 12 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Box>
                  </Box>
                </Grid>
              )}

              {/* Peso + Cajas */}
              <Grid size={{ xs: 6, sm: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <ScaleIcon color="action" sx={{ mt: 0.3 }} />
                  <Box>
                    <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                      Peso
                    </Typography>
                    <Typography variant="body1" fontWeight={700}>
                      {m.weight != null ? `${Number(m.weight).toFixed(2)} kg` : '—'}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Box>
                  <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                    Cajas
                  </Typography>
                  <Typography variant="body1" fontWeight={700}>
                    {m.totalBoxes ?? 1}
                  </Typography>
                </Box>
              </Grid>

              {/* Estado de pago */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <PaymentsIcon color="action" sx={{ mt: 0.3 }} />
                  <Box>
                    <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                      Estado de pago
                    </Typography>
                    <Chip
                      size="small"
                      label={m.clientPaid ? 'PAGADO' : (m.paymentStatus || 'PENDIENTE')}
                      color={m.clientPaid ? 'success' : 'warning'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Box>
                </Box>
              </Grid>
            </Grid>

            {/* Costos internos */}
            {(m.poboxServiceCost != null || m.poboxVentaMxn != null || m.nationalLabelCost != null || m.totalCost != null) && (
              <>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ bgcolor: '#FFF8E1', border: '1px solid #F9A825', borderRadius: 1, p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <PaymentsIcon color="warning" />
                    <Typography variant="subtitle2" fontWeight={700} color="warning.dark">
                      Costos internos (uso administrativo)
                    </Typography>
                  </Box>
                  <Grid container spacing={2}>
                    {(m.poboxVentaMxn != null || m.poboxServiceCost != null) && (
                      <Grid size={{ xs: 6, sm: 3 }}>
                        <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                          Venta al cliente (PO BOX)
                        </Typography>
                        <Typography variant="body1" fontWeight={700} color="error.main">
                          {fmtMoney(m.poboxVentaMxn ?? m.poboxServiceCost)}
                        </Typography>
                        {m.poboxVentaUsd != null && (
                          <Typography variant="caption" color="text.secondary">
                            × TC {m.registeredExchangeRate ?? '—'} = {fmtMoney(m.poboxVentaUsd, 'USD')}
                          </Typography>
                        )}
                      </Grid>
                    )}
                    {m.nationalLabelCost != null && (
                      <Grid size={{ xs: 6, sm: 3 }}>
                        <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                          Costo paquetería (última milla)
                        </Typography>
                        <Typography variant="body1" fontWeight={700} color="error.main">
                          {fmtMoney(m.nationalLabelCost)}
                        </Typography>
                      </Grid>
                    )}
                    {m.poboxProviderCostMxn != null && (
                      <Grid size={{ xs: 6, sm: 3 }}>
                        <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                          Costo del servicio (proveedor)
                        </Typography>
                        <Typography variant="body1" fontWeight={700}>
                          {fmtMoney(m.poboxProviderCostMxn)}
                        </Typography>
                        {m.poboxProviderCostUsd != null && (
                          <Typography variant="caption" color="text.secondary">
                            ({fmtMoney(m.poboxProviderCostUsd, 'USD')})
                          </Typography>
                        )}
                      </Grid>
                    )}
                    {m.totalCost != null && (
                      <Grid size={{ xs: 6, sm: 3 }}>
                        <Typography variant="overline" color="text.secondary" display="block" lineHeight={1.2}>
                          Total a cobrar al cliente
                        </Typography>
                        <Typography variant="body1" fontWeight={700} color="error.main">
                          {fmtMoney(m.totalCost)}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              </>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
