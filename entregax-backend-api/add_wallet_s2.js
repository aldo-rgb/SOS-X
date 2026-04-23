require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      `SELECT id, internal_code, name, email FROM users
       WHERE internal_code = 'S2' OR internal_code ILIKE '%-S2'
       ORDER BY id LIMIT 5`
    );

    if (userRes.rows.length === 0) {
      console.log('❌ No se encontró cliente con internal_code S2');
      await client.query('ROLLBACK');
      return;
    }

    console.log('Clientes encontrados:');
    console.table(userRes.rows);

    if (userRes.rows.length > 1) {
      console.log('⚠️  Hay múltiples, se aplicará al primero:', userRes.rows[0]);
    }

    const user = userRes.rows[0];
    const amount = 5600;

    // Asegurar fila wallet
    const wRes = await client.query(
      `INSERT INTO user_wallets (user_id, wallet_balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [user.id]
    );

    const updRes = await client.query(
      `UPDATE user_wallets
       SET wallet_balance = COALESCE(wallet_balance,0) + $2,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING wallet_balance`,
      [user.id, amount]
    );

    // Registrar transacción
    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, created_at)
       VALUES ($1, 'credit', $2, $3, $4, NOW())`,
      [user.id, amount, updRes.rows[0].wallet_balance, 'Abono manual administrativo']
    ).catch(err => console.log('(wallet_transactions no insertó:', err.message, ')'));

    await client.query('COMMIT');
    console.log(`✅ Saldo abonado a ${user.internal_code} (${user.name}). Nuevo balance: $${updRes.rows[0].wallet_balance}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
