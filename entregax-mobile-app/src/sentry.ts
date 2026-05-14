/**
 * Sentry wiring para Expo React Native — tolerante a la ausencia del paquete.
 *
 * El paquete @sentry/react-native rompía el build de Android por autolinking
 * sin SENTRY_AUTH_TOKEN. Mientras se decide la estrategia final, este módulo
 * carga Sentry mediante require() condicional: si el paquete no está
 * instalado o EXPO_PUBLIC_SENTRY_DSN no está definido, todo es no-op.
 *
 * Variables soportadas (expo public — visibles en bundle, OK para DSN):
 *   EXPO_PUBLIC_SENTRY_DSN
 *   EXPO_PUBLIC_SENTRY_ENV (default: process.env.NODE_ENV)
 */

let Sentry: any = null;
let enabled = false;

function loadSentry(): any {
  if (Sentry) return Sentry;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Sentry = require('@sentry/react-native');
    return Sentry;
  } catch {
    if (__DEV__) console.log('🟡 @sentry/react-native no instalado — Sentry mobile deshabilitado');
    return null;
  }
}

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (__DEV__) console.log('🟡 Sentry mobile deshabilitado (EXPO_PUBLIC_SENTRY_DSN no definido)');
    return;
  }
  const S = loadSentry();
  if (!S) return;

  S.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENV || (__DEV__ ? 'development' : 'production'),
    debug: false,
    enableAutoSessionTracking: true,
    enabled: !__DEV__,
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    beforeSend(event: any) {
      if (event.request?.headers) {
        const h = event.request.headers as Record<string, string>;
        delete h.authorization;
        delete h.Authorization;
        delete h.cookie;
      }
      if (event.request?.url) {
        event.request.url = event.request.url.replace(
          /([?&](token|password|secret|otp)=)[^&]*/gi,
          '$1[REDACTED]'
        );
      }
      if (event.breadcrumbs) {
        for (const b of event.breadcrumbs) {
          if (b.data && typeof b.data === 'object') {
            for (const k of Object.keys(b.data)) {
              if (/password|token|secret|cvv|cvc|otp/i.test(k)) {
                (b.data as Record<string, unknown>)[k] = '[REDACTED]';
              }
            }
          }
        }
      }
      return event;
    },
    ignoreErrors: ['Network request failed', 'AbortError', 'cancelled'],
  });
  enabled = true;
}

export function setSentryUser(
  user: { id: string | number; email?: string; role?: string } | null
): void {
  if (!enabled || !Sentry) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: String(user.id), email: user.email, segment: user.role });
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled || !Sentry) return;
  Sentry.withScope((scope: any) => {
    if (context) for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
    Sentry.captureException(err);
  });
}

// wrapAppWithSentry: pasa el componente tal cual si Sentry no está disponible.
export function wrapAppWithSentry<T>(component: T): T {
  const S = loadSentry();
  if (S && typeof S.wrap === 'function') return S.wrap(component);
  return component;
}
