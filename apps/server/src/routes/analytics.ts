import { Router } from 'express';
import { AgentRunModel } from '../models/agent-run.js';
import { CycleModel } from '../models/cycle.js';
import { TaskModel } from '../models/task.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();

router.get(
  '/spending',
  asyncHandler(async (_req, res) => {
    const [byCycle, byRole] = await Promise.all([
      AgentRunModel.aggregate([
        {
          $group: {
            _id: '$cycleId',
            totalCostUsd: { $sum: '$costUsd' },
            runCount: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 20 },
        {
          $project: {
            _id: 0,
            cycleId: '$_id',
            totalCostUsd: { $round: ['$totalCostUsd', 2] },
            runCount: 1,
          },
        },
      ]),
      AgentRunModel.aggregate([
        {
          $group: {
            _id: '$role',
            totalCostUsd: { $sum: '$costUsd' },
            runCount: { $sum: 1 },
          },
        },
        { $sort: { totalCostUsd: -1 } },
        {
          $project: {
            _id: 0,
            role: '$_id',
            totalCostUsd: { $round: ['$totalCostUsd', 2] },
            runCount: 1,
          },
        },
      ]),
    ]);

    res.json({ byCycle, byRole });
  })
);

router.get(
  '/tasks',
  asyncHandler(async (_req, res) => {
    const [byType, byCycle] = await Promise.all([
      TaskModel.aggregate([
        {
          $group: {
            _id: '$type',
            total: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            avgRetryCount: { $avg: '$retryCount' },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            type: '$_id',
            total: 1,
            done: 1,
            failed: 1,
            avgRetryCount: { $round: [{ $ifNull: ['$avgRetryCount', 0] }, 2] },
          },
        },
      ]),
      TaskModel.aggregate([
        {
          $group: {
            _id: '$cycleId',
            total: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            avgRetryCount: { $avg: '$retryCount' },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 20 },
        {
          $project: {
            _id: 0,
            cycleId: '$_id',
            total: 1,
            done: 1,
            failed: 1,
            avgRetryCount: { $round: [{ $ifNull: ['$avgRetryCount', 0] }, 2] },
          },
        },
      ]),
    ]);

    res.json({ byType, byCycle });
  })
);

interface ReviewQualityEntry {
  cycleId: number;
  tasksRetried: number | null;
  tasksPassedFirstReview: number | null;
  retryRate: number | null;
}

router.get(
  '/review-quality',
  asyncHandler(async (_req, res) => {
    type CycleLean = {
      _id: number;
      metrics?: { tasksRetried?: number; tasksPassedFirstReview?: number };
    };
    const cycles = await CycleModel.find({ status: 'completed' })
      .sort({ _id: -1 })
      .limit(20)
      .lean<CycleLean[]>();

    const result: ReviewQualityEntry[] = cycles.map((cycle) => {
      const cycleId = cycle._id;
      const m = cycle.metrics;

      if (!m || m.tasksRetried === undefined) {
        return { cycleId, tasksRetried: null, tasksPassedFirstReview: null, retryRate: null };
      }

      const tasksRetried = m.tasksRetried;
      const tasksPassedFirstReview = m.tasksPassedFirstReview ?? 0;
      const total = tasksRetried + tasksPassedFirstReview;
      const retryRate = total === 0 ? 0 : Math.round((tasksRetried / total) * 100) / 100;

      return { cycleId, tasksRetried, tasksPassedFirstReview, retryRate };
    });

    res.json(result);
  })
);

export default router;
