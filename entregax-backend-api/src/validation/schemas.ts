/**
 * Esquemas Zod centralizados para validación + sanitización de input.
 *
 * Beneficio: detiene Mass Assignment (extrae solo lo permitido del body),
 * type-safety en runtime y respuestas 400 consistentes.
 *
 * Uso:
 *   import { validateBody, loginSchema } from './validation/schemas';
 *   app.post('/api/auth/login', validateBody(loginSchema), loginUser);
 */
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// ============================================================
// MIDDLEWARE
// ============================================================

/**
 * Valida y reemplaza req.body con la versión "stripped" del schema.
 * Cualquier campo extra no declarado se elimina (anti Mass Assignment).
 */
export const validateBody =
  <T extends z.ZodTypeAny>(schema: T) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Datos inválidos',
        issues: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };

// ============================================================
// SCHEMAS — AUTH
// ============================================================

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(1).max(200),
  })
  .strict();

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(8).max(200).optional(),
    phone: z.string().trim().max(30).optional(),
    isAdminCreated: z.boolean().optional(),
    referralCodeInput: z.string().trim().max(50).optional(),
    existingBoxId: z.string().trim().max(20).optional(),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10).max(500),
    newPassword: z.string().min(8).max(200),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
  })
  .strict();
