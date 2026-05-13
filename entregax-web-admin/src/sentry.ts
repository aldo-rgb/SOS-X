/**
 * Sentry wiring para web admin (Vite + React).
 * Env-gated: si VITE_SENTRY_DSN no está definido, todo es no-op.
 */
import * as Sentry from '@sentry/react';

let enabled = false;

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    if (!import.meta.env.PROD) {
      console.log('🟡 Sentry web deshabilitado (VITE_SENTRY_DSN no definido)');
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || 'production',
    release: (import.meta.env.VITE_SENTRY_RELEASE as string | undefined) || undefined,
    // Performance: 10% en prod, 100% en dev
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Session replay opcional: 0 = off, 0.01 = 1% sesiones, 1.0 = todo error
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 0.1 : 0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    // Scrubbing: nunca enviar tokens / passwords
    beforeSend(event) {
      if (event.request?.headers) {
        const h = event.request.headers as Record<string, string>;
        delete h.authorization;
        delete h.cookie;
      }
      // Limpiar query params sensibles
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/([?&](token|password|secret)=)[^&]*/gi, '$1[REDACTED]');
      }
      return event;
    },
    // No reportar errores ruidosos del navegador
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      'Network request failed',
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
    if (context) {
      for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
    }
    Sentry.captureException(err);
  });
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
