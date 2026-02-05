import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Endpoint de salud - Para probar que el servidor funciona
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'EntregaX API está funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Endpoint raíz
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'EntregaX Backend API',
    description: 'API central para el ecosistema EntregaX',
    endpoints: {
      health: 'GET /health - Estado del servidor',
    }
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 EntregaX API corriendo en http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
