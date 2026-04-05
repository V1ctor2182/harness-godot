import { Router } from 'express';
import { TaskModel } from '../models/task.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';
import { broadcast } from '../services/sse-manager.js';
import { createJob } from '../services/job-queue.js';

const router = Router();

// List tasks (optionally filtered by cycleId or status)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.cycleId) filter.cycleId = Number(req.query.cycleId);
    if (req.query.status) filter.status = req.query.status;

    const tasks = await TaskModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json(tasks);
  })
);

// Get single task
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const task = await TaskModel.findById(id).lean();
    if (!task) throw new NotFoundError('Task', id);
    res.json(task);
  })
);

// Update task
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const update: Record<string, unknown> = { $set: req.body };

    // Append activity log entry when status is being changed
    if (req.body.status) {
      update.$push = {
        activityLog: { timestamp: new Date(), action: `Status changed to ${req.body.status}` },
      };
    }

    const task = await TaskModel.findByIdAndUpdate(id, update, { new: true });
    if (!task) throw new NotFoundError('Task', id);

    // Broadcast status change if status was updated
    if (req.body.status) {
      const eventData: Record<string, unknown> = { taskId: id, status: req.body.status };
      if (req.body.prNumber !== undefined) eventData.prNumber = req.body.prNumber;
      broadcast('task:status_changed', eventData);
    }

    res.json(task);
  })
);

// Retry a failed task — resets status to backlog and re-queues a coder agent
router.post(
  '/:id/retry',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const task = await TaskModel.findById(id).lean();
    if (!task) throw new NotFoundError('Task', id);

    if (task.status !== 'failed') {
      throw new ValidationError(
        `Task ${id} cannot be retried: status is '${task.status}', expected 'failed'`
      );
    }

    const updated = await TaskModel.findByIdAndUpdate(
      id,
      {
        $set: { status: 'backlog' },
        $inc: { retryCount: 1 },
        $push: { activityLog: { timestamp: new Date(), action: 'Retried manually' } },
      },
      { new: true }
    );

    await createJob('spawn', 'agent', { role: 'coder', taskId: id, cycleId: task.cycleId });

    broadcast('task:status_changed', { taskId: id, status: 'backlog' });

    res.json(updated);
  })
);

export default router;
