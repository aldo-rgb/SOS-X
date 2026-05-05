import React, { useEffect, useMemo, useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from 'react-i18next';
import EntangledPaymentRequest from '../components/EntangledPaymentRequestV2';

const DARK = '#0A0A0A';
const ORANGE = '#F05A28';
const RED = '#C1272D';

interface ExternalProviderPageProps {
  onBack: () => void;
  userName?: string;
  isAuthenticated: boolean;
  forcePreview?: boolean;
}

/**
 * 🔐 ExternalProviderPage
 * Página dedicada para "Pago a Proveedor Externo".
 * Muestra una transición animada estilo "secure gateway" durante 1.8s
 * y luego renderiza el módulo EntangledPaymentRequest a página completa.
 */
const ExternalProviderPage: React.FC<ExternalProviderPageProps> = ({ onBack, userName, isAuthenticated, forcePreview = false }) => {
  const { t } = useTranslation();
  const [showContent, setShowContent] = useState(false);
  const shouldShowContent = forcePreview || !isAuthenticated || showContent;
  const canRenderEntangled = isAuthenticated || forcePreview;

  const headerUserName = useMemo(() => {
    if (!isAuthenticated) {
      return '';
    }

    const pickCandidate = (raw: unknown): string => {
      if (typeof raw !== 'string') return '';
      const value = raw.trim();
      return value;
    };

    const fromProp = pickCandidate(userName);
    if (fromProp) return fromProp;

    if (typeof window !== 'undefined') {
      try {
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          const fromStorage =
            pickCandidate(parsed?.name) ||
            pickCandidate(parsed?.full_name) ||
            pickCandidate(parsed?.first_name) ||
            pickCandidate(parsed?.username) ||
            pickCandidate(parsed?.email);
          if (fromStorage) return fromStorage;
        }
      } catch {
        // Ignorar parse errors y usar fallback
      }

      try {
        const token = localStorage.getItem('token') || new URLSearchParams(window.location.search).get('token');
        if (token) {
          const payloadPart = token.split('.')[1];
          if (payloadPart) {
            const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
            const payload = JSON.parse(atob(padded));
            const fromToken =
              pickCandidate(payload?.name) ||
              pickCandidate(payload?.full_name) ||
              pickCandidate(payload?.first_name) ||
              pickCandidate(payload?.username) ||
              pickCandidate(payload?.email);
            if (fromToken) return fromToken;
          }
        }
      } catch {
        // Ignorar errores de decode del JWT y usar fallback
      }
    }

    return t('xpay.accessing', 'Accediendo a');
  }, [isAuthenticated, t, userName]);

  useEffect(() => {
    if (!isAuthenticated || forcePreview) {
      return;
    }

    const timer = setTimeout(() => setShowContent(true), 1800);
    return () => clearTimeout(timer);
  }, [forcePreview, isAuthenticated]);

  if (shouldShowContent) {
    return (
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1200, // Cubre AppBar (1100) pero por debajo de Dialogs/Modals (1300+)
          bgcolor: '#000000',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        {/* Header con back */}
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            bgcolor: DARK,
            color: '#FFF',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: 3,
            py: 1.5,
            borderBottom: `2px solid ${ORANGE}`,
          }}
        >
          <Tooltip title={t('common.back', 'Volver') as string}>
            <IconButton onClick={onBack} sx={{ color: '#FFF' }}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Box
            component="img"
            src="/logo-xpay-square.png"
            alt="X-Pay"
            sx={{
              width: { xs: 42, md: 50 },
              height: 'auto',
              opacity: 0.95,
              filter: 'drop-shadow(0 0 12px rgba(240,90,40,0.25))',
            }}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {isAuthenticated && (
              <Box sx={{ fontSize: 11, color: '#999', letterSpacing: 1 }}>
                  {headerUserName}
              </Box>
            )}
            <Box sx={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>
              {t('xpay.secureSite', 'Sitio Seguro')}
            </Box>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Box
            sx={{
              fontSize: 10,
              color: '#888',
              letterSpacing: 2,
              display: { xs: 'none', md: 'block' },
            }}
          >
            🔒 {t('xpay.secureGateway')}
          </Box>
        </Box>

        {/* Contenido (sin marco/padding extra para que el negro fluya hasta los bordes) */}
        {canRenderEntangled ? (
          <Box sx={{ flex: 1, bgcolor: '#000000' }}>
            <EntangledPaymentRequest />
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              bgcolor: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              px: 3,
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                width: 420,
                height: 420,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(240,90,40,0.26) 0%, rgba(240,90,40,0) 68%)',
                filter: 'blur(6px)',
                top: '14%',
                left: '50%',
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
              }}
            />
            <Box
              sx={{
                width: '100%',
                maxWidth: 420,
                border: `1px solid ${ORANGE}4A`,
                borderRadius: 4,
                p: { xs: 3, md: 4 },
                background: 'linear-gradient(165deg, rgba(240,90,40,0.2) -15%, rgba(15,15,18,0.88) 46%, rgba(7,7,7,0.98) 100%)',
                boxShadow: '0 26px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
                backdropFilter: 'blur(8px)',
                textAlign: 'center',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  mb: 2,
                }}
              >
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    borderRadius: 999,
                    border: `1px solid ${ORANGE}66`,
                    background: 'rgba(8,8,8,0.82)',
                    boxShadow: `0 0 26px ${ORANGE}33`,
                  }}
                >
                  <Box
                    component="img"
                    src="/logo-xpay-square.png"
                    alt="X-Pay"
                    sx={{ width: { xs: 56, md: 68 }, height: 'auto' }}
                  />
                </Box>
              </Box>
              <Typography sx={{ color: '#ffffff', fontWeight: 800, mb: 1.5, fontSize: { xs: 20, md: 22 } }}>
                {t('auth.loginRequired', '')}
              </Typography>
              <Typography sx={{ color: '#b8bec9', fontSize: 15, mb: 3, lineHeight: 1.55 }}>
                {t('auth.loginToContinue', 'Ingresa con tu cuenta para ver y gestionar tus pagos.')}
              </Typography>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1,
                  borderRadius: 999,
                  border: `1px solid ${ORANGE}40`,
                  bgcolor: 'rgba(255,255,255,0.03)',
                  color: '#f3f4f6',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}
              >
                🔒 {t('xpay.secureGateway', 'Secure Gateway')}
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  // Pantalla de transición
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: DARK,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2001,
        overflow: 'hidden',
        '@keyframes fadeIn': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        '@keyframes spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        '@keyframes spinReverse': {
          from: { transform: 'rotate(360deg)' },
          to: { transform: 'rotate(0deg)' },
        },
        '@keyframes pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: 1 },
          '50%': { transform: 'scale(1.08)', opacity: 0.85 },
        },
        '@keyframes scanline': {
          '0%': { transform: 'translateY(-120px)', opacity: 0 },
          '50%': { opacity: 1 },
          '100%': { transform: 'translateY(120px)', opacity: 0 },
        },
        '@keyframes dotPulse': {
          '0%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
          '50%': { opacity: 1, transform: 'scale(1)' },
        },
      }}
    >
      {/* Esquinas HUD */}
      {[
        { top: 30, left: 30, borderTop: `2px solid ${ORANGE}`, borderLeft: `2px solid ${ORANGE}` },
        { top: 30, right: 30, borderTop: `2px solid ${ORANGE}`, borderRight: `2px solid ${ORANGE}` },
        { bottom: 30, left: 30, borderBottom: `2px solid ${RED}`, borderLeft: `2px solid ${RED}` },
        { bottom: 30, right: 30, borderBottom: `2px solid ${RED}`, borderRight: `2px solid ${RED}` },
      ].map((style, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            width: 32,
            height: 32,
            ...style,
          }}
        />
      ))}

      {/* Anillos animados */}
      <Box
        sx={{
          position: 'relative',
          width: 240,
          height: 240,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 4,
          animation: 'fadeIn 0.6s ease-out',
        }}
      >
        {/* Anillo exterior */}
        <Box
          sx={{
            position: 'absolute',
            width: 240,
            height: 240,
            borderRadius: '50%',
            border: `1.5px solid ${ORANGE}40`,
            animation: 'spin 6s linear infinite',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: -5,
              left: '50%',
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: ORANGE,
              boxShadow: `0 0 12px ${ORANGE}`,
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              bottom: -3,
              right: '20%',
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: RED,
              boxShadow: `0 0 10px ${RED}`,
            },
          }}
        />
        {/* Anillo medio */}
        <Box
          sx={{
            position: 'absolute',
            width: 180,
            height: 180,
            borderRadius: '50%',
            border: `1px solid ${RED}50`,
            animation: 'spinReverse 4s linear infinite',
          }}
        />
        {/* Anillo interior con scan line */}
        <Box
          sx={{
            position: 'absolute',
            width: 130,
            height: 130,
            borderRadius: '50%',
            border: `2px solid ${ORANGE}`,
            overflow: 'hidden',
            '&::after': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${ORANGE}, transparent)`,
              animation: 'scanline 1.6s ease-in-out infinite',
            },
          }}
        />
        {/* Logo central — video animado */}
        <Box
          sx={{
            width: 180,
            height: 180,
            borderRadius: '50%',
            border: `2.5px solid ${ORANGE}`,
            boxShadow: `0 0 28px ${ORANGE}80, 0 0 6px ${ORANGE}50 inset`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            overflow: 'hidden',
            background: '#0A0A0A',
          }}
        >
          <Box
            component="video"
            src="/logo-xpay-move.mp4"
            autoPlay
            loop
            muted
            playsInline
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </Box>
      </Box>

      {/* Texto */}
      {isAuthenticated && (
        <Box
          sx={{
            color: '#888',
            fontSize: 13,
            letterSpacing: 4,
            mb: 1,
            animation: 'fadeIn 0.8s ease-out',
          }}
        >
          {headerUserName}
        </Box>
      )}
      <Box
        sx={{
          color: '#FFF',
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: 3,
          mb: 2,
          animation: 'fadeIn 1s ease-out',
        }}
      >
        {t('xpay.secureSite', 'Sitio Seguro')}
      </Box>

      {/* Línea decorativa */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
        <Box sx={{ width: 32, height: 3, bgcolor: ORANGE, borderRadius: 1 }} />
        <Box sx={{ width: 16, height: 3, bgcolor: RED, borderRadius: 1 }} />
      </Box>

      <Box
        sx={{
          color: '#666',
          fontSize: 13,
          mb: 3,
          animation: 'fadeIn 1.2s ease-out',
        }}
      >
        {t('xpay.transitionSubtitle')}
      </Box>

      {/* Dots */}
      <Box sx={{ display: 'flex', gap: 1, mb: 4 }}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: i === 1 ? RED : ORANGE,
              animation: `dotPulse 1.4s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 80,
          color: '#555',
          fontSize: 11,
          letterSpacing: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: ORANGE }} />
        {t('xpay.secureGateway')}
        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: ORANGE }} />
      </Box>
    </Box>
  );
};

export default ExternalProviderPage;
