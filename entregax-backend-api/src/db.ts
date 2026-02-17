import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Cargar .env desde el directorio raíz del proyecto
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Configuración de conexión - soporta DATABASE_URL (Railway/producción) o variables individuales (desarrollo)
const poolConfig = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT || '5432'),
    };

// Creamos un "Pool" de conexiones (Es como tener varias líneas telefónicas listas)
export const pool = new Pool(poolConfig);

// Probamos la conexión al iniciar
pool.connect()
    .then(() => console.log('✅ Conexión exitosa a PostgreSQL'))
    .catch((err: Error) => console.error('❌ Error de conexión a BD:', err.message));
