import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import { MilestoneModel } from '../models/milestone.js';
import { config } from '../config.js';
import { logger } from './logger.js';

// The harness-system repo root (same trick as seed-rooms.ts):
//   local dev: apps/server/src/lib/ → ../../../.. = project root
//   Docker:    apps/server/dist/lib/ → ../../../.. = /app
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..', '..');

interface MilestoneYaml {
  id: string;
  name: string;
  description?: string;
  goals?: string[];
  features?: string[];
  dependsOn?: string[];
  estimatedWeeks?: number;
  order?: number;
}

/**
 * Resolve the directory to read milestone yaml files from.
 *
 * Preference order:
 *  1. `$GAME_REPO_LOCAL_PATH/milestones/` — canonical source once the game
 *     repo owns the roadmap.
 *  2. `<harness-root>/seed-data/milestones/` — bootstrap source shipped with
 *     harness-system so local dev works without cloning the game repo.
 */
async function resolveMilestonesDir(): Promise<string | null> {
  const gameRepo = config.gameRepoLocalPath;
  if (gameRepo) {
    const gameRepoDir = path.join(gameRepo, 'milestones');
    try {
      const stat = await fs.stat(gameRepoDir);
      if (stat.isDirectory()) return gameRepoDir;
    } catch {
      // fall through
    }
  }

  const seedDir = path.join(PROJECT_ROOT, 'seed-data', 'milestones');
  try {
    const stat = await fs.stat(seedDir);
    if (stat.isDirectory()) return seedDir;
  } catch {
    return null;
  }
  return null;
}

export async function seedMilestones(): Promise<{
  upserted: number;
  source: string | null;
}> {
  const dir = await resolveMilestonesDir();
  if (!dir) {
    logger.warn('[seedMilestones] no milestones directory found — skipping');
    return { upserted: 0, source: null };
  }

  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  } catch (e) {
    logger.warn({ err: e }, `[seedMilestones] failed to read ${dir}`);
    return { upserted: 0, source: dir };
  }

  let upserted = 0;
  for (const file of files) {
    const fullPath = path.join(dir, file);
    try {
      const raw = await fs.readFile(fullPath, 'utf8');
      const parsed = parseYaml(raw) as MilestoneYaml;
      if (!parsed?.id || !parsed?.name) {
        logger.warn(`[seedMilestones] ${file} missing id or name, skipping`);
        continue;
      }

      await MilestoneModel.updateOne(
        { _id: parsed.id },
        {
          $set: {
            name: parsed.name,
            description: parsed.description ?? '',
            goals: parsed.goals ?? [],
            features: parsed.features ?? [],
            dependsOn: parsed.dependsOn ?? [],
            estimatedWeeks: parsed.estimatedWeeks ?? 0,
            order: parsed.order ?? 0,
            lastSyncedAt: new Date(),
          },
          $setOnInsert: {
            status: 'planned',
            cycles: [],
            totalCostUsd: 0,
          },
        },
        { upsert: true }
      );
      upserted += 1;
    } catch (e) {
      logger.warn({ err: e }, `[seedMilestones] failed to parse ${file}`);
    }
  }

  logger.info(`[seedMilestones] synced ${upserted} milestones from ${dir}`);
  return { upserted, source: dir };
}
