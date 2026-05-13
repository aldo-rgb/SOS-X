/**
 * cleanup_orphan_children.js
 *
 * Encuentra y opcionalmente elimina paquetes hijos (master_id IS NOT NULL)
 * cuyo master ya NO existe en la tabla packages.
 *
 * Causa raíz: bug previo en deletePackage hacía `UPDATE packages SET master_id = NULL`
 * en vez de borrar las hijas, dejándolas huérfanas. El bug ya está corregido,
 * pero las huérfanas previas necesitan limpiarse.
 *
 * Uso:
 *   node cleanup_orphan_children.js          → dry-run (sólo lista)
 *   node cleanup_orphan_children.js --apply  → elimina las huérfanas
 */
require('dotenv').config();
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

(async () => {
  const client = await pool.connect();
  try {
    console.log(`\n🔍 Buscando paquetes huérfanos de multi-piece...\n`);

    // Dos tipos de huérfanos:
    // (a) master_id apunta a un id que ya no existe o que ya no es master
    // (b) total_boxes > 1, box_number > 1, master_id IS NULL  (bug previo: UPDATE SET master_id=NULL)
    //     y no existe ningún master_id válido para esa caja
    const orphans = await client.query(`
      WITH multi AS (
        SELECT
          p.id,
          p.tracking_internal,
          p.master_id,
          p.user_id,
          p.status,
          p.is_master,
          p.box_number,
          p.total_boxes,
          p.created_at,
          m.id AS master_exists,
          m.is_master AS master_is_master_flag
        FROM packages p
        LEFT JOIN packages m ON m.id = p.master_id
        WHERE
          -- Caso A: master_id apunta a algo inválido
          (p.master_id IS NOT NULL AND (m.id IS NULL OR m.is_master = false))
          OR
          -- Caso B: multi-piece (total_boxes>1) que NO es master y NO tiene master_id
          (
            COALESCE(p.total_boxes, 1) > 1
            AND COALESCE(p.is_master, false) = false
            AND p.master_id IS NULL
          )
      )
      SELECT * FROM multi
      ORDER BY tracking_internal, box_number
    `);

    if (orphans.rows.length === 0) {
      console.log('✅ No se encontraron paquetes huérfanos.');
      return;
    }

    console.log(`⚠️  Encontrados ${orphans.rows.length} paquetes huérfanos:\n`);
    console.table(
      orphans.rows.map((r) => ({
        id: r.id,
        tracking: r.tracking_internal,
        master_id: r.master_id,
        box: `${r.box_number}/${r.total_boxes}`,
        user_id: r.user_id,
        status: r.status,
        razon: r.master_id ? (r.master_exists ? 'master no es master' : 'master borrado') : 'huerfana sin master_id',
        created: r.created_at?.toISOString?.()?.slice(0, 10),
      }))
    );

    if (!APPLY) {
      console.log('\nℹ️  Modo dry-run. Para eliminar estos paquetes ejecuta:');
      console.log('    node cleanup_orphan_children.js --apply\n');
      return;
    }

    console.log('\n🗑️  Eliminando huérfanos en cascada (con dependencias)...\n');
    await client.query('BEGIN');

    const ids = orphans.rows.map((r) => r.id);
    const relatedTables = [
      'caja_chica_aplicacion_pagos',
      'delivery_documents',
      'china_status_history',
      'package_history',
    ];
    for (const t of relatedTables) {
      try {
        const r = await client.query(`DELETE FROM ${t} WHERE package_id = ANY($1::int[])`, [ids]);
        console.log(`   ${t}: ${r.rowCount} filas borradas`);
      } catch (e) {
        console.log(`   ${t}: skip (${e.message?.slice(0, 60) || 'no existe'})`);
      }
    }

    const del = await client.query('DELETE FROM packages WHERE id = ANY($1::int[])', [ids]);
    console.log(`\n✅ Eliminados ${del.rowCount} paquetes huérfanos.`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
