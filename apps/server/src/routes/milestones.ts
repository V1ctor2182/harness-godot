import { Router } from 'express';
import { z } from 'zod';
import { MilestoneModel } from '../models/milestone.js';
import { CycleModel } from '../models/cycle.js';
import { SpecModel } from '../models/spec.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';
import { broadcast } from '../services/sse-manager.js';

const router = Router();

// GET /api/milestones — list all (sorted by order)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    const items = await MilestoneModel.find(filter).sort({ order: 1 }).lean();
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

    const specs = await SpecModel.find({ 'provenance.cycle_tag': id }).limit(20).lean();

    res.json({ ...milestone, cyclesDetail: cycles, specs });
  })
);

// POST /api/milestones — create a new milestone
const createSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  goals: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  estimatedWeeks: z.number().optional(),
  source: z.enum(['human', 'orchestrator']).optional(),
  prdRef: z.string().optional(),
  order: z.number().optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const existing = await MilestoneModel.findById(data.id).lean();
    if (existing) throw new ValidationError(`Milestone ${data.id} already exists`);

    const count = await MilestoneModel.countDocuments();
    const milestone = await MilestoneModel.create({
      _id: data.id,
      name: data.name,
      description: data.description ?? '',
      goals: data.goals ?? [],
      features: data.features ?? [],
      dependsOn: data.dependsOn ?? [],
      estimatedWeeks: data.estimatedWeeks ?? 0,
      source: data.source ?? 'human',
      prdRef: data.prdRef,
      status: data.source === 'orchestrator' ? 'proposed' : 'planned',
      order: data.order ?? count,
    });

    broadcast('milestone:updated', { action: 'created', milestoneId: data.id });
    res.status(201).json(milestone);
  })
);

// PATCH /api/milestones/:id — update fields
const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  goals: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  estimatedWeeks: z.number().optional(),
  status: z.enum(['planned', 'active', 'completed', 'blocked', 'archived']).optional(),
  order: z.number().optional(),
});

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const id = req.params.id as string;
    const milestone = await MilestoneModel.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { new: true }
    );
    if (!milestone) throw new NotFoundError('Milestone', id);

    broadcast('milestone:updated', { action: 'updated', milestoneId: id });
    res.json(milestone);
  })
);

// PATCH /api/milestones/reorder — bulk reorder
const reorderSchema = z.array(z.object({ id: z.string(), order: z.number() }));

router.patch(
  '/reorder',
  asyncHandler(async (req, res) => {
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    for (const item of parsed.data) {
      await MilestoneModel.updateOne({ _id: item.id }, { $set: { order: item.order } });
    }

    broadcast('milestone:updated', { action: 'reordered' });
    res.json({ reordered: parsed.data.length });
  })
);

// POST /api/milestones/:id/confirm — flip proposed → planned
router.post(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const milestone = await MilestoneModel.findById(id);
    if (!milestone) throw new NotFoundError('Milestone', id);
    if (milestone.status !== 'proposed') {
      throw new ValidationError(`Milestone ${id} is ${milestone.status}, not proposed`);
    }

    milestone.status = 'planned';
    await milestone.save();

    broadcast('milestone:updated', { action: 'confirmed', milestoneId: id });
    broadcast('inbox:resolved', { id: `milestone:${id}` });
    res.json(milestone);
  })
);

// DELETE /api/milestones/:id — archive
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const milestone = await MilestoneModel.findByIdAndUpdate(
      id,
      { $set: { status: 'archived' } },
      { new: true }
    );
    if (!milestone) throw new NotFoundError('Milestone', id);

    broadcast('milestone:updated', { action: 'archived', milestoneId: id });
    res.json(milestone);
  })
);

export default router;
