import * as zlib from 'zlib';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || 'entregax-uploads';

function escapeValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString().replace('T', ' ').replace('Z', '')}'`;
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function escapeIdentifier(name: string): string {
  return `"${name}"`;
}

export const runDatabaseBackup = async (): Promise<void> => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    console.log('[BACKUP] Iniciando backup completo de base de datos...');
    const chunks: Buffer[] = [];

    const push = (s: string) => chunks.push(Buffer.from(s, 'utf8'));

    push(`-- EntregaX DB Full Backup\n-- Generated: ${new Date().toISOString()}\n-- Host: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0]}\n\n`);
    push(`SET statement_timeout = 0;\nSET lock_timeout = 0;\nSET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\nSET check_function_bodies = false;\nSET xmloption = content;\nSET client_min_messages = warning;\nSET row_security = off;\n\n`);

    // 1. SEQUENCES
    const seqs = await client.query<{ sequence_name: string }>(`
      SELECT sequence_name FROM information_schema.sequences
      WHERE sequence_schema = 'public' ORDER BY sequence_name
    `);
    push(`-- SEQUENCES\n`);
    for (const { sequence_name } of seqs.rows) {
      const s = await client.query(`SELECT * FROM "${sequence_name}"`);
      if (s.rows[0]) {
        push(`CREATE SEQUENCE IF NOT EXISTS ${escapeIdentifier(sequence_name)} START ${s.rows[0].last_value || 1} INCREMENT ${s.rows[0].increment_by || 1} MINVALUE ${s.rows[0].min_value || 1} MAXVALUE ${s.rows[0].max_value || '9223372036854775807'} CACHE ${s.rows[0].cache_value || 1};\n`);
      }
    }
    push('\n');

    // 2. TABLE DEFINITIONS
    const tables = await client.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `);

    push(`-- TABLE DEFINITIONS\n`);
    for (const { tablename } of tables.rows) {
      const cols = await client.query(`
        SELECT
          c.column_name,
          c.data_type,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.is_nullable,
          c.column_default,
          c.udt_name
        FROM information_schema.columns c
        WHERE c.table_name = $1 AND c.table_schema = 'public'
        ORDER BY c.ordinal_position
      `, [tablename]);

      push(`CREATE TABLE IF NOT EXISTS ${escapeIdentifier(tablename)} (\n`);
      const colDefs = cols.rows.map((col: any) => {
        let type = col.data_type;
        if (type === 'character varying') type = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'varchar';
        else if (type === 'character') type = `char(${col.character_maximum_length || 1})`;
        else if (type === 'numeric') type = col.numeric_precision ? `numeric(${col.numeric_precision},${col.numeric_scale ?? 0})` : 'numeric';
        else if (type === 'USER-DEFINED') type = col.udt_name;
        else if (type === 'ARRAY') type = col.udt_name.replace(/^_/, '') + '[]';

        let def = `  ${escapeIdentifier(col.column_name)} ${type}`;
        if (col.column_default) def += ` DEFAULT ${col.column_default}`;
        if (col.is_nullable === 'NO') def += ' NOT NULL';
        return def;
      });
      push(colDefs.join(',\n') + '\n);\n\n');
    }

    // 3. PRIMARY KEYS & UNIQUE CONSTRAINTS
    const constraints = await client.query(`
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
             string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
      GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
      ORDER BY tc.table_name, tc.constraint_type
    `);

    push(`-- PRIMARY KEYS & UNIQUE CONSTRAINTS\n`);
    for (const c of constraints.rows) {
      push(`ALTER TABLE ${escapeIdentifier(c.table_name)} ADD CONSTRAINT ${escapeIdentifier(c.constraint_name)} ${c.constraint_type} (${c.columns.split(', ').map((col: string) => escapeIdentifier(col.trim())).join(', ')});\n`);
    }
    push('\n');

    // 4. INDEXES
    const indexes = await client.query(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname NOT IN (SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = 'public')
      ORDER BY tablename, indexname
    `);

    push(`-- INDEXES\n`);
    for (const idx of indexes.rows) {
      push(`${idx.indexdef};\n`);
    }
    push('\n');

    // 5. FOREIGN KEYS
    const fks = await client.query(`
      SELECT tc.constraint_name, tc.table_name,
             string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns,
             ccu.table_name AS foreign_table,
             string_agg(ccu.column_name, ', ' ORDER BY kcu.ordinal_position) AS foreign_columns,
             rc.update_rule, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      GROUP BY tc.constraint_name, tc.table_name, ccu.table_name, rc.update_rule, rc.delete_rule
      ORDER BY tc.table_name
    `);

    push(`-- FOREIGN KEYS\n`);
    for (const fk of fks.rows) {
      const cols = fk.columns.split(', ').map((c: string) => escapeIdentifier(c.trim())).join(', ');
      const fCols = fk.foreign_columns.split(', ').map((c: string) => escapeIdentifier(c.trim())).join(', ');
      push(`ALTER TABLE ${escapeIdentifier(fk.table_name)} ADD CONSTRAINT ${escapeIdentifier(fk.constraint_name)} FOREIGN KEY (${cols}) REFERENCES ${escapeIdentifier(fk.foreign_table)} (${fCols}) ON UPDATE ${fk.update_rule} ON DELETE ${fk.delete_rule};\n`);
    }
    push('\n');

    // 6. DATA
    push(`-- DATA\nSET session_replication_role = replica;\n\n`);
    let totalRows = 0;
    for (const { tablename } of tables.rows) {
      const cols = await client.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tablename]);
      const colNames = cols.rows.map(r => r.column_name);
      const data = await client.query(`SELECT * FROM ${escapeIdentifier(tablename)}`);
      if (!data.rows.length) continue;

      push(`-- ${tablename}: ${data.rows.length} rows\n`);
      const colList = colNames.map(c => escapeIdentifier(c)).join(', ');
      for (const row of data.rows) {
        const vals = colNames.map(c => escapeValue(row[c])).join(', ');
        push(`INSERT INTO ${escapeIdentifier(tablename)} (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`);
      }
      push('\n');
      totalRows += data.rows.length;
      process.stdout.write('.');
    }
    push(`\nSET session_replication_role = DEFAULT;\n\n`);

    // 7. RESET SEQUENCES to current max values
    push(`-- RESET SEQUENCES\n`);
    for (const { tablename } of tables.rows) {
      const pkCol = await client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1 AND tc.table_schema = 'public'
        LIMIT 1
      `, [tablename]);
      if (pkCol.rows[0]) {
        push(`SELECT setval(pg_get_serial_sequence('${tablename}', '${pkCol.rows[0].column_name}'), COALESCE((SELECT MAX("${pkCol.rows[0].column_name}") FROM ${escapeIdentifier(tablename)}), 1));\n`);
      }
    }
    push('\n');

    const sqlBuffer = Buffer.concat(chunks);
    console.log(`\n[BACKUP] SQL generado: ${(sqlBuffer.length / 1024 / 1024).toFixed(1)} MB | Filas: ${totalRows}`);

    const compressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.gzip(sqlBuffer, { level: 6 }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    console.log(`[BACKUP] Comprimido: ${(compressed.length / 1024 / 1024).toFixed(1)} MB`);

    const date = new Date().toISOString().substring(0, 10);
    const key = `db-backups/entregax_${date}.sql.gz`;

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: compressed,
      ContentType: 'application/gzip',
    }));

    console.log(`[BACKUP] ✅ Subido a S3: s3://${BUCKET}/${key} (${(compressed.length / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    client.release();
    await pool.end();
  }
};
