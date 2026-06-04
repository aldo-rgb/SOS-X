/**
 * Traducción de errores de PayPal a mensaje accionable en mobile.
 *
 * Espera la respuesta JSON del backend cuando un capture falla:
 *   { success: false, code, errorKey, action, retryable, detail }
 *
 * Y devuelve { title, message, actionLabel } listos para Alert.alert.
 */

import i18n from '../i18n';

const CODE_TO_KEY: Record<string, string> = {
  INSTRUMENT_DECLINED: 'pp.declined',
  PAYER_ACTION_REQUIRED: 'pp.action_required',
  PAYER_CANNOT_PAY: 'pp.cannot_pay',
  COMPLIANCE_VIOLATION: 'pp.compliance',
  TRANSACTION_REFUSED: 'pp.refused',
  CARD_TYPE_NOT_SUPPORTED: 'pp.card_type',
  ORDER_ALREADY_CAPTURED: 'pp.already_paid',
  ORDER_NOT_APPROVED: 'pp.not_approved',
  PAYEE_BLOCKED_TRANSACTION: 'pp.payee_blocked',
  AGREEMENT_ALREADY_CANCELLED: 'pp.agreement_cancel',
  CURRENCY_NOT_SUPPORTED: 'pp.currency_not_supported',
  MAX_NUMBER_OF_PAYMENT_ATTEMPTS_EXCEEDED: 'pp.max_attempts',
  REDIRECT_PAYER_FOR_ALTERNATE_FUNDING: 'pp.alt_funding',
  INSUFFICIENT_FUNDS: 'pp.insufficient_funds',
  EXPIRED_CARD: 'pp.expired_card',
  SUSPECTED_FRAUD: 'pp.suspected_fraud',
  LOST_OR_STOLEN: 'pp.lost_stolen',
  INVALID_ACCOUNT: 'pp.invalid_account',
  INVALID_OR_RESTRICTED_CARD: 'pp.invalid_card',
  DO_NOT_HONOR: 'pp.do_not_honor',
  GENERIC_DECLINE: 'pp.generic_decline',
  CVV2_FAILURE_POSSIBLE_RETRY_WITH_CVV: 'pp.cvv_retry',
  CARD_CLOSED: 'pp.card_closed',
  PAYMENT_AUTHORIZATION_EXPIRED: 'pp.auth_expired',
  PENDING_REVIEW: 'pp.pending_review',
  PAYER_ACCOUNT_RESTRICTED: 'pp.payer_restricted',
  PENDING: 'pp.pending',
  PAYPAL_ERROR: 'pp.unknown',
};

export interface PaypalErrorPayload {
  errorKey?: string;
  code?: string;
  action?: string;
  retryable?: boolean;
  detail?: string;
  error?: string;
}

export interface PaypalErrorDisplay {
  title: string;
  message: string;
  actionLabel?: string;
  retryable: boolean;
  alreadyPaid: boolean;
}

export function buildPaypalErrorDisplay(payload: PaypalErrorPayload | null | undefined): PaypalErrorDisplay {
  const t = i18n.t.bind(i18n);
  const errorKey = payload?.errorKey
    || (payload?.code ? CODE_TO_KEY[String(payload.code).toUpperCase()] : undefined)
    || 'pp.unknown';
  const action = payload?.action || 'contact_support';
  const message = t(errorKey, { defaultValue: payload?.error || payload?.detail || 'No pudimos procesar tu pago.' });
  const actionLabel = t(`pp.action.${action}`, { defaultValue: '' });
  return {
    title: t('common.error', { defaultValue: 'Error' }),
    message: actionLabel ? `${message}\n\n${actionLabel}` : message,
    actionLabel: actionLabel || undefined,
    retryable: payload?.retryable === true,
    alreadyPaid: action === 'already_paid',
  };
}
