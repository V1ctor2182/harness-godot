import { Router } from 'express';
import { getProjectConfigState, loadProjectConfig } from '../lib/project-config.js';
import { asyncHandler } from '../lib/async-handler.js';
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

// POST /api/project/reload — re-read $PROJECT_REPO_LOCAL_PATH/.harness/project.yaml
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

export default router;
