import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { config } from '../config.js';
import { logger } from './logger.js';

// ─── Schema (source of truth for project.yaml) ──────────────────────

const testLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  runner: z.string().optional(),
});

const projectConfigSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),

    stack: z
      .object({
        engine: z.string().optional(),
        engine_version: z.string().optional(),
        language: z.string().optional(),
        test_runner: z.string().optional(),
        os: z.string().optional(),
      })
      .optional(),

    paths: z
      .object({
        source: z.string().optional(),
        tests: z.string().optional(),
        data: z.string().optional(),
        rooms: z.string().optional(),
      })
      .optional(),

    conventions: z.string().optional(),
    prd_path: z.string().optional(),

    constants: z.record(z.union([z.number(), z.string()])).optional(),
    test_layers: z.array(testLayerSchema).optional(),
  }),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>['project'];

// ─── In-memory cache ────────────────────────────────────────────────

interface Cache {
  loaded: boolean;
  config: ProjectConfig | null;
  source: string | null;
  error: string | null;
  loadedAt: Date | null;
}

const cache: Cache = {
  loaded: false,
  config: null,
  source: null,
  error: null,
  loadedAt: null,
};

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Returns the currently-loaded ProjectConfig or null if no project is
 * configured. Callers must handle null (e.g. dashboard empty state).
 */
export function getProjectConfig(): ProjectConfig | null {
  return cache.config;
}

export function getProjectConfigState(): {
  loaded: boolean;
  config: ProjectConfig | null;
  source: string | null;
  error: string | null;
  loadedAt: Date | null;
} {
  return { ...cache };
}

/**
 * Load `$PROJECT_REPO_LOCAL_PATH/.harness/project.yaml` into the cache.
 * Call at server startup (after seedRooms, before any agent-spawning
 * work) and from POST /api/project/reload.
 *
 * Failure modes:
 *  - No PROJECT_REPO_LOCAL_PATH env var  → cache.loaded=false, no error
 *  - Path doesn't exist / not a dir      → cache.loaded=false, error set
 *  - .harness/project.yaml missing       → cache.loaded=false, error set
 *  - yaml parse or schema validation fail → cache.loaded=false, error set
 *
 * In every failure mode the server keeps running. Cycle creation is
 * expected to check getProjectConfig() and return 409 when unloaded.
 */
export async function loadProjectConfig(): Promise<Cache> {
  const base = config.projectRepoLocalPath;
  cache.loadedAt = new Date();

  if (!base) {
    cache.loaded = false;
    cache.config = null;
    cache.source = null;
    cache.error = null;
    logger.info('[project-config] PROJECT_REPO_LOCAL_PATH unset — running with no project loaded');
    return cache;
  }

  try {
    const stat = await fs.stat(base);
    if (!stat.isDirectory()) {
      cache.loaded = false;
      cache.config = null;
      cache.source = base;
      cache.error = `${base} is not a directory`;
      logger.warn({ base }, '[project-config] path is not a directory');
      return cache;
    }
  } catch {
    cache.loaded = false;
    cache.config = null;
    cache.source = base;
    cache.error = `project repo path does not exist: ${base}`;
    logger.warn({ base }, '[project-config] project repo path does not exist');
    return cache;
  }

  const yamlPath = path.join(base, '.harness', 'project.yaml');

  let raw: string;
  try {
    raw = await fs.readFile(yamlPath, 'utf8');
  } catch {
    cache.loaded = false;
    cache.config = null;
    cache.source = yamlPath;
    cache.error = `missing ${path.relative(base, yamlPath)} — create a .harness/project.yaml in the project repo`;
    logger.warn({ yamlPath }, '[project-config] project.yaml not found');
    return cache;
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = parseYaml(raw);
  } catch (e) {
    cache.loaded = false;
    cache.config = null;
    cache.source = yamlPath;
    cache.error = `invalid yaml: ${e instanceof Error ? e.message : String(e)}`;
    logger.warn({ err: e, yamlPath }, '[project-config] yaml parse failed');
    return cache;
  }

  const parsed = projectConfigSchema.safeParse(parsedYaml);
  if (!parsed.success) {
    cache.loaded = false;
    cache.config = null;
    cache.source = yamlPath;
    cache.error = `schema validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    logger.warn({ issues: parsed.error.issues, yamlPath }, '[project-config] schema validation failed');
    return cache;
  }

  cache.loaded = true;
  cache.config = parsed.data.project;
  cache.source = yamlPath;
  cache.error = null;
  logger.info(
    { projectId: cache.config.id, projectName: cache.config.name, source: yamlPath },
    '[project-config] loaded'
  );
  return cache;
}

/**
 * For test helpers only — lets unit tests inject a config without
 * touching the filesystem.
 */
export function __setProjectConfigForTests(c: ProjectConfig | null): void {
  cache.loaded = c !== null;
  cache.config = c;
  cache.source = c ? '(injected by tests)' : null;
  cache.error = null;
  cache.loadedAt = new Date();
}
