import mongoose from 'mongoose';
import { config } from './config.js';
import { app } from './app.js';
import logger from './lib/logger.js';
import { runMigrations } from './lib/migration-runner.js';
import { seedKnowledge } from './lib/seed-knowledge.js';
import { seedRooms } from './lib/seed-rooms.js';
import { initSSE, stopSSE } from './services/sse-manager.js';
import { startJobQueue, stopJobQueue } from './services/job-queue.js';
import { getOrCreateControl } from './models/control.js';
import {
  failInterruptedJobs,
  reconcileOrphans,
  recoverStaleTasks,
} from './services/launcher/orphan-recovery.js';

// ─── Startup Status (exported for health route) ─────────────────────

let startupReady = false;
let lastRecovery: {
  orphansFound: number;
  jobsFailed: number;
  roomsSeeded: number;
} | null = null;

export function getStartupStatus() {
  return { startupReady, lastRecovery };
}

// ─── Helpers ────────────────────────────────────────────────────────

function redactMongoUri(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return uri;
  }
}

async function main() {
  // Connect to MongoDB
  logger.info('Connecting to MongoDB...');
  await mongoose.connect(config.mongodbUri);
  logger.info('MongoDB connected');

  // Run pending migrations
  await runMigrations();

  // Seed knowledge base from knowledge/ directory (idempotent)
  console.log('Seeding knowledge base...');
  await seedKnowledge();
  console.log('Knowledge base seeded');

  // Seed rooms & specs from rooms/ directory (idempotent)
  console.log('Seeding rooms...');
  const roomResult = await seedRooms();
  console.log('Rooms seeded');

  // Ensure control document exists
  await getOrCreateControl();

  // Fail jobs that were active when the previous server instance shut down
  await failInterruptedJobs();

  // Reconcile orphaned containers
  await reconcileOrphans();

  // Recover tasks stuck in non-terminal states with terminated agent runs
  await recoverStaleTasks();

  // Mark startup as ready
  lastRecovery = {
    orphansFound: 0, // orphan recovery functions return void; count is logged internally
    jobsFailed: 0,
    roomsSeeded: roomResult?.roomsUpserted ?? 0,
  };
  startupReady = true;
  logger.info({ lastRecovery }, 'Startup recovery complete');

  // Start SSE heartbeat
  initSSE();

  // Start job queue polling
  startJobQueue();

  // Start server
  app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.nodeEnv,
        mongoUri: redactMongoUri(config.mongodbUri),
      },
      'Server started'
    );
  });

  // Graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function shutdown() {
  logger.info('Shutting down...');
  stopJobQueue();
  stopSSE();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
