/**
 * Mapeo central de errores de PayPal Orders v2 a mensajes accionables.
 *
 * PayPal devuelve errores en dos lugares:
 *   1) HTTP error (4xx/5xx) con body { name, details: [{ issue, description }] }
 *      cuando el endpoint /v2/checkout/orders/{id}/capture rechaza el cobro
 *      (ej. INSTRUMENT_DECLINED).
 *   2) HTTP 200/201 con status COMPLETED a nivel orden, pero con un
 *      `purchase_units[0].payments.captures[0].status` distinto de COMPLETED
 *      (DECLINED, PENDING, FAILED) y `status_details.reason` con el código
 *      real del procesador (INSUFFICIENT_FUNDS, EXPIRED_CARD, etc.).
 *
 * Ambos casos se normalizan aquí para que el frontend reciba siempre
 * { code, errorKey, action, retryable } y muestre UX accionable.
 */

export type PaypalErrorAction =
  | 'retry_same_card'
  | 'use_other_card'
  | 'contact_bank'
  | 'contact_support'
  | 'wait'
  | 'already_paid';

export interface PaypalMappedError {
  /** Clave i18n para mostrar al cliente final (ej. 'pp.declined'). */
  errorKey: string;
  /** Acción sugerida que el frontend debe ofrecer. */
  action: PaypalErrorAction;
  /** Si conviene mostrar botón "Reintentar" con la misma tarjeta. */
  retryable: boolean;
  /** Si el caso amerita registrar alerta de fraude. */
  alertFraud?: boolean;
}

/** Mapeo de `details[0].issue` de PayPal Orders v2. */
const ISSUE_MAP: Record<string, PaypalMappedError> = {
  INSTRUMENT_DECLINED:                   { errorKey: 'pp.declined',         action: 'use_other_card',  retryable: false },
  PAYER_ACTION_REQUIRED:                 { errorKey: 'pp.action_required',  action: 'retry_same_card', retryable: true  },
  PAYER_CANNOT_PAY:                      { errorKey: 'pp.cannot_pay',       action: 'use_other_card',  retryable: false },
  COMPLIANCE_VIOLATION:                  { errorKey: 'pp.compliance',       action: 'contact_support', retryable: false },
  TRANSACTION_REFUSED:                   { errorKey: 'pp.refused',          action: 'contact_bank',    retryable: false },
  CARD_TYPE_NOT_SUPPORTED:               { errorKey: 'pp.card_type',        action: 'use_other_card',  retryable: false },
  REDIRECT_PAYER_FOR_ALTERNATE_FUNDING:  { errorKey: 'pp.alt_funding',      action: 'use_other_card',  retryable: false },
  ORDER_ALREADY_CAPTURED:                { errorKey: 'pp.already_paid',     action: 'already_paid',    retryable: false },
  ORDER_NOT_APPROVED:                    { errorKey: 'pp.not_approved',     action: 'retry_same_card', retryable: true  },
  PAYEE_BLOCKED_TRANSACTION:             { errorKey: 'pp.payee_blocked',    action: 'contact_support', retryable: false },
  AGREEMENT_ALREADY_CANCELLED:           { errorKey: 'pp.agreement_cancel', action: 'use_other_card',  retryable: false },
  CURRENCY_NOT_SUPPORTED:                { errorKey: 'pp.currency',         action: 'contact_support', retryable: false },
  MAX_NUMBER_OF_PAYMENT_ATTEMPTS_EXCEEDED:{ errorKey: 'pp.max_attempts',    action: 'wait',            retryable: false },
};

/** Mapeo de `captures[0].status_details.reason` cuando el cargo falla. */
const REASON_MAP: Record<string, PaypalMappedError> = {
  INSUFFICIENT_FUNDS:                    { errorKey: 'pp.insufficient_funds', action: 'use_other_card',  retryable: false },
  EXPIRED_CARD:                          { errorKey: 'pp.expired_card',       action: 'use_other_card',  retryable: false },
  SUSPECTED_FRAUD:                       { errorKey: 'pp.suspected_fraud',    action: 'contact_support', retryable: false, alertFraud: true },
  LOST_OR_STOLEN:                        { errorKey: 'pp.lost_stolen',        action: 'contact_support', retryable: false, alertFraud: true },
  INVALID_ACCOUNT:                       { errorKey: 'pp.invalid_account',    action: 'use_other_card',  retryable: false },
  INVALID_OR_RESTRICTED_CARD:            { errorKey: 'pp.invalid_card',       action: 'use_other_card',  retryable: false },
  DO_NOT_HONOR:                          { errorKey: 'pp.do_not_honor',       action: 'contact_bank',    retryable: false },
  GENERIC_DECLINE:                       { errorKey: 'pp.generic_decline',    action: 'contact_bank',    retryable: false },
  CVV2_FAILURE_POSSIBLE_RETRY_WITH_CVV:  { errorKey: 'pp.cvv_retry',          action: 'retry_same_card', retryable: true  },
  CARD_CLOSED:                           { errorKey: 'pp.card_closed',        action: 'use_other_card',  retryable: false },
  PAYMENT_AUTHORIZATION_EXPIRED:         { errorKey: 'pp.auth_expired',       action: 'retry_same_card', retryable: true  },
  PENDING_REVIEW:                        { errorKey: 'pp.pending_review',     action: 'wait',            retryable: false },
  PAYER_ACCOUNT_RESTRICTED:              { errorKey: 'pp.payer_restricted',   action: 'contact_support', retryable: false },
  TRANSACTION_REFUSED:                   { errorKey: 'pp.refused',            action: 'contact_bank',    retryable: false },
  ECHECK:                                { errorKey: 'pp.echeck',             action: 'wait',            retryable: false },
};

const UNKNOWN: PaypalMappedError = {
  errorKey: 'pp.unknown',
  action: 'contact_support',
  retryable: false,
};

const NOT_COMPLETED: PaypalMappedError = {
  errorKey: 'pp.not_completed',
  action: 'retry_same_card',
  retryable: true,
};

const PENDING: PaypalMappedError = {
  errorKey: 'pp.pending',
  action: 'wait',
  retryable: false,
};

const ALREADY_PAID: PaypalMappedError = {
  errorKey: 'pp.already_paid',
  action: 'already_paid',
  retryable: false,
};

export interface PaypalCaptureCheck {
  ok: boolean;
  /** Si ok=true, este es el captureId (CAPTURE-XXX) que se debe persistir. */
  captureId?: string;
  /** Status reportado por PayPal a nivel orden (COMPLETED/PENDING/…). */
  orderStatus?: string | undefined;
  /** Status del capture individual cuando difiere del de la orden. */
  captureStatus?: string | undefined;
  /** Código crudo de PayPal (issue o reason) para auditoría. */
  rawCode?: string | undefined;
  /** Descripción cruda de PayPal para logs. */
  rawDescription?: string | undefined;
  /** Mapeo accionable para el frontend (solo si ok=false). */
  mapped?: PaypalMappedError | undefined;
}

/**
 * Analiza la respuesta de `/v2/checkout/orders/{id}/capture` (éxito o error)
 * y devuelve un veredicto unificado. Llamar siempre — no asumir COMPLETED.
 *
 * @param captureResp body de la respuesta de PayPal cuando hubo éxito HTTP.
 * @param axiosError  error de axios cuando PayPal devolvió 4xx/5xx.
 */
export function evaluatePaypalCapture(
  captureResp?: any,
  axiosError?: any
): PaypalCaptureCheck {
  // 1) HTTP error de PayPal.
  if (axiosError?.response?.data) {
    const data = axiosError.response.data;
    const detail = Array.isArray(data.details) && data.details.length > 0 ? data.details[0] : null;
    const issue = detail?.issue || data.name || 'UNKNOWN_ERROR';
    const mapped = ISSUE_MAP[issue] || UNKNOWN;
    return {
      ok: false,
      mapped,
      rawCode: issue,
      rawDescription: detail?.description || data.message || axiosError.message,
    };
  }

  if (!captureResp || typeof captureResp !== 'object') {
    return { ok: false, mapped: NOT_COMPLETED, rawCode: 'NO_RESPONSE' };
  }

  const orderStatus = String(captureResp.status || '').toUpperCase();
  const capDetail = captureResp.purchase_units?.[0]?.payments?.captures?.[0];
  const captureStatus = capDetail?.status ? String(capDetail.status).toUpperCase() : undefined;
  const reason = capDetail?.status_details?.reason as string | undefined;

  // 2) Orden COMPLETED y capture COMPLETED → éxito.
  if (orderStatus === 'COMPLETED' && (!captureStatus || captureStatus === 'COMPLETED')) {
    return {
      ok: true,
      captureId: capDetail?.id,
      orderStatus,
      captureStatus,
    };
  }

  // 3) Orden COMPLETED pero el capture quedó DECLINED/FAILED.
  if (orderStatus === 'COMPLETED' && captureStatus && captureStatus !== 'COMPLETED') {
    const mapped = (reason && REASON_MAP[reason]) || NOT_COMPLETED;
    return {
      ok: false,
      orderStatus,
      captureStatus,
      rawCode: reason || captureStatus,
      rawDescription: capDetail?.status_details?.description,
      mapped,
    };
  }

  // 4) Orden en estados intermedios.
  if (orderStatus === 'PENDING' || orderStatus === 'PAYER_ACTION_REQUIRED') {
    return {
      ok: false,
      orderStatus,
      mapped: orderStatus === 'PENDING' ? PENDING : ISSUE_MAP.PAYER_ACTION_REQUIRED!,
      rawCode: orderStatus,
    };
  }

  // 5) Otros (VOIDED, DECLINED a nivel orden, etc.).
  return {
    ok: false,
    orderStatus,
    captureStatus,
    rawCode: orderStatus,
    mapped: NOT_COMPLETED,
  };
}

/**
 * Construye la respuesta JSON que el backend devuelve al cliente cuando
 * el cobro falla. Status HTTP 402 ("Payment Required") salvo idempotencia.
 */
export function buildPaypalErrorResponse(check: PaypalCaptureCheck) {
  const status = check.mapped?.action === 'already_paid' ? 409 : 402;
  return {
    status,
    body: {
      success: false,
      code: check.rawCode || 'UNKNOWN',
      errorKey: check.mapped?.errorKey || 'pp.unknown',
      action: check.mapped?.action || 'contact_support',
      retryable: check.mapped?.retryable === true,
      orderStatus: check.orderStatus,
      captureStatus: check.captureStatus,
      detail: check.rawDescription,
    },
  };
}

export { ALREADY_PAID };
