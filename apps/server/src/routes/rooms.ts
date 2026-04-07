import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { RoomModel } from '../models/room.js';
import { SpecModel } from '../models/spec.js';
import { NotFoundError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();

const createRoomSchema = z.object({
  _id: z.string(),
  name: z.string(),
  parent: z.string().nullable().optional(),
  type: z.enum(['project', 'epic', 'feature']),
  owner: z.string().optional(),
  lifecycle: z.enum(['planning', 'active', 'stable', 'archived']).optional(),
  depends_on: z.array(z.string()).optional(),
  contributors: z.array(z.string()).optional(),
  path: z.string(),
});

const patchRoomSchema = z
  .object({
    name: z.string().optional(),
    lifecycle: z.enum(['planning', 'active', 'stable', 'archived']).optional(),
    owner: z.string().optional(),
    depends_on: z.array(z.string()).optional(),
    contributors: z.array(z.string()).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

// GET /api/rooms/tree — full tree structure (must be registered before /:id)
router.get(
  '/tree',
  asyncHandler(async (_req: Request, res: Response) => {
    const rooms = await RoomModel.find().lean();

    // Build parent→children map
    const childrenMap = new Map<string | null, typeof rooms>();
    for (const room of rooms) {
      const parentKey = room.parent ?? null;
      if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
      childrenMap.get(parentKey)!.push(room);
    }

    // Get spec counts per room
    const specCounts = await SpecModel.aggregate([
      { $group: { _id: '$roomId', total: { $sum: 1 }, draft: { $sum: { $cond: [{ $eq: ['$state', 'draft'] }, 1, 0] } } } },
    ]);
    const specCountMap = new Map<string, { total: number; draft: number }>();
    for (const entry of specCounts) {
      specCountMap.set(entry._id, { total: entry.total, draft: entry.draft });
    }

    interface TreeNode {
      _id: string;
      name: string;
      type: string;
      owner: string;
      lifecycle: string;
      path: string;
      specCount: { total: number; draft: number };
      children: TreeNode[];
    }

    function buildTree(parentId: string | null): TreeNode[] {
      const children = childrenMap.get(parentId) ?? [];
      return children.map((room) => ({
        _id: room._id as string,
        name: room.name as string,
        type: room.type as string,
        owner: (room.owner ?? 'backend') as string,
        lifecycle: (room.lifecycle ?? 'planning') as string,
        path: room.path as string,
        specCount: specCountMap.get(room._id as string) ?? { total: 0, draft: 0 },
        children: buildTree(room._id as string),
      }));
    }

    res.json(buildTree(null));
  })
);

// GET /api/rooms — list rooms
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.parent) filter.parent = req.query.parent;
    if (req.query.lifecycle) filter.lifecycle = req.query.lifecycle;
    if (req.query.type) filter.type = req.query.type;

    const rooms = await RoomModel.find(filter).sort({ _id: 1 }).lean();
    res.json(rooms);
  })
);

// GET /api/rooms/:id — single room + children + spec counts
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const room = await RoomModel.findById(id).lean();
    if (!room) throw new NotFoundError('Room', id);

    const [children, specCounts] = await Promise.all([
      RoomModel.find({ parent: id }).lean(),
      SpecModel.aggregate([
        { $match: { roomId: id } },
        {
          $group: {
            _id: '$state',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const specs: Record<string, number> = {};
    for (const entry of specCounts) {
      specs[entry._id] = entry.count;
    }

    res.json({ ...room, children, specs });
  })
);

// POST /api/rooms — create room
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const room = await RoomModel.create({
      ...parsed.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.status(201).json(room);
  })
);

// PATCH /api/rooms/:id — update room
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = patchRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const id = req.params.id as string;
    const room = await RoomModel.findByIdAndUpdate(
      id,
      { $set: { ...parsed.data, updatedAt: new Date() } },
      { new: true }
    );
    if (!room) throw new NotFoundError('Room', id);
    res.json(room);
  })
);

export default router;
