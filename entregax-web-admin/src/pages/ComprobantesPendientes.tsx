import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Chip, CircularProgress, Stack, Divider,
  Accordion, AccordionSummary, AccordionDetails, TextField, Alert, AlertTitle,
  Dialog, DialogTitle, DialogContent, DialogActions, Radio, Tooltip, Snackbar,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from '../services/api';

const money = (v?: number | string) =>
  `$${Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso?: string) => { try { return iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; } catch { return '—'; } };
const diasDesde = (iso?: string) => {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
};

interface Voucher {
  id: number; declared_amount: string; created_at: string; file_url?: string;
  service_type?: string; payment_reference: string; order_amount: string;
  order_status: string; voucher_total?: string; voucher_count?: number;
  user_name: string; pobox_code: string; user_email?: string;
  subido_por_nombre?: string; subido_por_rol?: string; subido_por_otro?: boolean;
}
interface OtraOrden {
  id: number; payment_reference: string; amount: number; status: string;
  es_credito: boolean; alcanza: boolean;
}
interface Candidato {
  id: number; fecha: string; concepto: string; referencia?: string;
  abono: string; banco?: string; disponible: number; alcanza: boolean;
  importe_exacto: boolean; cita_al_cliente: boolean; razon: string;
}

export default function ComprobantesPendientes({
  // Vive dentro del dashboard de Cobranza, que ya pone su propio encabezado.
  // Suelto tambien funciona: asi se puede abrir aparte sin duplicar titulos.
  embebido = false,
  onCambio,
}: { embebido?: boolean; onCambio?: (pendientes: number) => void } = {}) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [notaCand, setNotaCand] = useState<string | null>(null);
  const [cargandoCand, setCargandoCand] = useState(false);
  const [elegido, setElegido] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [confirmar, setConfirmar] = useState<Voucher | null>(null);
  const [sinLigar, setSinLigar] = useState<Voucher | null>(null);
  const [rechazar, setRechazar] = useState<Voucher | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ txt: string; tipo: 'success' | 'error' } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [otras, setOtras] = useState<any>(null);
  const [extras, setExtras] = useState<number[]>([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/vouchers/pending?limit=200');
      const lista = r.data?.vouchers || [];
      setVouchers(lista);
      onCambio?.(lista.length);
    } catch {
      setAviso({ txt: 'No se pudo cargar la lista.', tipo: 'error' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const buscarAbonos = useCallback(async (voucherId: number, q: string) => {
    setCargandoCand(true); setElegido(null);
    try {
      const r = await api.get(`/admin/vouchers/${voucherId}/bank-candidates${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setCandidatos(r.data?.candidatos || []);
      setNotaCand(r.data?.nota || null);
    } catch {
      setCandidatos([]); setNotaCand('No se pudieron buscar los movimientos.');
    } finally { setCargandoCand(false); }
  }, []);

  const abrir = (v: Voucher) => {
    if (abierto === v.id) { setAbierto(null); return; }
    setAbierto(v.id); setBusqueda(''); setCandidatos([]); setNotaCand(null);
    setOtras(null); setExtras([]);
    buscarAbonos(v.id, '');
    // Solo devuelve algo cuando el depósito es mayor que la orden.
    api.get(`/admin/vouchers/${v.id}/otras-ordenes`)
      .then((r) => { if (r.data?.aplica) setOtras(r.data); })
      .catch(() => { /* sin esto la pantalla sigue funcionando igual */ });
  };

  const aprobar = async (v: Voucher, opts: { bank_entry_id?: number; aprobar_sin_ligar?: boolean; confirm_duplicate?: boolean }) => {
    setGuardando(true);
    try {
      const r = await api.post(`/admin/voucher/approve/${v.id}`, { ...opts, ordenes_extra: extras });
      const extraOk = (r.data?.ordenes_extra || []).filter((x: any) => x.ok);
      const extraFail = (r.data?.ordenes_extra || []).filter((x: any) => x && x.ok === false);
      setAviso({
        txt: `Comprobante #${v.id} autorizado. El pago de ${v.user_name} ya quedó aplicado.`
          + (extraOk.length ? ` También se liquidaron ${extraOk.length} orden(es) más: ${extraOk.map((x: any) => x.referencia).join(', ')}.` : '')
          + (extraFail.length ? ` No se pudo con ${extraFail.length}: ${extraFail.map((x: any) => x.motivo).join(' ')}` : ''),
        tipo: extraFail.length ? 'error' : 'success',
      });
      setConfirmar(null); setSinLigar(null); setAbierto(null);
      cargar();
    } catch (e: any) {
      const d = e?.response?.data;
      if (d?.requires_confirmation) {
        // Es el freno de duplicados: se lo mostramos tal cual, con su explicación.
        if (window.confirm(`${d.message}\n\n¿De verdad son dos pagos distintos?`)) {
          await aprobar(v, { ...opts, confirm_duplicate: true });
          return;
        }
      } else {
        setAviso({ txt: d?.message || d?.error || 'No se pudo autorizar.', tipo: 'error' });
      }
      setConfirmar(null); setSinLigar(null);
    } finally { setGuardando(false); }
  };

  const hacerRechazo = async () => {
    if (!rechazar) return;
    setGuardando(true);
    try {
      await api.post(`/admin/voucher/reject/${rechazar.id}`, { reason: motivo });
      setAviso({ txt: `Comprobante #${rechazar.id} rechazado. Al cliente le llega el motivo.`, tipo: 'success' });
      setRechazar(null); setMotivo(''); setAbierto(null); cargar();
    } catch (e: any) {
      setAviso({ txt: e?.response?.data?.error || 'No se pudo rechazar.', tipo: 'error' });
    } finally { setGuardando(false); }
  };

  // Agrupado por cliente: un solo cliente puede traer once comprobantes, y
  // revisarlos seguidos es mucho más rápido que ir saltando entre clientes.
  const porCliente = vouchers.reduce((acc: Record<string, Voucher[]>, v) => {
    const k = `${v.pobox_code}|${v.user_name}`;
    (acc[k] = acc[k] || []).push(v);
    return acc;
  }, {});
  const grupos = Object.entries(porCliente).sort((a, b) => b[1].length - a[1].length);
  const totalDinero = vouchers.reduce((s, v) => s + Number(v.declared_amount || 0), 0);
  const masViejo = vouchers.reduce((m, v) => Math.max(m, diasDesde(v.created_at)), 0);

  if (loading) return <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      {!embebido && (
        <Typography variant="h5" fontWeight={800} sx={{ mb: 0.5 }}>Autorizar pagos de clientes</Typography>
      )}
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2, maxWidth: 760 }}>
        Aquí están los pagos que los clientes ya hicieron y subieron su comprobante,
        pero que nadie ha autorizado todavía.
      </Typography>

      {/* Lo que está en juego, dicho sin tecnicismos: es la razón por la que
          esta pantalla existe y por la que no puede quedarse sin trabajar. */}
      <Alert severity="info" icon={false} sx={{ mb: 3 }}>
        <AlertTitle sx={{ fontWeight: 800 }}>¿Por qué importa vaciar esta lista?</AlertTitle>
        Mientras un comprobante siga aquí, para el cliente su pago sigue <b>“en proceso”</b>,
        su orden no se cierra y, si es cliente con crédito, <b>su línea sigue ocupada</b> aunque
        ya haya pagado. Por eso llaman a preguntar por qué su saldo no sube.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Paper sx={{ p: 2, flex: 1, borderLeft: '4px solid #F59E0B' }}>
          <Typography variant="caption" color="text.secondary">Pagos por autorizar</Typography>
          <Typography variant="h4" fontWeight={800}>{vouchers.length}</Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, borderLeft: '4px solid #10B981' }}>
          <Typography variant="caption" color="text.secondary">Dinero detenido</Typography>
          <Typography variant="h4" fontWeight={800}>{money(totalDinero)}</Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, borderLeft: '4px solid #EF4444' }}>
          <Typography variant="caption" color="text.secondary">El más viejo lleva</Typography>
          <Typography variant="h4" fontWeight={800}>{masViejo} día{masViejo === 1 ? '' : 's'}</Typography>
        </Paper>
      </Stack>

      {vouchers.length === 0 && (
        <Paper sx={{ p: 5, textAlign: 'center' }}>
          <CheckCircleIcon sx={{ fontSize: 46, color: '#10B981' }} />
          <Typography variant="h6" fontWeight={700} sx={{ mt: 1 }}>No hay nada pendiente</Typography>
          <Typography variant="body2" color="text.secondary">
            Todos los pagos que los clientes reportaron ya están autorizados.
          </Typography>
        </Paper>
      )}

      {grupos.map(([clave, lista]) => {
        const [box, nombre] = clave.split('|');
        const suma = lista.reduce((s, v) => s + Number(v.declared_amount || 0), 0);
        return (
          <Accordion key={clave} defaultExpanded={grupos.length <= 3} sx={{ mb: 1.5 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: '100%', pr: 2 }}>
                <Typography fontWeight={700}>{nombre}</Typography>
                <Chip size="small" label={box} variant="outlined" />
                <Box sx={{ flex: 1 }} />
                <Chip size="small" color="warning"
                  label={`${lista.length} pago${lista.length === 1 ? '' : 's'} · ${money(suma)}`} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ bgcolor: '#FAFAFA' }}>
              {lista.map((v) => {
                const activo = abierto === v.id;
                return (
                  <Paper key={v.id} variant="outlined" sx={{ p: 2, mb: 1.5 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="h6" fontWeight={800}>{money(v.declared_amount)}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Dice haber pagado esto a la orden{' '}
                          <b style={{ fontFamily: 'monospace' }}>{v.payment_reference}</b>{' '}
                          (la orden es de {money(v.order_amount)})
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Subido el {fecha(v.created_at)} · lleva {diasDesde(v.created_at)} días esperando
                        </Typography>
                        {/* Muy seguido el comprobante lo sube el asesor, no el
                            cliente. Decirlo evita la lectura de que el asesor
                            está pagando algo suyo. */}
                        {v.subido_por_otro && v.subido_por_nombre && (
                          <Chip size="small" variant="outlined" sx={{ mt: 0.5 }}
                            label={`Lo subió ${v.subido_por_nombre}${v.subido_por_rol === 'advisor' || v.subido_por_rol === 'sub_advisor' ? ' (su asesor)' : ''}`} />
                        )}
                      </Box>
                      <Button variant={activo ? 'outlined' : 'contained'} onClick={() => abrir(v)}>
                        {activo ? 'Cerrar' : 'Revisar este pago'}
                      </Button>
                    </Stack>

                    {activo && (
                      <Box sx={{ mt: 2 }}>
                        <Divider sx={{ mb: 2 }} />

                        {/* PASO 1 */}
                        <Typography fontWeight={800} sx={{ mb: 1 }}>
                          Paso 1 · Mira el comprobante que subió
                        </Typography>
                        {v.file_url ? (
                          <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 3 }}>
                            <Box
                              component="img" src={v.file_url} alt={`Comprobante ${v.id}`}
                              onClick={() => setZoom(v.file_url!)}
                              sx={{ maxWidth: 260, maxHeight: 200, border: '1px solid #ddd', borderRadius: 1, cursor: 'zoom-in', objectFit: 'contain', bgcolor: '#fff' }}
                            />
                            <Button size="small" endIcon={<OpenInNewIcon />} href={v.file_url} target="_blank" rel="noopener">
                              Abrir grande
                            </Button>
                          </Stack>
                        ) : (
                          <Alert severity="warning" sx={{ mb: 3 }}>
                            Este comprobante no tiene archivo. No puedes verificarlo: lo correcto es rechazarlo
                            y pedirle al cliente que lo vuelva a subir.
                          </Alert>
                        )}

                        {/* PASO 2 */}
                        <Typography fontWeight={800} sx={{ mb: 0.5 }}>
                          Paso 2 · Encuentra ese depósito en el estado de cuenta
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                          Abajo están los movimientos del banco que <b>todavía no se han usado</b> para
                          pagar otra cosa. Elige el que corresponde a este comprobante. Si no lo ves,
                          búscalo por nombre, banco o importe.
                        </Typography>

                        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                          <TextField
                            size="small" fullWidth placeholder="Buscar por nombre, banco, referencia…"
                            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') buscarAbonos(v.id, busqueda); }}
                          />
                          <Button variant="outlined" startIcon={<SearchIcon />} onClick={() => buscarAbonos(v.id, busqueda)}>
                            Buscar
                          </Button>
                        </Stack>

                        {cargandoCand ? (
                          <Box sx={{ py: 2, textAlign: 'center' }}><CircularProgress size={22} /></Box>
                        ) : candidatos.length === 0 ? (
                          <Alert severity="warning" sx={{ mb: 2 }}>
                            <AlertTitle sx={{ fontWeight: 700 }}>No encontré el depósito automáticamente</AlertTitle>
                            {notaCand || 'Prueba buscando por el nombre de quien deposita.'}
                            <b> Ojo: esto no quiere decir que el cliente no haya pagado.</b>
                          </Alert>
                        ) : (
                          <Box sx={{ mb: 2, maxHeight: 320, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 1 }}>
                            {candidatos.map((c) => (
                              <Box
                                key={c.id} onClick={() => c.alcanza && setElegido(c.id)}
                                sx={{
                                  display: 'flex', alignItems: 'center', gap: 1, p: 1.2,
                                  borderBottom: '1px solid #eee',
                                  cursor: c.alcanza ? 'pointer' : 'not-allowed',
                                  opacity: c.alcanza ? 1 : 0.5,
                                  bgcolor: elegido === c.id ? '#E8F5E9' : 'transparent',
                                }}
                              >
                                <Radio size="small" checked={elegido === c.id} disabled={!c.alcanza} />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                    <Typography fontWeight={700}>{money(c.abono)}</Typography>
                                    <Typography variant="caption" color="text.secondary">{fecha(c.fecha)}</Typography>
                                    {c.importe_exacto && <Chip size="small" color="success" label="Importe exacto" />}
                                    {c.cita_al_cliente && <Chip size="small" color="primary" label="Menciona su número de cliente" />}
                                  </Stack>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
                                    {c.concepto}
                                  </Typography>
                                  {!c.alcanza && (
                                    <Typography variant="caption" color="error">
                                      Este movimiento ya se usó casi todo: solo quedan {money(c.disponible)} libres,
                                      y este comprobante es de {money(v.declared_amount)}.
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        )}

                        {/* PASO 2b · ¿el depósito cubre otras órdenes? */}
                        {otras && otras.otras?.length > 0 && (
                          <Box sx={{ mb: 2.5 }}>
                            <Typography fontWeight={800} sx={{ mb: 0.5 }}>
                              Depositó {money(otras.deposito)} y esta orden es de {money(otras.monto_orden)}
                            </Typography>
                            {otras.cobertura_exacta ? (
                              <Alert severity="success" sx={{ mb: 1.5 }}>
                                <AlertTitle sx={{ fontWeight: 800 }}>Cubre exactamente todas sus órdenes</AlertTitle>
                                {otras.mensaje} Márcalas todas y se liquidan con este mismo depósito.
                                <Box sx={{ mt: 1 }}>
                                  <Button size="small" variant="contained" color="success"
                                    onClick={() => setExtras(otras.otras.map((o: OtraOrden) => o.id))}>
                                    Aplicarlo a todas
                                  </Button>
                                </Box>
                              </Alert>
                            ) : (
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                Sobran <b>{money(otras.sobrante)}</b>. Si el cliente pagó otras órdenes en el
                                mismo depósito, márcalas aquí y se liquidan también. Lo que no marques
                                se le queda como saldo a favor —o abona a su deuda si tiene crédito—.
                              </Typography>
                            )}
                            <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
                              {otras.otras.map((o: OtraOrden) => (
                                <Box key={o.id}
                                  onClick={() => setExtras((prev) => prev.includes(o.id)
                                    ? prev.filter((x) => x !== o.id) : [...prev, o.id])}
                                  sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.2,
                                        borderBottom: '1px solid #eee', cursor: 'pointer',
                                        bgcolor: extras.includes(o.id) ? '#E8F5E9' : 'transparent' }}>
                                  <Radio size="small" checked={extras.includes(o.id)} />
                                  <Box sx={{ flex: 1 }}>
                                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                      {o.payment_reference}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {o.es_credito ? 'A crédito, sin liquidar' : o.status}
                                    </Typography>
                                  </Box>
                                  <Typography fontWeight={700}>{money(o.amount)}</Typography>
                                </Box>
                              ))}
                            </Box>
                            {extras.length > 0 && (
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                Se liquidarán {extras.length} orden(es) más con este mismo depósito.
                              </Typography>
                            )}
                          </Box>
                        )}

                        {/* PASO 3 */}
                        <Typography fontWeight={800} sx={{ mb: 0.5 }}>Paso 3 · Decide</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1 }}>
                          <Tooltip title={elegido ? '' : 'Primero elige el movimiento del banco en el Paso 2'}>
                            <span>
                              <Button
                                variant="contained" color="success" startIcon={<CheckCircleIcon />}
                                disabled={!elegido} onClick={() => setConfirmar(v)}
                              >
                                Sí pagó — autorizar
                              </Button>
                            </span>
                          </Tooltip>
                          <Button variant="outlined" color="error" startIcon={<BlockIcon />} onClick={() => { setRechazar(v); setMotivo(''); }}>
                            No cuadra — rechazar
                          </Button>
                          <Box sx={{ flex: 1 }} />
                          <Button size="small" color="warning" startIcon={<WarningAmberIcon />} onClick={() => setSinLigar(v)}>
                            Autorizar sin encontrar el depósito
                          </Button>
                        </Stack>
                      </Box>
                    )}
                  </Paper>
                );
              })}
            </AccordionDetails>
          </Accordion>
        );
      })}

      {/* Confirmar aprobación normal: se dice qué va a pasar ANTES de que pase. */}
      <Dialog open={!!confirmar} onClose={() => setConfirmar(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Vas a dar por pagado este comprobante</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>Al autorizarlo, el sistema hace todo esto solo:</Typography>
          <Stack spacing={1}>
            {[
              'Marca el comprobante como aprobado.',
              'Suma este pago a la orden. Si ya quedó cubierta, la orden se cierra.',
              'Si es cliente con crédito, le libera la línea que tenía ocupada.',
              'Si pagó de más, el sobrante le queda como saldo a favor.',
              'Aparta ese movimiento del banco para que nadie lo use en otra orden.',
            ].map((t, i) => (
              <Stack key={i} direction="row" spacing={1}>
                <Typography color="success.main" fontWeight={800}>✓</Typography>
                <Typography variant="body2">{t}</Typography>
              </Stack>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmar(null)}>Cancelar</Button>
          <Button variant="contained" color="success" disabled={guardando}
            onClick={() => confirmar && aprobar(confirmar, { bank_entry_id: elegido! })}>
            {guardando ? 'Autorizando…' : 'Sí, autorizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Aprobar sin ligar: la salida de emergencia. Tiene que dar miedo. */}
      <Dialog open={!!sinLigar} onClose={() => setSinLigar(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: '#B45309' }}>Autorizar sin respaldo del banco</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Vas a dar por bueno un pago <b>sin haber encontrado el depósito</b> en el estado de cuenta.
          </Alert>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Úsalo solo cuando el depósito de verdad existe pero todavía no aparece cargado
            —por ejemplo, un pago de hoy o un estado de cuenta que falta subir—.
          </Typography>
          <Typography variant="body2">
            Queda anotado a tu nombre. Si el depósito nunca llega, ese dinero se dio por
            cobrado sin haber entrado.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSinLigar(null)}>Mejor no</Button>
          <Button variant="contained" color="warning" disabled={guardando}
            onClick={() => sinLigar && aprobar(sinLigar, { aprobar_sin_ligar: true })}>
            {guardando ? 'Autorizando…' : 'Autorizar bajo mi responsabilidad'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!rechazar} onClose={() => setRechazar(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Rechazar este comprobante</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Escribe por qué no cuadra. <b>El cliente va a leer esto</b>, así que dile qué necesita hacer.
          </Typography>
          <TextField
            autoFocus fullWidth multiline rows={3} value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: El comprobante está borroso, no se ve el importe. Vuelve a subirlo."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRechazar(null)}>Cancelar</Button>
          <Button variant="contained" color="error" disabled={guardando || motivo.trim().length < 5}
            onClick={hacerRechazo}>
            {guardando ? 'Rechazando…' : 'Rechazar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!zoom} onClose={() => setZoom(null)} maxWidth="lg">
        <DialogContent sx={{ p: 0 }}>
          {zoom && <Box component="img" src={zoom} sx={{ maxWidth: '100%', display: 'block' }} />}
        </DialogContent>
      </Dialog>

      <Snackbar
        open={!!aviso} autoHideDuration={6000} onClose={() => setAviso(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={aviso?.tipo || 'success'} onClose={() => setAviso(null)}>{aviso?.txt}</Alert>
      </Snackbar>
    </Box>
  );
}
