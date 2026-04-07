import { Router } from 'express';
import { z } from 'zod';
import { getOrCreateControl, ControlModel } from '../models/control.js';
import { AgentRunModel } from '../models/agent-run.js';
import { killContainer } from '../services/launcher/container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { broadcast } from '../services/sse-manager.js';

const router = Router();

const patchControlSchema = z.object({
  mode: z.enum(['active', 'paused', 'killed']).optional(),
  humanMessage: z.string().optional(),
  spendingCapUsd: z.number().positive().optional(),
  autoApprovalCategories: z.array(z.string()).optional(),
  operationMode: z.enum(['auto', 'supervised', 'manual']).optional(),
  cycleOverrides: z.record(z.unknown()).optional(),
});

// Get control state
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const control = await getOrCreateControl();
    res.json(control);
  })
);

// Update control state
router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = patchControlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { mode, humanMessage, spendingCapUsd, autoApprovalCategories, operationMode, cycleOverrides } =
      parsed.data;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (mode !== undefined) update.mode = mode;
    if (humanMessage !== undefined) update.humanMessage = humanMessage;
    if (spendingCapUsd !== undefined) update.spendingCapUsd = spendingCapUsd;
    if (autoApprovalCategories !== undefined)
      update.autoApprovalCategories = autoApprovalCategories;
    if (operationMode !== undefined) update.operationMode = operationMode;
    if (cycleOverrides !== undefined) update.cycleOverrides = cycleOverrides;

    await getOrCreateControl(); // Ensure it exists
    const control = await ControlModel.findByIdAndUpdate(
      'singleton',
      { $set: update },
      { new: true }
    );

    // Broadcast control update so dashboards/event logs refresh
    const controlObj = control?.toObject() as Record<string, unknown> | undefined;
    broadcast('system:control_updated', {
      mode: controlObj?.mode,
      operationMode: controlObj?.operationMode,
      updatedAt: controlObj?.updatedAt,
    });

    // Handle kill mode
    if (mode === 'killed') {
      const runningAgents = await AgentRunModel.find({ status: 'running' }).lean();
      for (const agent of runningAgents) {
        if (agent.containerId) {
          try {
            await killContainer(agent.containerId);
            await AgentRunModel.updateOne(
              { _id: agent._id },
              { $set: { status: 'killed', completedAt: new Date(), error: 'Killed via control' } }
            );
          } catch (err) {
            console.error(`Failed to kill container for ${agent._id}:`, err);
          }
        }
      }
    }

    res.json(control);
  })
);

export default router;
