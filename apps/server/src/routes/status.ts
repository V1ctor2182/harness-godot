import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { AgentRunModel } from '../models/agent-run.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const activeAgentCount = await AgentRunModel.countDocuments({
      status: { $in: ['starting', 'running'] },
    });

    res.status(200).json({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeAgentCount,
    });
  })
);

export default router;
