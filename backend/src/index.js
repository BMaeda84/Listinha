import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';

import householdsRouter from './routes/households.js';
import listsRouter from './routes/lists.js';
import scanRouter from './routes/scan.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: em produção exige FRONTEND_URL configurado
const allowedOrigin = process.env.FRONTEND_URL;
if (!allowedOrigin && process.env.NODE_ENV === 'production') {
  console.error('ERRO: FRONTEND_URL não definido em produção. Abortando.');
  process.exit(1);
}

app.use(cors({
  origin: allowedOrigin || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting geral
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em breve.' },
}));

// Rate limiting específico para scan/frame (caro em tokens)
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Limite de escaneamentos por minuto atingido.' },
});

// Limite maior para aceitar imagens em base64
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'Listinha API' }));

app.use('/api/households', householdsRouter);
app.use('/api/lists', listsRouter);
app.use('/api/scan/frame', scanLimiter);
app.use('/api/scan', scanRouter);

app.listen(PORT, () => {
  console.log(`Listinha API rodando na porta ${PORT}`);
});
