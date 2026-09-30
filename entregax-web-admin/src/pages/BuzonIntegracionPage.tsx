// ============================================================
// Buzón de integración — el hilo de recados con el equipo de desarrollo del
// proveedor con el que se está construyendo una conexión.
//
// Existe porque la coordinación técnica se estaba yendo por correo y por
// WhatsApp, donde no queda historia que alguien más pueda leer después: el que
// no estaba en la cadena no se entera, y cuando alguien sale del proyecto se va
// con el contexto. Aquí el hilo es uno solo y vive con el sistema.
//
// No es un chat en vivo: son recados. No hay "escribiendo…" ni entrega
// instantánea a propósito, porque prometer inmediatez en un canal que nadie
// atiende de tiempo completo genera la expectativa equivocada.
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import {
    Box, Paper, Typography, TextField, Button, Chip, Stack,
    CircularProgress, Alert, Divider, IconButton, Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ScheduleIcon from '@mui/icons-material/Schedule';
import api from '../services/api';

interface Mensaje {
    id: number;
    de: 'entregax' | 'socio';
    autor: string | null;
    asunto: string | null;
    cuerpo: string;
    recogido: boolean;
    leido: boolean;
    entregado?: boolean;
    ultimo_error?: string | null;
    fecha: string;
}

const SOCIO = 'entangled';

const fechaCorta = (iso: string): string =>
    new Date(iso).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });

export default function BuzonIntegracionPage({ onBack }: { onBack: () => void }) {
    const [mensajes, setMensajes] = useState<Mensaje[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [configurado, setConfigurado] = useState(false);
    const [lesAvisamos, setLesAvisamos] = useState(false);
    const [asunto, setAsunto] = useState('');
    const [cuerpo, setCuerpo] = useState('');
    const [enviando, setEnviando] = useState(false);

    const cargar = useCallback(async () => {
        try {
            setError(null);
            const r = await api.get(`/admin/buzon/${SOCIO}`);
            setMensajes(r.data?.mensajes || []);
            setConfigurado(!!r.data?.configurado);
            setLesAvisamos(!!r.data?.les_avisamos);
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setError(msg || 'No se pudo leer el buzón.');
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const enviar = async () => {
        const texto = cuerpo.trim();
        if (!texto) return;
        setEnviando(true);
        try {
            await api.post(`/admin/buzon/${SOCIO}`, { asunto: asunto.trim() || undefined, cuerpo: texto });
            setCuerpo('');
            setAsunto('');
            await cargar();
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setError(msg || 'No se pudo mandar el mensaje.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <IconButton onClick={onBack} size="small"><ArrowBackIcon /></IconButton>
                <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" fontWeight={700}>Buzón de integración</Typography>
                    <Typography variant="caption" color="text.secondary">
                        Recados con el equipo técnico del proveedor mientras se construye la conexión
                    </Typography>
                </Box>
                <Tooltip title="Actualizar">
                    <IconButton onClick={cargar} size="small"><RefreshIcon /></IconButton>
                </Tooltip>
            </Stack>

            {/* Estado de la conexión. Va arriba porque si falta la llave, todo lo
                que se escriba aquí se queda guardado y ellos no lo pueden leer. */}
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Chip
                    size="small"
                    label={configurado ? 'Credenciales cargadas' : 'Faltan credenciales'}
                    color={configurado ? 'success' : 'warning'}
                    variant={configurado ? 'filled' : 'outlined'}
                />
                <Chip
                    size="small"
                    label={lesAvisamos ? 'Se les avisa al escribir' : 'Sin aviso automático'}
                    color={lesAvisamos ? 'info' : 'default'}
                    variant="outlined"
                />
            </Stack>

            {!configurado && !cargando && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    El buzón todavía no tiene credenciales cargadas, así que el proveedor no puede
                    leer ni escribir. Lo que dejes aquí se guarda y lo verán en cuanto se
                    configuren <code>BUZON_ENTANGLED_API_KEY</code> y <code>BUZON_ENTANGLED_SECRET</code>.
                </Alert>
            )}

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                    Dejar un recado
                </Typography>
                <TextField
                    id="buzon-asunto"
                    label="Asunto (opcional)"
                    value={asunto}
                    onChange={(e) => setAsunto(e.target.value)}
                    size="small"
                    fullWidth
                    sx={{ mb: 1.5 }}
                />
                <TextField
                    id="buzon-cuerpo"
                    label="Mensaje"
                    value={cuerpo}
                    onChange={(e) => setCuerpo(e.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                    placeholder="Ej: Ya quedó el endpoint de consulta, prueben cuando puedan."
                />
                <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        variant="contained"
                        startIcon={enviando ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                        onClick={enviar}
                        disabled={enviando || !cuerpo.trim()}
                    >
                        Mandar
                    </Button>
                </Box>
            </Paper>

            {cargando ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : mensajes.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                        Todavía no hay recados. El primero que escribas les llega en cuanto lo mandes.
                    </Typography>
                </Paper>
            ) : (
                <Stack spacing={1.5}>
                    {[...mensajes].reverse().map((m) => {
                        const nuestro = m.de === 'entregax';
                        return (
                            <Paper
                                key={m.id}
                                variant="outlined"
                                sx={{
                                    p: 2,
                                    borderLeft: 3,
                                    borderLeftColor: nuestro ? 'primary.main' : 'secondary.main',
                                    bgcolor: nuestro ? 'action.hover' : 'background.paper',
                                }}
                            >
                                <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: .5, flexWrap: 'wrap' }}>
                                    <Typography variant="subtitle2" fontWeight={700}>
                                        {nuestro ? (m.autor || 'EntregaX') : (m.autor || 'Proveedor')}
                                    </Typography>
                                    <Chip
                                        size="small"
                                        label={nuestro ? 'Nosotros' : 'Ellos'}
                                        color={nuestro ? 'primary' : 'secondary'}
                                        variant="outlined"
                                        sx={{ height: 18, fontSize: 10 }}
                                    />
                                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                        {fechaCorta(m.fecha)}
                                    </Typography>
                                </Stack>

                                {m.asunto && (
                                    <Typography variant="body2" fontWeight={600} sx={{ mb: .5 }}>
                                        {m.asunto}
                                    </Typography>
                                )}

                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                    {m.cuerpo}
                                </Typography>

                                {/* Solo en los nuestros. En los de ellos sobra, porque
                                    leerlos es justamente estar en esta pantalla.

                                    Tres estados, no dos: que su servidor se lo baje NO es
                                    que alguien lo haya leído. Con un agente consultando
                                    cada pocos minutos, un solo estado dejaría todo en
                                    "leído" aunque nadie lo haya abierto. */}
                                {nuestro && (
                                    <>
                                        <Divider sx={{ my: 1 }} />
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            {m.leido ? (
                                                <Chip size="small" icon={<DoneAllIcon />} label="Lo leyó una persona"
                                                      color="success" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                                            ) : m.recogido ? (
                                                <Chip size="small" icon={<DoneAllIcon />} label="Lo recogió su sistema"
                                                      color="info" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                                            ) : (
                                                <Chip size="small" icon={<ScheduleIcon />} label="Sin entregar"
                                                      variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                                            )}
                                            {m.ultimo_error && (
                                                <Typography variant="caption" color="error.main">
                                                    No se les pudo avisar: {m.ultimo_error}
                                                </Typography>
                                            )}
                                        </Stack>
                                    </>
                                )}
                            </Paper>
                        );
                    })}
                </Stack>
            )}
        </Box>
    );
}
