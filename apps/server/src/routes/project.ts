import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { stringify as yamlStringify } from 'yaml';
import { getProjectConfigState, loadProjectConfig } from '../lib/project-config.js';
import { asyncHandler } from '../lib/async-handler.js';
import { ValidationError } from '../lib/errors.js';
import { broadcast } from '../services/sse-manager.js';

const router = Router();

// GET /api/project — current project config + load state
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const state = getProjectConfigState();
    res.json({
      loaded: state.loaded,
      config: state.config,
      source: state.source,
      error: state.error,
      loadedAt: state.loadedAt,
    });
  })
);

// POST /api/project/reload — re-read project.yaml from disk
router.post(
  '/reload',
  asyncHandler(async (_req, res) => {
    const state = await loadProjectConfig();
    broadcast('project:reloaded', {
      loaded: state.loaded,
      projectId: state.config?.id ?? null,
      error: state.error,
    });
    res.json({
      loaded: state.loaded,
      config: state.config,
      source: state.source,
      error: state.error,
    });
  })
);

// ─── Engine auto-detection ──────────────────────────────────────────

const ENGINE_MARKERS: Array<{
  glob: string;
  engine: string;
  language: string;
  test_runner?: string;
  version_extractor?: (content: string) => string | undefined;
}> = [
  {
    glob: 'project.godot',
    engine: 'Godot',
    language: 'GDScript',
    test_runner: 'GUT',
    version_extractor: (content) => {
      const match = content.match(/config\/features\/(\d+\.\d+)/);
      return match?.[1];
    },
  },
  { glob: 'Cargo.toml', engine: 'Rust', language: 'Rust', test_runner: 'cargo-test' },
  { glob: 'go.mod', engine: 'Go', language: 'Go', test_runner: 'go-test' },
  { glob: 'package.json', engine: 'Node', language: 'TypeScript', test_runner: 'vitest' },
  { glob: 'pyproject.toml', engine: 'Python', language: 'Python', test_runner: 'pytest' },
];

async function detectEngine(repoPath: string): Promise<{
  engine: string;
  language: string;
  test_runner?: string;
  engine_version?: string;
}> {
  for (const marker of ENGINE_MARKERS) {
    const markerPath = path.join(repoPath, marker.glob);
    try {
      const stat = await fs.stat(markerPath);
      if (stat.isFile()) {
        let version: string | undefined;
        if (marker.version_extractor) {
          try {
            const content = await fs.readFile(markerPath, 'utf-8');
            version = marker.version_extractor(content);
          } catch { /* ignore */ }
        }
        return {
          engine: marker.engine,
          language: marker.language,
          test_runner: marker.test_runner,
          engine_version: version,
        };
      }
    } catch {
      // marker not found, try next
    }
  }
  return { engine: 'Unknown', language: 'Unknown' };
}

async function countPrdDocs(repoPath: string): Promise<number> {
  const prdDir = path.join(repoPath, 'prd');
  try {
    const entries = await fs.readdir(prdDir);
    return entries.filter((e) => e.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

// POST /api/project/init — scaffold .harness/ in a game repo
const initSchema = z.object({
  path: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  conventions: z.string().optional(),
});

router.post(
  '/init',
  asyncHandler(async (req, res) => {
    const parsed = initSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const repoPath = parsed.data.path;

    // Validate path exists and is a directory
    try {
      const stat = await fs.stat(repoPath);
      if (!stat.isDirectory()) throw new ValidationError(`${repoPath} is not a directory`);
    } catch (e) {
      if (e instanceof ValidationError) throw e;
      throw new ValidationError(`Path does not exist: ${repoPath}`);
    }

    // Check if .harness/project.yaml already exists
    const existingYaml = path.join(repoPath, '.harness', 'project.yaml');
    try {
      await fs.stat(existingYaml);
      throw new ValidationError(
        '.harness/project.yaml already exists. Use POST /api/project/reload to load it.'
      );
    } catch (e) {
      if (e instanceof ValidationError) throw e;
      // doesn't exist — good, we'll create it
    }

    // Auto-detect engine
    const detected = await detectEngine(repoPath);
    const prdCount = await countPrdDocs(repoPath);

    // Derive project ID from directory name
    const dirName = path.basename(repoPath);
    const projectId = dirName.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

    // Build project.yaml content
    const projectConfig = {
      project: {
        id: projectId,
        name: parsed.data.name ?? dirName,
        description: parsed.data.description ?? '',
        stack: {
          engine: detected.engine,
          ...(detected.engine_version && { engine_version: detected.engine_version }),
          language: detected.language,
          ...(detected.test_runner && { test_runner: detected.test_runner }),
        },
        paths: {
          source: '.',
          tests: 'tests/',
        },
        ...(parsed.data.conventions && { conventions: parsed.data.conventions }),
        prd_path: 'prd/',
      },
    };

    const yamlContent = yamlStringify(projectConfig, { lineWidth: 120 });

    // Scaffold directories
    await fs.mkdir(path.join(repoPath, '.harness', 'rooms'), { recursive: true });

    // Write project.yaml
    await fs.writeFile(existingYaml, yamlContent, 'utf-8');

    // Create prd/ with a template README if it doesn't exist
    const prdDir = path.join(repoPath, 'prd');
    try {
      await fs.stat(prdDir);
    } catch {
      await fs.mkdir(prdDir, { recursive: true });
      await fs.writeFile(
        path.join(prdDir, 'README.md'),
        [
          '# PRD — Product Requirements',
          '',
          'Place your product requirement documents here as Markdown files.',
          'The Orchestrator agent reads these when planning cycles.',
          '',
          'One file per major feature area is recommended.',
          '',
        ].join('\n'),
        'utf-8'
      );
    }

    res.status(201).json({
      scaffolded: true,
      projectId,
      detected,
      prdDocsFound: prdCount,
      yamlPath: existingYaml,
      yaml: yamlContent,
    });
  })
);

export default router;
