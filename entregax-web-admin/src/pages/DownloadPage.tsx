import { Box, Typography, Button, Stack, Container } from '@mui/material';

export default function DownloadPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #0f0f0f 0%, #1a1a1a 60%, #2a1a0a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow background circle */}
      <Box
        sx={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(230,81,0,0.15) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -60%)',
          pointerEvents: 'none',
        }}
      />

      <Container maxWidth="sm" sx={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <Box sx={{ mb: 4 }}>
          <img
            src="/logo-paqeteria.png"
            alt="EntregaX"
            style={{ height: 56, objectFit: 'contain' }}
          />
        </Box>

        {/* Cajito */}
        <Box sx={{ mb: 3 }}>
          <img
            src="/cajito-asomando.png"
            alt=""
            style={{ height: 120, objectFit: 'contain', filter: 'drop-shadow(0 8px 32px rgba(230,81,0,0.4))' }}
          />
        </Box>

        {/* Headline */}
        <Typography
          variant="h4"
          fontWeight="bold"
          sx={{ color: '#fff', mb: 1.5, letterSpacing: '-0.5px' }}
        >
          Descarga nuestra app
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: 'rgba(255,255,255,0.6)', mb: 4, maxWidth: 380, mx: 'auto' }}
        >
          Rastrea tus paquetes, gestiona tus envíos y accede a tu casillero desde cualquier lugar.
        </Typography>

        {/* Store buttons */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ mb: 4 }}>
          {/* App Store */}
          <Button
            component="a"
            href="https://entregax.app/login"
            sx={{
              bgcolor: '#fff',
              color: '#000',
              borderRadius: 3,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              boxShadow: '0 4px 20px rgba(255,255,255,0.15)',
              '&:hover': { bgcolor: '#f0f0f0' },
              minWidth: 190,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000" width="22" height="22" fill="currentColor">
              <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-150.3-90c-42.8-51.3-81.4-135.2-81.4-215.3 0-227 149.1-347.1 295.4-347.1 75.5 0 138.3 49.3 185.1 49.3 44.6 0 115.1-52.6 198.7-52.6zm-234.1-181c26-30.1 44.1-72.6 44.1-115.1 0-5.8-.6-11.7-1.9-16.2-41.5 1.9-92 27.8-122.1 61.6-22.4 24.8-42.8 67.3-42.8 110.4 0 6.4 1.3 12.8 1.9 14.7 2.6.3 6.5.6 10.4.6 37.7 0 85.1-24.2 110.4-55z"/>
            </svg>
            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="caption" display="block" sx={{ fontSize: 10, lineHeight: 1, opacity: 0.7 }}>
                Disponible en
              </Typography>
              <Typography fontWeight="bold" sx={{ fontSize: 16, lineHeight: 1.2 }}>
                App Store
              </Typography>
            </Box>
          </Button>

          {/* Play Store */}
          <Button
            component="a"
            href="https://entregax.app/login"
            sx={{
              bgcolor: '#fff',
              color: '#000',
              borderRadius: 3,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              boxShadow: '0 4px 20px rgba(255,255,255,0.15)',
              '&:hover': { bgcolor: '#f0f0f0' },
              minWidth: 190,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="22" height="22">
              <path fill="#EA4335" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
              <path fill="#FBBC05" d="M19.7 0C8.8 6.5 0 19 0 35.2v441.6c0 16.2 8.8 28.7 19.7 35.2l3 2.2 247.3-247.3v-5.8L22.7-2.2z"/>
              <path fill="#34A853" d="M325.3 277.7l-100.1 100 -224-129.3 3.5-3.5 320.6-184.3z"/>
              <path fill="#EA4335" d="M386.4 321l-61.1 35.2L104.6 499l280.8-161.2 1-1z"/>
              <path fill="#4285F4" d="M19.7 512c8.8 6.5 20.2 6.5 31.5.3l235.8-136.2-67.3-67.3z"/>
              <path fill="#30A8E0" d="M0 35.2c0-16.2 8.8-28.7 19.7-35.2L267 247.3l-67.3 67.3z"/>
            </svg>
            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="caption" display="block" sx={{ fontSize: 10, lineHeight: 1, opacity: 0.7 }}>
                Disponible en
              </Typography>
              <Typography fontWeight="bold" sx={{ fontSize: 16, lineHeight: 1.2 }}>
                Google Play
              </Typography>
            </Box>
          </Button>
        </Stack>

        {/* Divider */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box sx={{ flex: 1, height: 1, bgcolor: 'rgba(255,255,255,0.1)' }} />
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>o</Typography>
          <Box sx={{ flex: 1, height: 1, bgcolor: 'rgba(255,255,255,0.1)' }} />
        </Box>

        {/* Portal link */}
        <Button
          component="a"
          href="/login"
          variant="outlined"
          sx={{
            borderColor: 'rgba(255,255,255,0.25)',
            color: 'rgba(255,255,255,0.7)',
            borderRadius: 3,
            px: 4,
            py: 1.2,
            textTransform: 'none',
            fontWeight: 500,
            fontSize: 14,
            '&:hover': {
              borderColor: '#E65100',
              color: '#fff',
              bgcolor: 'rgba(230,81,0,0.08)',
            },
          }}
        >
          Acceder al portal web →
        </Button>
      </Container>

      {/* Bottom branding */}
      <Box sx={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)' }}>
          © {new Date().getFullYear()} EntregaX Paquetería
        </Typography>
      </Box>
    </Box>
  );
}
