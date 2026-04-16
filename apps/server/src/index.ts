import mongoose from 'mongoose';
import { config } from './config.js';
import { app } from './app.js';
import logger from './lib/logger.js';
import { runMigrations } from './lib/migration-runner.js';
import { seedKnowledge } from './lib/seed-knowledge.js';
import { seedRooms } from './lib/seed-rooms.js';
import { loadProjectConfig } from './lib/project-config.js';
import { initSSE, stopSSE } from './services/sse-manager.js';
import { startJobQueue, stopJobQueue } from './services/job-queue.js';
import { getOrCreateControl } from './models/control.js';
import {
  failInterruptedJobs,
  reconcileOrphans,
  recoverStaleTasks,
} from './services/launcher/orphan-recovery.js';

import { setStartupStatus } from './lib/startup-status.js';

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

  // Load project config from $PROJECT_REPO_LOCAL_PATH/.harness/project.yaml.
  // Safe to call without a project — the server runs in "no project loaded"
  // mode and the dashboard shows an empty state.
  console.log('Loading project config...');
  const projectState = await loadProjectConfig();
  if (projectState.loaded && projectState.config) {
    console.log(`Project loaded: ${projectState.config.id} (${projectState.config.name})`);
  } else {
    console.log(
      projectState.error
        ? `No project loaded: ${projectState.error}`
        : 'No project loaded (PROJECT_REPO_LOCAL_PATH unset)'
    );
  }

  // Milestones are Mongo-only (created via dashboard or Orchestrator proposals).
  // No yaml seeding — Phase G of the decoupling plan removed seed-milestones.ts.

  // Ensure control document exists
  await getOrCreateControl();

  // Fail jobs that were active when the previous server instance shut down
  await failInterruptedJobs();

  // Reconcile orphaned containers
  await reconcileOrphans();

  // Recover tasks stuck in non-terminal states with terminated agent runs
  await recoverStaleTasks();

  // Mark startup as ready
  const recoveryStats = {
    orphansFound: 0, // orphan recovery functions return void; count is logged internally
    jobsFailed: 0,
    roomsSeeded: roomResult?.roomsUpserted ?? 0,
  };
  setStartupStatus(true, recoveryStats);
  logger.info({ lastRecovery: recoveryStats }, 'Startup recovery complete');

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
