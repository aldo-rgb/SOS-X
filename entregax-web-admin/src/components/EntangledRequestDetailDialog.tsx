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
  comision_asesor?: number | string | null;
  comision_entregax?: number | string | null;
  advisor_name?: string | null;
  provider_inferred?: string | null;
  costo_default_pct?: number | string | null;
  tc_aplicado_usd?: number | string | null;
  tc_cliente_final?: number | string | null;
  es_pesos?: boolean | null;
  es_hibrida?: boolean | null;
  raw_response?: any;
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

  const empresas = (() => {
    const v = row.empresas_asignadas;
    if (!v) return null;
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return null; }
    }
    return v;
  })();

  // 🩹 Carril Pesos MX: el monto ya está en MXN y el TC NO aplica (=1). Para
  //    USD/RMB usamos tc_aplicado_usd. (Antes multiplicaba pesos × 18.2 → bug.)
  const esPesos = String(row.op_divisa_destino || '').toUpperCase() === 'MXN' || row.es_pesos === true;
  const tcEff: number | null = esPesos ? 1 : tcUsd;

  // Utilidad XPAY = monto × (pctCliente - pctCobrada) / 100 × tcEff  (en MXN)
  let utilidadMxn: number | null = null;
  let utilidadDivisa: number | null = null;
  if (pctCliente != null && pctCobrada != null) {
    utilidadDivisa = monto * (pctCliente - pctCobrada) / 100;
    if (tcEff != null) utilidadMxn = utilidadDivisa * tcEff;
  }

  // Reparto de la utilidad: margen total = % asesor + % EntregaX (neto).
  const pctAsesor = row.comision_asesor != null ? Number(row.comision_asesor) : null;
  const pctEgx = row.comision_entregax != null ? Number(row.comision_entregax) : null;
  const comAsesorDivisa = pctAsesor != null ? monto * pctAsesor / 100 : null;
  const comAsesorMxn = comAsesorDivisa != null && tcEff != null ? comAsesorDivisa * tcEff : null;
  const utilNetaDivisa = pctEgx != null ? monto * pctEgx / 100 : null;
  const utilNetaMxn = utilNetaDivisa != null && tcEff != null ? utilNetaDivisa * tcEff : null;

  // Envío del dinero: comercializadora (depósito del cliente) + banco destino (proveedor final).
  const rawResp: any = row.raw_response || {};
  const bancoDestino: any = rawResp.banco_destino || null;
  const empArr: any[] = Array.isArray(empresas) ? empresas : [];
  const comercializadora: any = empArr[0]?.empresa || null;
  const cuentaComercializadora: any = empArr[0]?.cuenta_bancaria || null;
  const paisDestino: string = bancoDestino?.pais
    || (esPesos ? 'México' : String(row.op_divisa_destino || '').toUpperCase() === 'RMB' ? 'China' : 'Estados Unidos');

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
                {row.costo_default_pct != null && Number(row.costo_default_pct) > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Costo default asignado</Typography>
                    <Typography fontWeight={700} fontSize={18} color="text.secondary">
                      {Number(row.costo_default_pct).toFixed(2)}%
                    </Typography>
                  </Box>
                )}
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
                      {fmtMoney(monto)} × ({pctCliente.toFixed(2)}% − {pctCobrada.toFixed(2)}%){esPesos ? '' : ` × ${tcEff != null ? fmtMoney(tcEff, 4) : '?'}`}
                    </Typography>
                  </Box>
                </Stack>
              )}
              {/* Reparto de la utilidad: cuánto es del asesor y cuánto neto para EntregaX */}
              {(pctAsesor != null || pctEgx != null) && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Stack direction="row" spacing={4} flexWrap="wrap">
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Comisión asesor{pctAsesor != null ? ` (${pctAsesor.toFixed(2)}%)` : ''}{row.advisor_name ? ` · ${row.advisor_name}` : ''}
                      </Typography>
                      <Typography fontWeight={800} fontSize={18} color="warning.dark">
                        {comAsesorMxn != null ? `$${fmtMoney(comAsesorMxn)} MXN` : '—'}
                      </Typography>
                      {pctAsesor != null && (
                        <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', color: 'text.secondary' }}>
                          {fmtMoney(monto)} × {pctAsesor.toFixed(2)}%{esPesos ? '' : ` × ${tcEff != null ? fmtMoney(tcEff, 4) : '?'}`}
                        </Typography>
                      )}
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Utilidad neta EntregaX{pctEgx != null ? ` (${pctEgx.toFixed(2)}%)` : ''}
                      </Typography>
                      <Typography fontWeight={800} fontSize={18} color="success.main">
                        {utilNetaMxn != null ? `$${fmtMoney(utilNetaMxn)} MXN` : '—'}
                      </Typography>
                      {pctEgx != null && (
                        <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', color: 'text.secondary' }}>
                          {fmtMoney(monto)} × {pctEgx.toFixed(2)}%{esPesos ? '' : ` × ${tcEff != null ? fmtMoney(tcEff, 4) : '?'}`}
                          {comAsesorMxn != null && utilNetaMxn != null ? `  ·  Margen − Asesor` : ''}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </>
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

          {/* Envío del dinero: comercializadora (depósito) + banco destino (proveedor final) */}
          {(comercializadora || cuentaComercializadora || bancoDestino) && (
            <Grid size={{ xs: 12 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="overline" color="text.secondary">Envío del dinero</Typography>
                <Stack direction="row" spacing={4} flexWrap="wrap" sx={{ mt: 1, mb: 1.5 }}>
                  {row.provider_inferred && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Proveedor</Typography>
                      <Typography fontWeight={700} color="secondary.main">{row.provider_inferred}</Typography>
                      <Typography variant="caption" color="text.secondary">inferido por % costo</Typography>
                    </Box>
                  )}
                  <Box>
                    <Typography variant="caption" color="text.secondary">País destino</Typography>
                    <Typography fontWeight={700}>{paisDestino || '—'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Comercializadora asignada</Typography>
                    <Typography fontWeight={700}>{comercializadora?.razon_social || '—'}</Typography>
                    {comercializadora?.rfc && (
                      <Typography variant="caption" color="text.secondary">RFC {comercializadora.rfc}</Typography>
                    )}
                  </Box>
                </Stack>

                <Grid container spacing={1.5}>
                  {/* Cuenta 1: donde el cliente DEPOSITA (comercializadora) */}
                  {cuentaComercializadora && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'grey.50', height: '100%' }}>
                        <Typography variant="caption" fontWeight={700} color="primary.main">1) Cuenta de depósito (cliente → comercializadora)</Typography>
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="body2"><b>Banco:</b> {cuentaComercializadora.banco || '—'}</Typography>
                          {cuentaComercializadora.clabe && <Typography variant="body2" fontFamily="monospace"><b>CLABE:</b> {cuentaComercializadora.clabe}</Typography>}
                          {cuentaComercializadora.cuenta && <Typography variant="body2" fontFamily="monospace"><b>Cuenta:</b> {cuentaComercializadora.cuenta}</Typography>}
                          <Typography variant="body2"><b>Moneda:</b> {cuentaComercializadora.moneda || '—'}</Typography>
                          {cuentaComercializadora.titular && <Typography variant="body2"><b>Titular:</b> {cuentaComercializadora.titular}</Typography>}
                        </Box>
                      </Paper>
                    </Grid>
                  )}
                  {/* Cuenta 2: a donde ENTANGLED ENVÍA el dinero (proveedor final) */}
                  {bancoDestino && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'success.50', height: '100%' }}>
                        <Typography variant="caption" fontWeight={700} color="success.dark">2) Cuenta destino (envío al proveedor final)</Typography>
                        <Box sx={{ mt: 0.5 }}>
                          {bancoDestino.beneficiario && <Typography variant="body2"><b>Beneficiario:</b> {bancoDestino.beneficiario}</Typography>}
                          <Typography variant="body2"><b>Banco:</b> {bancoDestino.banco || '—'}</Typography>
                          {bancoDestino.cuenta && <Typography variant="body2" fontFamily="monospace"><b>Cuenta:</b> {bancoDestino.cuenta}</Typography>}
                          {bancoDestino.swift && <Typography variant="body2" fontFamily="monospace"><b>SWIFT:</b> {bancoDestino.swift}</Typography>}
                          {bancoDestino.aba && <Typography variant="body2" fontFamily="monospace"><b>ABA:</b> {bancoDestino.aba}</Typography>}
                          <Typography variant="body2"><b>Moneda:</b> {bancoDestino.moneda || row.op_divisa_destino || '—'}</Typography>
                          {bancoDestino.pais && <Typography variant="body2"><b>País:</b> {bancoDestino.pais}</Typography>}
                        </Box>
                      </Paper>
                    </Grid>
                  )}
                </Grid>
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
