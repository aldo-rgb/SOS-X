/**
 * Sentry stub para Expo React Native.
 *
 * @sentry/react-native no está instalado actualmente (rompe el build Android
 * por autolinking sin SENTRY_AUTH_TOKEN). Mientras se decide la estrategia
 * final, este módulo expone la API esperada como no-op para evitar errores
 * de Metro al bundlear (Metro analiza require() estáticamente y falla si
 * intenta resolver un módulo inexistente).
 *
 * Cuando se reinstale el paquete, restaurar el require() condicional o
 * importarlo directamente.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

export function initSentry(): void {
  if (__DEV__) console.log('🟡 Sentry mobile deshabilitado (paquete no instalado)');
}

export function setSentryUser(
  _user: { id: string | number; email?: string; role?: string } | null
): void {
  /* no-op */
}

export function captureError(_err: unknown, _context?: Record<string, unknown>): void {
  /* no-op */
}

export function wrapAppWithSentry<T>(component: T): T {
  return component;
}
