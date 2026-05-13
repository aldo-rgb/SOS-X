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
    console.log(`\n🔍 Buscando paquetes huérfanos (master_id apunta a un master inexistente)...\n`);

    // Huérfanos: tienen master_id pero ese master_id ya no existe en packages
    // O su master existe pero NO tiene is_master = true (master fue alterado)
    const orphans = await client.query(`
      SELECT
        p.id,
        p.tracking_internal,
        p.master_id,
        p.client_id,
        p.status,
        p.created_at,
        m.id AS master_exists,
        m.is_master AS master_is_master_flag
      FROM packages p
      LEFT JOIN packages m ON m.id = p.master_id
      WHERE p.master_id IS NOT NULL
        AND (m.id IS NULL OR m.is_master = false)
      ORDER BY p.created_at DESC
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
        master_existe: r.master_exists ? 'sí (pero is_master=false)' : 'NO',
        client_id: r.client_id,
        status: r.status,
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
