import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import householdsRouter from './routes/households.js';
import listsRouter from './routes/lists.js';
import scanRouter from './routes/scan.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Limite maior para aceitar imagens em base64
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'Listinha API' }));

app.use('/api/households', householdsRouter);
app.use('/api/lists', listsRouter);
app.use('/api/scan', scanRouter);

app.listen(PORT, () => {
  console.log(`Listinha API rodando na porta ${PORT}`);
});
