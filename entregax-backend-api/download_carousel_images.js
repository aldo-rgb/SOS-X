const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = 'entregax-uploads';
const OUTPUT_DIR = '../entregax-mobile-app/assets/carousel';

const images = [
  { key: 'carousel/slide-1773346205775.jpg', name: 'gex_protection.jpg' },
  { key: 'carousel/slide-1773346046892.jpg', name: 'air_express.jpg' },
  { key: 'carousel/slide-1773346223055.jpg', name: 'maritime_savings.jpg' },
  { key: 'carousel/slide-1773346003820.jpg', name: 'referral_program.jpg' },
];

async function downloadImages() {
  // Crear directorio si no existe
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const img of images) {
    try {
      const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: img.key });
      const response = await s3Client.send(cmd);
      
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      
      const outputPath = path.join(OUTPUT_DIR, img.name);
      fs.writeFileSync(outputPath, buffer);
      console.log('✅ Descargado:', img.name, '(' + buffer.length + ' bytes)');
    } catch (e) {
      console.error('❌ Error descargando', img.key, ':', e.message);
    }
  }
  
  console.log('\n✅ Imágenes guardadas en:', path.resolve(OUTPUT_DIR));
}

downloadImages();
