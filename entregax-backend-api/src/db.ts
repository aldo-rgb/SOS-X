import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Cargar .env desde el directorio raíz del proyecto
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Configuración de conexión - soporta DATABASE_URL (Railway/producción) o variables individuales (desarrollo)
const poolConfig = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000,
        max: 20,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        allowExitOnIdle: false,
    }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT || '5432'),
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
    };

// Creamos un "Pool" de conexiones (Es como tener varias líneas telefónicas listas)
export const pool = new Pool(poolConfig);

// ── Migraciones de arranque que no tumban el sistema ──
// Cada arranque corre ~300 "ALTER TABLE … ADD COLUMN IF NOT EXISTS". Aunque la
// columna ya exista, el ALTER pide el candado EXCLUSIVO de la tabla. Si una
// consulta vieja lo tiene tomado, el ALTER se forma detrás, y detrás del ALTER
// se forman TODAS las consultas a esa tabla: el sistema entero deja de
// responder. Pasó dos veces el 11-sep-2026 con packages y users, por una
// conexión que dejó colgada la instancia anterior al redeploy.
//
// Con lock_timeout el ALTER se rinde a los 3 s en vez de formarse. Casi siempre
// la columna ya existía; por si fuera nueva, se reintenta en segundo plano.
const ESPERA_CANDADO_MIGRACION = '3s';
const REINTENTOS_MIGRACION = 5;
const esMigracionDeColumna = (sql: unknown): sql is string =>
    typeof sql === 'string' && /^\s*ALTER\s+TABLE\b[\s\S]*\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/i.test(sql);
const queryOriginal = pool.query.bind(pool) as (...args: any[]) => any;
const intentosMigracion = new Map<string, number>();

async function correrMigracionConEspera(args: any[]): Promise<any> {
    const sql = args[0] as string;
    const client = await pool.connect();
    try {
        await client.query(`SET lock_timeout = '${ESPERA_CANDADO_MIGRACION}'`);
        return await (client.query as any)(...args);
    } catch (e: any) {
        if (e?.code !== '55P03') throw e; // 55P03 = no se consiguió el candado
        const intento = (intentosMigracion.get(sql) || 0) + 1;
        intentosMigracion.set(sql, intento);
        const corto = sql.replace(/\s+/g, ' ').trim().slice(0, 110);
        console.warn(`⚠️ [migración] candado ocupado, se salta (intento ${intento}/${REINTENTOS_MIGRACION}): ${corto}`);
        if (intento < REINTENTOS_MIGRACION) {
            setTimeout(() => { correrMigracionConEspera(args).catch(() => {}); }, 30000 * intento).unref();
        }
        return { rows: [], rowCount: 0, command: 'ALTER', fields: [] };
    } finally {
        await client.query('RESET lock_timeout').catch(() => {});
        client.release();
    }
}

(pool as any).query = (...args: any[]) => {
    const conCallback = typeof args[args.length - 1] === 'function';
    if (conCallback || !esMigracionDeColumna(args[0])) return queryOriginal(...args);
    return correrMigracionConEspera(args);
};

// Manejar errores de conexiones idle para que no maten el proceso
pool.on('error', (err: Error) => {
    console.error('⚠️ Error en conexión idle del pool PostgreSQL:', err.message);
    // No hacer process.exit — el pool se reconecta automáticamente
});

// Capturar errores no manejados de conexión para evitar crash
process.on('uncaughtException', (err: Error) => {
    if (err.message.includes('Connection terminated') || err.message.includes('ECONNRESET') || err.message.includes('ECONNREFUSED')) {
        console.error('⚠️ Conexión a BD perdida, el pool se reconectará:', err.message);
        return; // No crashear
    }
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

// Probamos la conexión al iniciar
pool.connect()
    .then((client) => {
        console.log('✅ Conexión exitosa a PostgreSQL');
        client.release();
    })
    .catch((err: Error) => console.error('❌ Error de conexión a BD:', err.message));
