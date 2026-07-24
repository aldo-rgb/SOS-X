// desktopNotifications.ts
// Capa A: notificaciones NATIVAS de escritorio (macOS/Windows/Linux) cuando la
// pestaña del dashboard está ABIERTA. Usa la Notifications API del navegador
// (Chrome/Safari/Firefox/Edge). Requiere permiso del usuario + que el navegador
// tenga permitido notificar en los ajustes del SO.

let permissionAsked = false;

export function desktopNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

// Pide permiso (una vez). Devuelve true si quedó concedido.
export async function ensureDesktopNotificationPermission(): Promise<boolean> {
  if (!desktopNotificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  // Aquí ya descartamos 'granted' y 'denied' arriba; solo queda 'default'.
  if (permissionAsked) return false;
  permissionAsked = true;
  try {
    const p = await Notification.requestPermission();
    return p === 'granted';
  } catch {
    return false;
  }
}

// Pequeño "ding" por WebAudio como respaldo audible (por si el SO no suena solo).
function playBeep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.start();
    o.stop(ctx.currentTime + 0.36);
    setTimeout(() => { try { ctx.close(); } catch { /* noop */ } }, 600);
  } catch { /* noop */ }
}

const audioCache: Record<string, HTMLAudioElement> = {};
function playUrlSound(url: string) {
  try {
    let a = audioCache[url];
    if (!a) { a = new Audio(url); audioCache[url] = a; }
    a.currentTime = 0;
    a.play().catch(() => playBeep());
  } catch { playBeep(); }
}

// Muestra un banner nativo. `soundUrl` opcional = mp3/wav configurado en el panel;
// si no hay, suena un ding por WebAudio (además del sonido propio del SO).
export function showDesktopNotification(opts: {
  title: string; body?: string; tag?: string; soundUrl?: string | null;
}) {
  if (!desktopNotificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body || '',
      tag: opts.tag,
      icon: '/favicon.png',
      badge: '/favicon.png',
      silent: !!opts.soundUrl, // si reproducimos MP3 propio, silenciamos el del SO para no duplicar
    });
    n.onclick = () => { try { window.focus(); } catch { /* noop */ } n.close(); };
    setTimeout(() => { try { n.close(); } catch { /* noop */ } }, 8000);
  } catch { /* noop */ }
  // Con sonido custom lo reproducimos nosotros (el banner va silent). Sin él, el
  // propio SO reproduce su tono de notificación (silent:false) — no duplicamos.
  if (opts.soundUrl) playUrlSound(opts.soundUrl);
}
