// ============================================================================
// 📣 PROMOCIÓN DEL RECORDATORIO DE ACTIVACIÓN (tarea 869)
// ============================================================================
// 425 clientes se registraron, nunca terminaron de verificarse y nunca movieron
// una sola guía. El asesor ya puede mandarles un recordatorio desde "Mis
// Clientes"; aquí Dirección/Comercial decide si ese recordatorio lleva además
// una promoción para su primera importación, y con qué palabras.
//
// Nace apagada a propósito: prometer un beneficio que nadie autorizó es peor
// que no mandar nada. Mientras esté apagada, el recordatorio sale sin promesa.
// ============================================================================

import { useEffect, useState } from 'react';
import {
    Box, Card, CardContent, Typography, Button, Chip, Alert, Stack,
    CircularProgress, Switch, FormControlLabel, TextField, Snackbar, Paper,
} from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import api from '../services/api';

interface Promo { activa: boolean; texto: string; vigencia: string; }

export default function PromoActivacionManager() {
    const [promo, setPromo] = useState<Promo | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });

    useEffect(() => {
        api.get('/admin/promo-activacion')
            .then(r => setPromo(r.data?.data || { activa: false, texto: '', vigencia: '' }))
            .catch(() => setPromo({ activa: false, texto: '', vigencia: '' }));
    }, []);

    const guardar = async () => {
        if (!promo) return;
        setGuardando(true);
        try {
            const r = await api.put('/admin/promo-activacion', promo);
            setPromo(r.data?.data || promo);
            setSnack({ open: true, msg: 'Promoción guardada', sev: 'success' });
        } catch (e: any) {
            setSnack({ open: true, msg: e?.response?.data?.error || 'No se pudo guardar', sev: 'error' });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, mb: 3 }}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <CampaignIcon sx={{ color: 'text.secondary' }} />
                    <Typography variant="h6" fontWeight={600}>Promoción para activar cuentas</Typography>
                    <Chip label="Dirección" size="small" color="warning" sx={{ ml: 1 }} />
                    {promo?.activa && <Chip label="ACTIVA" size="small" color="success" />}
                </Box>
                <Alert severity="info" sx={{ mb: 3 }}>
                    El asesor puede mandar un recordatorio a los clientes que se registraron y nunca
                    terminaron de verificarse ni hicieron un envío. Aquí decides si ese recordatorio
                    lleva además una promoción para su primera importación. Apagada, el mensaje sale
                    sin ofrecer nada.
                </Alert>

                {!promo ? (
                    <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={24} /></Box>
                ) : (
                    <Stack spacing={2}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={promo.activa}
                                    onChange={(e) => setPromo({ ...promo, activa: e.target.checked })}
                                    color="success"
                                />
                            }
                            label={promo.activa ? 'El mensaje incluye la promoción' : 'El mensaje va sin promoción'}
                        />
                        <TextField
                            label="Qué se ofrece"
                            placeholder="Ej.: 10% de descuento en el flete de tu primera importación"
                            value={promo.texto}
                            onChange={(e) => setPromo({ ...promo, texto: e.target.value })}
                            fullWidth multiline minRows={2} size="small"
                            helperText="Tal como lo va a leer el cliente en WhatsApp"
                        />
                        <TextField
                            label="Vigencia (opcional)"
                            placeholder="Ej.: válido hasta el 31 de diciembre"
                            value={promo.vigencia}
                            onChange={(e) => setPromo({ ...promo, vigencia: e.target.value })}
                            fullWidth size="small"
                        />

                        {/* Para que nadie tenga que imaginarse cómo queda */}
                        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                Así se va a ver el mensaje:
                            </Typography>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                                {`Hola [nombre], soy [asesor] de EntregaX. Tu casillero es S0000.\n\n`
                                    + `Vi que ya hiciste tu registro, pero te falta terminar la verificación de tu cuenta `
                                    + `y por eso todavía no puedes mover tu primer envío. Es rápido: desde la app subes tu `
                                    + `identificación y queda lista.`
                                    + (promo.activa && promo.texto.trim()
                                        ? `\n\n🎁 ${promo.texto.trim()}${promo.vigencia.trim() ? ` (${promo.vigencia.trim()})` : ''}`
                                        : '')
                                    + `\n\n¿Te ayudo a terminarla hoy?`}
                            </Typography>
                        </Paper>

                        <Box>
                            <Button variant="contained" onClick={guardar} disabled={guardando}>
                                {guardando ? 'Guardando…' : 'Guardar'}
                            </Button>
                        </Box>
                    </Stack>
                )}
            </CardContent>
            <Snackbar open={snack.open} autoHideDuration={5000} onClose={() => setSnack({ ...snack, open: false })}>
                <Alert severity={snack.sev} onClose={() => setSnack({ ...snack, open: false })}>{snack.msg}</Alert>
            </Snackbar>
        </Card>
    );
}
