// Lista los contenedores del cliente CAJO (box S87)
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const u = await pool.query(`SELECT id, full_name, box_id FROM users WHERE box_id = 'S87' LIMIT 1`);
    if (u.rows.length === 0) { console.log('❌ No existe usuario con box S87'); process.exit(1); }
    const user = u.rows[0];
    console.log(`👤 Cliente: #${user.id} ${user.full_name} (${user.box_id})\n`);

    const c = await pool.query(
      `SELECT id, container_number, bl_number, reference_code, week_number,
              vessel_name, voyage_number, status, eta,
              total_weight_kg, total_cbm,
              created_at
         FROM containers
        WHERE client_user_id = $1
        ORDER BY created_at DESC`,
      [user.id]
    );

    console.log(`📦 Total contenedores asociados: ${c.rows.length}\n`);

    // Resumen por status
    const byStatus = c.rows.reduce((acc, r) => { acc[r.status] = (acc[r.status]||0)+1; return acc; }, {});
    console.log('📊 Resumen por status:');
    Object.entries(byStatus).forEach(([s, n]) => console.log(`   · ${s}: ${n}`));
    console.log('');

    console.log('# | REF | CONTAINER | BL | WEEK | BUQUE/VIAJE | STATUS | ETA | KG | CBM');
    console.log('-'.repeat(120));
    c.rows.forEach((r, i) => {
      const eta = r.eta ? new Date(r.eta).toISOString().slice(0,10) : '—';
      console.log(
        `${String(i+1).padStart(3,' ')} | ${r.reference_code||'—'} | ${r.container_number||'—'} | ${r.bl_number||'—'} | ${r.week_number||'—'} | ${(r.vessel_name||'—')+' / '+(r.voyage_number||'—')} | ${r.status} | ${eta} | ${r.total_weight_kg||'—'} | ${r.total_cbm||'—'}`
      );
    });
  } catch (err) {
    console.error('💥', err.message);
  } finally {
    await pool.end();
  }
})();
