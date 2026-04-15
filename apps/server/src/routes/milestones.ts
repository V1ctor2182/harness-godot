import { Router } from 'express';
import { MilestoneModel } from '../models/milestone.js';
import { CycleModel } from '../models/cycle.js';
import { SpecModel } from '../models/spec.js';
import { NotFoundError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';
import { seedMilestones } from '../lib/seed-milestones.js';
import { broadcast } from '../services/sse-manager.js';

const router = Router();

// GET /api/milestones — list all
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await MilestoneModel.find({}).sort({ order: 1 }).lean();
    res.json(items);
  })
);

// GET /api/milestones/:id — single with joined cycles + specs
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const milestone = await MilestoneModel.findById(id).lean();
    if (!milestone) throw new NotFoundError('Milestone', id);

    const cycleIds = milestone.cycles ?? [];
    const cycles = cycleIds.length
      ? await CycleModel.find({ _id: { $in: cycleIds } })
          .sort({ _id: 1 })
          .lean()
      : [];

    // Specs linked to this milestone via provenance.cycle_tag (best effort)
    const specs = await SpecModel.find({ 'provenance.cycle_tag': id }).limit(20).lean();

    res.json({ ...milestone, cyclesDetail: cycles, specs });
  })
);

// POST /api/milestones/sync — re-run the yaml seed
router.post(
  '/sync',
  asyncHandler(async (_req, res) => {
    const result = await seedMilestones();
    broadcast('milestone:updated', { action: 'synced', upserted: result.upserted });
    res.json(result);
  })
);

export default router;
