// ============================================================================
// EntangledPaymentRequestV2
// Formulario cliente v2: 2 servicios (con/sin factura), multipart con
// comprobante en una sola llamada a /api/entangled/payment-requests.
// Reemplaza la lógica antigua de proveedores y "comprobante diferido".
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Card, CardContent, Box, Typography, Stack, RadioGroup, Radio,
  FormControl, FormControlLabel, TextField, Button, MenuItem,
  CircularProgress, Alert, Chip, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Tooltip,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import LocalAtmIcon from '@mui/icons-material/LocalAtm';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type Servicio = 'pago_con_factura' | 'pago_sin_factura';
type Divisa = 'USD' | 'RMB';

interface ServiceCfg {
  pago_con_factura: { comision_porcentaje: number; es_override: boolean };
  pago_sin_factura: { comision_porcentaje: number; es_override: boolean };
}

interface RequestRow {
  id: number;
  referencia_pago?: string;
  entangled_transaccion_id?: string | null;
  servicio?: Servicio;
  cf_razon_social?: string | null;
  op_monto: number | string;
  op_divisa_destino: string;
  estatus_global: string;
  estatus_factura: string;
  estatus_proveedor: string;
  comision_cliente_final_porcentaje?: number | null;
  comision_cobrada_porcentaje?: number | null;
  tc_aplicado_usd?: number | null;
  factura_url?: string | null;
  comprobante_proveedor_url?: string | null;
  url_comprobante_cliente?: string | null;
  created_at: string;
}

const REGIMENES = ['601', '603', '605', '606', '612', '621', '626', '616'];
const USOS_CFDI = ['G01', 'G03', 'P01', 'I01', 'I02', 'I04', 'I08'];

const formatMoney = (v: number | string) =>
  Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusColor = (s: string): 'default' | 'warning' | 'info' | 'success' | 'error' => {
  if (['completado', 'emitida', 'enviado'].includes(s)) return 'success';
  if (['en_proceso', 'pendiente'].includes(s)) return 'warning';
  if (['rechazado', 'error_envio'].includes(s)) return 'error';
  return 'default';
};

export default function EntangledPaymentRequestV2() {
  const token = localStorage.getItem('token') || '';
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [cfg, setCfg] = useState<ServiceCfg | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error' | 'info'; msg: string } | null>(null);

  // Form
  const [servicio, setServicio] = useState<Servicio>('pago_con_factura');
  const [monto, setMonto] = useState<string>('');
  const [divisa, setDivisa] = useState<Divisa>('USD');
  const [razonSocial, setRazonSocial] = useState('');
  const [rfc, setRfc] = useState('');
  const [email, setEmail] = useState('');
  const [regimenFiscal, setRegimenFiscal] = useState('601');
  const [cp, setCp] = useState('');
  const [usoCfdi, setUsoCfdi] = useState('G03');
  const [conceptosText, setConceptosText] = useState(''); // 1 por línea: "01010101 - Descripción"
  const [claveHistory, setClaveHistory] = useState<{ clave: string; descripcion?: string; uses_count: number }[]>([]);
  const [notas, setNotas] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);

  const loadCfg = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/entangled/service-config`, { headers: authHeaders });
      setCfg(r.data);
    } catch {
      setCfg(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      setLoadingList(true);
      const r = await axios.get(`${API_URL}/api/entangled/payment-requests/me`, { headers: authHeaders });
      setRequests(Array.isArray(r.data) ? r.data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoadingList(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadCfg(); loadRequests(); }, [loadCfg, loadRequests]);

  // Carga el historial de claves SAT del usuario para autocomplete
  const loadClaveHistory = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/entangled/clave-sat-history`, { headers: authHeaders });
      setClaveHistory(Array.isArray(r.data) ? r.data : []);
    } catch {
      setClaveHistory([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { loadClaveHistory(); }, [loadClaveHistory]);

  const appendClaveFromHistory = (h: { clave: string; descripcion?: string }) => {
    const line = h.descripcion ? `${h.clave} - ${h.descripcion}` : h.clave;
    setConceptosText((prev) => {
      if (!prev.trim()) return line;
      const lines = prev.split('\n');
      if (lines.some(l => l.trim().startsWith(h.clave))) return prev; // ya está
      return prev.trimEnd() + '\n' + line;
    });
  };

  const currentPct = cfg?.[servicio]?.comision_porcentaje ?? null;
  const montoNum = Number(monto) || 0;
  const utilidadEstimadaPct = currentPct;
  const totalEstimado = montoNum > 0 && currentPct != null
    ? montoNum * (1 + currentPct / 100)
    : null;

  const reset = () => {
    setMonto('');
    setRazonSocial('');
    setRfc('');
    setEmail('');
    setCp('');
    setConceptosText('');
    setNotas('');
    setComprobante(null);
  };

  const submit = async () => {
    setFeedback(null);
    if (!comprobante) {
      setFeedback({ severity: 'error', msg: 'Falta adjuntar el comprobante de pago.' });
      return;
    }
    if (montoNum <= 0) {
      setFeedback({ severity: 'error', msg: 'Monto inválido.' });
      return;
    }
    if (!razonSocial.trim()) {
      setFeedback({ severity: 'error', msg: 'Razón social del cliente final es requerida.' });
      return;
    }

    let conceptos: { clave_prodserv: string; descripcion?: string }[] = [];
    if (servicio === 'pago_con_factura') {
      if (!rfc.trim() || !email.trim() || !cp.trim()) {
        setFeedback({ severity: 'error', msg: 'Completa todos los datos fiscales.' });
        return;
      }
      // Cada línea: "clave - descripción"  o "clave"
      conceptos = conceptosText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((line) => {
          const m = line.match(/^(\S+)\s*[-:]?\s*(.*)$/);
          return {
            clave_prodserv: (m?.[1] || line).trim(),
            descripcion: (m?.[2] || '').trim() || undefined,
          };
        });
      if (conceptos.length === 0) {
        setFeedback({ severity: 'error', msg: 'Agrega al menos un concepto SAT.' });
        return;
      }
    }

    const fd = new FormData();
    fd.append('servicio', servicio);
    fd.append('monto_usd', String(montoNum));
    fd.append('divisa', divisa);
    fd.append(
      'cliente_final',
      JSON.stringify(
        servicio === 'pago_con_factura'
          ? {
              razon_social: razonSocial.trim(),
              rfc: rfc.trim().toUpperCase(),
              email: email.trim(),
              regimen_fiscal: regimenFiscal,
              cp: cp.trim(),
              uso_cfdi: usoCfdi,
            }
          : { razon_social: razonSocial.trim() }
      )
    );
    if (servicio === 'pago_con_factura') {
      fd.append('conceptos', JSON.stringify(conceptos));
    }
    if (notas.trim()) fd.append('notas', notas.trim());
    fd.append('comprobante', comprobante);

    try {
      setSubmitting(true);
      const r = await axios.post(`${API_URL}/api/entangled/payment-requests`, fd, {
        headers: { ...authHeaders, 'Content-Type': 'multipart/form-data' },
      });
      setFeedback({
        severity: 'success',
        msg: `Solicitud enviada. Referencia ${r.data?.referencia_pago || ''}`,
      });
      reset();
      loadRequests();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al enviar';
      setFeedback({ severity: 'error', msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <Card variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
            XPay — Pago a proveedores internacionales
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Triangulación internacional · Factura SAT opcional
          </Typography>

          <Divider sx={{ my: 2 }} />

          {feedback && (
            <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ mb: 2 }}>
              {feedback.msg}
            </Alert>
          )}

          {/* Selector de servicio */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Selecciona el servicio</Typography>
          <FormControl>
            <RadioGroup
              row
              value={servicio}
              onChange={(e) => setServicio(e.target.value as Servicio)}
            >
              <Card
                variant="outlined"
                sx={{
                  mr: 2,
                  borderColor: servicio === 'pago_con_factura' ? 'primary.main' : undefined,
                  borderWidth: servicio === 'pago_con_factura' ? 2 : 1,
                }}
              >
                <CardContent sx={{ pb: '12px !important', pr: 2 }}>
                  <FormControlLabel
                    value="pago_con_factura"
                    control={<Radio />}
                    label={
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <ReceiptLongIcon fontSize="small" />
                          <Typography fontWeight={700}>Pago con factura SAT</Typography>
                          {cfg?.pago_con_factura && (
                            <Chip
                              size="small"
                              color="primary"
                              label={`${cfg.pago_con_factura.comision_porcentaje}%${cfg.pago_con_factura.es_override ? ' · personalizado' : ''}`}
                            />
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          Emite factura SAT a tu cliente final. Requiere datos fiscales y conceptos.
                        </Typography>
                      </Box>
                    }
                  />
                </CardContent>
              </Card>
              <Card
                variant="outlined"
                sx={{
                  borderColor: servicio === 'pago_sin_factura' ? 'primary.main' : undefined,
                  borderWidth: servicio === 'pago_sin_factura' ? 2 : 1,
                }}
              >
                <CardContent sx={{ pb: '12px !important', pr: 2 }}>
                  <FormControlLabel
                    value="pago_sin_factura"
                    control={<Radio />}
                    label={
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <LocalAtmIcon fontSize="small" />
                          <Typography fontWeight={700}>Pago sin factura</Typography>
                          {cfg?.pago_sin_factura && (
                            <Chip
                              size="small"
                              color="primary"
                              label={`${cfg.pago_sin_factura.comision_porcentaje}%${cfg.pago_sin_factura.es_override ? ' · personalizado' : ''}`}
                            />
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          Sólo envía el pago al proveedor. No se emite factura.
                        </Typography>
                      </Box>
                    }
                  />
                </CardContent>
              </Card>
            </RadioGroup>
          </FormControl>

          <Divider sx={{ my: 2 }} />

          {/* Monto y divisa */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Monto"
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              fullWidth
              InputProps={{ inputProps: { min: 0, step: 0.01 } }}
            />
            <TextField
              select
              label="Divisa"
              value={divisa}
              onChange={(e) => setDivisa(e.target.value as Divisa)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="USD">USD</MenuItem>
              <MenuItem value="RMB">RMB</MenuItem>
            </TextField>
          </Stack>

          {totalEstimado != null && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Total estimado: <b>{formatMoney(totalEstimado)} {divisa}</b>{' '}
              (monto + comisión XPAY {utilidadEstimadaPct}%). El TC y la comisión final
              se confirmarán al recibir la respuesta del proveedor.
            </Alert>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Cliente final */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Cliente final</Typography>
          <Stack spacing={2}>
            <TextField
              label="Razón social"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              fullWidth
              required
            />
            {servicio === 'pago_con_factura' && (
              <>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="RFC"
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    fullWidth
                    required
                    inputProps={{ maxLength: 13 }}
                  />
                  <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    fullWidth
                    required
                  />
                  <TextField
                    label="CP"
                    value={cp}
                    onChange={(e) => setCp(e.target.value)}
                    sx={{ minWidth: 120 }}
                    required
                    inputProps={{ maxLength: 5 }}
                  />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    select
                    label="Régimen fiscal"
                    value={regimenFiscal}
                    onChange={(e) => setRegimenFiscal(e.target.value)}
                    fullWidth
                  >
                    {REGIMENES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </TextField>
                  <TextField
                    select
                    label="Uso CFDI"
                    value={usoCfdi}
                    onChange={(e) => setUsoCfdi(e.target.value)}
                    fullWidth
                  >
                    {USOS_CFDI.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                  </TextField>
                </Stack>
                <Alert severity="info" sx={{ mt: 1 }}>
                  📋 <b>Datos fiscales del cliente</b> — RFC, razón social, régimen y uso CFDI son los datos del receptor de la factura.
                  Las claves de producto/servicio SAT a facturar se capturan abajo, <b>por cada operación</b>.
                </Alert>
              </>
            )}
            <TextField
              label="Notas (opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              fullWidth
            />
          </Stack>

          {servicio === 'pago_con_factura' && (
            <>
              <Divider sx={{ my: 2 }} />
              {/* Conceptos SAT — bloque independiente, captura por operación */}
              <Box sx={{ p: 2, borderRadius: 2, border: (theme) => `1px solid ${theme.palette.divider}`, bgcolor: 'action.hover' }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  🧾 Claves SAT a facturar <b>(por operación)</b>
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Captura las claves de producto/servicio SAT que correspondan a este pago. Se guardan en tu historial para reutilizarlas.
                </Typography>
                {claveHistory.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Tus claves más usadas (click para agregar):
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      {claveHistory.slice(0, 10).map((h) => (
                        <Chip
                          key={h.clave}
                          label={h.descripcion ? `${h.clave} · ${h.descripcion.slice(0, 24)}` : h.clave}
                          size="small"
                          onClick={() => appendClaveFromHistory(h)}
                          sx={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}
                <TextField
                  label="Claves SAT (uno por línea: clave - descripción)"
                  value={conceptosText}
                  onChange={(e) => setConceptosText(e.target.value)}
                  multiline
                  minRows={3}
                  fullWidth
                  required
                  placeholder={"01010101 - Servicios profesionales\n50211503 - Pago a proveedor"}
                  helperText="Una línea por clave. Formato: clave_prodserv - descripción (la descripción es opcional)"
                />
              </Box>
            </>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Comprobante */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Comprobante de pago</Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="outlined"
              component="label"
              startIcon={<UploadFileIcon />}
            >
              {comprobante ? 'Cambiar archivo' : 'Subir comprobante'}
              <input
                type="file"
                hidden
                accept="image/*,application/pdf"
                onChange={(e) => setComprobante(e.target.files?.[0] || null)}
              />
            </Button>
            {comprobante && (
              <Chip
                label={`${comprobante.name} · ${(comprobante.size / 1024).toFixed(1)} KB`}
                onDelete={() => setComprobante(null)}
              />
            )}
          </Stack>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              size="large"
              disabled={submitting}
              onClick={submit}
              startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
            >
              {submitting ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Lista de solicitudes */}
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography fontWeight={700}>Mis solicitudes</Typography>
          <Tooltip title="Refrescar">
            <IconButton onClick={loadRequests}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell>Referencia</TableCell>
                <TableCell>Servicio</TableCell>
                <TableCell>Cliente final</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell>Divisa</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Factura</TableCell>
                <TableCell>Comprobante</TableCell>
                <TableCell>Creada</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingList ? (
                <TableRow><TableCell colSpan={9} align="center"><CircularProgress size={20} /></TableCell></TableRow>
              ) : requests.length === 0 ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}>Aún no tienes solicitudes.</TableCell></TableRow>
              ) : (
                requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.referencia_pago || `#${r.id}`}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={r.servicio === 'pago_sin_factura' ? 'Sin factura' : 'Con factura'}
                        color={r.servicio === 'pago_sin_factura' ? 'default' : 'primary'}
                      />
                    </TableCell>
                    <TableCell>{r.cf_razon_social || '—'}</TableCell>
                    <TableCell align="right">{formatMoney(r.op_monto)}</TableCell>
                    <TableCell>{r.op_divisa_destino}</TableCell>
                    <TableCell>
                      <Chip size="small" color={statusColor(r.estatus_global)} label={r.estatus_global} />
                    </TableCell>
                    <TableCell>
                      {r.factura_url ? (
                        <IconButton size="small" component="a" href={r.factura_url} target="_blank">
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {r.comprobante_proveedor_url ? (
                        <IconButton size="small" component="a" href={r.comprobante_proveedor_url} target="_blank">
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      ) : '—'}
                    </TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleDateString('es-MX')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
