import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, CircularProgress, IconButton, Tooltip, Button
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReceiptIcon from '@mui/icons-material/Receipt';
import VerifiedIcon from '@mui/icons-material/Verified';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EntangledServiceConfigCard from './EntangledServiceConfigCard';
import EntangledUserServicePricingCard from './EntangledUserServicePricingCard';
import EntangledRequestDetailDialog from './EntangledRequestDetailDialog';
import type { EntangledRequestDetail } from './EntangledRequestDetailDialog';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

interface EntangledRow {
  id: number;
  user_id: number;
  user_email?: string;
  user_name?: string;
  cf_rfc: string;
  cf_razon_social: string;
  cf_email: string;
  op_monto: number;
  op_divisa_destino: string;
  estatus_global: string;
  estatus_factura: string;
  estatus_proveedor: string;
  entangled_transaccion_id?: string;
  referencia_pago?: string;
  factura_url?: string;
  comprobante_proveedor_url?: string;
  comprobante_cliente_url?: string;
  url_comprobante_cliente?: string;
  created_at: string;
  servicio?: 'pago_con_factura' | 'pago_sin_factura' | null;
  comision_cliente_final_porcentaje?: number | string | null;
  comision_cobrada_porcentaje?: number | string | null;
  tc_aplicado_usd?: number | string | null;
  empresas_asignadas?: unknown;
}

const statusColor = (s: string): 'default' | 'warning' | 'info' | 'success' | 'error' => {
  if (!s) return 'default';
  if (['completado', 'emitida', 'enviado', 'pagado'].includes(s)) return 'success';
  if (['en_proceso', 'pendiente'].includes(s)) return 'warning';
  if (['rechazado', 'error_envio', 'error'].includes(s)) return 'error';
  return 'info';
};

export default function EntangledAdminTab() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EntangledRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<EntangledRequestDetail | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`${API_URL}/admin/entangled/payment-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRows(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <EntangledServiceConfigCard />
      <EntangledUserServicePricingCard />
      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Box sx={{ p: 2, bgcolor: 'grey.100', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography fontWeight="bold">🔗 {t('entangled.title', 'Pago a Proveedores')}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('entangled.subtitle', 'Triangulación de pagos internacional')}
          </Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={load} variant="outlined" size="small">
          {t('common.refresh', 'Refrescar')}
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell>ID</TableCell>
                <TableCell>Referencia</TableCell>
                <TableCell>Servicio</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>RFC / Razón social</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell>Divisa</TableCell>
                <TableCell align="right">Util. XPAY (MXN)</TableCell>
                <TableCell>Global</TableCell>
                <TableCell>Factura</TableCell>
                <TableCell>Proveedor</TableCell>
                <TableCell>ID transacción</TableCell>
                <TableCell>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const monto = Number(r.op_monto) || 0;
                const pctC = r.comision_cliente_final_porcentaje != null ? Number(r.comision_cliente_final_porcentaje) : null;
                const pctK = r.comision_cobrada_porcentaje != null ? Number(r.comision_cobrada_porcentaje) : null;
                const tcUsd = r.tc_aplicado_usd != null ? Number(r.tc_aplicado_usd) : null;
                const utilMxn = (pctC != null && pctK != null && tcUsd != null)
                  ? monto * (pctC - pctK) / 100 * tcUsd
                  : null;
                return (
                <TableRow key={r.id} hover>
                  <TableCell>{r.id}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#FF6600', letterSpacing: '0.04em' }}
                    >
                      {r.referencia_pago || `XP${String(r.id).padStart(6, '0')}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={r.servicio === 'pago_sin_factura' ? 'Sin' : 'Con'}
                      color={r.servicio === 'pago_sin_factura' ? 'default' : 'primary'}
                      variant={r.servicio ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{r.user_name || r.user_email || `#${r.user_id}`}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.cf_email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{r.cf_rfc}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.cf_razon_social}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight="bold">{Number(r.op_monto).toLocaleString()}</Typography>
                  </TableCell>
                  <TableCell>{r.op_divisa_destino}</TableCell>
                  <TableCell align="right">
                    {utilMxn != null ? (
                      <Typography fontWeight="bold" color={utilMxn >= 0 ? 'success.main' : 'error.main'}>
                        ${utilMxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                    {pctC != null && pctK != null && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {pctC.toFixed(2)}% − {pctK.toFixed(2)}%
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell><Chip size="small" color={statusColor(r.estatus_global)} label={r.estatus_global || '-'} /></TableCell>
                  <TableCell><Chip size="small" color={statusColor(r.estatus_factura)} label={r.estatus_factura || '-'} /></TableCell>
                  <TableCell><Chip size="small" color={statusColor(r.estatus_proveedor)} label={r.estatus_proveedor || '-'} /></TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {r.entangled_transaccion_id ? r.entangled_transaccion_id.slice(0, 12) + '…' : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Ver detalles">
                        <IconButton size="small" color="primary" onClick={() => setDetail(r as EntangledRequestDetail)}>
                          <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {(r.comprobante_cliente_url || r.url_comprobante_cliente) && (
                        <Tooltip title="Comprobante cliente">
                          <IconButton size="small" component="a" href={r.comprobante_cliente_url || r.url_comprobante_cliente!} target="_blank">
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {r.factura_url && (
                        <Tooltip title="Factura">
                          <IconButton size="small" color="primary" component="a" href={r.factura_url} target="_blank">
                            <ReceiptIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {r.comprobante_proveedor_url && (
                        <Tooltip title="Comprobante proveedor">
                          <IconButton size="small" color="success" component="a" href={r.comprobante_proveedor_url} target="_blank">
                            <VerifiedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">Sin solicitudes registradas</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
      <EntangledRequestDetailDialog
        open={!!detail}
        row={detail}
        onClose={() => setDetail(null)}
      />
    </>
  );
}
