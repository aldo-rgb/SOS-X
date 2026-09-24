// ============================================
// MÓDULO TCG — el tramo mexicano del contenedor (tarea 654)
//
// TCG es el transportista que recoge la carga del otro lado y la baja hasta el
// destino. Tres movimientos, en cascada: cada etapa solo deja escoger de lo que
// ya cumplió la anterior, y la fecha y hora las pone el sistema al confirmar.
//
//   CRUCE    ← solo los que el almacén de El Paso marcó como shipped. La caja
//              seca y el sello vienen precargados del correo del almacén y aquí
//              solo se confirman (o se corrigen).
//   TRÁNSITO ← solo los que ya tienen cruce finalizado.
//   ENTREGA  ← solo los que ya van en tránsito.
//
// Cada tarjeta trae la dirección de entrega: sin eso el módulo diría qué mover
// pero no a dónde (tarea 647).
// ============================================

import { useCallback, useEffect, useState } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, IconButton, InputAdornment, Paper, Stack, TextField, Typography,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Refresh as RefreshIcon,
    LocalShipping as TruckIcon,
    CheckCircle as CheckIcon,
    Place as PlaceIcon,
    Warning as WarningIcon,
    Search as SearchIcon,
    Close as CloseIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { limpiarEscaneo } from '../utils/scanInput';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#F05A28';
const BLACK = '#1A1A1A';

type Etapa = 'cruce' | 'transito' | 'entrega';

const ETAPAS: { key: Etapa; titulo: string; accion: string; ayuda: string; color: string }[] = [
    {
        key: 'cruce',
        titulo: 'Cruce internacional',
        accion: 'Marcar cruce finalizado',
        ayuda: 'Solo aparecen los contenedores que el almacén de El Paso ya marcó como shipped. Confirma cuando la carga llegó a la yarda de Ciudad Juárez.',
        color: '#1565C0',
    },
    {
        key: 'transito',
        titulo: 'Tránsito a destino final',
        accion: 'Marcar en tránsito',
        ayuda: 'Solo los que ya tienen el cruce finalizado. Al confirmar se guarda la fecha y hora de este momento.',
        color: '#C77800',
    },
    {
        key: 'entrega',
        titulo: 'Entrega finalizada',
        accion: 'Marcar entrega finalizada',
        ayuda: 'Solo los que ya van en tránsito. Al confirmar se guarda la fecha y hora de la entrega.',
        color: '#2E7D46',
    },
];

interface ContenedorTcg {
    id: number;
    contenedor: string;
    bl: string | null;
    semana: string | null;
    referencia: string | null;
    estado: string;
    eta: string | null;
    caja_seca: string | null;
    sello: string | null;
    cliente: string | null;
    ordenes: number;
    paso_previo_at: string | null;
    entrega_completa: string | null;
    entrega_telefono: string | null;
    entrega_ciudad: string | null;
    sin_direccion: boolean;
}

function authHeaders() {
    return { Authorization: `Bearer ${localStorage.getItem('token') || ''}` };
}

export default function TcgModulePage({ onBack }: { onBack: () => void }) {
    const [etapa, setEtapa] = useState<Etapa>('cruce');
    const [loading, setLoading] = useState(false);
    const [lista, setLista] = useState<ContenedorTcg[]>([]);
    const [resumen, setResumen] = useState<Record<Etapa, number>>({ cruce: 0, transito: 0, entrega: 0 });
    const [error, setError] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    const [busqueda, setBusqueda] = useState('');

    // Confirmación
    const [elegido, setElegido] = useState<ContenedorTcg | null>(null);
    const [caja, setCaja] = useState('');
    const [sello, setSello] = useState('');
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async (e: Etapa) => {
        setLoading(true); setError(null);
        try {
            const [l, r] = await Promise.all([
                axios.get(`${API_URL}/api/maritime/tcg/contenedores`, { params: { etapa: e }, headers: authHeaders() }),
                axios.get(`${API_URL}/api/maritime/tcg/resumen`, { headers: authHeaders() }),
            ]);
            setLista(l.data?.contenedores || []);
            setResumen(r.data || { cruce: 0, transito: 0, entrega: 0 });
        } catch (err: any) {
            setError(err?.response?.data?.error || 'No se pudieron cargar los contenedores');
            setLista([]);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { cargar(etapa); }, [etapa, cargar]);

    const abrir = (c: ContenedorTcg) => {
        setElegido(c);
        setCaja(c.caja_seca || '');
        setSello(c.sello || '');
        setNota('');
    };

    const confirmar = async () => {
        if (!elegido) return;
        setGuardando(true); setError(null);
        try {
            const r = await axios.post(
                `${API_URL}/api/maritime/tcg/${elegido.id}/avanzar`,
                { etapa, caja_seca: caja, sello, nota },
                { headers: authHeaders() }
            );
            setOk(`${r.data?.contenedor}: ${r.data?.etiqueta}`);
            setElegido(null);
            cargar(etapa);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'No se pudo registrar el movimiento');
        } finally { setGuardando(false); }
    };

    const cfg = ETAPAS.find(e => e.key === etapa)!;

    // El buscador alcanza también el BL, la referencia, la semana y la caja y el
    // sello: quien llama por teléfono dice cualquiera de esos, no siempre el
    // número de contenedor.
    const termino = busqueda.trim().toLowerCase();
    const visibles = !termino ? lista : lista.filter(c =>
        [c.contenedor, c.bl, c.referencia, c.semana, c.caja_seca, c.sello, c.cliente, c.entrega_ciudad]
            .filter(Boolean).join(' ').toLowerCase().includes(termino));

    return (
        <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>
                <TruckIcon sx={{ color: ORANGE }} />
                <Box sx={{ flex: 1 }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: ORANGE }}>Módulo TCG</Typography>
                    <Typography variant="caption" color="text.secondary">
                        Cruce internacional, tránsito a destino y entrega final de los contenedores de rutas ELP
                    </Typography>
                </Box>
                <Button startIcon={<RefreshIcon />} onClick={() => cargar(etapa)} sx={{ textTransform: 'none' }}>
                    Actualizar
                </Button>
            </Stack>

            {/* Las tres etapas, con cuántos esperan en cada una */}
            <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                {ETAPAS.map(e => (
                    <Paper
                        key={e.key}
                        onClick={() => setEtapa(e.key)}
                        sx={{
                            px: 2.5, py: 1.5, cursor: 'pointer', borderRadius: 2, minWidth: 190,
                            borderLeft: `5px solid ${e.color}`,
                            bgcolor: etapa === e.key ? '#FFF6F2' : '#FFF',
                            boxShadow: etapa === e.key ? `0 0 0 2px ${ORANGE}` : undefined,
                        }}
                    >
                        <Typography variant="caption" sx={{ color: '#777', fontWeight: 700, letterSpacing: 0.5 }}>
                            {e.titulo.toUpperCase()}
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 800, color: e.color, lineHeight: 1.1 }}>
                            {resumen[e.key] ?? 0}
                        </Typography>
                    </Paper>
                ))}
            </Stack>

            <Alert severity="info" sx={{ mb: 2 }}>{cfg.ayuda}</Alert>

            <TextField
                size="small"
                fullWidth
                placeholder="Buscar por contenedor, BL, referencia, caja o sello…"
                value={busqueda}
                onChange={e => setBusqueda(limpiarEscaneo(e.target.value))}
                sx={{ mb: 2 }}
                InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                    endAdornment: busqueda ? (
                        <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setBusqueda('')}><CloseIcon fontSize="small" /></IconButton>
                        </InputAdornment>
                    ) : null,
                }}
            />
            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
            {ok && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setOk(null)}>{ok}</Alert>}

            {loading ? (
                <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
            ) : visibles.length === 0 ? (
                <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 3 }}>
                    <Typography color="text.secondary">
                        {termino
                            ? `Ningún contenedor de esta etapa coincide con “${busqueda}”.`
                            : `🎉 No hay contenedores esperando en “${cfg.titulo}”.`}
                    </Typography>
                </Paper>
            ) : (
                <Stack spacing={1.5}>
                    {visibles.map(c => (
                        <Paper key={c.id} sx={{ p: 2, borderRadius: 3, borderLeft: `5px solid ${cfg.color}` }}>
                            <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ flexWrap: 'wrap' }}>
                                <Box sx={{ minWidth: 200 }}>
                                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.05rem', color: BLACK }}>
                                        {c.contenedor}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        {c.bl || 'sin BL'}{c.semana ? ` · ${c.semana}` : ''}
                                    </Typography>
                                    {c.paso_previo_at && (
                                        <Typography variant="caption" sx={{ color: '#777' }}>
                                            Desde {new Date(c.paso_previo_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                                        </Typography>
                                    )}
                                </Box>

                                {/* Caja y sello: lo que manda el correo del almacén */}
                                <Box sx={{ minWidth: 170 }}>
                                    <Typography variant="caption" sx={{ color: '#888', fontWeight: 700 }}>CAJA SECA / SELLO</Typography>
                                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700 }}>
                                        {c.caja_seca || '—'} / {c.sello || '—'}
                                    </Typography>
                                </Box>

                                {/* A dónde va */}
                                <Box sx={{ flex: 1, minWidth: 240 }}>
                                    <Typography variant="caption" sx={{ color: '#888', fontWeight: 700 }}>ENTREGA</Typography>
                                    {c.sin_direccion ? (
                                        <Chip icon={<WarningIcon />} label="Sin dirección cargada" size="small"
                                            sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 700 }} />
                                    ) : (
                                        <Stack direction="row" spacing={0.5} alignItems="flex-start">
                                            <PlaceIcon sx={{ fontSize: 16, color: '#2E7D46', mt: 0.2 }} />
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                    {c.entrega_completa}
                                                </Typography>
                                                {c.entrega_telefono && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        Tel. {c.entrega_telefono}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Stack>
                                    )}
                                </Box>

                                <Button
                                    variant="contained"
                                    startIcon={<CheckIcon />}
                                    onClick={() => abrir(c)}
                                    sx={{ bgcolor: cfg.color, '&:hover': { bgcolor: cfg.color, filter: 'brightness(0.9)' }, textTransform: 'none', fontWeight: 700 }}
                                >
                                    {cfg.accion}
                                </Button>
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            )}

            {/* Confirmación */}
            <Dialog open={!!elegido} onClose={() => setElegido(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 800 }}>
                    {cfg.accion}
                    <Typography variant="caption" display="block" color="text.secondary">
                        {elegido?.contenedor}
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    {etapa === 'cruce' ? (
                        <>
                            <Typography variant="body2" sx={{ mb: 1.5 }}>
                                La caja y el sello vienen del correo del almacén. Corrígelos solo si no coinciden
                                con lo que cruzó.
                            </Typography>
                            <Stack direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
                                <TextField label="Caja seca" size="small" fullWidth value={caja}
                                    onChange={e => setCaja(e.target.value)} />
                                <TextField label="Sello" size="small" fullWidth value={sello}
                                    onChange={e => setSello(e.target.value)} />
                            </Stack>
                        </>
                    ) : (
                        <Typography variant="body2" sx={{ mb: 1.5 }}>
                            Se va a guardar la fecha y hora de este momento como
                            “{cfg.titulo.toLowerCase()}”.
                        </Typography>
                    )}
                    {elegido && !elegido.sin_direccion && (
                        <>
                            <Divider sx={{ my: 1.5 }} />
                            <Typography variant="caption" sx={{ color: '#888', fontWeight: 700 }}>SE ENTREGA EN</Typography>
                            <Typography variant="body2">{elegido.entrega_completa}</Typography>
                        </>
                    )}
                    <TextField label="Nota (opcional)" size="small" fullWidth multiline rows={2} sx={{ mt: 2 }}
                        value={nota} onChange={e => setNota(e.target.value)} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setElegido(null)} sx={{ textTransform: 'none' }}>Cancelar</Button>
                    <Button variant="contained" onClick={confirmar} disabled={guardando}
                        startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
                        sx={{ bgcolor: cfg.color, textTransform: 'none', fontWeight: 700 }}>
                        {guardando ? 'Guardando…' : 'Confirmar'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
