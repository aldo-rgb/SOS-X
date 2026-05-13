/**
 * Sentry wiring para Expo React Native.
 * Env-gated: si EXPO_PUBLIC_SENTRY_DSN no está definido, todo es no-op.
 *
 * Variables soportadas (expo public — visibles en bundle, OK para DSN):
 *   EXPO_PUBLIC_SENTRY_DSN
 *   EXPO_PUBLIC_SENTRY_ENV (default: process.env.NODE_ENV)
 */
import * as Sentry from '@sentry/react-native';

let enabled = false;

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (__DEV__) console.log('🟡 Sentry mobile deshabilitado (EXPO_PUBLIC_SENTRY_DSN no definido)');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENV || (__DEV__ ? 'development' : 'production'),
    debug: false,
    enableAutoSessionTracking: true,
    // No reportar en dev a menos que se fuerce
    enabled: !__DEV__,
    // 10% performance traces en prod
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    // Scrubbing: redact authorization/cookie y payloads sensibles
    beforeSend(event) {
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
      // Redactar campos en breadcrumbs
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
    ignoreErrors: [
      'Network request failed',
      'AbortError',
      'cancelled',
    ],
  });
  enabled = true;
}

export function setSentryUser(user: { id: string | number; email?: string; role?: string } | null): void {
  if (!enabled) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: String(user.id), email: user.email, segment: user.role });
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context) for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
    Sentry.captureException(err);
  });
}

export const wrapAppWithSentry = Sentry.wrap;
