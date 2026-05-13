/**
 * Sanitización de HTML usando DOMPurify.
 *
 * Uso obligatorio antes de inyectar HTML proveniente del backend
 * (mensajes de soporte, descripciones de productos, contenido de tickets,
 * notificaciones, etc.) en cualquier `dangerouslySetInnerHTML`.
 *
 * Bloquea XSS basado en <script>, <iframe>, atributos on*, javascript:, etc.
 *
 * @example
 *   import { safeHTML } from '@/utils/sanitize';
 *   <div dangerouslySetInnerHTML={{ __html: safeHTML(ticket.body) }} />
 */
import DOMPurify from 'dompurify';

const STRICT_CONFIG = {
  ALLOWED_TAGS: [
    'b',
    'i',
    'em',
    'strong',
    'a',
    'p',
    'br',
    'ul',
    'ol',
    'li',
    'span',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'code',
    'pre',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus'],
};

/**
 * Sanitiza HTML y fuerza target="_blank" + rel="noopener noreferrer" en enlaces.
 */
export function safeHTML(dirty: string | null | undefined): string {
  if (!dirty) return '';
  // Hook para forzar enlaces seguros
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  const clean = DOMPurify.sanitize(String(dirty), STRICT_CONFIG) as unknown as string;
  DOMPurify.removeAllHooks();
  return clean;
}

/**
 * Versión "plain text" — strippea TODO el HTML.
 * Útil para preview/tooltips donde solo queremos texto.
 */
export function stripHTML(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(String(dirty), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) as unknown as string;
}
