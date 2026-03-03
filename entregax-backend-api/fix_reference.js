const { Pool } = require('pg');

const pool = new Pool({ 
  connectionString: 'postgresql://postgres:kSJFfASjlkl234kljsaJF98SADjkjasf@switchback.proxy.rlwy.net:54834/railway'
});

async function fixReference() {
  try {
    const result = await pool.query(
      "UPDATE containers SET reference = 'JSM26-0013' WHERE reference = '0013' RETURNING id, container_number, reference"
    );
    console.log('Actualizado:', result.rows);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixReference();
