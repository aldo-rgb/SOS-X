#!/usr/bin/env node
/**
 * Genera src/data/cambios.json a partir del historial de git.
 *
 * Existe porque Cajito necesita poder contestar "qué cambió esta semana" y los
 * commits viven en git, no en la base. El contenedor de Railway no trae git, así
 * que el archivo se genera aquí, se commitea, y el backend lo siembra al
 * arrancar. Correr esto antes de anunciar cambios:
 *
 *   node scripts/generar-cambios.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DESDE = process.argv[2] || '2026-06-01';
const SEP_CAMPO = '\x1f';
const SEP_REG = '\x1e';

const crudo = execSync(
  `git log --since="${DESDE}" --date=short --pretty=format:'%H${SEP_CAMPO}%ad${SEP_CAMPO}%s${SEP_CAMPO}%b${SEP_REG}'`,
  { cwd: path.join(__dirname, '..', '..'), maxBuffer: 64 * 1024 * 1024 }
).toString();

const cambios = [];
for (const reg of crudo.split(SEP_REG)) {
  if (!reg.trim()) continue;
  const [sha, fecha, titulo, cuerpo = ''] = reg.replace(/^\n/, '').split(SEP_CAMPO);
  if (!sha || !titulo) continue;
  const m = /^(feat|fix|chore|refactor|docs|perf)\(([^)]+)\):\s*(.+)$/.exec(titulo);
  const tipo = m ? m[1] : 'otro';
  const area = m ? m[2] : 'general';
  // Qué NO se anuncia nunca: trabajo interno que nadie fuera del equipo nota.
  // Un refactor o un script no cambian nada en la pantalla de nadie, y meterlos
  // en un comunicado entrena a la gente a no leerlos.
  const INTERNO = ['chore', 'refactor', 'docs'];
  const AREAS_INTERNAS = ['scripts', 'build', 'ci', 'deps', 'infra', 'tipos', 'lint'];
  const anunciable = !INTERNO.includes(tipo) && !AREAS_INTERNAS.includes(area.toLowerCase());

  cambios.push({
    sha: sha.slice(0, 12),
    fecha,
    tipo,
    area,
    titulo: m ? m[3] : titulo,
    detalle: cuerpo.replace(/Co-Authored-By:.*/gi, '').trim().slice(0, 1200),
    anunciable,
  });
}

const destino = path.join(__dirname, '..', 'src', 'data', 'cambios.json');
fs.writeFileSync(destino, JSON.stringify(cambios, null, 1));
console.log(`${cambios.length} cambios escritos en src/data/cambios.json (desde ${DESDE})`);
