import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { getDb } from './db.js';
import { requireAuth } from './security.js';
import { createAuthRouter, getUserById } from './routes/auth.js';
import { createDataRouter } from './routes/data.js';
import { createAIRouter } from './routes/ai.js';

export function createApp(customDbPath?: string) {
  const db = getDb(customDbPath);
  const app = express();

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'online', app: 'MESA AI v2.0', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', createAuthRouter(db));

  const authMiddleware = requireAuth((id) => getUserById(db, id));
  app.use('/api', authMiddleware, createDataRouter(db));
  app.use('/api/ai', authMiddleware, createAIRouter(db));

  // Serve built client in production
  const clientDist = path.resolve(process.cwd(), 'dist', 'client');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server/index.ts') || process.argv[1].endsWith('server/index.js'));

if (isDirectRun) {
  const port = Number(process.env.PORT || 4000);
  const app = createApp();
  app.listen(port, '0.0.0.0', () => {
    console.log(`[MESA AI v2.0] Secure API server listening on http://localhost:${port}`);
  });
}
