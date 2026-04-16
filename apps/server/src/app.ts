import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { AppError } from './lib/errors.js';
import logger from './lib/logger.js';
import { config } from './config.js';
import healthRouter from './routes/health.js';
import cyclesRouter from './routes/cycles.js';
import tasksRouter from './routes/tasks.js';
import agentsRouter from './routes/agents.js';
import jobsRouter from './routes/jobs.js';
import knowledgeRouter from './routes/knowledge.js';
import controlRouter from './routes/control.js';
import eventsRouter from './routes/events.js';
import statusRouter from './routes/status.js';
import analyticsRouter from './routes/analytics.js';
import roomsRouter from './routes/rooms.js';
import specsRouter from './routes/specs.js';
import testsRouter from './routes/tests.js';
import inboxRouter from './routes/inbox.js';
import milestonesRouter from './routes/milestones.js';
import assetsRouter from './routes/assets.js';
import projectRouter from './routes/project.js';

const app = express();

app.use(cors());
if (config.nodeEnv !== 'test') {
  app.use(pinoHttp({ logger }));
}
app.use(express.json());

// Routes
app.use('/api/health', healthRouter);
app.use('/api/cycles', cyclesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/control', controlRouter);
app.use('/api/events', eventsRouter);
app.use('/api/status', statusRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/specs', specsRouter);
app.use('/api/tests', testsRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/milestones', milestonesRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/project', projectRouter);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export { app };
