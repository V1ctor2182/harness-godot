import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { SpecModel } from '../models/spec.js';
import { NotFoundError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();

const createSpecSchema = z.object({
  _id: z.string().optional(),
  roomId: z.string(),
  type: z.enum(['intent', 'decision', 'constraint', 'contract', 'convention', 'change', 'context']),
  state: z.enum(['draft', 'active', 'archived']).optional(),
  title: z.string(),
  summary: z.string().optional(),
  detail: z.string().optional(),
  provenance: z
    .object({
      source_type: z.enum(['human', 'prd_extraction', 'codebase_extraction', 'agent_sediment', 'curator_review']),
      confidence: z.number().min(0).max(1),
      source_ref: z.string().optional(),
      agentRunId: z.string().optional(),
      cycleId: z.number().optional(),
      cycle_tag: z.string().optional(),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
  relations: z
    .array(
      z.object({
        target: z.string(),
        type: z.enum(['depends_on', 'conflicts_with', 'supersedes', 'relates_to']),
      })
    )
    .optional(),
  anchors: z
    .array(
      z.object({
        file: z.string(),
        symbol: z.string().optional(),
        line_range: z.string().optional(),
      })
    )
    .optional(),
});

const patchSpecSchema = z
  .object({
    state: z.enum(['draft', 'active', 'archived']).optional(),
    title: z.string().optional(),
    summary: z.string().optional(),
    detail: z.string().optional(),
    tags: z.array(z.string()).optional(),
    qualityScore: z.number().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

// POST /api/specs/archive-stale — must be registered before /:id
router.post(
  '/archive-stale',
  asyncHandler(async (req: Request, res: Response) => {
    const { roomId, maxCyclesUnreferenced } = req.body as {
      roomId?: string;
      maxCyclesUnreferenced?: number;
    };

    const filter: Record<string, unknown> = { state: 'active' };
    if (roomId) filter.roomId = roomId;

    // Archive specs not referenced in the last N cycles (default 10)
    // Approximation: use lastReferencedAt with a time-based threshold
    const thresholdCycles = maxCyclesUnreferenced ?? 10;
    // Estimate ~1 hour per cycle → threshold in milliseconds
    const thresholdMs = thresholdCycles * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - thresholdMs);

    filter.$or = [
      { lastReferencedAt: { $lt: cutoffDate } },
      { lastReferencedAt: { $exists: false } },
    ];

    const result = await SpecModel.updateMany(filter, {
      $set: { state: 'archived', updatedAt: new Date() },
    });

    res.json({ archived: result.modifiedCount });
  })
);

// GET /api/specs — list specs
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.roomId) filter.roomId = req.query.roomId;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.state) filter.state = req.query.state;
    if (req.query.tags) {
      const tags = (req.query.tags as string).split(',');
      filter.tags = { $in: tags };
    }

    const specs = await SpecModel.find(filter).sort({ qualityScore: -1 }).lean();
    res.json(specs);
  })
);

// GET /api/specs/:id — single spec
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const spec = await SpecModel.findById(id).lean();
    if (!spec) throw new NotFoundError('Spec', id);
    res.json(spec);
  })
);

// POST /api/specs — create spec
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createSpecSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const id =
      data._id ??
      `${data.type}-${data.roomId}-${Date.now().toString(36)}`;

    const spec = await SpecModel.create({
      _id: id,
      roomId: data.roomId,
      type: data.type,
      state: data.state ?? 'draft',
      title: data.title,
      summary: data.summary ?? '',
      detail: data.detail ?? '',
      provenance: data.provenance ?? { source_type: 'human', confidence: 1.0 },
      tags: data.tags ?? [],
      relations: data.relations ?? [],
      anchors: data.anchors ?? [],
      qualityScore: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.status(201).json(spec);
  })
);

// PATCH /api/specs/:id — update spec
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = patchSpecSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const id = req.params.id as string;
    const spec = await SpecModel.findByIdAndUpdate(
      id,
      { $set: { ...parsed.data, updatedAt: new Date() } },
      { new: true }
    );
    if (!spec) throw new NotFoundError('Spec', id);
    res.json(spec);
  })
);

export default router;
