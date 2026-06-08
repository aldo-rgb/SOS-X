// ============================================
// PÁGINA PÚBLICA DE RASTREO — sin autenticación
// Ruta: /rastrear
// ============================================

import { useState, useEffect } from 'react';
import { usePaymentStatus } from '../hooks/usePaymentStatus';
import {
  Box, Typography, TextField, Button, Paper, Stepper, Step,
  StepLabel, CircularProgress, Chip, Divider, Alert, IconButton,
  Menu, MenuItem, Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  CheckCircle as CheckIcon,
  LocalShipping as ShippingIcon,
  Security as CustomsIcon,
  Warehouse as WarehouseIcon,
  Inventory as InventoryIcon,
  DoneAll as DoneAllIcon,
  Language as LanguageIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ORANGE = '#F05A28';
const BLACK = '#111111';

// ── Textos multilingüe ────────────────────────────────────────────────────────

const T = {
  es: {
    title: '¡Rastrea tu envío!',
    subtitle: 'Ingresa tu número de guía y te decimos dónde está tu paquete en tiempo real.',
    placeholder: 'Ingresa tu guía (ej. TDX-0001234, JJD001...)',
    searchBtn: 'Rastrear',
    trackingLabel: 'Número de guía:',
    serviceLabel: 'Servicio:',
    detailsTitle: 'Estado de tu envío',
    movementsTitle: 'Últimas actualizaciones',
    ctaTitle: '¿Quieres importar como los expertos?',
    ctaBtn: 'Descargar la App',
    card1Title: 'Cotiza en 10 segundos',
    card1Body: 'Precios exactos sin sorpresas — con nuestra tecnología en tiempo real.',
    card2Title: 'Cero costos ocultos',
    card2Body: 'Cálculos matemáticos claros directo desde la plataforma.',
    card3Title: 'Dirección USA + China',
    card3Body: 'Recibe en nuestras bodegas y nosotros te la mandamos a México.',
    priceFrom: 'Desde',
    priceSuffix: 'USD',
    error404: 'Guía no encontrada. Verifica el número e intenta de nuevo.',
    notFound: 'No encontramos esa guía. ¿Está correctamente escrito?',
    langLabel: 'Idioma',
    footer: '© 2025 EntregaX Paquetería · Todos los derechos reservados',
    privacy: 'Privacidad',
    terms: 'Términos',
  },
  en: {
    title: 'Track your shipment!',
    subtitle: 'Enter your tracking number and we\'ll tell you exactly where your package is.',
    placeholder: 'Enter tracking number (e.g. TDX-0001234, JJD001...)',
    searchBtn: 'Track',
    trackingLabel: 'Tracking number:',
    serviceLabel: 'Service:',
    detailsTitle: 'Shipment Status',
    movementsTitle: 'Latest Updates',
    ctaTitle: 'Want to import like a pro?',
    ctaBtn: 'Download the App',
    card1Title: 'Quote in 10 seconds',
    card1Body: 'Exact prices, no surprises — powered by our real-time technology.',
    card2Title: 'Zero hidden costs',
    card2Body: 'Clear math-based pricing straight from the platform.',
    card3Title: 'USA + China Address',
    card3Body: 'Receive at our warehouses and we ship it to Mexico for you.',
    priceFrom: 'From',
    priceSuffix: 'USD',
    error404: 'Tracking number not found. Please double-check and try again.',
    notFound: 'We couldn\'t find that tracking number. Is it spelled correctly?',
    langLabel: 'Language',
    footer: '© 2025 EntregaX Paquetería · All rights reserved',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  zh: {
    title: '查询您的包裹！',
    subtitle: '输入运单号，实时了解您的包裹位置。',
    placeholder: '输入运单号（如 TDX-0001234, JJD001...）',
    searchBtn: '查询',
    trackingLabel: '运单号：',
    serviceLabel: '服务：',
    detailsTitle: '运输状态',
    movementsTitle: '最新动态',
    ctaTitle: '像专业人士一样进口货物？',
    ctaBtn: '下载应用',
    card1Title: '10秒报价',
    card1Body: '实时精确报价，无任何隐藏费用。',
    card2Title: '零隐藏费用',
    card2Body: '清晰的数学定价，直接来自平台。',
    card3Title: '美国 + 中国地址',
    card3Body: '在我们的仓库收货，我们帮您运到墨西哥。',
    priceFrom: '起价',
    priceSuffix: '美元',
    error404: '未找到该运单号，请检查后重试。',
    notFound: '未找到该运单号，请确认是否正确。',
    langLabel: '语言',
    footer: '© 2025 EntregaX Paquetería · 版权所有',
    privacy: '隐私政策',
    terms: '服务条款',
  },
} as const;

type Lang = 'es' | 'en' | 'zh';

const STEP_ICONS = [CheckIcon, ShippingIcon, CustomsIcon, WarehouseIcon, InventoryIcon, DoneAllIcon];
const LANG_OPTIONS: { code: Lang; flag: string; label: string }[] = [
  { code: 'es', flag: '🇲🇽', label: 'Español' },
  { code: 'en', flag: '🇺🇸', label: 'English' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
];

interface TrackingResult {
  tracking: string;
  service: { es: string; en: string; zh: string };
  current_milestone: number;
  milestones: { label_es: string; label_en: string; label_zh: string }[];
  movements: { date: string; location: string; description_es: string; description_en: string; description_zh: string }[];
  found: boolean;
  container?: {
    container_number: string | null;
    bl_number: string | null;
    reference: string | null;
    vessel: string | null;
    port: string | null;
    eta: string | null;
    cn_status_en: string | null;
    cn_status_ch: string | null;
  };
}

export default function PublicTrackingPage() {
  const [lang, setLang] = useState<Lang>('es');
  const [langAnchor, setLangAnchor] = useState<null | HTMLElement>(null);
  const { cajitoAvatarUrl, entregaxFullBlackUrl } = usePaymentStatus();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rates, setRates] = useState<{ aereo: number; maritimo: number; pobox: number } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/public/rates`)
      .then(r => r.json())
      .then(data => {
        const svcMap: Record<string, any> = {};
        for (const s of (data.servicios || [])) svcMap[s.id] = s;
        setRates({
          aereo: svcMap.aereo?.precio_base_usd ?? 19.30,
          maritimo: svcMap.maritimo?.precio_base_usd ?? 39,
          pobox: 39,
        });
      })
      .catch(() => setRates({ aereo: 19.30, maritimo: 39, pobox: 39 }));
  }, []);

  const t = T[lang];

  const handleSearch = async () => {
    const tracking = input.trim().toUpperCase();
    if (!tracking) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axios.get(`${API_URL}/api/public/track/${encodeURIComponent(tracking)}`);
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || t.error404);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result.tracking);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const stepLabel = (m: TrackingResult['milestones'][0]) =>
    lang === 'en' ? m.label_en : lang === 'zh' ? m.label_zh : m.label_es;
  const moveDesc = (m: TrackingResult['movements'][0]) =>
    lang === 'en' ? m.description_en : lang === 'zh' ? m.description_zh : m.description_es;
  const serviceLabel = (s: TrackingResult['service']) =>
    lang === 'en' ? s.en : lang === 'zh' ? s.zh : s.es;

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#FAFAFA', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box sx={{
        backgroundColor: '#fff',
        borderBottom: '1px solid #F0F0F0',
        px: { xs: 2, md: 6 },
        py: 1.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
      }}>
        {/* Logo */}
        <Box component="a" href="/" sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', gap: 1 }}>
          {entregaxFullBlackUrl ? (
            <Box
              component="img"
              src={entregaxFullBlackUrl}
              alt="EntregaX"
              onError={(e: any) => { e.target.style.display = 'none'; }}
              sx={{ height: 36, objectFit: 'contain' }}
            />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.3 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 900, color: BLACK, letterSpacing: -0.5, fontFamily: 'Inter, sans-serif' }}>
                Entrega
              </Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 900, color: ORANGE, letterSpacing: -0.5, fontFamily: 'Inter, sans-serif' }}>
                X
              </Typography>
            </Box>
          )}
          <Typography sx={{ fontSize: 11, color: '#888', fontWeight: 500 }}>
            Internacional
          </Typography>
        </Box>

        {/* Language selector */}
        <Box>
          <Button
            startIcon={<LanguageIcon />}
            onClick={(e) => setLangAnchor(e.currentTarget)}
            sx={{ color: '#555', textTransform: 'none', fontWeight: 600, fontSize: 13 }}
          >
            {LANG_OPTIONS.find(l => l.code === lang)?.flag} {LANG_OPTIONS.find(l => l.code === lang)?.label}
          </Button>
          <Menu anchorEl={langAnchor} open={Boolean(langAnchor)} onClose={() => setLangAnchor(null)}>
            {LANG_OPTIONS.map(opt => (
              <MenuItem key={opt.code} selected={lang === opt.code} onClick={() => { setLang(opt.code); setLangAnchor(null); }}>
                <Typography sx={{ mr: 1 }}>{opt.flag}</Typography> {opt.label}
              </MenuItem>
            ))}
          </Menu>
        </Box>
      </Box>

      {/* ── Hero + Search ───────────────────────────────────────────────────── */}
      <Box sx={{
        background: `linear-gradient(135deg, ${BLACK} 0%, #1A1A1A 60%, #2A1A0A 100%)`,
        px: { xs: 2, md: 8 },
        py: { xs: 6, md: 8 },
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: 'center',
        gap: 4,
      }}>
        <Box sx={{ flex: 1, color: '#fff' }}>
          <Typography sx={{ fontSize: { xs: 28, md: 40 }, fontWeight: 900, lineHeight: 1.15, mb: 1.5 }}>
            {t.title}
          </Typography>
          <Typography sx={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', mb: 3, lineHeight: 1.6, maxWidth: 520 }}>
            {t.subtitle}
          </Typography>

          {/* Search bar */}
          <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField
              fullWidth
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={t.placeholder}
              disabled={loading}
              sx={{
                backgroundColor: '#fff',
                borderRadius: 2,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  '& fieldset': { borderColor: 'transparent' },
                  '&:hover fieldset': { borderColor: ORANGE },
                  '&.Mui-focused fieldset': { borderColor: ORANGE, borderWidth: 2 },
                },
                '& input': { fontSize: 15, fontWeight: 500, py: 1.8 },
              }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: '#AAA', mr: 1 }} />,
              }}
            />
            <Button
              variant="contained"
              onClick={handleSearch}
              disabled={loading || !input.trim()}
              sx={{
                backgroundColor: ORANGE,
                '&:hover': { backgroundColor: '#D94E1E' },
                fontWeight: 800,
                fontSize: 15,
                px: 4,
                py: 1.8,
                borderRadius: 2,
                whiteSpace: 'nowrap',
                minWidth: 130,
                boxShadow: '0 4px 16px rgba(240,90,40,0.4)',
              }}
            >
              {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : t.searchBtn}
            </Button>
          </Box>
        </Box>

        {/* Logo + Cajito */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          {(entregaxFullBlackUrl || true) && (
            <Box
              component="img"
              src={entregaxFullBlackUrl || '/logo-blanco.png'}
              alt="EntregaX"
              onError={(e: any) => { e.target.style.display = 'none'; }}
              sx={{
                width: 220,
                objectFit: 'contain',
                filter: entregaxFullBlackUrl ? 'brightness(0) invert(1)' : 'brightness(0) invert(1)',
                opacity: 0.92,
              }}
            />
          )}
          {cajitoAvatarUrl && (
            <Box
              component="img"
              src={cajitoAvatarUrl}
              alt="Cajito"
              sx={{ width: 180, height: 180, objectFit: 'contain', borderRadius: '50%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
            />
          )}
        </Box>
      </Box>

      {/* ── Resultados ──────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, px: { xs: 2, md: 8 }, py: 4, display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 3, maxWidth: 1400, mx: 'auto', width: '100%' }}>

        {/* Columna izquierda: resultado del rastreo */}
        <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>

          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          {result && (
            <>
              {/* Encabezado del paquete */}
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #F0F0F0' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                  <Box>
                    <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700, letterSpacing: 1.5 }}>
                      {t.detailsTitle}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <Typography sx={{ fontSize: 18, fontWeight: 800, color: BLACK, fontFamily: 'monospace' }}>
                        {result.tracking}
                      </Typography>
                      <Tooltip title={copied ? '¡Copiado!' : 'Copiar'}>
                        <IconButton size="small" onClick={handleCopy}>
                          <CopyIcon sx={{ fontSize: 16, color: copied ? ORANGE : '#AAA' }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Chip
                      label={serviceLabel(result.service)}
                      size="small"
                      sx={{ mt: 1, backgroundColor: '#FFF5EE', color: ORANGE, fontWeight: 700, border: `1px solid ${ORANGE}33` }}
                    />
                  </Box>
                  <Chip
                    label={stepLabel(result.milestones[result.current_milestone])}
                    sx={{ backgroundColor: result.current_milestone === 5 ? '#E8F5E9' : '#FFF5EE', color: result.current_milestone === 5 ? '#2E7D32' : ORANGE, fontWeight: 700 }}
                  />
                </Box>

                {/* Stepper de hitos */}
                <Stepper activeStep={result.current_milestone} alternativeLabel sx={{ mt: 2 }}>
                  {result.milestones.map((m, idx) => {
                    const IconComp = STEP_ICONS[idx];
                    return (
                      <Step key={idx} completed={idx <= result.current_milestone}>
                        <StepLabel
                          StepIconComponent={() => (
                            <Box sx={{
                              width: 32, height: 32, borderRadius: '50%',
                              backgroundColor: idx <= result.current_milestone ? ORANGE : '#E0E0E0',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'background-color 0.3s',
                            }}>
                              <IconComp sx={{ fontSize: 16, color: idx <= result.current_milestone ? '#fff' : '#999' }} />
                            </Box>
                          )}
                        >
                          <Typography sx={{ fontSize: 10, fontWeight: idx === result.current_milestone ? 700 : 400, color: idx <= result.current_milestone ? BLACK : '#AAA', mt: 0.5 }}>
                            {stepLabel(m)}
                          </Typography>
                        </StepLabel>
                      </Step>
                    );
                  })}
                </Stepper>
              </Paper>

              {/* Datos del contenedor (solo si aplica) */}
              {result.container && (
                <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #F0F0F0' }}>
                  <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700, letterSpacing: 1.5 }}>
                    {lang === 'zh' ? '集装箱信息' : lang === 'en' ? 'Container Info' : 'Info del Contenedor'}
                  </Typography>
                  <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    {result.container.container_number && (
                      <Box>
                        <Typography sx={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 1 }}>CONTENEDOR</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: BLACK }}>{result.container.container_number}</Typography>
                      </Box>
                    )}
                    {result.container.bl_number && (
                      <Box>
                        <Typography sx={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 1 }}>BL / REFERENCIA</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: BLACK }}>{result.container.bl_number}</Typography>
                      </Box>
                    )}
                    {result.container.vessel && (
                      <Box>
                        <Typography sx={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 1 }}>BUQUE</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: BLACK }}>{result.container.vessel}</Typography>
                      </Box>
                    )}
                    {result.container.eta && (
                      <Box>
                        <Typography sx={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 1 }}>ETA</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: BLACK }}>
                          {new Date(result.container.eta).toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </Typography>
                      </Box>
                    )}
                    {result.container.cn_status_en && (
                      <Box sx={{ gridColumn: '1 / -1' }}>
                        <Typography sx={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 1 }}>STATUS</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: BLACK }}>
                          {lang === 'zh' && result.container.cn_status_ch ? result.container.cn_status_ch : result.container.cn_status_en}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Paper>
              )}

              {/* Últimos movimientos */}
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #F0F0F0' }}>
                <Typography variant="overline" sx={{ color: '#888', fontWeight: 700, letterSpacing: 1.5 }}>
                  {t.movementsTitle}
                </Typography>
                <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {result.movements.map((mv, idx) => (
                    <Box key={idx}>
                      <Box sx={{ display: 'flex', gap: 2, py: 1.5, alignItems: 'flex-start' }}>
                        <Box sx={{
                          width: 8, height: 8, borderRadius: '50%', mt: 0.7, flexShrink: 0,
                          backgroundColor: idx === 0 ? ORANGE : '#DDD',
                        }} />
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 600, color: BLACK }}>
                            {moveDesc(mv)}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: '#888', mt: 0.3 }}>
                            {mv.location} · {new Date(mv.date).toLocaleString(lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </Box>
                      </Box>
                      {idx < result.movements.length - 1 && <Divider sx={{ ml: 2.5 }} />}
                    </Box>
                  ))}
                </Box>
              </Paper>
            </>
          )}

          {/* Estado vacío inicial */}
          {!result && !error && !loading && (
            <Paper elevation={0} sx={{ p: 6, borderRadius: 3, border: '2px dashed #F0F0F0', textAlign: 'center' }}>
              <Typography sx={{ fontSize: 40, mb: 1 }}>📦</Typography>
              <Typography sx={{ color: '#AAA', fontSize: 14 }}>
                {lang === 'en' ? 'Enter your tracking number above to start' : lang === 'zh' ? '在上方输入运单号开始查询' : 'Ingresa tu guía arriba para comenzar'}
              </Typography>
            </Paper>
          )}
        </Box>

        {/* ── Panel de conversión (columna derecha) ─────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: { lg: 300 } }}>

          {/* Precio Aéreo China */}
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, background: `linear-gradient(135deg, ${ORANGE} 0%, #FF8C42 100%)`, color: '#fff' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, opacity: 0.85, letterSpacing: 1, textTransform: 'uppercase' }}>
              {lang === 'zh' ? '起价' : lang === 'en' ? 'From' : 'Desde'}
            </Typography>
            <Typography sx={{ fontSize: 38, fontWeight: 900, lineHeight: 1.1 }}>
              ${(rates?.aereo ?? 19.30).toFixed(2)} <span style={{ fontSize: 16, opacity: 0.85 }}>USD/kg</span>
            </Typography>
            <Typography sx={{ fontSize: 12, opacity: 0.8, mt: 0.5 }}>
              {lang === 'en' ? 'China Air Freight · All inclusive' : lang === 'zh' ? '中国空运 · 全包价' : 'Aéreo China · Todo incluido'}
            </Typography>
          </Paper>

          {/* Precio Marítimo */}
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: `1px solid ${ORANGE}44`, background: '#FFF9F7' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography sx={{ fontSize: 26 }}>🚢</Typography>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {lang === 'zh' ? '起价' : lang === 'en' ? 'From' : 'Desde'}
                </Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 900, color: BLACK, lineHeight: 1.1 }}>
                  ${(rates?.maritimo ?? 39).toFixed(0)} <span style={{ fontSize: 13, color: '#666' }}>USD/m³</span>
                </Typography>
                <Typography sx={{ fontSize: 11, color: '#777', mt: 0.3 }}>
                  {lang === 'en' ? 'China Sea Freight · Per cubic meter' : lang === 'zh' ? '中国海运 · 每立方米' : 'Marítimo China · Por m³'}
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Precio PO Box */}
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E8E8E8' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography sx={{ fontSize: 26 }}>🇺🇸</Typography>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 11, color: '#888', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {lang === 'zh' ? '起价' : lang === 'en' ? 'From' : 'Desde'}
                </Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 900, color: BLACK, lineHeight: 1.1 }}>
                  ${(rates?.pobox ?? 39).toFixed(0)} <span style={{ fontSize: 13, color: '#666' }}>USD/{lang === 'en' ? 'box' : lang === 'zh' ? '箱' : 'caja'}</span>
                </Typography>
                <Typography sx={{ fontSize: 11, color: '#777', mt: 0.3 }}>
                  {lang === 'en' ? 'USA to Mexico · Per package' : lang === 'zh' ? '美国直邮墨西哥 · 每箱' : 'Terrestre USA a México · Por caja'}
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Cards de beneficios */}
          {[
            { title: t.card1Title, body: t.card1Body, emoji: '⚡' },
            { title: t.card2Title, body: t.card2Body, emoji: '🔒' },
            { title: t.card3Title, body: t.card3Body, emoji: '🌎' },
          ].map((card, i) => (
            <Paper key={i} elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #F0F0F0', display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <Box sx={{ fontSize: 24, lineHeight: 1, mt: 0.2 }}>{card.emoji}</Box>
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: BLACK }}>{card.title}</Typography>
                <Typography sx={{ fontSize: 12, color: '#777', mt: 0.3, lineHeight: 1.5 }}>{card.body}</Typography>
              </Box>
            </Paper>
          ))}

          {/* CTA + App Store badges */}
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: `2px solid ${ORANGE}33`, textAlign: 'center', backgroundColor: '#FFF9F7' }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: BLACK, mb: 1.5 }}>{t.ctaTitle}</Typography>

            {/* App Store badge */}
            <Box
              component="a"
              href="https://apps.apple.com/app/id6762685124"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ display: 'block', mb: 1 }}
            >
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                backgroundColor: BLACK, color: '#fff', borderRadius: 2,
                px: 2.5, py: 1.2, cursor: 'pointer',
                '&:hover': { backgroundColor: '#222' }, transition: '0.2s',
              }}>
                <Typography sx={{ fontSize: 22 }}>🍎</Typography>
                <Box sx={{ textAlign: 'left' }}>
                  <Typography sx={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>
                    {lang === 'en' ? 'Download on the' : lang === 'zh' ? '下载于' : 'Descargar en'}
                  </Typography>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>App Store</Typography>
                </Box>
              </Box>
            </Box>

            {/* Google Play badge (placeholder — link pendiente) */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              backgroundColor: '#1A1A2E', color: '#fff', borderRadius: 2,
              px: 2.5, py: 1.2, opacity: 0.5, cursor: 'not-allowed',
            }}>
              <Typography sx={{ fontSize: 22 }}>▶️</Typography>
              <Box sx={{ textAlign: 'left' }}>
                <Typography sx={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>
                  {lang === 'en' ? 'Get it on' : lang === 'zh' ? '获取于' : 'Disponible en'}
                </Typography>
                <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>Google Play</Typography>
              </Box>
            </Box>

            <Typography sx={{ fontSize: 10, color: '#BBB', mt: 1.5 }}>
              {lang === 'en' ? 'Android — Coming soon' : lang === 'zh' ? 'Android 即将上线' : 'Android — Próximamente'}
            </Typography>
          </Paper>
        </Box>
      </Box>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <Box sx={{ backgroundColor: BLACK, color: 'rgba(255,255,255,0.6)', px: { xs: 2, md: 8 }, py: 3, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ fontSize: 12 }}>{t.footer}</Typography>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <Button size="small" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'none', '&:hover': { color: '#fff' } }}>{t.privacy}</Button>
          <Button size="small" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'none', '&:hover': { color: '#fff' } }}>{t.terms}</Button>
          {/* Language selector en footer */}
          <Box>
            <Button
              startIcon={<LanguageIcon />}
              onClick={(e) => setLangAnchor(e.currentTarget)}
              sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'none', '&:hover': { color: '#fff' } }}
            >
              {LANG_OPTIONS.find(l => l.code === lang)?.flag}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
