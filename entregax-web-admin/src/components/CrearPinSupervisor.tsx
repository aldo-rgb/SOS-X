import { useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';

/**
 * Aparece cuando alguien que puede autorizar todavía no tiene PIN propio.
 *
 * Antes se autorizaba con el PIN de la cuenta "Administrador EntregaX" y cada
 * cambio quedaba a nombre de otro. Aquí la persona crea el suyo en el mismo
 * momento y la autorización sale a su nombre.
 */
export default function CrearPinSupervisor({ crear, onCreado }: {
  crear: (pin: string) => Promise<void>;
  onCreado: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setError('');
    if (!/^\d{6}$/.test(pin)) { setError('El PIN debe ser de 6 números.'); return; }
    if (pin !== pin2) { setError('Los dos PIN no coinciden.'); return; }
    setGuardando(true);
    try {
      await crear(pin);
      onCreado(pin);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo crear el PIN.');
    } finally { setGuardando(false); }
  };

  return (
    <Alert severity="info" sx={{ mt: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Crea tu PIN de supervisor</Typography>
      <Typography variant="caption" sx={{ display: 'block', mb: 1.5 }}>
        Cada autorización quedará a tu nombre. El PIN de otra cuenta ya no sirve para autorizar por ti. No lo compartas.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <TextField size="small" type="password" label="Nuevo PIN (6 números)" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputProps={{ inputMode: 'numeric', maxLength: 6 }} />
        <TextField size="small" type="password" label="Repite el PIN" value={pin2}
          onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} inputProps={{ inputMode: 'numeric', maxLength: 6 }}
          error={!!error} helperText={error || ' '} />
        <Button size="small" variant="contained" onClick={guardar} disabled={guardando || !pin || !pin2}>
          {guardando ? 'Guardando…' : 'Crear mi PIN'}
        </Button>
      </Box>
    </Alert>
  );
}
