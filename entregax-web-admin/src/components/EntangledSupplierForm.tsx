// ============================================================================
// EntangledSupplierForm
// Subcomponente reutilizable: formulario de proveedor de envío (beneficiario)
// con todos los campos bancarios internacionales y foto.
// ============================================================================

import { Grid, MenuItem, TextField, Button, Stack, Typography, Box } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

export interface SupplierFormData {
  id?: number;
  nombre_beneficiario: string;
  nombre_chino: string;
  direccion_beneficiario: string;
  pais_beneficiario: string;
  numero_cuenta: string;
  iban: string;
  banco_nombre: string;
  banco_direccion: string;
  banco_pais: string;
  swift_bic: string;
  aba_routing: string;
  divisa_default: string;
  motivo_default: string;
  foto_url: string;
  alias: string;
  notes: string;
}

export const EMPTY_SUPPLIER: SupplierFormData = {
  nombre_beneficiario: '',
  nombre_chino: '',
  direccion_beneficiario: '',
  pais_beneficiario: '',
  numero_cuenta: '',
  iban: '',
  banco_nombre: '',
  banco_direccion: '',
  banco_pais: '',
  swift_bic: '',
  aba_routing: '',
  divisa_default: 'RMB',
  motivo_default: '',
  foto_url: '',
  alias: '',
  notes: '',
};

const DIVISAS = ['RMB', 'USD', 'EUR', 'JPY', 'KRW', 'GBP'];

const ORANGE = '#F05A28';

interface Props {
  value: SupplierFormData;
  onChange: (next: SupplierFormData) => void;
  onUploadPhoto: (file: File) => Promise<void> | void;
  uploading?: boolean;
  lightTheme?: boolean;
}

export default function EntangledSupplierForm({
  value,
  onChange,
  onUploadPhoto,
  uploading,
  lightTheme = false,
}: Props) {
  const { t } = useTranslation();
  const isRMB = value.divisa_default === 'RMB';
  const set = (patch: Partial<SupplierFormData>) => onChange({ ...value, ...patch });

  const C = lightTheme ? {
    inputBg: '#ffffff',
    border: '#e3e6ea',
    borderStrong: '#d1d5db',
    textPrimary: '#0f1115',
    textMuted: '#6b7280',
    textFaint: '#9ca3af',
  } : {
    inputBg: '#0a0a0a',
    border: '#333333',
    borderStrong: '#555555',
    textPrimary: '#ffffff',
    textMuted: '#888888',
    textFaint: '#666666',
  };
  const textFieldSx = {
    '& .MuiOutlinedInput-root': {
      color: C.textPrimary,
      backgroundColor: C.inputBg,
      '& fieldset': { borderColor: C.border },
      '&:hover fieldset': { borderColor: C.borderStrong },
      '&.Mui-focused fieldset': { borderColor: ORANGE },
    },
    '& .MuiInputBase-input::placeholder': { color: C.textFaint, opacity: 0.7 },
    '& .MuiInputLabel-root': { color: C.textMuted },
    '& .MuiInputLabel-root.Mui-focused': { color: ORANGE },
    '& .MuiOutlinedInput-input': { color: C.textPrimary },
    '& .MuiSvgIcon-root': { color: ORANGE },
    '& .MuiFormHelperText-root': { color: C.textFaint },
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: C.textPrimary }}>
        {t('entangled.suppliers.beneficiary', 'Datos del beneficiario')}
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.alias', 'Alias / nombre corto')}
            value={value.alias}
            onChange={(e) => set({ alias: e.target.value })}
            placeholder="Ej. Mi proveedor de ...."
            sx={textFieldSx}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            select
            fullWidth
            label={t('entangled.fields.currency')}
            value={value.divisa_default}
            onChange={(e) => set({ divisa_default: e.target.value })}
            sx={textFieldSx}
          >
            {DIVISAS.map((d) => (
              <MenuItem key={d} value={d}>
                {d}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.beneficiaryName', 'Nombre completo del beneficiario')}
            value={value.nombre_beneficiario}
            onChange={(e) => set({ nombre_beneficiario: e.target.value })}
            required
            helperText={t('entangled.suppliers.beneficiaryNameHelp', 'Tal como aparece en la cuenta')}
            sx={textFieldSx}
          />
        </Grid>
        {isRMB && (
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label={t('entangled.suppliers.chineseName', '中文名 / Nombre en chino (RMB)')}
              value={value.nombre_chino}
              onChange={(e) => set({ nombre_chino: e.target.value })}
              required
              sx={textFieldSx}
            />
          </Grid>
        )}
        <Grid size={{ xs: 12, md: 8 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.beneficiaryAddress', 'Dirección del beneficiario')}
            value={value.direccion_beneficiario}
            onChange={(e) => set({ direccion_beneficiario: e.target.value })}
            sx={textFieldSx}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.country', 'País')}
            value={value.pais_beneficiario}
            onChange={(e) => set({ pais_beneficiario: e.target.value })}
            sx={textFieldSx}
          />
        </Grid>
      </Grid>

      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 3, mb: 1, color: C.textPrimary }}>
        {t('entangled.suppliers.account', 'Cuenta bancaria')}
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.accountNumber', 'Número de cuenta')}
            value={value.numero_cuenta}
            onChange={(e) => set({ numero_cuenta: e.target.value.trim() })}
            required
            sx={textFieldSx}
          />
        </Grid>
      </Grid>

      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 3, mb: 1, color: C.textPrimary }}>
        {t('entangled.suppliers.bank', 'Banco receptor')}
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.bankName', 'Nombre del banco')}
            value={value.banco_nombre}
            onChange={(e) => set({ banco_nombre: e.target.value })}
            required
            sx={textFieldSx}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.bankCountry', 'País del banco')}
            value={value.banco_pais}
            onChange={(e) => set({ banco_pais: e.target.value })}
            sx={textFieldSx}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.bankAddress', 'Dirección del banco')}
            value={value.banco_direccion}
            onChange={(e) => set({ banco_direccion: e.target.value })}
            sx={textFieldSx}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.swift', 'SWIFT / BIC (internacional)')}
            value={value.swift_bic}
            onChange={(e) => set({ swift_bic: e.target.value.trim().toUpperCase() })}
            inputProps={{ maxLength: 11 }}
            sx={textFieldSx}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.aba', 'ABA Routing (USA)')}
            value={value.aba_routing}
            onChange={(e) => set({ aba_routing: e.target.value.replace(/\D/g, '') })}
            inputProps={{ maxLength: 9 }}
            sx={textFieldSx}
          />
        </Grid>
      </Grid>

      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 3, mb: 1, color: C.textPrimary }}>
        {t('entangled.suppliers.extra', 'Información adicional')}
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.reason', 'Motivo de la transferencia')}
            value={value.motivo_default}
            onChange={(e) => set({ motivo_default: e.target.value })}
            sx={textFieldSx}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.notes', 'Notas internas')}
            value={value.notes}
            onChange={(e) => set({ notes: e.target.value })}
            sx={textFieldSx}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="outlined"
              component="label"
              startIcon={<CloudUploadIcon />}
              disabled={uploading}
              sx={{ color: ORANGE, borderColor: ORANGE, '&:hover': { bgcolor: 'rgba(240, 90, 40, 0.1)' } }}
            >
              {uploading
                ? t('entangled.messages.uploadingProof', 'Subiendo...')
                : t('entangled.suppliers.uploadPhoto', 'Foto / documento del proveedor')}
              <input
                hidden
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadPhoto(f);
                  e.target.value = '';
                }}
              />
            </Button>
            {value.foto_url && (
              <Button
                size="small"
                sx={{ color: '#4ade80' }}
                onClick={async () => {
                  try {
                    const r = await api.get('/uploads/signed-url', { params: { url: value.foto_url } });
                    window.open(r.data.signedUrl || value.foto_url, '_blank', 'noopener');
                  } catch {
                    window.open(value.foto_url, '_blank', 'noopener');
                  }
                }}
              >
                {t('entangled.suppliers.viewPhoto', 'Ver foto')}
              </Button>
            )}
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
