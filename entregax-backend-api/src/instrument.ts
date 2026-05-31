/**
 * Sentry instrumentation — MUST be imported BEFORE express y cualquier otro
 * módulo instrumentado por Sentry. Si no, sale el warning:
 *   "[Sentry] express is not instrumented..."
 *
 * Por eso este archivo se importa como primera línea de index.ts vía:
 *   import './instrument';
 */
import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';

dotenv.config();

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
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
  // eslint-disable-next-line no-console
  console.log('🟢 Sentry init (pre-express) listo');
} else {
  // eslint-disable-next-line no-console
  console.log('🟡 Sentry deshabilitado (SENTRY_DSN no definido)');
}
