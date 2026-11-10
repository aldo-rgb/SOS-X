/**
 * Recibir Pago — el mismo flujo de Caja CC, reusable.
 *
 * Vivía dentro de CajaChicaPage y solo se podía cobrar ahí. La caja chica de
 * cada sucursal necesita lo mismo —cobrar una cotización o una referencia de
 * cliente en el mostrador— y copiar el diálogo habría dejado dos pantallas que
 * se separan a la primera corrección, así que está en un solo lugar.
 *
 * La única diferencia entre los dos usos es DÓNDE queda el efectivo: sin
 * `branchId` entra a Caja CC, como siempre; con `branchId` entra a la caja
 * chica de esa sucursal, que es de donde sale su corte. Eso lo resuelve el
 * backend; aquí solo se manda el dato.
 */
import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField,
  Button, CircularProgress, Alert, Divider, Paper, Avatar, Chip, InputAdornment,
  IconButton,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import PersonIcon from '@mui/icons-material/Person';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StorefrontIcon from '@mui/icons-material/Storefront';
import api from '../services/api';

/**
 * "1,360.50" → 1360.5 · "1.360,50" → 1360.5
 * No usar parseFloat a secas: con locale es, "1.360" se vuelve 1.36.
 */
export const parseMontoEs = (raw: string): number => {
  if (!raw) return NaN;
  let t = String(raw).trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!t) return NaN;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decAt = Math.max(lastDot, lastComma);
    t = t.slice(0, decAt).replace(/[.,]/g, '') + '.' + t.slice(decAt + 1).replace(/[.,]/g, '');
  } else if (lastComma >= 0) {
    const after = t.slice(lastComma + 1);
    t = (after.length === 3 && (t.match(/,/g) || []).length === 1)
      ? t.replace(/,/g, '')
      : t.replace(/,/g, '.');
  } else if (lastDot >= 0) {
    const after = t.slice(lastDot + 1);
    if (after.length === 3 && (t.match(/\./g) || []).length === 1) {
      t = t.replace(/\./g, '');
    }
  }
  return parseFloat(t);
};

const fmt = (amount: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount || 0);

export interface RefEncontrada {
  referencia: string;
  monto: number;
  cliente: { id: number; nombre: string; email: string; box_id: string };
  guias: Array<{ id: number; tracking: string; monto: number }>;
  /** Referencia de cartera: el cliente deja efectivo para su saldo, no paga guías. */
  es_fondeo_cartera?: boolean;
  saldo_actual?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Cuando se cobra en el mostrador de una sucursal, el efectivo entra a SU caja chica. */
  branchId?: number | null;
  branchName?: string | null;
  /** Se llama al terminar bien, para refrescar la pantalla de atrás. */
  onDone?: () => void;
  onMessage?: (msg: string, severity: 'success' | 'error') => void;
}

const RecibirPagoDialog: React.FC<Props> = ({
  open, onClose, branchId = null, branchName = null, onDone, onMessage,
}) => {
  const [searchRef, setSearchRef] = useState('');
  const [searchingRef, setSearchingRef] = useState(false);
  const [searchRefError, setSearchRefError] = useState('');
  const [refFound, setRefFound] = useState<RefEncontrada | null>(null);
  const [montoRecibido, setMontoRecibido] = useState('');
  const [notasPago, setNotasPago] = useState('');
  const [procesandoPago, setProcesandoPago] = useState(false);

  const limpiar = () => {
    setRefFound(null);
    setSearchRef('');
    setSearchRefError('');
    setMontoRecibido('');
    setNotasPago('');
  };

  const cerrar = () => { limpiar(); onClose(); };

  const buscar = async () => {
    if (!searchRef.trim()) return;
    setSearchingRef(true);
    setSearchRefError('');
    setRefFound(null);
    try {
      const response = await api.get('/caja-chica/buscar-referencia', { params: { ref: searchRef.trim() } });
      if (response.data.found) {
        setRefFound(response.data);
        // En un cobro normal se precarga el adeudo. En un fondeo no hay adeudo:
        // el cliente entrega lo que quiere y el campo arranca vacío.
        setMontoRecibido(response.data.es_fondeo_cartera ? '' : String(response.data.monto));
      } else {
        setSearchRefError('No se encontró ningún pago con esa referencia');
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      setSearchRefError(axiosError.response?.data?.error || 'Error al buscar la referencia');
    } finally {
      setSearchingRef(false);
    }
  };

  const confirmar = async (confirmarDuplicado = false) => {
    if (!refFound) return;
    setProcesandoPago(true);
    try {
      const resp = await api.post('/caja-chica/confirmar-pago-referencia', {
        referencia: refFound.referencia,
        monto: parseMontoEs(montoRecibido),
        notas: notasPago,
        ...(branchId ? { branch_id: branchId } : {}),
        ...(confirmarDuplicado ? { confirmar_duplicado: true } : {}),
      });
      onMessage?.(
        refFound.es_fondeo_cartera
          ? `✅ ${resp.data?.message || 'Fondeo acreditado a la cartera del cliente'}`
          : `✅ Pago de ${fmt(parseMontoEs(montoRecibido))} registrado correctamente`,
        'success',
      );
      limpiar();
      onClose();
      onDone?.();
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { status?: number; data?: { error?: string; message?: string; duplicado_posible?: boolean } }
      };
      // El backend frena un fondeo idéntico al de hace unos minutos. Puede ser
      // real —el cliente volvió y dejó otro tanto— así que se pregunta.
      if (axiosError.response?.status === 409 && axiosError.response?.data?.duplicado_posible) {
        setProcesandoPago(false);
        if (window.confirm(`${axiosError.response.data.message}\n\n¿Abonarlo de todas formas?`)) {
          confirmar(true);
        }
        return;
      }
      onMessage?.(axiosError.response?.data?.error || 'Error al confirmar pago', 'error');
    } finally {
      setProcesandoPago(false);
    }
  };

  return (
    <Dialog open={open} onClose={cerrar} maxWidth="md" fullWidth>
      <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" gap={1}>
            <PersonIcon />
            <Typography variant="h6">Recibir Pago</Typography>
          </Box>
          <IconButton onClick={cerrar} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        {/* Dónde va a quedar el efectivo. Se dice antes de cobrar, no después. */}
        {branchName && (
          <Alert icon={<StorefrontIcon fontSize="inherit" />} severity="info" sx={{ mb: 2 }}>
            El efectivo entra a la caja chica de <strong>{branchName}</strong>, no a Caja CC.
          </Alert>
        )}

        {/* Paso 1: Buscar por referencia de pago */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            1. Ingresa la referencia de pago del cliente
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Referencia de Pago"
              placeholder="Ej: EF-0054-M7K9X2 · SAF-A3F19B02 para fondear cartera"
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && buscar()}
              InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} /> }}
              autoFocus
            />
            <Button
              variant="contained"
              onClick={buscar}
              disabled={searchingRef || !searchRef.trim()}
              sx={{ minWidth: 120 }}
            >
              {searchingRef ? <CircularProgress size={24} /> : 'Buscar'}
            </Button>
          </Box>
          {searchRefError && <Alert severity="error" sx={{ mt: 2 }}>{searchRefError}</Alert>}
        </Box>

        {/* Paso 2: Información del pago encontrado */}
        {refFound && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              2. Información del Pago Encontrado
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'success.50' }}>
              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
                      {refFound.cliente.nombre.charAt(0)}
                    </Avatar>
                    <Box>
                      <Typography variant="h6">{refFound.cliente.nombre}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {refFound.cliente.box_id} • {refFound.cliente.email}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ textAlign: 'right' }}>
                    {refFound.es_fondeo_cartera ? (
                      <>
                        <Typography variant="overline" color="text.secondary">Saldo actual en su cartera</Typography>
                        <Typography variant="h4" color="success.main" fontWeight="bold">
                          {fmt(refFound.saldo_actual || 0)}
                        </Typography>
                      </>
                    ) : (
                      <>
                        <Typography variant="overline" color="text.secondary">Monto a Cobrar</Typography>
                        <Typography variant="h4" color="success.main" fontWeight="bold">
                          {fmt(refFound.monto)}
                        </Typography>
                      </>
                    )}
                    <Chip label={refFound.referencia} color="primary" size="small" sx={{ mt: 1 }} />
                  </Box>
                </Grid>
              </Grid>

              {refFound.es_fondeo_cartera && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  <strong>Fondeo de cartera general.</strong> No cobra guías: el efectivo se abona
                  al saldo disponible del cliente y lo puede usar después en cualquier servicio.
                  Captura abajo lo que realmente estás recibiendo.
                </Alert>
              )}

              {refFound.guias && refFound.guias.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Guías incluidas:</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {refFound.guias.map((g) => (
                      <Chip key={g.id} label={`${g.tracking}: ${fmt(g.monto)}`} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}
            </Paper>

            {/* Paso 3: Confirmar monto recibido */}
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              {refFound.es_fondeo_cartera ? '3. Efectivo recibido para su cartera' : '3. Confirmar Monto Recibido'}
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Monto Recibido"
                  type="text"
                  inputMode="decimal"
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Notas (opcional)"
                  value={notasPago}
                  onChange={(e) => setNotasPago(e.target.value)}
                  placeholder="Ej: Pago en efectivo"
                />
              </Grid>
            </Grid>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={cerrar}>Cancelar</Button>
        <Button
          variant="contained"
          color="success"
          onClick={() => confirmar()}
          disabled={!refFound || procesandoPago || !montoRecibido}
          startIcon={procesandoPago ? <CircularProgress size={20} /> : <CheckCircleIcon />}
        >
          {procesandoPago
            ? 'Procesando...'
            : refFound?.es_fondeo_cartera
              ? `Abonar ${fmt(parseMontoEs(montoRecibido) || 0)} a su cartera`
              : `Registrar Pago de ${fmt(parseMontoEs(montoRecibido) || 0)}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RecibirPagoDialog;
