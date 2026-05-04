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
  created_at: string;
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
    <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Box sx={{ p: 2, bgcolor: 'grey.100', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography fontWeight="bold">🔗 {t('entangled.title', 'Pago a Proveedores (ENTANGLED)')}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('entangled.subtitle', 'Triangulación de pagos con motor externo')}
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
                <TableCell>Cliente</TableCell>
                <TableCell>RFC / Razón social</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell>Divisa</TableCell>
                <TableCell>Global</TableCell>
                <TableCell>Factura</TableCell>
                <TableCell>Proveedor</TableCell>
                <TableCell>Tx ENTANGLED</TableCell>
                <TableCell>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
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
                      {r.comprobante_cliente_url && (
                        <Tooltip title="Comprobante cliente">
                          <IconButton size="small" component="a" href={r.comprobante_cliente_url} target="_blank">
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
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">Sin solicitudes ENTANGLED</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
