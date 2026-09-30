/**
 * Prueba que la cuenta de Paquete Express de una sucursal pueda entrar.
 *
 * Existe porque una contraseña mal capturada no se nota hasta que alguien
 * intenta generar una guía: la de Monterrey está guardada en base64 y quien da
 * de alta otra cuenta pega lo que le dieron, en texto plano. Esto lo dice antes.
 *
 * Uso:
 *   PQTX_CDMX_USER=... PQTX_CDMX_PASSWORD=... npx ts-node --transpile-only scripts/probar-cuenta-pqtx.ts CDMX
 *
 * O, si ya están en el .env local, nada más:
 *   npx ts-node --transpile-only scripts/probar-cuenta-pqtx.ts CDMX
 *
 * NUNCA imprime la contraseña, solo en qué formato funcionó.
 */
import axios from 'axios';
import { pool } from '../src/db';
import { credencialesDe, formasDePassword, remitenteDeSucursal } from '../src/pqtxSucursal';

// El mismo valor por omisión que usa el backend. Ojo: si PQTX_BASE_URL no está
// definida se apunta a QA, y ahí la cuenta de producción no necesariamente entra.
const BASE_URL = process.env.PQTX_BASE_URL || 'https://qaglp.paquetexpress.com.mx';
const ES_QA = BASE_URL.includes('qa');

/**
 * El motivo del rechazo, legible. Paquete Express a veces manda un objeto y a
 * veces una lista; interpolarlo tal cual imprimía "[object Object]", que no
 * ayuda a nadie a saber si la contraseña está mal o el usuario no existe.
 */
function motivo(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map(motivo).filter(Boolean).join(' · ');
  const directo = v.desTrans || v.message || v.messages || v.description || v.error;
  if (directo && directo !== v) return motivo(directo);
  if (v.header) return motivo(v.header);
  try { return JSON.stringify(v).slice(0, 300); } catch { return String(v); }
}

async function main() {
  const sucursal = (process.argv[2] || 'CDMX').toUpperCase();
  const cred = credencialesDe(sucursal);
  const rem = await remitenteDeSucursal(sucursal);

  console.log(`\nSucursal ${sucursal}`);
  console.log(`  usuario:    ${cred.user}`);
  console.log(`  cliente:    ${cred.billClientId}`);
  console.log(`  contraseña: ${cred.password ? `capturada (${cred.password.length} caracteres)` : 'NO HAY'}`);
  console.log(`  origen:     CP ${rem.zip}, ${rem.col}, ${rem.street} ${rem.num} (${rem.city}, ${rem.state})`);

  const propia = !!process.env[`PQTX_${sucursal}_USER`];
  if (!propia && sucursal !== 'MTY') {
    console.log(`\n  ⚠️  No hay PQTX_${sucursal}_USER: se está probando la cuenta general (la de Monterrey).`);
  }

  const url = `${BASE_URL}/RadRestFul/api/rad/loginv1/login`;
  const formas = formasDePassword(cred.password);
  console.log(`\nAmbiente: ${ES_QA ? 'QA (pruebas)' : 'PRODUCCIÓN'} — ${BASE_URL}`);
  if (ES_QA) {
    console.log(`  ⚠️  Es el ambiente de pruebas. Para probar la cuenta real hay que`);
    console.log(`      pasar PQTX_BASE_URL con el mismo valor que tiene en Railway.`);
  }
  console.log(`\nProbando login (${formas.length} formato${formas.length > 1 ? 's' : ''} de contraseña)...`);

  for (let i = 0; i < formas.length; i++) {
    const comoSeMando = formas[i] === cred.password ? 'tal cual está guardada' : 'codificada en base64';
    try {
      const r = await axios.post(url, { header: { security: { user: cred.user, password: formas[i] } } },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
      const resp = r.data?.body?.response;
      const token = resp?.data?.token
        || (r.data?.header?.staTrans === 'ok' && typeof resp === 'string' ? resp : null);
      if (token) {
        console.log(`\n✅ Entró, mandando la contraseña ${comoSeMando}.`);
        console.log(`   Token recibido (${String(token).length} caracteres). No hay que cambiar nada en Railway.`);
        if (i > 0) {
          console.log(`   Nota: funcionó en el segundo intento. El backend hace lo mismo, así que está bien así.`);
        }
        return;
      }
      console.log(`   ✗ ${comoSeMando}: ${motivo(resp?.messages) || motivo(r.data?.header?.desTrans) || 'rechazada sin detalle'}`);
    } catch (e: any) {
      console.log(`   ✗ ${comoSeMando}: ${motivo(e?.response?.data) || e?.message || 'error de red'}`);
    }
  }

  console.log(`\n❌ Ningún formato entró con el usuario ${cred.user}.`);
  console.log(`   Revisa PQTX_${sucursal}_USER y PQTX_${sucursal}_PASSWORD en Railway.`);
  console.log(`   Mientras no entre, las guías de ${sucursal} salen con la cuenta de Monterrey`);
  console.log(`   pero ya con el domicilio de ${sucursal}, así que la operación no se detiene.`);
}

main()
  .catch((e) => console.error('\nError inesperado:', e?.message))
  .finally(() => pool.end());
