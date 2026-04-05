import { Router } from 'express';
import { AgentRunModel } from '../models/agent-run.js';
import { AgentEventModel } from '../models/agent-event.js';
import { NotFoundError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();

// List agent runs
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.cycleId) filter.cycleId = Number(req.query.cycleId);
    if (req.query.taskId) filter.taskId = req.query.taskId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.role) filter.role = req.query.role;

    const runs = await AgentRunModel.find(filter).sort({ startedAt: -1 }).lean();
    res.json(runs);
  })
);

// Get single agent run
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const run = await AgentRunModel.findById(id).lean();
    if (!run) throw new NotFoundError('AgentRun', id);
    res.json(run);
  })
);

// Get events for an agent run
router.get(
  '/:id/events',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const run = await AgentRunModel.findById(id).lean();
    if (!run) throw new NotFoundError('AgentRun', id);

    const filter: Record<string, unknown> = { agentRunId: id };
    if (req.query.type) filter.type = req.query.type;

    const events = await AgentEventModel.find(filter).sort({ sequenceNum: 1 }).lean();
    res.json(events);
  })
);

export default router;
