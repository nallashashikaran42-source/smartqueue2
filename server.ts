import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { ENV } from './server/config/env.ts';
import { authRoutes } from './server/routes/authRoutes.ts';
import { orgStructureRoutes } from './server/routes/orgStructureRoutes.ts';
import { queueRoutes } from './server/routes/queueRoutes.ts';
import { analyticsRoutes } from './server/routes/analyticsRoutes.ts';
import { notificationRoutes } from './server/routes/notificationRoutes.ts';
import { citizenRoutes } from './server/routes/citizenRoutes.ts';
import { operatorRoutes } from './server/routes/operatorRoutes.ts';
import { adminRoutes } from './server/routes/adminRoutes.ts';
import { wsHub } from './server/socket/wsHub.ts';

export async function createAppServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'smartqueue-api',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/orgs', orgStructureRoutes);
  app.use('/api/queues', queueRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/citizen', citizenRoutes);
  app.use('/api/operator', operatorRoutes);
  app.use('/api/admin', adminRoutes);

  // Explicit 404 JSON for unknown /api/* endpoints
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const httpServer = http.createServer(app);
  wsHub.attach(httpServer);

  if (ENV.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return { app, httpServer };
}

// Start server directly when run as entrypoint
const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]).endsWith('server.ts');

if (isMainModule) {
  createAppServer()
    .then(({ httpServer }) => {
      httpServer.listen(ENV.PORT, '0.0.0.0', () => {
        console.log(`SmartQueue server listening on http://0.0.0.0:${ENV.PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start SmartQueue server:', err);
      process.exit(1);
    });
}
