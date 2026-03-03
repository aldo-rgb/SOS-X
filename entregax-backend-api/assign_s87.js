const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function assignContainers() {
  // Buscar el user_id del cliente S87
  const legacyRes = await pool.query("SELECT id, box_id, full_name, claimed_by_user_id FROM legacy_clients WHERE box_id = 'S87'");
  console.log('Cliente S87:', legacyRes.rows[0]);
  
  const legacy = legacyRes.rows[0];
  let userId = legacy.claimed_by_user_id;
  
  // Si no tiene claimed_by_user_id, buscar usuario con ese box_id
  if (!userId) {
    const userRes = await pool.query("SELECT id, full_name FROM users WHERE box_id = 'S87'");
    if (userRes.rows.length > 0) {
      userId = userRes.rows[0].id;
      console.log('Usuario encontrado:', userRes.rows[0]);
    }
  }
  
  console.log('User ID a asignar:', userId);
  
  // Lista de contenedores a actualizar
  const containers = [
    'WHSU6590528',
    'WHSU8038035', 
    'WHSU8015030',
    'WHSU6318016',
    'WHSU8172126',
    'WHSU8393410',
    'FFAU7207311',
    'TEMU6147144'
  ];
  
  // Actualizar cada contenedor
  for (const containerNum of containers) {
    const result = await pool.query(
      'UPDATE containers SET client_user_id = $1 WHERE container_number = $2 RETURNING id, container_number',
      [userId, containerNum]
    );
    if (result.rows.length > 0) {
      console.log('✅ Asignado:', result.rows[0].container_number);
    } else {
      console.log('⚠️ No encontrado:', containerNum);
    }
  }
  
  await pool.end();
  console.log('\n✅ Todos los contenedores asignados a S87');
}

assignContainers();
