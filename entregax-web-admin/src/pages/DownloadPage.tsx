import { Box, Typography, Button, Stack, Container } from '@mui/material';

function PhoneMockup() {
  return (
    <Box sx={{
      width: 260, height: 520, bgcolor: '#0f0f0f', borderRadius: '40px',
      border: '8px solid #2a2a2a',
      boxShadow: '0 0 0 1px #3a3a3a, 0 32px 80px rgba(0,0,0,0.7), 0 0 60px rgba(230,81,0,0.2)',
      position: 'relative', overflow: 'hidden', mx: 'auto',
    }}>
      {/* Notch */}
      <Box sx={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 100, height: 28, bgcolor: '#0f0f0f', borderRadius: '0 0 18px 18px', zIndex: 10,
      }} />
      {/* Screen */}
      <Box sx={{ width: '100%', height: '100%', bgcolor: '#fff', pt: 5, px: 2.5, boxSizing: 'border-box' }}>
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <img src="/logo-paqeteria.png" alt="EntregaX" style={{ height: 28, objectFit: 'contain' }} />
        </Box>
        <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#111', mb: 0.3 }}>Bienvenido</Typography>
        <Typography sx={{ fontSize: 10, color: '#666', mb: 2.5 }}>
          ¡Tu suite inteligente de paquetería,<br />ahora en tu bolsillo!
        </Typography>
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: 9, fontWeight: 600, color: '#444', mb: 0.5 }}>Email</Typography>
          <Box sx={{ border: '1px solid #ddd', borderRadius: 1.5, px: 1.5, py: 1, bgcolor: '#fafafa' }}>
            <Typography sx={{ fontSize: 9, color: '#bbb' }}>Email or mail@gmail.com</Typography>
          </Box>
        </Box>
        <Box sx={{ mb: 0.5 }}>
          <Box sx={{ border: '1px solid #ddd', borderRadius: 1.5, px: 1.5, py: 1, bgcolor: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 9, color: '#bbb' }}>Contraseña</Typography>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #bbb' }} />
          </Box>
        </Box>
        <Typography sx={{ fontSize: 8, color: '#E65100', textAlign: 'right', mb: 2 }}>¿Olvidaste tu password?</Typography>
        <Box sx={{ bgcolor: '#E65100', borderRadius: 2, py: 1, textAlign: 'center', mb: 1.5 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>Ingresar</Typography>
        </Box>
        <Typography sx={{ fontSize: 8.5, color: '#E65100', textAlign: 'center', mb: 2.5 }}>¿Ingresar con contraseña?</Typography>
        <Typography sx={{ fontSize: 8, color: '#888', textAlign: 'center', mb: 1 }}>Idioma</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
          {[{ flag: '🇲🇽', label: 'MX' }, { flag: '🇺🇸', label: 'US' }, { flag: '🇨🇳', label: 'China' }].map((l) => (
            <Box key={l.label} sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontSize: 16 }}>{l.flag}</Typography>
              <Typography sx={{ fontSize: 7, color: '#555' }}>{l.label}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

const FEATURES = [
  { icon: '🚢', title: 'Marítimo China', desc: 'Cotización instantánea y rastreo directo' },
  { icon: '✈️', title: 'Aéreo China', desc: 'Visibilidad de costos y tiempos' },
  { icon: '📦', title: 'Despacho Aduanal USA a Mexico', desc: 'Historial completo y gestión centralizada' },
];

export default function DownloadPage() {
  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(160deg, #0f0f0f 0%, #1a1a1a 55%, #2a1a0a 100%)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Glow */}
      <Box sx={{
        position: 'absolute', width: 700, height: 700, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(230,81,0,0.12) 0%, transparent 70%)',
        top: '35%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none',
      }} />

      {/* Top nav */}
      <Box sx={{ position: 'relative', zIndex: 2 }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2.5, pb: 1 }}>
            <Button
              component="a"
              href="/login"
              variant="outlined"
              size="small"
              sx={{
                borderColor: 'rgba(255,255,255,0.3)', color: '#fff', borderRadius: 2.5,
                textTransform: 'none', fontWeight: 600, fontSize: 13, px: 2.5, py: 0.8,
                '&:hover': { borderColor: '#E65100', bgcolor: 'rgba(230,81,0,0.1)' },
              }}
            >
              Ingresar al portal web →
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Main */}
      <Container maxWidth="lg" sx={{ flex: 1, position: 'relative', zIndex: 1 }}>
        <Box sx={{
          display: 'flex', flexDirection: { xs: 'column', md: 'row' },
          alignItems: 'center', gap: { xs: 6, md: 8 },
          minHeight: { md: '80vh' }, py: { xs: 6, md: 0 },
        }}>
          {/* Left */}
          <Box sx={{ flex: 1 }}>
            <Box sx={{ mb: 4 }}>
              <img src="/logo-paqeteria.png" alt="EntregaX" style={{ height: 192, objectFit: 'contain' }} />
            </Box>

            <Typography variant="h3" fontWeight="bold" sx={{ color: '#fff', mb: 2, lineHeight: 1.15, letterSpacing: '-0.5px' }}>
              ¡Tu suite inteligente de{' '}
              <Box component="span" sx={{ color: '#E65100' }}>paquetería</Box>,<br />
              ahora en tu bolsillo!
            </Typography>

            <Typography sx={{ color: 'rgba(255,255,255,0.5)', mb: 4, maxWidth: 420, fontSize: 16 }}>
              Rastrea envíos aéreos y marítimos, gestiona tu Suite y mantén el control de tus importaciones desde una sola app.
            </Typography>

            {/* Store buttons */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 4 }}>
              <Button
                component="a"
                href="https://apps.apple.com/mx/app/entregax/id6762685124"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  bgcolor: '#fff', color: '#000', borderRadius: 3, px: 3, py: 1.5,
                  textTransform: 'none', display: 'flex', alignItems: 'center', gap: 1.5,
                  boxShadow: '0 4px 20px rgba(255,255,255,0.12)',
                  '&:hover': { bgcolor: '#f0f0f0' }, minWidth: 180,
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000" width="20" height="20" fill="currentColor">
                  <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-150.3-90c-42.8-51.3-81.4-135.2-81.4-215.3 0-227 149.1-347.1 295.4-347.1 75.5 0 138.3 49.3 185.1 49.3 44.6 0 115.1-52.6 198.7-52.6zm-234.1-181c26-30.1 44.1-72.6 44.1-115.1 0-5.8-.6-11.7-1.9-16.2-41.5 1.9-92 27.8-122.1 61.6-22.4 24.8-42.8 67.3-42.8 110.4 0 6.4 1.3 12.8 1.9 14.7 2.6.3 6.5.6 10.4.6 37.7 0 85.1-24.2 110.4-55z"/>
                </svg>
                <Box sx={{ textAlign: 'left' }}>
                  <Typography variant="caption" display="block" sx={{ fontSize: 9, lineHeight: 1, opacity: 0.6 }}>Disponible en</Typography>
                  <Typography fontWeight="bold" sx={{ fontSize: 15, lineHeight: 1.2 }}>App Store</Typography>
                </Box>
              </Button>

              {/* Google Play */}
              <Button
                href="https://play.google.com/store/apps/details?id=com.entregax.mobile"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  bgcolor: '#fff', color: '#000', borderRadius: 3, px: 3, py: 1.5,
                  textTransform: 'none', display: 'flex', alignItems: 'center', gap: 1.5,
                  boxShadow: '0 4px 20px rgba(255,255,255,0.12)',
                  '&:hover': { bgcolor: '#f0f0f0' }, minWidth: 180,
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="20" height="20">
                  <path fill="#EA4335" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
                  <path fill="#FBBC05" d="M19.7 0C8.8 6.5 0 19 0 35.2v441.6c0 16.2 8.8 28.7 19.7 35.2l3 2.2 247.3-247.3v-5.8L22.7-2.2z"/>
                  <path fill="#34A853" d="M325.3 277.7l-100.1 100-224-129.3 3.5-3.5 320.6-184.3z"/>
                  <path fill="#EA4335" d="M386.4 321l-61.1 35.2L104.6 499l280.8-161.2 1-1z"/>
                  <path fill="#4285F4" d="M19.7 512c8.8 6.5 20.2 6.5 31.5.3l235.8-136.2-67.3-67.3z"/>
                  <path fill="#30A8E0" d="M0 35.2c0-16.2 8.8-28.7 19.7-35.2L267 247.3l-67.3 67.3z"/>
                </svg>
                <Box sx={{ textAlign: 'left' }}>
                  <Typography variant="caption" display="block" sx={{ fontSize: 9, lineHeight: 1, opacity: 0.6 }}>Disponible en</Typography>
                  <Typography fontWeight="bold" sx={{ fontSize: 15, lineHeight: 1.2 }}>Google Play</Typography>
                </Box>
              </Button>
            </Stack>

            {/* Languages */}
            <Box>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)', display: 'block', mb: 1 }}>Disponible en</Typography>
              <Stack direction="row" spacing={2}>
                {[{ flag: '🇲🇽', label: 'MX' }, { flag: '🇺🇸', label: 'US' }, { flag: '🇨🇳', label: 'China' }].map((l) => (
                  <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <Typography sx={{ fontSize: 20 }}>{l.flag}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{l.label}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Box>

          {/* Right — phone */}
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <PhoneMockup />
          </Box>
        </Box>
      </Container>

      {/* Features bar */}
      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.06)', bgcolor: 'rgba(255,255,255,0.02)', position: 'relative', zIndex: 1 }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
            {FEATURES.map((f, i) => (
              <Box key={f.title} sx={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 2.5,
                borderLeft: { sm: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' },
                borderTop: { xs: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', sm: 'none' },
              }}>
                <Box sx={{
                  width: 40, height: 40, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                }}>
                  {f.icon}
                </Box>
                <Box>
                  <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{f.title}:</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{f.desc}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ py: 2, borderTop: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 1 }}>
        <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Stack direction="row" spacing={3}>
            <Typography component="a" href="/privacy-policy" variant="caption"
              sx={{ color: 'rgba(255,255,255,0.2)', textDecoration: 'none', '&:hover': { color: 'rgba(255,255,255,0.5)' } }}>
              Privacy policy
            </Typography>
            <Typography component="a" href="mailto:contacto@entregax.com" variant="caption"
              sx={{ color: 'rgba(255,255,255,0.2)', textDecoration: 'none', '&:hover': { color: 'rgba(255,255,255,0.5)' } }}>
              Contact us
            </Typography>
            <Typography component="a" href="/login" variant="caption"
              sx={{ color: 'rgba(255,255,255,0.2)', textDecoration: 'none', '&:hover': { color: '#E65100' } }}>
              Portal web →
            </Typography>
          </Stack>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.15)' }}>
            © {new Date().getFullYear()} EntregaX Paquetería
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
