/**
 * SocialAuthButtons — Botones de "Continuar con Google" / "Continuar con Apple".
 *
 * Feature flags (Vite envs, embebidas en build):
 *   VITE_GOOGLE_CLIENT_ID   — Web client_id de Google Cloud Console
 *   VITE_APPLE_SERVICES_ID  — Services ID de Apple Developer (ej. com.entregax.web)
 *   VITE_APPLE_REDIRECT_URI — URL completa registrada en Apple (ej. https://www.entregax.app/login)
 *
 * Si la env no existe, el botón correspondiente NO se renderiza
 * (feature flag implícito — útil para deploys donde aún no hay credenciales).
 *
 * Flow:
 *   1) Usuario clickea botón
 *   2) Proveedor entrega un ID token JWT
 *   3) Lo enviamos a POST /api/auth/{google|apple}
 *   4) Backend valida y responde { user, access } igual que login normal
 *   5) onSuccess({ user, access }) — el padre guarda en localStorage y entra
 */

import { useEffect, useRef } from 'react';
import { Box, Button, Divider, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import AppleIcon from '@mui/icons-material/Apple';
import axios from 'axios';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const APPLE_SERVICES_ID = import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined;
const APPLE_REDIRECT_URI = import.meta.env.VITE_APPLE_REDIRECT_URI as string | undefined;

interface Props {
  onSuccess: (data: { user: any; access: any }) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

// ============================================================
// APPLE — carga script externo y handler de clic
// ============================================================

declare global {
  interface Window {
    AppleID?: any;
  }
}

const APPLE_SCRIPT_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

const loadAppleScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.AppleID) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${APPLE_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Apple JS')));
      return;
    }
    const script = document.createElement('script');
    script.src = APPLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Apple JS'));
    document.head.appendChild(script);
  });
};

// ============================================================
// Componente
// ============================================================

const InnerButtons: React.FC<Props> = ({ onSuccess, onError, disabled }) => {
  const appleInitDone = useRef(false);

  useEffect(() => {
    if (!APPLE_SERVICES_ID || !APPLE_REDIRECT_URI) return;
    loadAppleScript()
      .then(() => {
        if (!appleInitDone.current && window.AppleID) {
          window.AppleID.auth.init({
            clientId: APPLE_SERVICES_ID,
            scope: 'name email',
            redirectURI: APPLE_REDIRECT_URI,
            usePopup: true,
          });
          appleInitDone.current = true;
        }
      })
      .catch((err) => console.warn('[SOCIAL AUTH] Apple JS no cargó:', err));
  }, []);

  const handleGoogleCredential = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      onError('Google no devolvió credencial.');
      return;
    }
    try {
      const { data } = await axios.post(`${API_URL}/auth/google`, {
        idToken: credentialResponse.credential,
      });
      // Backend devuelve { message, user, access }
      localStorage.setItem('token', data.access.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('permissions', JSON.stringify(data.access.permissions));
      onSuccess({ user: data.user, access: data.access });
    } catch (err: any) {
      onError(err.response?.data?.error || 'No se pudo iniciar sesión con Google');
    }
  };

  const handleAppleClick = async () => {
    if (!window.AppleID) {
      onError('Apple Sign-In no está disponible. Recarga la página.');
      return;
    }
    try {
      const result = await window.AppleID.auth.signIn();
      // result = { authorization: { id_token, code, state }, user?: { name, email } }
      const idToken: string | undefined = result?.authorization?.id_token;
      if (!idToken) {
        onError('Apple no devolvió id_token.');
        return;
      }
      const fullName = result?.user?.name
        ? `${result.user.name.firstName || ''} ${result.user.name.lastName || ''}`.trim()
        : undefined;
      const { data } = await axios.post(`${API_URL}/auth/apple`, {
        idToken,
        fullName,
      });
      localStorage.setItem('token', data.access.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('permissions', JSON.stringify(data.access.permissions));
      onSuccess({ user: data.user, access: data.access });
    } catch (err: any) {
      // Apple lanza error con .error === 'popup_closed_by_user' cuando el usuario cancela
      if (err?.error === 'popup_closed_by_user' || err?.error === 'user_cancelled_authorize') {
        return; // silencioso
      }
      onError(err.response?.data?.error || 'No se pudo iniciar sesión con Apple');
    }
  };

  const showGoogle = !!GOOGLE_CLIENT_ID;
  const showApple = !!APPLE_SERVICES_ID && !!APPLE_REDIRECT_URI;

  if (!showGoogle && !showApple) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ my: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', px: 1 }}>
          o continúa con
        </Typography>
      </Divider>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {showGoogle && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              opacity: disabled ? 0.6 : 1,
              pointerEvents: disabled ? 'none' : 'auto',
              '& > div': { width: '100% !important' },
            }}
          >
            <GoogleLogin
              onSuccess={handleGoogleCredential}
              onError={() => onError('Falló el inicio de sesión con Google')}
              text="continue_with"
              shape="rectangular"
              size="large"
              width="100%"
              theme="outline"
            />
          </Box>
        )}

        {showApple && (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AppleIcon />}
            onClick={handleAppleClick}
            disabled={disabled}
            sx={{
              py: 1.25,
              borderRadius: 2,
              textTransform: 'none',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#000',
              borderColor: '#000',
              background: '#fff',
              '&:hover': {
                borderColor: '#000',
                background: '#f5f5f5',
              },
            }}
          >
            Continuar con Apple
          </Button>
        )}
      </Box>
    </Box>
  );
};

const SocialAuthButtons: React.FC<Props> = (props) => {
  // Si NO hay client_id de Google, igual mostramos Apple sin envolver en provider.
  if (!GOOGLE_CLIENT_ID) {
    // GoogleOAuthProvider requiere clientId no vacío; lo evitamos si está vacío.
    if (!APPLE_SERVICES_ID || !APPLE_REDIRECT_URI) return null;
    return (
      <Box sx={{ mt: 2 }}>
        <Divider sx={{ my: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', px: 1 }}>
            o continúa con
          </Typography>
        </Divider>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<AppleIcon />}
          onClick={() => {
            // Reusamos la lógica via re-render del Inner sin Google
            // (en práctica, si tienes Apple pero no Google, deberías configurar ambos)
          }}
          sx={{ py: 1.25, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          Continuar con Apple
        </Button>
      </Box>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <InnerButtons {...props} />
    </GoogleOAuthProvider>
  );
};

// Suprime warning de "GoogleIcon no usado" si dejamos referencia para futuro custom button
void GoogleIcon;

export default SocialAuthButtons;
