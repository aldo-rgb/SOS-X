// Borra todos los paquetes con status='received' en branch_id=1 (CEDIS HIDALGO/MONTERREY)
// junto con sus relaciones en otras tablas.
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ids = await client.query(`
      SELECT id, tracking_internal FROM packages
      WHERE status = 'received' AND current_branch_id = 1
      ORDER BY id
    `);

    if (ids.rows.length === 0) {
      console.log('Nada que borrar.');
      await client.query('COMMIT');
      return;
    }

    const idList = ids.rows.map(r => r.id);
    console.log(`🗑️  Borrando ${idList.length} paquetes:`);
    ids.rows.forEach(r => console.log(`   - id=${r.id} ${r.tracking_internal}`));

    // 1) Borrar relaciones primero
    const tables = [
      'caja_chica_aplicacion_pagos',
      'delivery_documents',
      'china_status_history',
      'package_history',
    ];

    for (const t of tables) {
      const r = await client.query(
        `DELETE FROM ${t} WHERE package_id = ANY($1::int[])`,
        [idList]
      );
      console.log(`   borrado ${r.rowCount} filas de ${t}`);
    }

    // 2) Limpiar referencias de master/child antes de borrar (master_id apunta a packages.id)
    await client.query(
      `UPDATE packages SET master_id = NULL WHERE master_id = ANY($1::int[])`,
      [idList]
    );

    // 3) Borrar paquetes
    const del = await client.query(
      `DELETE FROM packages WHERE id = ANY($1::int[])`,
      [idList]
    );
    console.log(`✅ Paquetes borrados: ${del.rowCount}`);

    await client.query('COMMIT');
    console.log('✅ Transacción confirmada');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error, ROLLBACK:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
