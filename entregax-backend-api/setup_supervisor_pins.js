// ============================================
// CONFIGURACIÓN DE PINs DE SUPERVISORES
// ============================================

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setup() {
    const client = await pool.connect();
    
    try {
        console.log('🔐 Configurando sistema de PINs de supervisor...\n');
        
        // 1. Crear tabla de autorizaciones si no existe
        console.log('📋 Creando tabla supervisor_authorizations...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS supervisor_authorizations (
                id SERIAL PRIMARY KEY,
                supervisor_id INTEGER,
                supervisor_name VARCHAR(255),
                requester_id INTEGER,
                branch_id INTEGER,
                action_type VARCHAR(50) NOT NULL DEFAULT 'dhl_reception',
                success BOOLEAN NOT NULL DEFAULT FALSE,
                ip_address VARCHAR(45),
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);
        console.log('✅ Tabla supervisor_authorizations creada\n');
        
        // 2. Crear índices
        console.log('🔍 Creando índices...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_supervisor_auth_date ON supervisor_authorizations(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_supervisor_auth_branch ON supervisor_authorizations(branch_id);
            CREATE INDEX IF NOT EXISTS idx_supervisor_auth_supervisor ON supervisor_authorizations(supervisor_id);
        `);
        console.log('✅ Índices creados\n');
        
        // 3. Verificar/crear columna supervisor_pin
        console.log('🔐 Verificando columna supervisor_pin...');
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS supervisor_pin VARCHAR(10)
        `);
        console.log('✅ Columna supervisor_pin verificada\n');
        
        // 4. Asignar PINs
        console.log('👤 Configurando PINs de supervisores...\n');
        
        // PIN para operaciones@entregax.com
        const operaciones = await client.query(`
            SELECT id, full_name, email, role, supervisor_pin FROM users WHERE email = 'operaciones@entregax.com'
        `);
        
        if (operaciones.rows.length > 0) {
            const user = operaciones.rows[0];
            if (!user.supervisor_pin) {
                await client.query(`
                    UPDATE users SET supervisor_pin = '2025' WHERE email = 'operaciones@entregax.com'
                `);
                console.log(`✅ PIN '2025' asignado a ${user.full_name} (${user.email})`);
            } else {
                console.log(`ℹ️  ${user.full_name} ya tiene PIN: ${user.supervisor_pin}`);
            }
        } else {
            console.log('⚠️  Usuario operaciones@entregax.com no encontrado');
        }
        
        // PIN por defecto para super_admins que no tengan
        const updated = await client.query(`
            UPDATE users SET supervisor_pin = '1234' 
            WHERE role = 'super_admin' AND supervisor_pin IS NULL
            RETURNING email, full_name
        `);
        
        if (updated.rows.length > 0) {
            console.log('\n📌 PINs por defecto asignados a super admins:');
            updated.rows.forEach(u => console.log(`   - ${u.full_name} (${u.email}) → PIN: 1234`));
        }
        
        // 5. Listar todos los supervisores con PIN
        console.log('\n📋 Lista actual de supervisores con PIN:\n');
        const supervisors = await client.query(`
            SELECT id, full_name, email, role, supervisor_pin, branch_id
            FROM users 
            WHERE supervisor_pin IS NOT NULL
            ORDER BY role, full_name
        `);
        
        console.log('┌────────────────────────────────────────────────────────────────────────────────┐');
        console.log('│ ID   │ Nombre                         │ Email                        │ PIN    │');
        console.log('├────────────────────────────────────────────────────────────────────────────────┤');
        
        supervisors.rows.forEach(s => {
            const id = String(s.id).padEnd(4);
            const name = (s.full_name || 'N/A').substring(0, 30).padEnd(30);
            const email = (s.email || 'N/A').substring(0, 28).padEnd(28);
            const pin = s.supervisor_pin.padEnd(6);
            console.log(`│ ${id} │ ${name} │ ${email} │ ${pin} │`);
        });
        
        console.log('└────────────────────────────────────────────────────────────────────────────────┘');
        console.log(`\n✅ Total: ${supervisors.rows.length} supervisores con PIN configurado`);
        
        console.log('\n🎉 Configuración completada exitosamente!');
        console.log('\n📝 Notas:');
        console.log('   - Los gerentes pueden cambiar su PIN desde la app móvil');
        console.log('   - Cada autorización queda registrada en supervisor_authorizations');
        console.log('   - Los admins pueden ver el historial de autorizaciones');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

setup().catch(console.error);
