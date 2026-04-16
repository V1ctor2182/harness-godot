import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import { MilestoneModel } from '../models/milestone.js';
import { config } from '../config.js';
import { logger } from './logger.js';

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
 * The project repo owns milestones: harness reads from
 * `$PROJECT_REPO_LOCAL_PATH/.harness/milestones/` first. For one release
 * cycle we also honour the legacy `$PROJECT_REPO_LOCAL_PATH/milestones/`
 * location so projects that predate the .harness/ convention keep working.
 *
 * If no project is configured or no milestones exist, the harness runs in
 * zero-milestone mode (dashboard shows empty state). There is no longer a
 * harness-local fallback — Phase B of the decoupling plan removed it.
 */
async function resolveMilestonesDir(): Promise<string | null> {
  const projectRepo = config.projectRepoLocalPath;
  if (!projectRepo) return null;

  const candidates = [
    path.join(projectRepo, '.harness', 'milestones'),
    path.join(projectRepo, 'milestones'),
  ];
  for (const dir of candidates) {
    try {
      const stat = await fs.stat(dir);
      if (stat.isDirectory()) return dir;
    } catch {
      // try next candidate
    }
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
