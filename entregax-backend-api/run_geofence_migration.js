// Script simple para ejecutar la migración de geocerca
require('dotenv').config();
const { Pool } = require('pg');

// Soporta DATABASE_URL (Railway) o variables individuales
const poolConfig = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'entregax',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
    };

const pool = new Pool(poolConfig);

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Ejecutando migración de geocerca...\n');
        
        // 1. Agregar columnas a branches
        console.log('1️⃣ Agregando columnas a branches...');
        await client.query(`
            ALTER TABLE branches 
            ADD COLUMN IF NOT EXISTS latitud DECIMAL(10,8),
            ADD COLUMN IF NOT EXISTS longitud DECIMAL(11,8),
            ADD COLUMN IF NOT EXISTS radio_geocerca_metros INT DEFAULT 100,
            ADD COLUMN IF NOT EXISTS wifi_ssid VARCHAR(100),
            ADD COLUMN IF NOT EXISTS wifi_validation_enabled BOOLEAN DEFAULT false
        `);
        console.log('✅ Columnas agregadas a branches\n');

        // 2. Agregar columnas a employee_attendance
        console.log('2️⃣ Agregando columnas a employee_attendance...');
        try {
            await client.query(`
                ALTER TABLE employee_attendance
                ADD COLUMN IF NOT EXISTS latitud_registro DECIMAL(10,8),
                ADD COLUMN IF NOT EXISTS longitud_registro DECIMAL(11,8),
                ADD COLUMN IF NOT EXISTS distancia_metros DECIMAL(10,2),
                ADD COLUMN IF NOT EXISTS metodo_validacion VARCHAR(20) DEFAULT 'gps',
                ADD COLUMN IF NOT EXISTS mock_location_detectado BOOLEAN DEFAULT false
            `);
            console.log('✅ Columnas agregadas a employee_attendance\n');
        } catch (err) {
            if (err.message.includes('does not exist')) {
                console.log('⚠️ Tabla employee_attendance no existe, saltando...\n');
            } else {
                throw err;
            }
        }

        // 3. Crear índice
        console.log('3️⃣ Creando índice de ubicación...');
        try {
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_branches_location 
                ON branches (latitud, longitud) 
                WHERE latitud IS NOT NULL AND longitud IS NOT NULL
            `);
            console.log('✅ Índice creado\n');
        } catch (err) {
            console.log('⚠️ Índice ya existe\n');
        }

        // 4. Crear función haversine_distance
        console.log('4️⃣ Creando función haversine_distance...');
        await client.query(`
            CREATE OR REPLACE FUNCTION haversine_distance(
                lat1 DECIMAL(10,8), 
                lon1 DECIMAL(11,8), 
                lat2 DECIMAL(10,8), 
                lon2 DECIMAL(11,8)
            ) RETURNS DECIMAL(10,2) AS $func$
            DECLARE
                R CONSTANT DECIMAL := 6371000;
                dlat DECIMAL;
                dlon DECIMAL;
                a DECIMAL;
                c DECIMAL;
            BEGIN
                lat1 := RADIANS(lat1);
                lat2 := RADIANS(lat2);
                dlat := RADIANS(lat2 - lat1);
                dlon := RADIANS(lon2 - lon1);
                a := SIN(dlat/2) * SIN(dlat/2) + COS(lat1) * COS(lat2) * SIN(dlon/2) * SIN(dlon/2);
                c := 2 * ATAN2(SQRT(a), SQRT(1-a));
                RETURN R * c;
            END;
            $func$ LANGUAGE plpgsql IMMUTABLE
        `);
        console.log('✅ Función haversine_distance creada\n');

        // Verificar
        console.log('📋 Verificando columnas en branches:');
        const result = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'branches' 
            AND column_name IN ('latitud', 'longitud', 'radio_geocerca_metros', 'wifi_ssid', 'wifi_validation_enabled')
            ORDER BY column_name
        `);
        
        result.rows.forEach(row => console.log(`  ✅ ${row.column_name} (${row.data_type})`));
        
        console.log('\n🎉 ¡Migración completada exitosamente!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
