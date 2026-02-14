const { pdfToPng } = require('pdf-to-png-converter');
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

(async () => {
  const result = await pool.query('SELECT pdf_url FROM maritime_reception_drafts WHERE id = 9');
  if (!result.rows.length) {
    console.log('Draft no encontrado');
    await pool.end();
    return;
  }
  
  const pdfUrl = result.rows[0].pdf_url;
  console.log('PDF URL length:', pdfUrl?.length);
  
  if (!pdfUrl) {
    console.log('No hay PDF URL');
    await pool.end();
    return;
  }
  
  const commaIndex = pdfUrl.indexOf(',');
  const base64Data = pdfUrl.substring(commaIndex + 1);
  const pdfBuffer = Buffer.from(base64Data, 'base64');
  console.log('PDF Buffer size:', pdfBuffer.length);
  
  // Guardar el PDF original también
  fs.writeFileSync('/tmp/test_bl.pdf', pdfBuffer);
  console.log('PDF guardado en /tmp/test_bl.pdf');
  
  const pngPages = await pdfToPng(pdfBuffer, {
    viewportScale: 3.0,
    disableFontFace: false,
    useSystemFonts: true,
    pagesToProcess: [1],
  });
  
  if (pngPages && pngPages.length > 0 && pngPages[0]?.content) {
    fs.writeFileSync('/tmp/test_bl.png', pngPages[0].content);
    console.log('PNG guardado en /tmp/test_bl.png');
    console.log('Tamaño PNG:', pngPages[0].content.length, 'bytes');
  } else {
    console.log('No se genero PNG');
  }
  
  await pool.end();
  process.exit(0);
})();
