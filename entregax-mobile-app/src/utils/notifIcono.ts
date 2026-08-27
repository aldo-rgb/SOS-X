/**
 * ICONO DE UNA NOTIFICACIÓN
 *
 * La columna `notifications.icon` se fue llenando desde media docena de lugares
 * distintos y quedó con nombres de tres familias mezcladas —MaterialCommunity
 * ('package-variant'), Ionicons ('search', 'headset'), MaterialIcons
 * ('local-shipping') y hasta emoji ('⚠️')—. La app las pinta con
 * MaterialCommunityIcons, así que todo lo que no era de esa familia salía como
 * un signo de interrogación: la lista entera se veía igual.
 *
 * Aquí se traduce cualquiera de esos nombres a un icono real, y si el nombre no
 * dice nada se cae al tipo de la notificación, que sí es confiable.
 */

/** Nombres que llegan de otras familias → su equivalente en MaterialCommunity. */
const ALIAS: Record<string, string> = {
  search: 'magnify',
  package: 'package-variant',
  checkbox: 'clipboard-check-outline',
  'local-shipping': 'truck-delivery',
  edit: 'pencil',
  card: 'credit-card-outline',
  'id-card': 'card-account-details',
  warning: 'alert',
  '⚠️': 'alert',
  '🎁': 'gift',
  '📦': 'package-variant',
  '💰': 'cash',
  '✅': 'check-circle',
  '🐛': 'bug',
  '📋': 'clipboard-check-outline',
};

/** Nombres que ya son de MaterialCommunity y se dejan pasar tal cual. */
const VALIDOS = new Set([
  'bell', 'bell-outline', 'magnify', 'headset', 'package-variant', 'package-variant-closed',
  'cash-check', 'cash', 'truck-delivery', 'ferry', 'check-circle', 'check-all', 'pencil',
  'clock-outline', 'file-document-edit', 'alert-circle', 'account-clock', 'wallet',
  'calendar', 'alert', 'gift', 'tag', 'shield-check', 'account-tie', 'account-plus',
  'clipboard-check-outline', 'credit-card-outline', 'card-account-details', 'bug',
  'airplane', 'cog-outline', 'information', 'store', 'map-marker',
  'hours-24', 'check-decagram', 'spray', 'swap-horizontal', 'clock-alert-outline',
  'comment-text-outline', 'account-arrow-right', 'party-popper', 'truck-alert',
]);

/**
 * Reglas por TÍTULO. Van primero porque son las únicas que distinguen entre
 * notificaciones que comparten type e icon: "Tareas urgentes", "X completó una
 * tarea" y "Te involucraron en una tarea" llegan las tres como
 * type='info'/'task' con icon='checkbox', así que en la lista salían con el
 * mismo portapapeles azul y no se podían separar de un vistazo.
 *
 * El emoji con el que arranca cada título es el discriminante confiable: lo
 * pone quien crea la notificación y no ha cambiado.
 */
const POR_TITULO: Array<{ re: RegExp; icon: string; color: string }> = [
  // Vencen en 24 horas: rojo y un icono que lo diga.
  { re: /^🔥|tareas?\s+urgentes?/i, icon: 'hours-24', color: '#C62828' },
  // Tarea terminada: palomita sola, sin portapapeles, en verde.
  { re: /^(✅|👀).*(complet[oó]|termin[oó])/i, icon: 'check-decagram', color: '#2E7D46' },
  // Error reportado: el bote de fumigar, que es lo que se hace con los bugs.
  { re: /^🐛|error\s+reportad/i, icon: 'spray', color: '#D84315' },
  // Cambio de tipo de producto: intercambio.
  { re: /tipo\s+de\s+producto/i, icon: 'swap-horizontal', color: '#546E7A' },
  // Resto del módulo de tareas, para que no sean todos el mismo portapapeles.
  { re: /^⏳|esperando tu confirmaci/i, icon: 'clock-alert-outline', color: '#E08A00' },
  { re: /^💬|coment[oó] en|te mencion/i, icon: 'comment-text-outline', color: '#1565C0' },
  { re: /^📥|prospecto/i, icon: 'account-arrow-right', color: '#1565C0' },
  { re: /^🎉|paquete entregado/i, icon: 'party-popper', color: '#2E7D46' },
  { re: /^🚨.*flotilla|alertas de flotilla/i, icon: 'truck-alert', color: '#C62828' },
];

/** Respaldo por tipo: lo que sí describe de qué trata la notificación. */
const POR_TIPO: Record<string, string> = {
  task: 'clipboard-check-outline',
  task_assigned: 'clipboard-check-outline',
  task_comment: 'clipboard-check-outline',
  ticket: 'headset',
  ticket_created: 'headset',
  ticket_reopened: 'headset',
  support_reply: 'headset',
  payment: 'cash-check',
  payment_received: 'cash-check',
  quote_request: 'file-document-edit',
  system: 'cog-outline',
  system_alert: 'alert',
  xpay_orden_cancelada: 'alert',
  success: 'check-circle',
  error: 'alert-circle',
  warning: 'alert',
  promo: 'tag',
  info: 'information',
};

export function iconoNotificacion(icon?: string | null, type?: string | null, title?: string | null): string {
  const t = String(title || '');
  if (t) {
    const regla = POR_TITULO.find(r => r.re.test(t));
    if (regla) return regla.icon;
  }
  const raw = String(icon || '').trim();
  if (ALIAS[raw]) return ALIAS[raw];
  if (VALIDOS.has(raw)) return raw;
  return POR_TIPO[String(type || '').trim()] || 'bell';
}

/** Color del círculo. Antes solo distinguía success / error / promo. */
export function colorNotificacion(type?: string | null, title?: string | null): string {
  const t = String(title || '');
  if (t) {
    const regla = POR_TITULO.find(r => r.re.test(t));
    if (regla) return regla.color;
  }
  switch (String(type || '')) {
    case 'success': return '#2E7D46';
    case 'error': return '#C62828';
    case 'warning': case 'system_alert': case 'xpay_orden_cancelada': return '#E08A00';
    case 'promo': return '#F05A28';
    case 'payment': case 'payment_received': return '#2E7D46';
    case 'ticket': case 'ticket_created': case 'ticket_reopened': case 'support_reply': return '#7B4DBF';
    case 'task': case 'task_assigned': case 'task_comment': return '#1565C0';
    case 'system': return '#546E7A';
    default: return '#2196F3';
  }
}

/**
 * La pantalla del asesor pinta con Ionicons, no con MaterialCommunity. Se
 * resuelve primero el icono "canónico" de arriba y luego se traduce, para no
 * mantener dos tablas de nombres que se van a desincronizar.
 */
const A_IONICONS: Record<string, string> = {
  bell: 'notifications-outline',
  'bell-outline': 'notifications-outline',
  magnify: 'search-outline',
  headset: 'headset-outline',
  'package-variant': 'cube-outline',
  'package-variant-closed': 'cube',
  'cash-check': 'cash-outline',
  cash: 'cash-outline',
  'truck-delivery': 'car-outline',
  ferry: 'boat-outline',
  'check-circle': 'checkmark-circle',
  'check-all': 'checkmark-done',
  pencil: 'create-outline',
  'clock-outline': 'time-outline',
  'file-document-edit': 'document-text-outline',
  'alert-circle': 'alert-circle-outline',
  'account-clock': 'person-outline',
  'account-tie': 'person-outline',
  'account-plus': 'person-add-outline',
  wallet: 'wallet-outline',
  calendar: 'calendar-outline',
  alert: 'warning-outline',
  gift: 'gift-outline',
  tag: 'pricetag-outline',
  'shield-check': 'shield-checkmark-outline',
  'clipboard-check-outline': 'clipboard-outline',
  'credit-card-outline': 'card-outline',
  'card-account-details': 'id-card-outline',
  bug: 'bug-outline',
  airplane: 'airplane-outline',
  'cog-outline': 'settings-outline',
  information: 'information-circle-outline',
  store: 'storefront-outline',
  'map-marker': 'location-outline',
  'hours-24': 'timer-outline',
  'check-decagram': 'checkmark-circle',
  spray: 'bug-outline',
  'swap-horizontal': 'swap-horizontal-outline',
  'clock-alert-outline': 'alarm-outline',
  'comment-text-outline': 'chatbubble-ellipses-outline',
  'account-arrow-right': 'person-add-outline',
  'party-popper': 'gift-outline',
  'truck-alert': 'car-outline',
};

export function iconoNotificacionIon(icon?: string | null, type?: string | null, title?: string | null): string {
  return A_IONICONS[iconoNotificacion(icon, type, title)] || 'notifications-outline';
}
