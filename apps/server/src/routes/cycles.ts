import { Router } from 'express';
import { CycleModel } from '../models/cycle.js';
import { getNextCycleId } from '../models/counter.js';
import { createJob } from '../services/job-queue.js';
import { NotFoundError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';
import { getProjectConfig } from '../lib/project-config.js';

const router = Router();

// List cycles
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const cycles = await CycleModel.find().sort({ _id: -1 }).lean();
    res.json(cycles);
  })
);

// Get active cycle
router.get(
  '/active',
  asyncHandler(async (_req, res) => {
    const cycle = await CycleModel.findOne({ status: 'active' }).lean();
    if (!cycle) throw new NotFoundError('Cycle', 'active');
    res.json(cycle);
  })
);

// Get single cycle
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const cycle = await CycleModel.findById(Number(id)).lean();
    if (!cycle) throw new NotFoundError('Cycle', id);
    res.json(cycle);
  })
);

// Create a new cycle
router.post(
  '/',
  asyncHandler(async (req, res) => {
    // Phase C hard-block: can't spawn agents without a project loaded.
    const project = getProjectConfig();
    if (!project) {
      res.status(409).json({
        error: 'no_project_loaded',
        message:
          'No project loaded. Set PROJECT_REPO_LOCAL_PATH and create .ludus/project.yaml in the project repo, then POST /api/project/reload.',
      });
      return;
    }

    const { goal } = req.body;
    if (!goal) {
      res.status(400).json({ error: 'goal is required' });
      return;
    }

    const cycleId = await getNextCycleId();
    const cycle = await CycleModel.create({
      _id: cycleId,
      goal,
      phase: 'plan',
      status: 'active',
    });

    // Spawn orchestrator to plan
    await createJob('spawn', 'agent', { role: 'orchestrator', cycleId });

    res.status(201).json(cycle);
  })
);

// Update cycle (manual phase/status override)
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const cycle = await CycleModel.findByIdAndUpdate(Number(id), { $set: req.body }, { new: true });
    if (!cycle) throw new NotFoundError('Cycle', id);
    res.json(cycle);
  })
);

export default router;
