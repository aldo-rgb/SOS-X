const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

const PASSWORD = 'Entregax123';

// Función para generar código de referido
function generateReferralCode(name) {
    const firstName = name.split(' ')[0].toUpperCase().substring(0, 4);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${firstName}-${random}`;
}

// Función para generar box_id
function generateBoxId() {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ETX-${random}`;
}

// Asesores LÍDERES (sin capitán)
const lideres = [
    { nombre: 'Juan Leal', correo: 'juanleal@entregax.com.mx', telefono: '8126295671' },
    { nombre: 'Juan Carlos Segura', correo: 'juansegura@grupolsd.com', telefono: '8120029375' },
    { nombre: 'Raul Olvera', correo: 'raulolvera@entregax.com.mx', telefono: '8124274971' },
    { nombre: 'Atención a clientes', correo: 'javierpadilla@grupolsd.com', telefono: '8119411741' },
    { nombre: 'Andres Campos', correo: 'andrescampos@grupolsd.com', telefono: '8112762306' },
    { nombre: 'Angel Quiroz', correo: 'angelquiroz@entregax.com.mx', telefono: '8110458706' },
    { nombre: 'Aldo Campos', correo: 'aldocampos@entregax.com', telefono: '8119411741' },
    { nombre: 'Antonio Hernandez', correo: 'antoniohdz@entregax.com', telefono: '4426649164' },
    { nombre: 'Neida Arriaga', correo: 'admon@grupolsd.com', telefono: '8119033311' },
    { nombre: 'Jorge Campos', correo: 'jorgecampos@entregax.com.mx', telefono: '8112505054' },
    { nombre: 'Paula Campos', correo: 'mariapaula@entregax.com.mx', telefono: '8134035007' },
    { nombre: 'Jesus Campos', correo: 'jesuscampos@entregax.com.mx', telefono: '8119926431' },
    { nombre: 'Seryte Garcia', correo: 'themisgarcia@entregax.com.mx', telefono: '5534482611' },
    { nombre: 'Alberto Sanchez', correo: 'albertosanchez@entregax.com.mx', telefono: '8130756472' },
    { nombre: 'Christian Gonzalez', correo: 'christiangonzalez@entregax.com', telefono: '8118246119' },
    { nombre: 'Ricardo Mendez', correo: 'ricardomendez@entregax.com.mx', telefono: '8119794494' },
    { nombre: 'Christian Treviño Salas', correo: 'christiantrevino@entregax.com.mx', telefono: '8113812866' },
    { nombre: 'Aldo Entregax', correo: 'aldocampos@entregax.com', telefono: '8119411741' },
];

// Sub-asesores (con capitán)
const subasesores = [
    { nombre: 'Sergio Rey Guerrero Juan', correo: 'sergioguerrero@grupolsd.com.mx', telefono: '4427526294', capitan: 'Antonio Hernandez' },
    { nombre: 'Víctor García', correo: 'victorgarcia@grupolsd.com.mx', telefono: '3311410733', capitan: 'Antonio Hernandez' },
    { nombre: 'Ricardo Oscar Cortez Vera', correo: 'ricardocortez@entregax.com.mx', telefono: '3320454574', capitan: 'Raul Olvera' },
    { nombre: 'Yajahira Valenzuela', correo: 'yajahiravalenzuela@entregax.com.mx', telefono: '3318371907', capitan: 'Jorge Campos' },
    { nombre: 'Karinal Mireles Leal', correo: 'karina.mireles@grupolsd.com.mx', telefono: '8187771424', capitan: 'Jorge Campos' },
    { nombre: 'Alejandro Murillo Placensia', correo: 'alejandromurillo@entregax.com.mx', telefono: '8613510000', capitan: 'Jorge Campos' },
    { nombre: 'Pedro Hernadez', correo: 'pedrohernandez@entregax.com', telefono: '8112502716', capitan: 'Christian Gonzalez' },
    { nombre: 'Ayded Reséndiz Ángeles', correo: 'ayded@entregax.com.mx', telefono: '8115569589', capitan: 'Raul Olvera' },
    { nombre: 'Hugo Arellano', correo: 'hugoarellano@entregax.com.mx', telefono: '4411060154', capitan: 'Raul Olvera' },
    { nombre: 'Edith Gonzalez', correo: 'edithgonzalez@entregax.com.mx', telefono: '7715686706', capitan: 'Antonio Hernandez' },
    { nombre: 'Lizeth Laredo', correo: 'elaredo@entregax.com.mx', telefono: '8124178457', capitan: 'Juan Leal' },
    { nombre: 'Daniel Alberto Martinez', correo: 'nd.alberto@entregax.com.mx', telefono: '8119031639', capitan: 'Juan Leal' },
    { nombre: 'Jorge Gaona', correo: 'jorgegaona@entregax.com.mx', telefono: '8122049629', capitan: 'Juan Leal' },
    { nombre: 'Hugo Hernandez', correo: 'hugohernandez@entregax.com.mx', telefono: '8129436647', capitan: 'Christian Gonzalez' },
    { nombre: 'Mario Alberto Campos Salas', correo: 'mariocampos@entregax.com.mx', telefono: '8110121406', capitan: 'Jorge Campos' },
    { nombre: 'Marcelo González Márquez', correo: 'marcelogonzalez@entregax.com.mx', telefono: '4775180008', capitan: 'Christian Gonzalez' },
    { nombre: 'Pedro Ivan López Colin', correo: 'pedrolopez@entregax.com.mx', telefono: '2381192552', capitan: 'Jesus Campos' },
    { nombre: 'Andres Mireles', correo: 'andresmireles@entregax.com.mx', telefono: '8114733507', capitan: 'Andres Campos' },
    { nombre: 'Juan Gerardo Espronceda', correo: 'juanespronceda@entregax.com.mx', telefono: '8128603469', capitan: 'Jorge Campos' },
    { nombre: 'Daniel Ornelas', correo: 'danielornelas@entregax.com.mx', telefono: '8116905101', capitan: 'Andres Campos' },
    { nombre: 'Andres Villasana', correo: 'andresvillasana@entregax.com.mx', telefono: '8116644000', capitan: 'Juan Carlos Segura' },
    { nombre: 'Oscar Aldana', correo: 'oscaraldana@entregax.com.mx', telefono: '3320895654', capitan: null }, // Sin capitán, es líder
];

async function importAsesores() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Iniciando importación de asesores...\n');
        
        const hashedPassword = await bcrypt.hash(PASSWORD, 10);
        const lideresMap = new Map(); // Para guardar IDs de líderes
        
        // ========== PASO 1: Crear líderes ==========
        console.log('📊 PASO 1: Creando asesores LÍDERES...\n');
        
        for (const lider of lideres) {
            try {
                // Verificar si ya existe
                const exists = await client.query(
                    'SELECT id, full_name FROM users WHERE email = $1',
                    [lider.correo.toLowerCase()]
                );
                
                if (exists.rows.length > 0) {
                    console.log(`⚠️  ${lider.nombre} ya existe (${lider.correo})`);
                    lideresMap.set(lider.nombre, exists.rows[0].id);
                    continue;
                }
                
                const referralCode = generateReferralCode(lider.nombre);
                const boxId = generateBoxId();
                
                const result = await client.query(`
                    INSERT INTO users (full_name, email, phone, password, role, referral_code, box_id, created_at)
                    VALUES ($1, $2, $3, $4, 'advisor', $5, $6, NOW())
                    RETURNING id, full_name, referral_code
                `, [lider.nombre, lider.correo.toLowerCase(), lider.telefono, hashedPassword, referralCode, boxId]);
                
                lideresMap.set(lider.nombre, result.rows[0].id);
                console.log(`✅ LÍDER: ${result.rows[0].full_name} - Código: ${result.rows[0].referral_code}`);
                
            } catch (err) {
                console.error(`❌ Error con ${lider.nombre}:`, err.message);
            }
        }
        
        console.log(`\n📊 Total líderes procesados: ${lideresMap.size}\n`);
        
        // ========== PASO 2: Crear sub-asesores ==========
        console.log('📊 PASO 2: Creando SUB-ASESORES...\n');
        
        let subCreados = 0;
        for (const sub of subasesores) {
            try {
                // Verificar si ya existe
                const exists = await client.query(
                    'SELECT id FROM users WHERE email = $1',
                    [sub.correo.toLowerCase()]
                );
                
                if (exists.rows.length > 0) {
                    console.log(`⚠️  ${sub.nombre} ya existe (${sub.correo})`);
                    continue;
                }
                
                // Buscar ID del capitán/líder
                let leaderId = null;
                if (sub.capitan) {
                    leaderId = lideresMap.get(sub.capitan);
                    if (!leaderId) {
                        // Buscar en BD por nombre
                        const leaderSearch = await client.query(
                            "SELECT id FROM users WHERE full_name ILIKE $1 AND role IN ('advisor', 'asesor_lider')",
                            [`%${sub.capitan}%`]
                        );
                        if (leaderSearch.rows.length > 0) {
                            leaderId = leaderSearch.rows[0].id;
                        }
                    }
                }
                
                const referralCode = generateReferralCode(sub.nombre);
                const boxId = generateBoxId();
                const role = sub.capitan ? 'sub_advisor' : 'advisor';
                
                const result = await client.query(`
                    INSERT INTO users (full_name, email, phone, password, role, referral_code, referred_by_id, box_id, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                    RETURNING id, full_name, referral_code
                `, [sub.nombre, sub.correo.toLowerCase(), sub.telefono, hashedPassword, role, referralCode, leaderId, boxId]);
                
                subCreados++;
                const capitanInfo = sub.capitan ? `→ Capitán: ${sub.capitan}` : '(LÍDER)';
                console.log(`✅ SUB: ${result.rows[0].full_name} - Código: ${result.rows[0].referral_code} ${capitanInfo}`);
                
            } catch (err) {
                console.error(`❌ Error con ${sub.nombre}:`, err.message);
            }
        }
        
        console.log(`\n📊 Total sub-asesores creados: ${subCreados}`);
        console.log('\n🎉 ¡Importación completada!\n');
        
        // Mostrar resumen
        const totalAdvisors = await client.query(
            "SELECT COUNT(*) as total FROM users WHERE role IN ('advisor', 'sub_advisor', 'asesor', 'asesor_lider')"
        );
        console.log(`📈 Total de asesores en el sistema: ${totalAdvisors.rows[0].total}`);
        
    } catch (error) {
        console.error('Error general:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

importAsesores();
