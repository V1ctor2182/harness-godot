import { Router, Request, Response } from 'express';
import { TestResultModel } from '../models/test-result.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();

// GET /api/tests — list test results
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.taskId) filter.taskId = req.query.taskId;
    if (req.query.cycleId) filter.cycleId = Number(req.query.cycleId);
    if (req.query.layer) filter.layer = req.query.layer;
    if (req.query.status) filter.status = req.query.status;

    const limitRaw = req.query.limit !== undefined ? parseInt(req.query.limit as string, 10) : 100;
    const limit = !isNaN(limitRaw) ? Math.min(limitRaw, 500) : 100;

    const results = await TestResultModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(results);
  })
);

export default router;
