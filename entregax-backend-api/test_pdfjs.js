const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function test() {
  // Obtener el PDF del draft 11
  const result = await pool.query('SELECT pdf_url FROM maritime_bl_drafts WHERE id = 11');
  if (!result.rows[0] || !result.rows[0].pdf_url) {
    console.log('No hay PDF en draft 11');
    await pool.end();
    return;
  }
  
  const pdfData = result.rows[0].pdf_url;
  console.log('PDF base64 size:', pdfData.length);
  
  // Convertir a Buffer
  let pdfBuffer;
  if (pdfData.startsWith('data:')) {
    const commaIndex = pdfData.indexOf(',');
    const base64Data = commaIndex > -1 ? pdfData.substring(commaIndex + 1) : pdfData;
    pdfBuffer = Buffer.from(base64Data, 'base64');
  } else {
    pdfBuffer = Buffer.from(pdfData, 'base64');
  }
  console.log('Buffer size:', pdfBuffer.length, 'bytes');
  
  // Extraer con pdfjs-dist
  const uint8Array = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjs.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;
  
  console.log('PDF cargado, páginas:', pdf.numPages);
  
  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  console.log('Texto extraído:', fullText.length, 'caracteres');
  console.log('Primeros 500 chars:', fullText.substring(0, 500));
  
  await pool.end();
}

test().catch(e => {
  console.error('Error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
