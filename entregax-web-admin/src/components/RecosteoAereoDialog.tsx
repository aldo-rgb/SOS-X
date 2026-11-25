// ============================================================
// RECOSTEO AÉREO: revisar medidas y volver a sacar el precio
//
// El precio de una guía aérea se congela cuando se cotiza, y el peso cobrable
// sale de las medidas que declara China. Cuando esas medidas están mal —de
// menos o de más— no había por dónde arreglarlo: esta pantalla enseñaba las
// medidas pero no las dejaba tocar, y cancelar la orden de pago vuelve a leer
// el mismo precio viejo. La operación terminaba parchando con cargos extra a
// mano (tarea 1108).
//
// Aquí se captura lo que midió CEDIS, se ve el antes y el después, y se aplica.
// La tarifa NO se trae la de hoy: se recostea con la que la guía ya tiene
// congelada, porque corregir una medida no es cambiarle el precio al cliente.
//
// Lo que sí se puede traer, y a propósito, es la tarifa DEL DÍA EN QUE LA CARGA
// SE RECIBIÓ EN CHINA, que es con la que la casa cobra. El manifiesto se sube
// de 2 a 7 días después y el costeo tomaba el tarifario de ese momento: 82
// guías de 21 clientes se cobraron así con una tarifa posterior a la de su
// propio lote, $6,018 USD de más (tarea 1115). El costeo nuevo ya sale bien;
// esto es para las que ya nacieron mal.
// ============================================================

import { useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Alert, AlertTitle, CircularProgress, Tooltip, Divider,
  FormControlLabel, Switch,
} from '@mui/material';
import ScaleIcon from '@mui/icons-material/Scale';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockIcon from '@mui/icons-material/Lock';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Lado {
  peso: number;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  volumetrico: number;
  pesoCobrable: number | null;
  porKg: number;
  tipo: string | null;
  usd: number;
  origenTarifa?: string;
}

/** En el lado nuevo el peso cobrable siempre sale: es max(neto, volumétrico). */
interface LadoNuevo extends Lado {
  pesoCobrable: number;
}

/** La tarifa que le tocaba el día en que la carga se recibió en China. */
interface TarifaDeSuDia {
  fecha: string;
  porKg: number;
  origen: string;
}

interface Fila {
  id: number;
  tracking: string;
  cliente: string | null;
  casillero: string | null;
  estado: string | null;
  actual: Lado;
  nuevo: LadoNuevo;
  tarifaDeSuDia: TarifaDeSuDia | null;
  difUsd: number;
  manda: 'neto' | 'volumetrico' | 'empate';
  bloqueo: string | null;
  ordenesAbiertas: string[];
}

interface Resumen {
  guias: number;
  recosteables: number;
  bloqueadas: number;
  cambian: number;
  suben: number;
  bajan: number;
  usdActual: number;
  usdNuevo: number;
  difUsd: number;
  ordenesAbiertas: string[];
  conTarifaDeOtroDia: number;
}

/** Lo que el usuario escribió a mano, por guía. */
type Correccion = { weight?: string; length?: string; width?: string; height?: string };

interface Props {
  open: boolean;
  onClose: () => void;
  /** Guía o lote con el que abre, si se entró desde una guía. */
  inicial?: string;
  /** Para que la pantalla de atrás recargue cuando algo cambió. */
  onAplicado?: () => void;
}

const fmtUsd = (n: number) =>
  `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RecosteoAereoDialog: React.FC<Props> = ({ open, onClose, inicial = '', onAplicado }) => {
  const [consulta, setConsulta] = useState(inicial);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [correcciones, setCorrecciones] = useState<Record<string, Correccion>>({});
  const [motivo, setMotivo] = useState('');
  // Apagado por omisión: traer la tarifa de su día cambia el precio, no la
  // medida, y quien lo prende tiene que decir por qué en el motivo.
  const [tarifaDeSuDia, setTarifaDeSuDia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const token = localStorage.getItem('token');

  /** Lo escrito se parte en lista de guías, o se manda como lote si es uno solo. */
  const armaCuerpo = () => {
    const partes = consulta.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const corr = Object.entries(correcciones).map(([tracking, c]) => ({
      tracking,
      weight: c.weight ? Number(c.weight) : null,
      length: c.length ? Number(c.length) : null,
      width: c.width ? Number(c.width) : null,
      height: c.height ? Number(c.height) : null,
    }));
    // Un solo texto sin guión de caja se trata como lote: trae todas sus hijas.
    if (partes.length === 1 && !/-\d+$/.test(partes[0]!)) {
      return { lote: partes[0], correcciones: corr, usarTarifaDeRecepcion: tarifaDeSuDia };
    }
    return { trackings: partes, correcciones: corr, usarTarifaDeRecepcion: tarifaDeSuDia };
  };

  const revisar = async () => {
    setError(null); setHecho(null);
    if (!consulta.trim()) { setError('Escribe una guía o el lote.'); return; }
    setCargando(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/air-recosteo/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(armaCuerpo()),
      });
      const d = await r.json();
      if (!r.ok || !d.success) { setError(d.error || 'No pude revisar esas guías.'); return; }
      setFilas(d.filas || []);
      setResumen(d.resumen || null);
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  const aplicar = async () => {
    setError(null); setHecho(null);
    if (motivo.trim().length < 5) { setError('Escribe el motivo: de dónde salió la medida.'); return; }
    setAplicando(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/air-recosteo/aplicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...armaCuerpo(), motivo: motivo.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) { setError(d.error || 'No pude aplicar el recosteo.'); return; }
      setHecho(
        `${d.aplicadas} guía(s) recosteada(s), ${d.difUsd >= 0 ? '+' : ''}${fmtUsd(d.difUsd)} USD.`
        + (d.aviso ? ` ${d.aviso}` : '')
        + (d.fallidas?.length ? ` No se pudo con ${d.fallidas.length}.` : ''),
      );
      setCorrecciones({});
      setMotivo('');
      onAplicado?.();
      await revisar();
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setAplicando(false);
    }
  };

  const setCorr = (tracking: string, campo: keyof Correccion, valor: string) => {
    setCorrecciones((prev) => ({ ...prev, [tracking]: { ...prev[tracking], [campo]: valor } }));
  };

  const cerrar = () => {
    setFilas([]); setResumen(null); setCorrecciones({});
    setMotivo(''); setError(null); setHecho(null);
    setTarifaDeSuDia(false);
    onClose();
  };

  const celdaNum = (tracking: string, campo: keyof Correccion, valorActual: number | null) => (
    <TextField
      size="small" variant="standard" type="number"
      placeholder={valorActual != null ? String(valorActual) : '-'}
      value={correcciones[tracking]?.[campo] ?? ''}
      onChange={(e) => setCorr(tracking, campo, e.target.value)}
      inputProps={{ style: { fontSize: 12, width: 56, textAlign: 'right' }, min: 0, step: '0.01' }}
    />
  );

  const hayCambios = (resumen?.cambian || 0) > 0;

  return (
    <Dialog open={open} onClose={cerrar} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ bgcolor: '#263238', color: '#fff' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScaleIcon />
          Revisar medidas y recostear
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          El cobro va sobre el peso MAYOR entre el neto y el volumétrico (largo × ancho × alto ÷ 6000).
          Captura lo que midió CEDIS y el precio se vuelve a sacar con la tarifa que la guía ya tiene
          —no con la del tarifario de hoy—. Lo que dejes vacío se queda como está.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            fullWidth size="small"
            label="Guía, lote, o varias guías separadas por espacio"
            placeholder="AIR202611090005   ·   AIR202611090005-003 AIR202611090005-005"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') revisar(); }}
          />
          <Button
            variant="contained" onClick={revisar} disabled={cargando}
            startIcon={cargando ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
            sx={{ bgcolor: '#E53935', '&:hover': { bgcolor: '#C62828' }, whiteSpace: 'nowrap' }}
          >
            Revisar
          </Button>
        </Box>

        <FormControlLabel
          sx={{ mb: 1 }}
          control={
            <Switch
              size="small" checked={tarifaDeSuDia}
              onChange={(e) => { setTarifaDeSuDia(e.target.checked); setFilas([]); setResumen(null); }}
            />
          }
          label={
            <Typography variant="caption">
              Cobrar con la tarifa del día en que se recibió en China (la fecha va en el número de
              guía). Sin esto, se respeta la tarifa que la guía ya tiene.
            </Typography>
          }
        />

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {hecho && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setHecho(null)}>{hecho}</Alert>}

        {resumen && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#fafafa' }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip size="small" label={`${resumen.guias} guías`} />
              {resumen.bloqueadas > 0 && (
                <Chip size="small" color="default" icon={<LockIcon />}
                  label={`${resumen.bloqueadas} bloqueadas`} />
              )}
              <Chip size="small" color={hayCambios ? 'warning' : 'success'}
                label={hayCambios ? `${resumen.cambian} cambian` : 'todas están bien'} />
              {resumen.suben > 0 && <Chip size="small" color="error" label={`${resumen.suben} suben`} />}
              {resumen.bajan > 0 && <Chip size="small" color="info" label={`${resumen.bajan} bajan`} />}
              <Box sx={{ flexGrow: 1 }} />
              <Typography variant="body2">
                {fmtUsd(resumen.usdActual)} → <strong>{fmtUsd(resumen.usdNuevo)}</strong> USD
              </Typography>
              <Typography variant="body2" fontWeight={700}
                color={resumen.difUsd > 0 ? 'error.main' : (resumen.difUsd < 0 ? 'info.main' : 'text.secondary')}>
                {resumen.difUsd >= 0 ? '+' : ''}{fmtUsd(resumen.difUsd)} USD
              </Typography>
            </Box>
          </Paper>
        )}

        {resumen && resumen.conTarifaDeOtroDia > 0 && !tarifaDeSuDia && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>
              {resumen.conTarifaDeOtroDia} guía(s) traen una tarifa distinta a la de su día de recepción
            </AlertTitle>
            Pasa cuando el manifiesto se sube días después y el tarifario ya cambió. La columna
            “Su día” dice cuánto valía el kilo ese día. Si así hay que cobrarlo, prende el
            interruptor de arriba y vuelve a revisar.
          </Alert>
        )}

        {resumen && resumen.ordenesAbiertas.length > 0 && (
          <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
            <AlertTitle>Hay orden de pago abierta: {resumen.ordenesAbiertas.join(', ')}</AlertTitle>
            Recostear no recalcula una orden ya armada. Después de aplicar, cancélala y genérala
            otra vez para que tome el precio nuevo.
          </Alert>
        )}

        {filas.length > 0 && (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Guía</TableCell>
                  <TableCell align="right">Peso real</TableCell>
                  <TableCell align="center">Largo</TableCell>
                  <TableCell align="center">Ancho</TableCell>
                  <TableCell align="center">Alto</TableCell>
                  <TableCell align="right">Volumétrico</TableCell>
                  <TableCell align="right">Cobrable</TableCell>
                  <TableCell align="center">Manda</TableCell>
                  <TableCell align="right">USD/kg</TableCell>
                  <TableCell align="right">Su día</TableCell>
                  <TableCell align="right">Cobra</TableCell>
                  <TableCell align="right">Debe</TableCell>
                  <TableCell align="right">Diferencia</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filas.map((f) => {
                  const cambia = Math.abs(f.difUsd) >= 0.01;
                  return (
                    <TableRow key={f.id} hover
                      sx={{ opacity: f.bloqueo ? 0.55 : 1,
                            bgcolor: cambia && !f.bloqueo ? '#fff8e1' : undefined }}>
                      <TableCell>
                        <Typography variant="caption" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                          {f.tracking}
                        </Typography>
                        {f.bloqueo && (
                          <Tooltip title={f.bloqueo}>
                            <Chip size="small" icon={<LockIcon />} label="bloqueada"
                              sx={{ ml: 0.5, height: 18, fontSize: 10 }} />
                          </Tooltip>
                        )}
                        <Typography variant="caption" color="text.secondary" display="block">
                          {f.casillero || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {f.bloqueo ? f.actual.peso : celdaNum(f.tracking, 'weight', f.actual.peso)}
                      </TableCell>
                      <TableCell align="center">
                        {f.bloqueo ? (f.actual.largo ?? '-') : celdaNum(f.tracking, 'length', f.actual.largo)}
                      </TableCell>
                      <TableCell align="center">
                        {f.bloqueo ? (f.actual.ancho ?? '-') : celdaNum(f.tracking, 'width', f.actual.ancho)}
                      </TableCell>
                      <TableCell align="center">
                        {f.bloqueo ? (f.actual.alto ?? '-') : celdaNum(f.tracking, 'height', f.actual.alto)}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption">{f.nuevo.volumetrico.toFixed(2)} kg</Typography>
                        {f.nuevo.volumetrico !== f.actual.volumetrico && (
                          <Typography variant="caption" color="text.secondary" display="block"
                            sx={{ textDecoration: 'line-through' }}>
                            {f.actual.volumetrico.toFixed(2)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption" fontWeight={700}>
                          {f.nuevo.pesoCobrable.toFixed(2)} kg
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip size="small" variant="outlined"
                          color={f.manda === 'volumetrico' ? 'warning' : 'default'}
                          label={f.manda === 'volumetrico' ? 'volumen' : (f.manda === 'neto' ? 'neto' : '=')}
                          sx={{ height: 18, fontSize: 10 }} />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={f.nuevo.origenTarifa || ''}>
                          <Typography variant="caption">
                            ${f.nuevo.porKg}{f.nuevo.tipo ? ` · ${f.nuevo.tipo}` : ''}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        {f.tarifaDeSuDia ? (
                          <Tooltip title={`${f.tarifaDeSuDia.fecha}: ${f.tarifaDeSuDia.origen}`}>
                            <Typography
                              variant="caption"
                              fontWeight={Math.abs(f.tarifaDeSuDia.porKg - f.actual.porKg) >= 0.01 ? 700 : 400}
                              color={Math.abs(f.tarifaDeSuDia.porKg - f.actual.porKg) >= 0.01
                                ? 'warning.main' : 'text.secondary'}
                            >
                              ${f.tarifaDeSuDia.porKg}
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption">{fmtUsd(f.actual.usd)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption" fontWeight={700}>{fmtUsd(f.nuevo.usd)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        {cambia ? (
                          <Typography variant="caption" fontWeight={700}
                            color={f.difUsd > 0 ? 'error.main' : 'info.main'}>
                            {f.difUsd > 0 ? '+' : ''}{fmtUsd(f.difUsd)}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {filas.length > 0 && hayCambios && (
          <>
            <Divider sx={{ my: 2 }} />
            <TextField
              fullWidth size="small" multiline minRows={2}
              label="Motivo (queda escrito en la bitácora de cada guía)"
              placeholder={tarifaDeSuDia
                ? 'Se cobra con la tarifa de su día de recepción en China, ticket TKT-0000-0000'
                : 'Medidas verificadas en CEDIS CDMX el 24-nov, ticket TKT-0000-0000'}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={cerrar}>Cerrar</Button>
        <Button
          variant="contained" color="warning"
          onClick={aplicar}
          disabled={aplicando || !hayCambios || motivo.trim().length < 5}
          startIcon={aplicando ? <CircularProgress size={18} color="inherit" /> : <ScaleIcon />}
        >
          {resumen ? `Aplicar a ${resumen.cambian} guía(s)` : 'Aplicar recosteo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RecosteoAereoDialog;
