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
    // Teléfono ahora es obligatorio (excepto cuando isAdminCreated=true que ya valida en controller).
    // Formato esperado: con código de país (ej. 5215512345678).
    phone: z.string().trim().min(7).max(20),
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

/** POST /api/auth/google — idToken JWT firmado por Google */
export const googleAuthSchema = z
  .object({
    idToken: z.string().min(20).max(8000),
  })
  .strict();

/** POST /api/auth/apple — idToken JWT firmado por Apple + nombre opcional
 * (Apple sólo envía el nombre la primera vez en el cliente). */
export const appleAuthSchema = z
  .object({
    idToken: z.string().min(20).max(8000),
    fullName: z.string().trim().max(120).optional(),
  })
  .strict();

/** POST /api/auth/phone/send-code */
export const sendPhoneCodeSchema = z
  .object({
    phone: z.string().trim().min(7).max(20),
  })
  .strict();

/** POST /api/auth/phone/verify-code */
export const verifyPhoneCodeSchema = z
  .object({
    phone: z.string().trim().min(7).max(20),
    code: z.string().trim().regex(/^\d{4,8}$/, 'Código debe ser 4-8 dígitos'),
  })
  .strict();

// ============================================================
// SCHEMAS — PAYMENTS / CONSOLIDATIONS
// ============================================================

/** POST /api/payments/create — PayPal consolidaciones aéreo */
export const createPaymentOrderSchema = z
  .object({
    consolidationId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  })
  .strict();

/** POST /api/payments/capture */
export const capturePaymentOrderSchema = z
  .object({
    paypalOrderId: z.string().trim().min(5).max(120),
    consolidationId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  })
  .strict();

/** POST /api/pobox/payment/order/:id/pay-internal */
export const payPoboxInternalSchema = z
  .object({
    method: z.enum(['wallet', 'credit']),
    service: z.string().trim().max(40).optional(),
    requiere_factura: z.boolean().optional(),
  })
  .strict();

/** POST /api/pobox/payment/order/:id/apply-credit */
export const applyCreditPoboxSchema = z
  .object({
    service: z.string().trim().max(40),
    credit_amount: z.number().positive().max(1_000_000),
  })
  .strict();

/** POST /api/pobox/payment/order/:id/apply-wallet */
export const applyWalletPoboxSchema = z
  .object({
    wallet_amount: z.number().positive().max(1_000_000),
  })
  .strict();

// ============================================================
// SCHEMAS — ADDRESSES
// ============================================================

/** Campos comunes para crear/actualizar dirección (formato app móvil). */
const addressBaseFields = {
  alias: z.string().trim().max(80).optional(),
  contact_name: z.string().trim().max(120).optional(),
  recipient_name: z.string().trim().max(120).optional(),
  street: z.string().trim().min(1).max(200),
  exterior_number: z.string().trim().max(30).optional().nullable(),
  interior_number: z.string().trim().max(30).optional().nullable(),
  colony: z.string().trim().max(120).optional().nullable(),
  neighborhood: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  zip_code: z.string().trim().min(3).max(15),
  phone: z.string().trim().max(30).optional().nullable(),
  reference: z.string().trim().max(500).optional().nullable(),
  reception_hours: z.string().trim().max(120).optional().nullable(),
  default_for_service: z.string().trim().max(200).optional().nullable(),
  is_default: z.boolean().optional(),
};

/** POST /api/addresses (app móvil) */
export const createMyAddressSchema = z.object(addressBaseFields).strict();

/** PUT /api/addresses/:id (app móvil) */
export const updateMyAddressSchema = z
  .object({
    ...addressBaseFields,
    street: addressBaseFields.street.optional(),
    city: addressBaseFields.city.optional(),
    state: addressBaseFields.state.optional(),
    zip_code: addressBaseFields.zip_code.optional(),
  })
  .strict();

/** PUT /api/addresses/:id/default-for-service */
export const setDefaultForServiceSchema = z
  .object({
    services: z.array(z.string().trim().max(40)).max(20).optional(),
    carrier_config: z.record(z.string(), z.string().max(60)).optional(),
  })
  .strict();

/** POST /api/client/addresses (formato web admin / legado, camelCase) */
export const createClientAddressSchema = z
  .object({
    userId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
    alias: z.string().trim().max(80).optional(),
    recipientName: z.string().trim().max(120).optional(),
    street: z.string().trim().min(1).max(200),
    exteriorNumber: z.string().trim().max(30).optional().nullable(),
    interiorNumber: z.string().trim().max(30).optional().nullable(),
    neighborhood: z.string().trim().max(120).optional().nullable(),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().min(1).max(120),
    zipCode: z.string().trim().min(3).max(15),
    phone: z.string().trim().max(30).optional().nullable(),
    reference: z.string().trim().max(500).optional().nullable(),
    isDefault: z.boolean().optional(),
  })
  .strict();

// ============================================================
// SCHEMAS — PACKAGES
// ============================================================

/** POST /api/packages/repack */
export const requestRepackSchema = z
  .object({
    packageIds: z.array(z.number().int().positive()).min(2).max(200),
    repackBox: z
      .object({
        length: z.number().positive().max(500),
        width: z.number().positive().max(500),
        height: z.number().positive().max(500),
        volume: z.number().positive().max(5_000_000),
        maxWeight: z.number().positive().max(5000),
      })
      .strict(),
    totalWeight: z.number().nonnegative().max(5000),
    totalVolume: z.number().nonnegative().max(5_000_000),
  })
  .strict();
