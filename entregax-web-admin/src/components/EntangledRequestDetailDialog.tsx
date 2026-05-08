// ============================================================================
// EntangledRequestDetailDialog
// Detalle admin: muestra servicio, comisión cliente vs cobrada, TC y la
// utilidad XPAY computada = monto × (% cliente − % cobrada) × tc_usd / 100
// ============================================================================

import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Chip, Divider, Stack, Grid, Paper, Tooltip,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReceiptIcon from '@mui/icons-material/Receipt';
import VerifiedIcon from '@mui/icons-material/Verified';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

export interface EntangledRequestDetail {
  id: number;
  referencia_pago?: string | null;
  entangled_transaccion_id?: string | null;
  servicio?: 'pago_con_factura' | 'pago_sin_factura' | null;
  user_name?: string | null;
  user_email?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  cf_rfc?: string | null;
  cf_razon_social?: string | null;
  cf_email?: string | null;
  op_monto: number | string;
  op_divisa_destino: string;
  estatus_global: string;
  estatus_factura: string;
  estatus_proveedor: string;
  comision_cliente_final_porcentaje?: number | string | null;
  comision_cobrada_porcentaje?: number | string | null;
  tc_aplicado_usd?: number | string | null;
  empresas_asignadas?: unknown;
  factura_url?: string | null;
  comprobante_proveedor_url?: string | null;
  comprobante_cliente_url?: string | null;
  url_comprobante_cliente?: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  row: EntangledRequestDetail | null;
}

const fmtMoney = (v: number | string | null | undefined, d = 2) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
};

const statusColor = (s?: string): 'default' | 'warning' | 'info' | 'success' | 'error' => {
  if (!s) return 'default';
  if (['completado', 'emitida', 'enviado', 'pagado'].includes(s)) return 'success';
  if (['en_proceso', 'pendiente'].includes(s)) return 'warning';
  if (['rechazado', 'error_envio', 'error', 'cancelado'].includes(s)) return 'error';
  return 'info';
};

export default function EntangledRequestDetailDialog({ open, onClose, row }: Props) {
  if (!row) return null;

  const monto = Number(row.op_monto) || 0;
  const pctCliente = row.comision_cliente_final_porcentaje != null ? Number(row.comision_cliente_final_porcentaje) : null;
  const pctCobrada = row.comision_cobrada_porcentaje != null ? Number(row.comision_cobrada_porcentaje) : null;
  const tcUsd = row.tc_aplicado_usd != null ? Number(row.tc_aplicado_usd) : null;

  // Utilidad XPAY = monto × (pctCliente - pctCobrada) / 100 × tc_aplicado_usd  (en MXN)
  let utilidadMxn: number | null = null;
  let utilidadDivisa: number | null = null;
  if (pctCliente != null && pctCobrada != null) {
    utilidadDivisa = monto * (pctCliente - pctCobrada) / 100;
    if (tcUsd != null) utilidadMxn = utilidadDivisa * tcUsd;
  }

  const empresas = (() => {
    const v = row.empresas_asignadas;
    if (!v) return null;
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return null; }
    }
    return v;
  })();

  const comprobanteUrl = row.comprobante_cliente_url || row.url_comprobante_cliente;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {row.referencia_pago || `XP${String(row.id).padStart(6, '0')}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(row.created_at).toLocaleString('es-MX')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip
              size="small"
              color="primary"
              label={row.servicio === 'pago_sin_factura' ? 'Sin factura' : 'Con factura SAT'}
            />
            <Chip size="small" color={statusColor(row.estatus_global)} label={row.estatus_global || '—'} />
          </Stack>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={2}>
          {/* Cliente XPAY */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
              <Typography variant="overline" color="text.secondary">Cliente XPAY</Typography>
              <Typography fontWeight={700}>{row.user_name || row.client_name || '—'}</Typography>
              <Typography variant="caption" color="text.secondary">
                {row.user_email || row.client_email || '—'}
              </Typography>
            </Paper>
          </Grid>

          {/* Cliente final (factura) */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
              <Typography variant="overline" color="text.secondary">Cliente final / Beneficiario factura</Typography>
              <Typography fontWeight={700}>{row.cf_razon_social || '—'}</Typography>
              <Typography variant="caption" color="text.secondary">
                {row.cf_rfc || '—'} · {row.cf_email || '—'}
              </Typography>
            </Paper>
          </Grid>

          {/* Operación */}
          <Grid size={{ xs: 12 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="overline" color="text.secondary">Operación</Typography>
              <Stack direction="row" spacing={3} sx={{ mt: 1 }} flexWrap="wrap">
                <Box>
                  <Typography variant="caption" color="text.secondary">Monto</Typography>
                  <Typography fontWeight={700} fontSize={18}>
                    {fmtMoney(monto)} {row.op_divisa_destino}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">% Cliente final</Typography>
                  <Typography fontWeight={700} fontSize={18}>
                    {pctCliente != null ? `${pctCliente.toFixed(2)}%` : '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">% Costo proveedor</Typography>
                  <Typography fontWeight={700} fontSize={18}>
                    {pctCobrada != null ? `${pctCobrada.toFixed(2)}%` : '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">TC aplicado USD</Typography>
                  <Typography fontWeight={700} fontSize={18}>
                    {tcUsd != null ? `$${fmtMoney(tcUsd, 4)}` : '—'}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>

          {/* Utilidad XPAY */}
          <Grid size={{ xs: 12 }}>
            <Paper
              variant="outlined"
              sx={{
                p: 2, borderRadius: 2,
                borderColor: utilidadMxn != null && utilidadMxn > 0 ? 'success.main' : 'warning.main',
                bgcolor: utilidadMxn != null && utilidadMxn > 0 ? 'success.50' : 'warning.50',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <TrendingUpIcon color={utilidadMxn != null && utilidadMxn > 0 ? 'success' : 'warning'} />
                <Typography variant="overline" sx={{ fontWeight: 700 }}>Utilidad XPAY</Typography>
              </Stack>
              {pctCliente == null || pctCobrada == null ? (
                <Typography variant="body2" color="text.secondary">
                  Aún no se ha recibido la confirmación del proveedor con la comisión cobrada y/o TC aplicado.
                </Typography>
              ) : (
                <Stack direction="row" spacing={4} flexWrap="wrap">
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Margen ({(pctCliente - pctCobrada).toFixed(2)}%)
                    </Typography>
                    <Typography fontWeight={800} fontSize={20}>
                      {fmtMoney(utilidadDivisa)} {row.op_divisa_destino}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Equivalente MXN</Typography>
                    <Typography fontWeight={800} fontSize={20} color={utilidadMxn != null && utilidadMxn > 0 ? 'success.main' : 'warning.main'}>
                      {utilidadMxn != null ? `$${fmtMoney(utilidadMxn)}` : '—'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Fórmula</Typography>
                    <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                      {fmtMoney(monto)} × ({pctCliente.toFixed(2)}% − {pctCobrada.toFixed(2)}%) × {tcUsd != null ? fmtMoney(tcUsd, 4) : '?'}
                    </Typography>
                  </Box>
                </Stack>
              )}
            </Paper>
          </Grid>

          {/* Estatus */}
          <Grid size={{ xs: 12 }}>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <Chip label={`Factura: ${row.estatus_factura || '—'}`} color={statusColor(row.estatus_factura)} variant="outlined" />
              <Chip label={`Proveedor: ${row.estatus_proveedor || '—'}`} color={statusColor(row.estatus_proveedor)} variant="outlined" />
              {row.entangled_transaccion_id && (
                <Chip label={`ID transacción: ${row.entangled_transaccion_id.slice(0, 18)}…`} variant="outlined" />
              )}
            </Stack>
          </Grid>

          {/* Empresas asignadas */}
          {empresas != null && (
            <Grid size={{ xs: 12 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="overline" color="text.secondary">Empresas asignadas</Typography>
                <Box component="pre" sx={{ m: 0, mt: 1, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(empresas, null, 2)}
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Documentos */}
          <Grid size={{ xs: 12 }}>
            <Divider sx={{ mb: 1 }} />
            <Stack direction="row" spacing={1}>
              {comprobanteUrl && (
                <Tooltip title="Comprobante del cliente">
                  <Button startIcon={<OpenInNewIcon />} size="small" variant="outlined" component="a" href={comprobanteUrl} target="_blank">
                    Comprobante cliente
                  </Button>
                </Tooltip>
              )}
              {row.factura_url && (
                <Tooltip title="Factura emitida">
                  <Button startIcon={<ReceiptIcon />} size="small" variant="outlined" color="primary" component="a" href={row.factura_url} target="_blank">
                    Factura
                  </Button>
                </Tooltip>
              )}
              {row.comprobante_proveedor_url && (
                <Tooltip title="Comprobante de pago al proveedor">
                  <Button startIcon={<VerifiedIcon />} size="small" variant="outlined" color="success" component="a" href={row.comprobante_proveedor_url} target="_blank">
                    Comprobante proveedor
                  </Button>
                </Tooltip>
              )}
              {!comprobanteUrl && !row.factura_url && !row.comprobante_proveedor_url && (
                <Typography variant="caption" color="text.secondary">Sin documentos disponibles</Typography>
              )}
            </Stack>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
