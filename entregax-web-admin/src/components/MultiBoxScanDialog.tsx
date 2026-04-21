// Modal para capturar N guías de proveedor cuando se agregan múltiples cajas.
// - Paso 1: elegir modo "Misma guía" o "Guía por caja"
// - Paso 2a (Misma guía): un input, se aplica a todas las N cajas
// - Paso 2b (Guía por caja): N inputs secuenciales con autofocus
import { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField,
  Button, Radio, RadioGroup, FormControlLabel, InputAdornment, Chip, Alert,
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Inventory2Icon from '@mui/icons-material/Inventory2';

const ORANGE = '#F05A28';

interface Props {
  open: boolean;
  quantity: number;
  initialGuide?: string; // Si el usuario ya escribió una guía en el form, precárgala
  onClose: () => void;
  onComplete: (guides: string[]) => void;
}

export default function MultiBoxScanDialog({ open, quantity, initialGuide, onClose, onComplete }: Props) {
  const [mode, setMode] = useState<'same' | 'each'>('same');
  const [currentInput, setCurrentInput] = useState('');
  const [captured, setCaptured] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset cuando abre
  useEffect(() => {
    if (open) {
      setMode('same');
      setCurrentInput(initialGuide || '');
      setCaptured([]);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open, initialGuide]);

  // Autofocus al cambiar de caja
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [captured.length, mode, open]);

  const handleSubmitCurrent = () => {
    const value = currentInput.trim().toUpperCase();
    if (!value) return;

    if (mode === 'same') {
      // Aplica la misma guía a las N cajas
      onComplete(Array(quantity).fill(value));
      return;
    }

    // Modo "each": acumular y avanzar
    const next = [...captured, value];
    setCaptured(next);
    setCurrentInput('');
    if (next.length >= quantity) {
      onComplete(next);
    }
  };

  const handleSkipCurrent = () => {
    if (mode !== 'each') return;
    const next = [...captured, ''];
    setCaptured(next);
    setCurrentInput('');
    if (next.length >= quantity) onComplete(next);
  };

  const currentIndex = captured.length + 1;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ bgcolor: '#111', color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Inventory2Icon sx={{ color: ORANGE }} />
        Guías del proveedor — {quantity} caja{quantity > 1 ? 's' : ''}
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Vas a agregar <strong>{quantity}</strong> cajas con el mismo peso y medidas.
          Elige cómo asignar las guías del proveedor.
        </Alert>

        <RadioGroup
          value={mode}
          onChange={(_, v) => { setMode(v as 'same' | 'each'); setCaptured([]); setCurrentInput(initialGuide || ''); }}
          sx={{ mb: 2 }}
        >
          <FormControlLabel
            value="same"
            control={<Radio sx={{ '&.Mui-checked': { color: ORANGE } }} />}
            label={`Usar la MISMA guía para las ${quantity} cajas`}
          />
          <FormControlLabel
            value="each"
            control={<Radio sx={{ '&.Mui-checked': { color: ORANGE } }} />}
            label="Escanear una guía DISTINTA por caja"
          />
        </RadioGroup>

        {mode === 'each' && (
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={`Caja ${currentIndex} de ${quantity}`}
              sx={{ bgcolor: ORANGE, color: 'white', fontWeight: 600 }}
            />
            {captured.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                Capturadas: {captured.filter(Boolean).length}/{captured.length}
              </Typography>
            )}
          </Box>
        )}

        <TextField
          fullWidth
          inputRef={inputRef}
          autoFocus
          label={mode === 'same' ? 'Guía del proveedor' : `Guía de la caja ${currentIndex}`}
          placeholder="Escanea o escribe la guía..."
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmitCurrent(); } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeScannerIcon /></InputAdornment> }}
          helperText={mode === 'each' ? 'Enter para avanzar a la siguiente caja' : 'Se aplicará a las N cajas'}
        />

        {mode === 'each' && captured.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {captured.map((g, i) => (
              <Chip
                key={i}
                size="small"
                icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                label={`${i + 1}: ${g || '(vacía)'}`}
                variant="outlined"
                sx={{ borderColor: ORANGE, color: ORANGE }}
              />
            ))}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        {mode === 'each' && (
          <Button onClick={handleSkipCurrent} color="inherit">
            Saltar esta caja
          </Button>
        )}
        <Button
          onClick={handleSubmitCurrent}
          variant="contained"
          disabled={!currentInput.trim() && mode === 'same'}
          sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d14b1f' } }}
        >
          {mode === 'same'
            ? `Aplicar a las ${quantity} cajas`
            : currentIndex >= quantity ? `Finalizar` : `Siguiente (${currentIndex}/${quantity})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
