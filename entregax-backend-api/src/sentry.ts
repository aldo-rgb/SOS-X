/**
 * Sentry wiring (env-gated).
 *
 * Si SENTRY_DSN no está definido, todas las funciones son no-op.
 * Esto permite tener el código instrumentado sin obligar a tener Sentry
 * en dev / CI. Al setear SENTRY_DSN en Railway / Vercel se activa.
 */
import * as Sentry from '@sentry/node';
import type { Express, Request, Response, NextFunction } from 'express';

let enabled = false;

export function initSentry(app: Express): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('🟡 Sentry deshabilitado (SENTRY_DSN no definido)');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || undefined,
    // Limitar volumen: 10% en prod, 100% en dev
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Scrubbing: nunca enviar tokens / passwords / cookies
    beforeSend(event) {
      if (event.request) {
        if (event.request.headers) {
          delete (event.request.headers as any).authorization;
          delete (event.request.headers as any).cookie;
        }
        if (event.request.data && typeof event.request.data === 'object') {
          const data = event.request.data as Record<string, unknown>;
          for (const key of Object.keys(data)) {
            if (/password|token|secret|cvv|cvc/i.test(key)) {
              data[key] = '[REDACTED]';
            }
          }
        }
      }
      return event;
    },
  });

  // Sentry v8+: setupExpressErrorHandler se llama al final
  Sentry.setupExpressErrorHandler(app);
  enabled = true;
  console.log('🟢 Sentry inicializado');
}

/** Captura manual de excepción con contexto del usuario autenticado. */
export function captureError(err: unknown, req?: Request): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (req) {
      const user = (req as any).user;
      if (user?.userId) {
        scope.setUser({ id: String(user.userId), email: user.email, role: user.role });
      }
      scope.setTag('route', req.path);
      scope.setTag('method', req.method);
    }
    Sentry.captureException(err);
  });
}

/** Middleware fallback de errores: log estructurado + 500. */
export function errorReporter(err: any, req: Request, res: Response, _next: NextFunction): void {
  captureError(err, req);
  console.error(`[ERR] ${req.method} ${req.path}`, err?.message || err);
  if (res.headersSent) return;
  res.status(err?.status || 500).json({
    error: 'Error interno',
    message:
      process.env.NODE_ENV !== 'production'
        ? err?.message || String(err)
        : 'Ocurrió un error procesando la solicitud',
  });
}
