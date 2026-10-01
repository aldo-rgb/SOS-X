/**
 * Registra un número de WhatsApp en la nube de Meta.
 *
 * Un número agregado a la cuenta de WhatsApp Business queda en "Pendiente" y no
 * puede mandar ni recibir hasta que se REGISTRA con un PIN de 6 dígitos. Eso es
 * lo que pide el aviso "Registra este número de teléfono con la API de
 * registro": no es un error, es un paso que falta.
 *
 * Uso — primero ver qué números hay y en qué estado:
 *   WHATSAPP_ACCESS_TOKEN="$(pbpaste)" npx ts-node --transpile-only \
 *     scripts/registrar-numero-whatsapp.ts listar
 *
 * Y después registrar el que esté pendiente:
 *   WHATSAPP_ACCESS_TOKEN="$(pbpaste)" npx ts-node --transpile-only \
 *     scripts/registrar-numero-whatsapp.ts registrar <PHONE_NUMBER_ID> <PIN>
 *
 * El token NO se imprime nunca. El PIN tampoco.
 *
 * Sobre el PIN: es el de verificación en dos pasos del número. Si nunca tuvo,
 * se elige uno aquí y ése queda. Anótalo: se pide de nuevo al mover el número
 * de cuenta y no hay forma de consultarlo después.
 */
const VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const TOKEN = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
const WABA = (process.env.WHATSAPP_WABA_ID || '').trim();

const pedir = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const cuerpo: any = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, cuerpo };
};

async function listar() {
  if (!WABA) {
    console.error('Falta WHATSAPP_WABA_ID. Pásala igual que el token:');
    console.error('  WHATSAPP_WABA_ID=... WHATSAPP_ACCESS_TOKEN="$(pbpaste)" npx ts-node ... listar');
    return;
  }
  const r = await pedir(
    `https://graph.facebook.com/${VERSION}/${WABA}/phone_numbers` +
    `?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,status`);
  if (!r.ok) {
    console.error(`No se pudo listar (HTTP ${r.status}): ${r.cuerpo?.error?.message || JSON.stringify(r.cuerpo).slice(0, 300)}`);
    return;
  }
  const nums = r.cuerpo?.data || [];
  console.log(`\n${nums.length} número(s) en la cuenta:\n`);
  for (const n of nums) {
    console.log(`  ${String(n.display_phone_number || '').padEnd(20)} ${String(n.verified_name || '').padEnd(24)}`);
    console.log(`     id: ${n.id}`);
    console.log(`     estado: ${n.status || '(sin estado)'} · verificación: ${n.code_verification_status || '—'} · calidad: ${n.quality_rating || '—'}`);
    if (String(n.status || '').toUpperCase() !== 'CONNECTED') {
      console.log(`     ⚠️  este es el que hay que registrar`);
    }
    console.log('');
  }
}

async function registrar(phoneId: string, pin: string) {
  if (!/^\d{6}$/.test(pin)) {
    console.error('El PIN debe ser de 6 dígitos.');
    return;
  }
  const r = await pedir(`https://graph.facebook.com/${VERSION}/${phoneId}/register`, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  });
  if (r.ok && r.cuerpo?.success) {
    console.log(`✅ Registrado. El número ${phoneId} ya puede mandar y recibir.`);
    console.log('   Guarda el PIN: se vuelve a pedir si el número cambia de cuenta y no se puede consultar.');
    return;
  }
  const err = r.cuerpo?.error || {};
  console.error(`❌ No se registró (HTTP ${r.status}).`);
  console.error(`   ${err.message || JSON.stringify(r.cuerpo).slice(0, 400)}`);
  // Los tres errores que salen de verdad, traducidos.
  const sub = Number(err.error_subcode || 0);
  if (sub === 2388004 || /incorrect pin/i.test(String(err.message))) {
    console.error('   → El número YA tenía un PIN de dos pasos y no es el que mandaste.');
    console.error('     Si no lo recuerdas, hay que borrar la verificación en dos pasos desde');
    console.error('     WhatsApp Manager y esperar; Meta impone una espera antes de poder reintentar.');
  } else if (/rate limit|too many/i.test(String(err.message))) {
    console.error('   → Demasiados intentos. Meta bloquea el registro un rato después de varios fallos.');
  } else if (Number(err.code) === 190) {
    console.error('   → El token no sirve o caducó. Genera uno nuevo en Meta Business.');
  }
}

(async () => {
  if (!TOKEN) {
    console.error('Falta WHATSAPP_ACCESS_TOKEN. Pásalo sin pegarlo en ningún archivo:');
    console.error('  WHATSAPP_ACCESS_TOKEN="$(pbpaste)" npx ts-node --transpile-only scripts/registrar-numero-whatsapp.ts listar');
    process.exit(1);
  }
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'listar') return listar();
  if (cmd === 'registrar' && a && b) return registrar(a, b);
  console.log('Uso:');
  console.log('  ... registrar-numero-whatsapp.ts listar');
  console.log('  ... registrar-numero-whatsapp.ts registrar <PHONE_NUMBER_ID> <PIN de 6 dígitos>');
})();
