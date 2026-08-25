/**
 * CORRIGE LAS ATRIBUCIONES DUDOSAS QUE DEJÓ EL BACKFILL
 *
 * El backfill confió en syncfy_transactions.matched_payment_id, y ese campo
 * viene con errores: el matcher del cron, cuando la referencia escrita en el
 * concepto correspondía a una orden ya pagada o cancelada, se caía a emparejar
 * por MONTO y elegía otra orden — a veces de otro cliente.
 *
 * Este script revisa cada aplicación reconstruida contra lo que dice el propio
 * concepto bancario, que es la evidencia más fuerte que existe:
 *
 *   · el concepto nombra la MISMA orden          → se deja (correcta)
 *   · el concepto nombra otra orden CANCELADA    → se deja. El cliente pagó
 *     citando una orden que él mismo canceló y regeneró; el dinero sí es de la
 *     orden vigente.
 *   · el concepto nombra otra orden que EXISTE   → se re-apunta a esa. No es
 *     adivinar: es leer la referencia que el cliente escribió.
 *   · el concepto nombra algo que no existe, o
 *     no trae referencia y el depósito es previo
 *     a la orden                                 → se revierte. Sin evidencia,
 *     mejor sin marcar que marcado mal.
 *
 * Revertir NO borra: deja el motivo, para que se pueda auditar qué se deshizo.
 * No toca órdenes, saldos ni pagos.
 *
 * Uso:  npx ts-node scripts/corregir_backfill_mal_atribuido.ts          → simulacro
 *       npx ts-node scripts/corregir_backfill_mal_atribuido.ts --apply
 */
require('dotenv').config();
import { pool } from '../src/db';

const APPLY = process.argv.includes('--apply');
const RE = /(RO|UW|PP|US|EP|GL)[-\s]?([A-F0-9]{8})(?![A-F0-9])/g;
const f = (n: any) => '$' + Number(n || 0).toFixed(2);

(async () => {
  const rows = (await pool.query(`
    SELECT a.id, a.payment_reference AS ref, a.payment_order_id, a.bank_entry_id,
           a.monto_aplicado, b.concepto, b.fecha, p.created_at AS orden_creada
      FROM bank_entry_applications a
      JOIN bank_statement_entries b ON b.id = a.bank_entry_id
      LEFT JOIN pobox_payments p ON p.id = a.payment_order_id
     WHERE a.reversed_at IS NULL AND a.origen = 'auto_syncfy'
     ORDER BY a.id`)).rows;

  const correctas: any[] = [], reapuntar: any[] = [], revertir: any[] = [], canceladas: any[] = [];

  for (const r of rows) {
    const refs = Array.from(String(r.concepto).toUpperCase().matchAll(RE)).map((m: any) => `${m[1]}-${m[2]}`);
    const propia = String(r.ref || '').toUpperCase();

    if (refs.includes(propia)) { correctas.push(r); continue; }

    if (refs.length === 0) {
      // Sin referencia: el único anclaje fue el monto. Solo se cuestiona si el
      // depósito entró antes de que la orden existiera — ahí es imposible.
      const dep = new Date(r.fecha), creada = r.orden_creada ? new Date(r.orden_creada) : null;
      if (creada && dep < new Date(creada.getTime() - 24 * 3600 * 1000)) {
        revertir.push({ ...r, motivo: `depósito del ${String(r.fecha).slice(0, 10)} anterior a la orden` });
      } else {
        correctas.push(r);
      }
      continue;
    }

    // El concepto nombra otra orden: se busca.
    const otra = (await pool.query(
      `SELECT id, payment_reference, status, amount FROM pobox_payments WHERE payment_reference = ANY($1)`,
      [refs]
    )).rows[0];

    if (!otra) {
      revertir.push({ ...r, motivo: `el concepto nombra ${refs.join(',')}, que no existe como orden` });
    } else if (['cancelled', 'expired'].includes(String(otra.status))) {
      canceladas.push({ ...r, nombrada: otra.payment_reference, estado: otra.status });
    } else {
      reapuntar.push({ ...r, nueva_id: otra.id, nueva_ref: otra.payment_reference, nuevo_estado: otra.status });
    }
  }

  console.log(`${APPLY ? 'APLICANDO' : 'SIMULACRO'} — ${rows.length} aplicaciones reconstruidas\n`);
  console.log(`  ${correctas.length}  el concepto confirma la orden (o no hay motivo para dudar) → se dejan`);
  console.log(`  ${canceladas.length}  nombran una orden cancelada por el propio cliente        → se dejan`);
  console.log(`  ${reapuntar.length}  el banco nombra OTRA orden vigente                        → se re-apuntan`);
  console.log(`  ${revertir.length}  sin evidencia                                             → se revierten\n`);

  if (reapuntar.length) {
    console.log('  RE-APUNTAR (lo que el cliente escribió manda sobre el monto):');
    reapuntar.forEach(x => console.log(`    #${x.id} ${f(x.monto_aplicado).padStart(12)}  ${x.ref} → ${x.nueva_ref} (${x.nuevo_estado})`));
  }
  if (revertir.length) {
    console.log('\n  REVERTIR:');
    revertir.forEach(x => console.log(`    #${x.id} ${f(x.monto_aplicado).padStart(12)}  ${x.ref} — ${x.motivo}`));
  }
  if (canceladas.length) {
    console.log('\n  SE DEJAN (la orden nombrada está cancelada, el dinero sí es de la vigente):');
    canceladas.forEach(x => console.log(`    #${x.id} ${x.ref}  el concepto dice ${x.nombrada} (${x.estado})`));
  }

  if (!APPLY) { console.log('\nSin cambios. Corre con --apply.'); await pool.end(); return; }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const x of reapuntar) {
      await c.query(
        `UPDATE bank_entry_applications
            SET payment_order_id = $2, payment_reference = $3::text,
                -- El cast es necesario: sin él Postgres no puede deducir el tipo
                -- de $3, que se usa como varchar y dentro de una concatenación.
                nota = COALESCE(nota, '') || ' · Re-apuntada: el concepto bancario nombra ' || $3::text || ', no ' || $4::text
          WHERE id = $1`,
        [x.id, x.nueva_id, x.nueva_ref, x.ref]
      );
    }
    for (const x of revertir) {
      await c.query(
        `UPDATE bank_entry_applications
            SET reversed_at = NOW(), reversed_motivo = $2
          WHERE id = $1`,
        [x.id, `Backfill sin evidencia: ${x.motivo}`]
      );
    }
    await c.query('COMMIT');
  } catch (e: any) {
    await c.query('ROLLBACK');
    console.error('ERROR, se revirtió todo:', e.message);
    c.release(); await pool.end(); return;
  }
  c.release();

  console.log(`\nRe-apuntadas: ${reapuntar.length}   revertidas: ${revertir.length}`);
  const v = await pool.query(
    `SELECT COUNT(*) vigentes, COALESCE(SUM(monto_aplicado),0) total
       FROM bank_entry_applications WHERE reversed_at IS NULL`);
  console.log('Ledger:', v.rows[0]);
  await pool.end();
})();
