import { Router } from 'express';
import mongoose from 'mongoose';
import { isDockerAvailable } from '../lib/docker.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    const dockerConnected = await isDockerAvailable();

    const checks = {
      database: dbConnected ? 'connected' : 'disconnected',
      docker: dockerConnected ? 'connected' : 'disconnected',
    };

    const allHealthy = dbConnected && dockerConnected;

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'ok' : 'degraded',
      checks,
      uptime: process.uptime(),
    });
  })
);

export default router;
