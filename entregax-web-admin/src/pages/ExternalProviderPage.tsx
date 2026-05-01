import React, { useEffect, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import EntangledPaymentRequest from '../components/EntangledPaymentRequest';

const DARK = '#0A0A0A';
const ORANGE = '#F05A28';
const RED = '#C1272D';

interface ExternalProviderPageProps {
  onBack: () => void;
}

/**
 * 🔐 ExternalProviderPage
 * Página dedicada para "Pago a Proveedor Externo".
 * Muestra una transición animada estilo "secure gateway" durante 1.8s
 * y luego renderiza el módulo EntangledPaymentRequest a página completa.
 */
const ExternalProviderPage: React.FC<ExternalProviderPageProps> = ({ onBack }) => {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  if (showContent) {
    return (
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000, // por encima del AppBar de MUI (default 1100)
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
          <Tooltip title="Volver">
            <IconButton onClick={onBack} sx={{ color: '#FFF' }}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <AccountBalanceIcon sx={{ color: ORANGE }} />
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ fontSize: 11, color: '#999', letterSpacing: 2, textTransform: 'uppercase' }}>
              Accediendo a
            </Box>
            <Box sx={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>PROVEEDOR EXTERNO</Box>
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
            🔒 SECURE GATEWAY · ENTREGAX
          </Box>
        </Box>

        {/* Contenido (sin marco/padding extra para que el negro fluya hasta los bordes) */}
        <Box sx={{ flex: 1, bgcolor: '#000000' }}>
          <EntangledPaymentRequest />
        </Box>
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
        {/* Logo central */}
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${ORANGE}, ${RED})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 30px ${ORANGE}80`,
            animation: 'pulse 1.8s ease-in-out infinite',
            zIndex: 2,
          }}
        >
          <AccountBalanceIcon sx={{ fontSize: 42, color: '#FFF' }} />
        </Box>
      </Box>

      {/* Texto */}
      <Box
        sx={{
          color: '#888',
          fontSize: 13,
          letterSpacing: 4,
          mb: 1,
          animation: 'fadeIn 0.8s ease-out',
        }}
      >
        ACCEDIENDO A
      </Box>
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
        PROVEEDOR EXTERNO
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
        Conexión segura cifrada
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
        SECURE GATEWAY · ENTREGAX
        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: ORANGE }} />
      </Box>
    </Box>
  );
};

export default ExternalProviderPage;
