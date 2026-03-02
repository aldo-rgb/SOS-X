// Script para limpiar espacio en la base de datos
// Elimina datos base64 antiguos que ahora están en S3

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function cleanupDatabase() {
    console.log('🔍 Analizando base de datos...\n');

    try {
        // 1. Ver el tamaño de las tablas
        const sizeQuery = await pool.query(`
            SELECT 
                schemaname,
                relname as table_name,
                pg_size_pretty(pg_total_relation_size(relid)) as total_size,
                pg_total_relation_size(relid) as size_bytes
            FROM pg_catalog.pg_statio_user_tables 
            ORDER BY pg_total_relation_size(relid) DESC
            LIMIT 20
        `);

        console.log('📊 Tablas más grandes:');
        console.log('========================');
        sizeQuery.rows.forEach(row => {
            console.log(`  ${row.table_name}: ${row.total_size}`);
        });
        console.log('');

        // 2. Ver espacio usado en disco
        const diskQuery = await pool.query(`
            SELECT 
                pg_size_pretty(pg_database_size(current_database())) as db_size
        `);
        console.log(`💾 Tamaño total de la DB: ${diskQuery.rows[0].db_size}\n`);

        // 3. Buscar columnas con datos base64 grandes
        console.log('🔍 Buscando datos base64 grandes...\n');

        // Revisar maritime_reception_drafts
        const draftsCheck = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN LENGTH(extracted_data::text) > 1000000 THEN 1 ELSE 0 END) as large_records,
                pg_size_pretty(SUM(LENGTH(extracted_data::text))::bigint) as total_data_size
            FROM maritime_reception_drafts
        `);
        console.log('📋 maritime_reception_drafts:');
        console.log(`   Total registros: ${draftsCheck.rows[0].total}`);
        console.log(`   Registros grandes (>1MB): ${draftsCheck.rows[0].large_records}`);
        console.log(`   Tamaño total extracted_data: ${draftsCheck.rows[0].total_data_size}`);

        // 4. Limpiar base64 de extracted_data si es muy grande
        console.log('\n🧹 Limpiando datos base64 de extracted_data...');
        
        // Obtener drafts con base64 embebido
        const draftsWithBase64 = await pool.query(`
            SELECT id, extracted_data 
            FROM maritime_reception_drafts 
            WHERE extracted_data::text LIKE '%base64%'
               OR LENGTH(extracted_data::text) > 500000
        `);

        console.log(`   Encontrados ${draftsWithBase64.rows.length} registros con posible base64`);

        let cleaned = 0;
        for (const draft of draftsWithBase64.rows) {
            try {
                let data = draft.extracted_data;
                if (typeof data === 'string') {
                    data = JSON.parse(data);
                }

                let modified = false;
                const fieldsToClean = [
                    'bl_document_pdf', 'telex_release_pdf', 'packing_list_data',
                    'bl_pdf_base64', 'telex_pdf_base64', 'packing_list_base64',
                    'bl_data', 'telex_data', 'summary_data', 'excel_data',
                    'pdf_data', 'file_data', 'attachment_data'
                ];

                for (const field of fieldsToClean) {
                    if (data[field] && typeof data[field] === 'string' && data[field].length > 10000) {
                        if (data[field].includes('base64') || data[field].startsWith('data:')) {
                            console.log(`     Draft ${draft.id}: limpiando campo ${field} (${(data[field].length/1024).toFixed(0)} KB)`);
                            data[field] = '[MOVED_TO_S3]';
                            modified = true;
                        }
                    }
                }

                // Limpiar packingListData si es muy grande
                if (data.packingListData && JSON.stringify(data.packingListData).length > 100000) {
                    // Mantener solo resumen, no datos completos
                    if (Array.isArray(data.packingListData)) {
                        console.log(`     Draft ${draft.id}: reduciendo packingListData de ${data.packingListData.length} items`);
                        // Mantener solo los primeros 10 items como referencia
                        data.packingListData = data.packingListData.slice(0, 10);
                        data.packingListData_truncated = true;
                        modified = true;
                    }
                }

                if (modified) {
                    await pool.query(
                        'UPDATE maritime_reception_drafts SET extracted_data = $1 WHERE id = $2',
                        [JSON.stringify(data), draft.id]
                    );
                    cleaned++;
                }
            } catch (e) {
                console.log(`     Error procesando draft ${draft.id}:`, e.message);
            }
        }

        console.log(`   ✅ Limpiados ${cleaned} registros\n`);

        // 5. Eliminar drafts rechazados antiguos (más de 30 días)
        console.log('🗑️ Eliminando drafts rechazados antiguos (>30 días)...');
        const deleteOld = await pool.query(`
            DELETE FROM maritime_reception_drafts 
            WHERE status = 'rejected' 
              AND created_at < NOW() - INTERVAL '30 days'
            RETURNING id
        `);
        console.log(`   Eliminados ${deleteOld.rowCount} drafts rechazados antiguos\n`);

        // 6. VACUUM para recuperar espacio
        console.log('🔄 Ejecutando VACUUM ANALYZE...');
        await pool.query('VACUUM ANALYZE maritime_reception_drafts');
        console.log('   ✅ VACUUM completado\n');

        // 7. Verificar espacio final
        const finalSize = await pool.query(`
            SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
        `);
        console.log(`💾 Tamaño final de la DB: ${finalSize.rows[0].db_size}`);

        console.log('\n✅ Limpieza completada!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

cleanupDatabase();
