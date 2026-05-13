/**
 * Rate limiters ligeros (sin deps externas, ventana fija en memoria).
 *
 * Suficiente para mitigar abuso por IP/usuario por instancia. En despliegues
 * multi-nodo NO sustituye un WAF; complementa a Cloudflare.
 *
 * Buckets:
 *  - paymentLimiter: 30 req / 5 min por user|ip
 *  - verifyLimiter:  20 req / 15 min por user|ip
 *  - uploadLimiter:  60 req / 10 min por user|ip
 *
 * En dev se permiten ~10x más.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';

const isProd = process.env.NODE_ENV === 'production';
const SCALE = isProd ? 1 : 10;

type Bucket = { count: number; resetAt: number };

function makeLimiter(opts: { windowMs: number; max: number; message?: string; hint?: string }): RequestHandler {
  const store = new Map<string, Bucket>();

  const gc = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of store.entries()) {
      if (now > b.resetAt) store.delete(k);
    }
  }, 60 * 1000);
  (gc as any).unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const uid = (req as any).user?.userId;
    const key = `${uid ? `u:${uid}` : `ip:${req.ip}`}:${req.path}`;
    const now = Date.now();
    const b = store.get(key);

    if (!b || now > b.resetAt) {
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    if (b.count >= opts.max * SCALE) {
      res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000).toString());
      res.status(429).json({
        error: opts.message || 'Demasiadas solicitudes',
        message: opts.hint || 'Has alcanzado el límite. Espera unos minutos.',
      });
      return;
    }

    b.count += 1;
    next();
  };
}

export const paymentLimiter: RequestHandler = makeLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Demasiadas operaciones de pago',
  hint: 'Espera unos minutos antes de volver a intentar el cobro.',
});

export const verifyLimiter: RequestHandler = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiados intentos de verificación',
});

export const uploadLimiter: RequestHandler = makeLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: 'Demasiadas subidas',
});
