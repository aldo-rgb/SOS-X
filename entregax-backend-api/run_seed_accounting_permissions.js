// Ejecuta la migración de permisos del módulo Contable
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', 'seed_accounting_permissions.sql'),
    'utf8'
  );
  try {
    console.log('▶️  Aplicando seed de permisos contables...');
    await pool.query(sql);
    const { rows } = await pool.query(
      "SELECT slug, name, category FROM permissions WHERE slug LIKE 'accounting.%' ORDER BY slug"
    );
    console.log(`✅ Permisos contables en BD: ${rows.length}`);
    rows.forEach(r => console.log(`   - ${r.slug}  (${r.name})`));
    const { rows: assigns } = await pool.query(
      `SELECT rp.role, COUNT(*)::int AS total
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.slug LIKE 'accounting.%'
       GROUP BY rp.role
       ORDER BY rp.role`
    );
    console.log('👥 Asignaciones por rol:');
    assigns.forEach(a => console.log(`   - ${a.role}: ${a.total}`));
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
