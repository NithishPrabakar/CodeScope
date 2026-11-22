import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import repoRoutes from './routes/repoRoutes.js';
import { isDatabaseConnected } from './db/prisma.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Basic health check route
app.get('/api/health', async (_req: Request, res: Response) => {
  const dbConnected = await isDatabaseConnected();
  res.status(200).json({
    status: 'ok',
    message: 'CodeScope Backend API is running successfully',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Repository Upload and Explorer routes
app.use('/api/repos', repoRoutes);

app.get('/', (_req: Request, res: Response) => {
  res.send('Welcome to CodeScope API. Use /api/health to check server status.');
});

// Error handling middleware (e.g. for Multer size limit errors)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File size limit exceeded. Maximum allowed size is 50MB.' });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: 'An unexpected internal server error occurred.' });
});

app.listen(PORT, () => {
  console.log(`[CodeScope Backend] Server listening on port ${PORT}`);
  console.log(`[CodeScope Backend] Health check available at http://localhost:${PORT}/api/health`);
});
