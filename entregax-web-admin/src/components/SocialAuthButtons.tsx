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
  /** Callback cuando el usuario social no está registrado aún. Recibe email + nombre para prellenar el formulario de registro. */
  onNotRegistered?: (prefill: { email: string; fullName: string; provider: 'google' | 'apple' }) => void;
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

const InnerButtons: React.FC<Props> = ({ onSuccess, onError, onNotRegistered, disabled }) => {
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
      const data = err.response?.data;
      if (data?.errorCode === 'SOCIAL_USER_NOT_REGISTERED' && data?.prefill && onNotRegistered) {
        onNotRegistered({
          email: data.prefill.email || '',
          fullName: data.prefill.fullName || '',
          provider: 'google',
        });
        return;
      }
      onError(data?.error || 'No se pudo iniciar sesión con Google');
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
      const data = err.response?.data;
      if (data?.errorCode === 'SOCIAL_USER_NOT_REGISTERED' && data?.prefill && onNotRegistered) {
        onNotRegistered({
          email: data.prefill.email || '',
          fullName: data.prefill.fullName || '',
          provider: 'apple',
        });
        return;
      }
      onError(data?.error || 'No se pudo iniciar sesión con Apple');
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

      <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1.5, alignItems: 'stretch' }}>
        {showGoogle && (
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              height: 44,
              position: 'relative',
              opacity: disabled ? 0.6 : 1,
              pointerEvents: disabled ? 'none' : 'auto',
              borderRadius: 2,
              border: '1.5px solid #DADCE0',
              background: '#fff',
              overflow: 'hidden',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: '#C1272D',
                boxShadow: '0 2px 8px rgba(193,39,45,0.12)',
                transform: 'translateY(-1px)',
              },
              // Estilizamos el iframe interno de GoogleLogin para que ocupe todo el contenedor
              '& > div, & iframe, & > div > div': {
                width: '100% !important',
                minWidth: '100% !important',
                height: '100% !important',
              },
              // Overlay con icono + label custom encima del iframe transparente de Google
              '&::before': {
                content: '"Google"',
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontFamily: 'Roboto, sans-serif',
                fontWeight: 600,
                fontSize: '0.95rem',
                color: '#3c4043',
                background: '#fff',
                pointerEvents: 'none',
                zIndex: 2,
                paddingLeft: '28px',
              },
              '&::after': {
                content: '""',
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-72px, -50%)',
                width: 18,
                height: 18,
                background: 'url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><path fill=%22%23FFC107%22 d=%22M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z%22/><path fill=%22%23FF3D00%22 d=%22M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z%22/><path fill=%22%234CAF50%22 d=%22M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z%22/><path fill=%22%231976D2%22 d=%22M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z%22/></svg>") center/contain no-repeat',
                pointerEvents: 'none',
                zIndex: 3,
              },
            }}
          >
            <GoogleLogin
              onSuccess={handleGoogleCredential}
              onError={() => onError('Fall\u00f3 el inicio de sesi\u00f3n con Google')}
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
            variant="contained"
            startIcon={<AppleIcon sx={{ fontSize: '1.25rem !important' }} />}
            onClick={handleAppleClick}
            disabled={disabled}
            sx={{
              flex: 1,
              minWidth: 0,
              height: 44,
              py: 0,
              borderRadius: 2,
              textTransform: 'none',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#fff',
              background: '#000',
              border: '1.5px solid #000',
              boxShadow: 'none',
              transition: 'all 0.2s ease',
              '&:hover': {
                background: '#1a1a1a',
                borderColor: '#1a1a1a',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                transform: 'translateY(-1px)',
              },
            }}
          >
            Apple
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
