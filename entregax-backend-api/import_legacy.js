const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  user: 'kmpsdeveloper',
  host: 'localhost',
  database: 'entregax_db',
  password: '',
  port: 5432
});

// Leer el archivo
const data = fs.readFileSync('/Users/kmpsdeveloper/Desktop/listado-clientes-2026-02-13.csv', 'utf8');
const lineas = data.split('\n').filter(l => l.trim());

function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === '\t' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

async function importar() {
    let importados = 0;
    let errores = 0;
    let duplicados = 0;
    
    for (const linea of lineas) {
        if (!linea.trim()) continue;
        
        const campos = parseLine(linea);
        
        // Columna 3: Nombre, Columna 7: Email, Columna 10: Box ID
        const fullName = campos[3] || '';
        const email = campos[7] || '';
        const boxId = campos[10] || '';
        
        // Buscar fecha en la última columna
        let registrationDate = null;
        for (let i = campos.length - 1; i >= 0; i--) {
            if (campos[i] && campos[i].match(/\d{4}-\d{2}-\d{2}/)) {
                registrationDate = campos[i].split(' ')[0];
                break;
            }
        }
        
        // Validar box_id
        if (!boxId || boxId === '\\N' || boxId === 'N' || boxId === '') {
            errores++;
            continue;
        }
        
        const cleanEmail = email && email !== '\\N' && email !== '' ? email.toLowerCase().trim() : null;
        const cleanName = fullName && fullName !== '\\N' && fullName !== '' ? fullName.trim() : null;
        const cleanBoxId = boxId.trim().toUpperCase();
        
        try {
            const result = await pool.query(
                'INSERT INTO legacy_clients (box_id, full_name, email, registration_date) VALUES ($1, $2, $3, $4) ON CONFLICT (box_id) DO NOTHING RETURNING id',
                [cleanBoxId, cleanName, cleanEmail, registrationDate]
            );
            
            if (result.rowCount > 0) {
                importados++;
            } else {
                duplicados++;
            }
        } catch (e) {
            console.error('Error en linea:', cleanBoxId, e.message);
            errores++;
        }
    }
    
    console.log('✅ Importación completada:');
    console.log('   - Importados:', importados);
    console.log('   - Duplicados:', duplicados);
    console.log('   - Errores:', errores);
    console.log('   - Total líneas:', lineas.length);
    
    pool.end();
}

importar();
