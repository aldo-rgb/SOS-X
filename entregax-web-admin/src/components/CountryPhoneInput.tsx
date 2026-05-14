/**
 * CountryPhoneInput — Selector de c\u00f3digo de pa\u00eds (LADA) + input de tel\u00e9fono.
 *
 * Soporta:
 *  - Dropdown con los pa\u00edses m\u00e1s comunes para EntregaX (MX por defecto + LATAM + USA + CN)
 *  - Escribir directamente la lada en el input "C\u00f3digo" (override del dropdown)
 *  - Validaci\u00f3n b\u00e1sica de longitud
 *  - Devuelve el n\u00famero E.164 sin '+' v\u00eda onChange (formato que pide nuestro backend)
 *
 * Uso:
 *   <CountryPhoneInput value={fullPhone} onChange={setFullPhone} required />
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  TextField,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';

export interface Country {
  code: string;       // e164 sin '+', ej "52"
  iso: string;        // ISO-3166-1 alpha-2, ej "MX"
  name: string;       // "M\u00e9xico"
  flag: string;       // emoji
  expectedLen?: number; // longitud m\u00e1s com\u00fan del n\u00famero local (opcional)
}

const COUNTRIES: Country[] = [
  { code: '52',  iso: 'MX', name: 'M\u00e9xico',          flag: '\ud83c\uddf2\ud83c\uddfd', expectedLen: 10 },
  { code: '1',   iso: 'US', name: 'Estados Unidos',  flag: '\ud83c\uddfa\ud83c\uddf8', expectedLen: 10 },
  { code: '1',   iso: 'CA', name: 'Canad\u00e1',           flag: '\ud83c\udde8\ud83c\udde6', expectedLen: 10 },
  { code: '86',  iso: 'CN', name: 'China',           flag: '\ud83c\udde8\ud83c\uddf3', expectedLen: 11 },
  { code: '57',  iso: 'CO', name: 'Colombia',        flag: '\ud83c\udde8\ud83c\uddf4', expectedLen: 10 },
  { code: '54',  iso: 'AR', name: 'Argentina',       flag: '\ud83c\udde6\ud83c\uddf7', expectedLen: 10 },
  { code: '56',  iso: 'CL', name: 'Chile',           flag: '\ud83c\udde8\ud83c\uddf1', expectedLen: 9  },
  { code: '51',  iso: 'PE', name: 'Per\u00fa',            flag: '\ud83c\uddf5\ud83c\uddea', expectedLen: 9  },
  { code: '34',  iso: 'ES', name: 'Espa\u00f1a',          flag: '\ud83c\uddea\ud83c\uddf8', expectedLen: 9  },
  { code: '55',  iso: 'BR', name: 'Brasil',          flag: '\ud83c\udde7\ud83c\uddf7', expectedLen: 11 },
  { code: '502', iso: 'GT', name: 'Guatemala',       flag: '\ud83c\uddec\ud83c\uddf9', expectedLen: 8  },
  { code: '503', iso: 'SV', name: 'El Salvador',     flag: '\ud83c\uddf8\ud83c\uddfb', expectedLen: 8  },
  { code: '504', iso: 'HN', name: 'Honduras',        flag: '\ud83c\udded\ud83c\uddf3', expectedLen: 8  },
  { code: '506', iso: 'CR', name: 'Costa Rica',      flag: '\ud83c\udde8\ud83c\uddf7', expectedLen: 8  },
  { code: '507', iso: 'PA', name: 'Panam\u00e1',          flag: '\ud83c\uddf5\ud83c\udde6', expectedLen: 8  },
  { code: '593', iso: 'EC', name: 'Ecuador',         flag: '\ud83c\uddea\ud83c\udde8', expectedLen: 9  },
  { code: '598', iso: 'UY', name: 'Uruguay',         flag: '\ud83c\uddfa\ud83c\uddfe', expectedLen: 8  },
];

interface Props {
  /** N\u00famero completo en formato E.164 sin '+', ej "5215512345678" */
  value: string;
  /** Callback con n\u00famero completo concatenado (lada+local), s\u00f3lo d\u00edgitos */
  onChange: (e164NoPlus: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  error?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
}

const onlyDigits = (s: string) => s.replace(/\D/g, '');

const splitValue = (val: string): { code: string; local: string } => {
  const digits = onlyDigits(val);
  if (!digits) return { code: '52', local: '' };
  // Intentamos hacer match con los c\u00f3digos m\u00e1s largos primero (3 d\u00edgitos -> 1)
  const sorted = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (digits.startsWith(c.code)) {
      return { code: c.code, local: digits.slice(c.code.length) };
    }
  }
  return { code: '52', local: digits };
};

const CountryPhoneInput: React.FC<Props> = ({
  value,
  onChange,
  label = 'WhatsApp',
  required,
  disabled,
  helperText,
  error,
  fullWidth = true,
  size = 'medium',
}) => {
  const initial = useMemo(() => splitValue(value || ''), [value]);
  const [code, setCode] = useState<string>(initial.code);
  const [local, setLocal] = useState<string>(initial.local);

  // Si el padre cambia value externamente (reset), sincronizamos
  useEffect(() => {
    const s = splitValue(value || '');
    setCode(s.code);
    setLocal(s.local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const propagate = (newCode: string, newLocal: string) => {
    const cleanCode = onlyDigits(newCode).slice(0, 4);
    const cleanLocal = onlyDigits(newLocal).slice(0, 12);
    setCode(cleanCode);
    setLocal(cleanLocal);
    onChange(`${cleanCode}${cleanLocal}`);
  };

  const country = COUNTRIES.find(c => c.code === code) || COUNTRIES[0];
  const expectedLen = country.expectedLen || 10;
  const localValid = local.length === 0 || local.length >= expectedLen - 1;

  return (
    <Box sx={{ display: 'flex', gap: 1, width: fullWidth ? '100%' : 'auto', alignItems: 'flex-start' }}>
      {/* Selector de pa\u00eds */}
      <TextField
        select
        size={size}
        disabled={disabled}
        value={`${country.iso}-${country.code}`}
        onChange={(e) => {
          const [, newCode] = String(e.target.value).split('-');
          propagate(newCode, local);
        }}
        sx={{ minWidth: 110, '& .MuiSelect-select': { py: size === 'small' ? 1 : 1.5 } }}
        SelectProps={{
          MenuProps: {
            PaperProps: { sx: { maxHeight: 360 } },
          },
          renderValue: () => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <span style={{ fontSize: '1.15rem' }}>{country.flag}</span>
              <span style={{ fontWeight: 600 }}>+{country.code}</span>
            </Box>
          ),
        }}
      >
        {COUNTRIES.map(c => (
          <MenuItem key={`${c.iso}-${c.code}`} value={`${c.iso}-${c.code}`}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <span style={{ fontSize: '1.2rem' }}>{c.flag}</span>
              <span style={{ flex: 1 }}>{c.name}</span>
              <span style={{ color: '#888', fontWeight: 600 }}>+{c.code}</span>
            </Box>
          </MenuItem>
        ))}
      </TextField>

      {/* C\u00f3digo de pa\u00eds editable (si no encuentra el suyo) */}
      <TextField
        size={size}
        disabled={disabled}
        label="C\u00f3digo"
        value={code}
        onChange={(e) => propagate(e.target.value, local)}
        sx={{ width: 80 }}
        inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4 }}
        InputProps={{
          startAdornment: <InputAdornment position="start">+</InputAdornment>,
        }}
      />

      {/* N\u00famero local */}
      <TextField
        fullWidth
        size={size}
        disabled={disabled}
        label={label + (required ? ' *' : '')}
        value={local}
        onChange={(e) => propagate(code, e.target.value)}
        placeholder={country.iso === 'MX' ? '5512345678' : 'N\u00famero local'}
        error={error || (local.length > 0 && !localValid)}
        helperText={
          helperText ||
          (local.length > 0 && !localValid
            ? `Debe tener ~${expectedLen} d\u00edgitos`
            : `Lada ${country.name} + n\u00famero (${expectedLen} d\u00edgitos)`)
        }
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <PhoneIcon sx={{ color: 'text.secondary' }} />
            </InputAdornment>
          ),
          inputMode: 'tel' as const,
        }}
      />
    </Box>
  );
};

export default CountryPhoneInput;
