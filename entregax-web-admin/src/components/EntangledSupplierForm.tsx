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
  clabe: string;
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
  clabe: '',
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

// Divisas operativas: Pesos (MXN), RMB (China) y USD. Se quitaron EUR/JPY/KRW/GBP.
const DIVISAS = ['MXN', 'RMB', 'USD'];

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

  // ¿El banco es de Estados Unidos? Lo dicen las posiciones 5 y 6 del SWIFT
  // ('CHASUS33' → US). No se pregunta aparte porque es un dato que ya se
  // captura, y `banco_pais` es texto libre y está vacío en casi la mitad.
  const swiftLimpio = String(value.swift_bic || '').replace(/\s+/g, '').toUpperCase();
  const bancoEsDeUsa = swiftLimpio.length >= 6 && swiftLimpio.slice(4, 6) === 'US';
  const pagaEnPesos = String(value.divisa_default || '').toUpperCase() === 'MXN';
  const problemaClabe = (() => {
    if (!pagaEnPesos) return '';
    const d = String(value.clabe || '').replace(/\D/g, '');
    if (!d) return 'Falta la CLABE: sin ella no se puede hacer el SPEI.';
    if (d.length !== 18) return `Deben ser 18 dígitos; llevas ${d.length}.`;
    // Dígito verificador de la CLABE: pesos 3,7,1 sobre los primeros 17.
    const pesos = [3, 7, 1];
    let suma = 0;
    for (let i = 0; i < 17; i++) suma += (Number(d[i]) * pesos[i % 3]!) % 10;
    if (((10 - (suma % 10)) % 10) !== Number(d[17])) return 'La CLABE no pasa su dígito verificador. Revísala con el proveedor.';
    return '';
  })();

  // Los tres testigos del país del banco. Si no coinciden, se marca.
  const avisoPais = (() => {
    const norm = (v: any) => String(v || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const PAISES: Record<string, string[]> = {
      US: ['ESTADOS UNIDOS DE AMERICA', 'ESTADOS UNIDOS', 'UNITED STATES', 'EEUU', 'EE UU', 'EUA', 'USA', 'US'],
      MX: ['ESTADOS UNIDOS MEXICANOS', 'MEXICO', 'MX'], CN: ['REPUBLICA POPULAR CHINA', 'CHINA MAINLAND', 'CHINA', 'CN'],
      HK: ['HONG KONG', 'HONGKONG', 'HK'], SG: ['SINGAPUR', 'SINGAPORE', 'SG'], JP: ['JAPON', 'JAPAN', 'JP'],
      KR: ['COREA DEL SUR', 'COREA', 'KOREA', 'KR'], TW: ['TAIWAN', 'TW'], DE: ['ALEMANIA', 'GERMANY', 'DE'],
      ES: ['ESPANA', 'SPAIN', 'ES'], CA: ['CANADA', 'CA'], VN: ['VIETNAM', 'VN'], IN: ['INDIA', 'IN'],
      GB: ['REINO UNIDO', 'UNITED KINGDOM', 'INGLATERRA', 'ENGLAND', 'GB', 'UK'],
    };
    const NOMBRES: Record<string, string> = { US: 'Estados Unidos', MX: 'México', CN: 'China', HK: 'Hong Kong', SG: 'Singapur', JP: 'Japón', KR: 'Corea', TW: 'Taiwán', DE: 'Alemania', ES: 'España', CA: 'Canadá', VN: 'Vietnam', IN: 'India', GB: 'Reino Unido' };
    const cand = Object.entries(PAISES)
      .flatMap(([iso, ns]) => ns.map(n => ({ iso, n: norm(n).replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() })))
      .sort((a, b) => b.n.length - a.n.length);
    // En la dirección NUNCA se buscan códigos de dos letras: "Anaheim, CA" no
    // es Canadá y "Lomas de Santa Fe" no es Alemania.
    const dePais = (txt: any, codigos: boolean) => {
      const t = ` ${norm(txt).replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
      for (const { iso, n } of cand) {
        if (n.length <= 3) { if (codigos && t.includes(` ${n} `)) return iso; }
        else if (t.includes(n)) return iso;
      }
      return null;
    };
    const sw = norm(value.swift_bic).replace(/\s+/g, '');
    // Solo cuenta si esas dos letras son un país conocido: un SWIFT inventado
    // deja basura ahí ('OCBCHXXX' → "HX") y el aviso saldría diciendo "el
    // SWIFT dice HX", que no le sirve a nadie.
    const codigoSwift = sw.length >= 6 ? sw.slice(4, 6) : '';
    const pSwift = NOMBRES[codigoSwift] ? codigoSwift : null;
    const pDecl = dePais(value.banco_pais, true);
    const pDir = dePais(value.banco_direccion, false);
    const vistos = [pSwift, pDecl, pDir].filter(Boolean) as string[];
    if (new Set(vistos).size <= 1) return '';
    const partes: string[] = [];
    if (pDecl) partes.push(`el país dice ${NOMBRES[pDecl] || pDecl}`);
    if (pSwift) partes.push(`el SWIFT dice ${NOMBRES[pSwift] || pSwift}`);
    if (pDir) partes.push(`la dirección dice ${NOMBRES[pDir] || pDir}`);
    return `Revisa el país del banco: ${partes.join(', ')}. Los tres deberían coincidir.`;
  })();

  const problemaAba = (() => {
    if (!bancoEsDeUsa) return '';
    const d = String(value.aba_routing || '').replace(/\D/g, '');
    if (!d) return 'Falta el ABA: el banco es de Estados Unidos y sin él el pago se rechaza. Son 9 dígitos.';
    if (d.length !== 9) return `Deben ser 9 dígitos exactos; llevas ${d.length}.`;
    const pesos = [3, 7, 1, 3, 7, 1, 3, 7, 1];
    const suma = pesos.reduce((acc, pe, i) => acc + Number(d[i]) * pe, 0);
    if (suma % 10 !== 0) return 'No pasa la verificación del banco. Lo más común es un dígito cambiado.';
    return '';
  })();

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
        <Grid size={{ xs: 12, md: pagaEnPesos ? 6 : 12 }}>
          <TextField
            fullWidth
            label={t('entangled.suppliers.accountNumber', 'Número de cuenta')}
            value={value.numero_cuenta}
            onChange={(e) => set({ numero_cuenta: e.target.value.trim() })}
            required
            sx={textFieldSx}
          />
        </Grid>
        {/* Un SPEI se hace con cuenta Y CLABE: son dos números distintos del
            mismo contrato y quien paga necesita los dos. Solo se pide cuando el
            pago va en pesos (tarea 866). */}
        {pagaEnPesos && (
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              label="CLABE (para SPEI)"
              value={value.clabe}
              onChange={(e) => set({ clabe: e.target.value.replace(/\D/g, '') })}
              inputProps={{ maxLength: 18 }}
              placeholder="18 dígitos"
              required
              error={!!problemaClabe}
              helperText={problemaClabe || 'Es distinta del número de cuenta; sin ella no se puede hacer el SPEI'}
              sx={textFieldSx}
            />
          </Grid>
        )}
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
            required
            error={!String(value.banco_direccion || '').trim()}
            helperText={!String(value.banco_direccion || '').trim()
              ? 'Obligatoria: es el dato que permite detectar un país mal capturado'
              : undefined}
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
          {/* El ABA se valida aquí mismo y no al guardar: son 9 dígitos exactos
              con dígito verificador (pesos 3,7,1, la suma múltiplo de 10), que
              es lo que comprueba el banco al recibir la transferencia. Antes
              solo se limitaba el largo a 9 sin exigirlo, y se guardaron
              proveedores con "0108" y "08100003"; el pago rebota días después
              y nadie sabe por qué (tarea 866). */}
          <TextField
            fullWidth
            label={t('entangled.suppliers.aba', 'ABA / Routing WIRE (USD)')}
            value={value.aba_routing}
            onChange={(e) => set({ aba_routing: e.target.value.replace(/\D/g, '') })}
            inputProps={{ maxLength: 9 }}
            placeholder="9 dígitos"
            required={bancoEsDeUsa}
            error={!!problemaAba}
            helperText={problemaAba
              || 'Debe ser el routing para WIRE. Muchos bancos tienen otro distinto para ACH — si se captura ése, el pago se devuelve.'}
            sx={textFieldSx}
          />
        </Grid>
        {/* El país del banco, cruzado por tres lados: lo que se declaró, lo que
            dice el SWIFT y lo que dice la dirección. Llegó un alta con SWIFT
            MRMDUS33 (Estados Unidos) y dirección "Queen's Road Central, Hong
            Kong": el país correcto era Hong Kong y la dirección era el único
            dato que lo decía (tarea 866). */}
        {!!avisoPais && (
          <Grid size={{ xs: 12 }}>
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: '#FFF4E5', border: '1px solid #FFB74D', display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <Typography sx={{ fontSize: 16, lineHeight: 1.2 }}>⚠️</Typography>
              <Typography variant="caption" sx={{ color: '#8A4B00', fontWeight: 600 }}>
                {avisoPais}
              </Typography>
            </Box>
          </Grid>
        )}
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
