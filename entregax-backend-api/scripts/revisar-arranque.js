#!/usr/bin/env node
/**
 * ¿El backend va a arrancar?
 *
 * Revisa en el JavaScript compilado si algún `require()` quedó DESPUÉS del
 * primer uso de su binding. Suena teórico y no lo es: TypeScript emite cada
 * `require` en el lugar exacto donde está el `import`, no arriba del archivo.
 * index.ts tiene 17,000 líneas y 134 imports, varios a media página. Basta con
 * que uno de ellos se use en una ruta registrada antes para que Node truene con
 * "Cannot access 'X_1' before initialization" en el arranque — el proceso
 * muerto, 502 en toda la API, y ni un error de compilación que lo anuncie.
 *
 * Así estaban tres: poboxEntregaMostrador, poboxCajaHidalgo y authMiddleware.
 *
 * Por qué importa tenerlo en el build y no solo en la cabeza: el 11-sep-2026 se
 * subió una ruta que tumbaba el backend al registrarse, y no se detectó porque
 * arrancar el servidor en local YA estaba roto justamente por esto. Un arranque
 * local roto no es una molestia: es el detector de humo desconectado.
 *
 *   node scripts/revisar-arranque.js            (revisa dist/index.js)
 *   node scripts/revisar-arranque.js otro.js
 */
const fs = require('fs');
const path = require('path');

const archivo = process.argv[2] || path.join(__dirname, '..', 'dist', 'index.js');
if (!fs.existsSync(archivo)) {
  console.error(`No encontré ${archivo}. Compila primero (npm run build).`);
  process.exit(1);
}

const lineas = fs.readFileSync(archivo, 'utf8').split('\n');

// `const modulo_1 = require("./modulo");` — así emite TypeScript un import.
const declarado = new Map();
lineas.forEach((l, i) => {
  const m = l.match(/^const ([A-Za-z0-9_$]+_\d+) = require\((.+)\);\s*$/);
  if (m && !declarado.has(m[1])) declarado.set(m[1], { linea: i + 1, modulo: m[2] });
});

const malos = [];
for (const [binding, d] of declarado) {
  const re = new RegExp('\\b' + binding.replace(/\$/g, '\\$') + '\\b');
  for (let i = 0; i < d.linea - 1; i++) {
    if (re.test(lineas[i])) {
      malos.push({ modulo: d.modulo, usadoEn: i + 1, requireEn: d.linea });
      break;
    }
  }
}

if (malos.length === 0) {
  console.log(`✅ Arranque limpio: los ${declarado.size} require() están antes de usarse.`);
  process.exit(0);
}

console.error(`\n❌ ${malos.length} import(s) se usan ANTES de su require. El backend NO va a arrancar:\n`);
for (const m of malos.sort((a, b) => a.usadoEn - b.usadoEn)) {
  console.error(`   ${m.modulo.padEnd(36)} se usa en la línea ${m.usadoEn}, pero el require está hasta la ${m.requireEn}`);
}
console.error(`\nArréglalo subiendo esos import al principio de src/index.ts, con los demás.\n`);
process.exit(1);
