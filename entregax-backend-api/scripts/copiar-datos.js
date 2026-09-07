#!/usr/bin/env node
/**
 * Copia src/data → dist/data después de compilar.
 *
 * tsc no copia archivos que no sean TypeScript, así que sin esto el
 * cambios.json que lee Cajito existe en src pero no en el contenedor, y la
 * herramienta devuelve una lista vacía sin decir por qué.
 */
const fs = require('fs');
const path = require('path');

const origen = path.join(__dirname, '..', 'src', 'data');
const destino = path.join(__dirname, '..', 'dist', 'data');
if (!fs.existsSync(origen)) { console.log('[build] no hay src/data, nada que copiar'); process.exit(0); }
fs.mkdirSync(destino, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(origen)) {
  fs.copyFileSync(path.join(origen, f), path.join(destino, f));
  n++;
}
console.log(`[build] ${n} archivo(s) copiados a dist/data`);
