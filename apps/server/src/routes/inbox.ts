import { Router } from 'express';
import { z } from 'zod';
import { JobModel } from '../models/job.js';
import { SpecModel } from '../models/spec.js';
import { TaskModel } from '../models/task.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';
import { createJob } from '../services/job-queue.js';
import { broadcast } from '../services/sse-manager.js';

const router = Router();

type InboxItemType =
  | 'approval'
  | 'plan_qa'
  | 'plan_review'
  | 'pr_gate'
  | 'draft_spec'
  | 'next_cycle';

type InboxUrgency = 'low' | 'normal' | 'urgent';

interface InboxItem {
  id: string;
  type: InboxItemType;
  source: {
    kind: 'job' | 'spec' | 'task';
    refId: string;
    cycleId?: number;
    taskId?: string;
    agentRunId?: string;
  };
  title: string;
  preview: string;
  urgency: InboxUrgency;
  status: 'unread' | 'read';
  payload: Record<string, unknown>;
  createdAt: Date;
  readAt?: Date;
}

function urgencyOf(createdAt: Date, type: InboxItemType): InboxUrgency {
  const ageMin = (Date.now() - createdAt.getTime()) / 60_000;
  if (type === 'pr_gate' || type === 'next_cycle') return 'urgent';
  if (ageMin > 60) return 'urgent';
  if (ageMin > 15) return 'normal';
  return 'low';
}

interface JobLean {
  _id: unknown;
  type: string;
  status: string;
  payload?: Record<string, unknown>;
  requiresApproval?: boolean;
  approvalStatus?: string;
  createdAt?: Date;
}

interface SpecLean {
  _id: string;
  type: string;
  roomId: string;
  state: string;
  title: string;
  summary?: string;
  detail?: string;
  provenance?: { confidence?: number; cycleId?: number; agentRunId?: string };
  createdAt?: Date;
}

interface TaskLean {
  _id: string;
  title: string;
  status: string;
  cycleId: number;
  prNumber?: number;
  prUrl?: string;
  branch?: string;
  reviewVerdict?: string;
  createdAt?: Date;
}

function jobToItem(job: JobLean): InboxItem | null {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const cycleId = typeof payload.cycleId === 'number' ? payload.cycleId : undefined;
  const taskId = typeof payload.taskId === 'string' ? payload.taskId : undefined;
  const createdAt = job.createdAt ?? new Date();
  const id = String(job._id);

  if (job.type === 'plan-qa' && job.approvalStatus === 'pending') {
    const questions = (payload.questions as unknown[] | undefined) ?? [];
    return {
      id: `job:${id}`,
      type: 'plan_qa',
      source: { kind: 'job', refId: id, cycleId, taskId },
      title: `Orchestrator has ${questions.length} question${questions.length === 1 ? '' : 's'}`,
      preview: (questions[0] as { question?: string } | undefined)?.question ?? 'Plan Q&A pending',
      urgency: urgencyOf(createdAt, 'plan_qa'),
      status: 'unread',
      payload,
      createdAt,
    };
  }

  if (job.type === 'plan-approval' && job.approvalStatus === 'pending') {
    return {
      id: `job:${id}`,
      type: 'plan_review',
      source: { kind: 'job', refId: id, cycleId, taskId },
      title: `Plan ready for review · cycle ${cycleId ?? '?'}`,
      preview: (payload.goal as string) ?? 'Approve or request changes',
      urgency: urgencyOf(createdAt, 'plan_review'),
      status: 'unread',
      payload,
      createdAt,
    };
  }

  if (job.type === 'next-cycle' && job.approvalStatus === 'pending') {
    return {
      id: `job:${id}`,
      type: 'next_cycle',
      source: { kind: 'job', refId: id, cycleId, taskId },
      title: `Next cycle pending decision · cycle ${cycleId ?? '?'}`,
      preview: (payload.reason as string) ?? 'All tasks failed — continue or stop?',
      urgency: urgencyOf(createdAt, 'next_cycle'),
      status: 'unread',
      payload,
      createdAt,
    };
  }

  if (job.requiresApproval && job.approvalStatus === 'pending') {
    return {
      id: `job:${id}`,
      type: 'approval',
      source: { kind: 'job', refId: id, cycleId, taskId },
      title: `${job.type} needs approval`,
      preview: typeof payload.reason === 'string' ? payload.reason : `Job type: ${job.type}`,
      urgency: urgencyOf(createdAt, 'approval'),
      status: 'unread',
      payload,
      createdAt,
    };
  }

  return null;
}

function specToItem(spec: SpecLean): InboxItem {
  const createdAt = spec.createdAt ?? new Date();
  return {
    id: `spec:${spec._id}`,
    type: 'draft_spec',
    source: {
      kind: 'spec',
      refId: spec._id,
      cycleId: spec.provenance?.cycleId,
      agentRunId: spec.provenance?.agentRunId,
    },
    title: `Draft spec: ${spec.title}`,
    preview: spec.summary || spec.detail?.slice(0, 160) || `${spec.type} · ${spec.roomId}`,
    urgency: urgencyOf(createdAt, 'draft_spec'),
    status: 'unread',
    payload: {
      specType: spec.type,
      roomId: spec.roomId,
      confidence: spec.provenance?.confidence,
    },
    createdAt,
  };
}

function taskToPRGateItem(task: TaskLean): InboxItem {
  const createdAt = task.createdAt ?? new Date();
  return {
    id: `task:${task._id}`,
    type: 'pr_gate',
    source: { kind: 'task', refId: task._id, cycleId: task.cycleId, taskId: task._id },
    title: `PR #${task.prNumber} · ${task.title}`,
    preview: `Review verdict pending for ${task._id}`,
    urgency: urgencyOf(createdAt, 'pr_gate'),
    status: 'unread',
    payload: {
      prNumber: task.prNumber,
      prUrl: task.prUrl,
      branch: task.branch,
    },
    createdAt,
  };
}

async function loadInboxItems(filters: {
  type?: InboxItemType;
  cycleId?: number;
}): Promise<InboxItem[]> {
  const items: InboxItem[] = [];
  const pickType = (t: InboxItemType) => !filters.type || filters.type === t;
  const byCycle = (cycleId?: number) =>
    filters.cycleId == null || cycleId === filters.cycleId;

  // Jobs — covers approval / plan_qa / plan_review / next_cycle
  const jobTypesInvolved = ['plan-qa', 'plan-approval', 'next-cycle', 'spawn', 'apply-plan'];
  const jobs = await JobModel.find({
    $or: [
      { requiresApproval: true, approvalStatus: 'pending' },
      { type: { $in: jobTypesInvolved }, approvalStatus: 'pending' },
    ],
  })
    .sort({ createdAt: -1 })
    .lean();

  for (const job of jobs) {
    const item = jobToItem(job as unknown as JobLean);
    if (!item) continue;
    if (!pickType(item.type)) continue;
    if (!byCycle(item.source.cycleId)) continue;
    items.push(item);
  }

  // Specs — draft state
  if (pickType('draft_spec')) {
    const specs = await SpecModel.find({ state: 'draft' }).sort({ createdAt: -1 }).lean();
    for (const spec of specs) {
      const item = specToItem(spec as unknown as SpecLean);
      if (!byCycle(item.source.cycleId)) continue;
      items.push(item);
    }
  }

  // Tasks with open PR waiting on review verdict
  if (pickType('pr_gate')) {
    const tasks = await TaskModel.find({
      status: 'in-review',
      prNumber: { $exists: true, $ne: null },
      reviewVerdict: { $exists: false },
    })
      .sort({ updatedAt: -1 })
      .lean();
    for (const task of tasks) {
      const item = taskToPRGateItem(task as unknown as TaskLean);
      if (!byCycle(item.source.cycleId)) continue;
      items.push(item);
    }
  }

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return items;
}

// GET /api/inbox — list items
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const typeParam = req.query.type as string | undefined;
    const cycleIdParam = req.query.cycleId as string | undefined;
    const items = await loadInboxItems({
      type: typeParam as InboxItemType | undefined,
      cycleId: cycleIdParam ? Number(cycleIdParam) : undefined,
    });
    res.json(items);
  })
);

// GET /api/inbox/count — unread count for top nav badge
router.get(
  '/count',
  asyncHandler(async (_req, res) => {
    const items = await loadInboxItems({});
    res.json({ count: items.length });
  })
);

// GET /api/inbox/:id — single item
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const items = await loadInboxItems({});
    const item = items.find((i) => i.id === req.params.id);
    if (!item) throw new NotFoundError('InboxItem', req.params.id as string);
    res.json(item);
  })
);

// POST /api/inbox/:id/resolve — dispatch to the underlying handler
const resolveBodySchema = z.object({
  action: z.enum(['approve', 'reject', 'answer', 'activate_spec', 'archive_spec']),
  reason: z.string().optional(),
  answers: z.record(z.string()).optional(),
  feedback: z.string().optional(),
});

router.post(
  '/:id/resolve',
  asyncHandler(async (req, res) => {
    const parsed = resolveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const id = req.params.id as string;
    const [kind, refId] = id.split(':');
    if (!kind || !refId) throw new ValidationError('Invalid inbox id');

    if (kind === 'job') {
      const job = await JobModel.findById(refId);
      if (!job) throw new NotFoundError('Job', refId);

      if (parsed.data.action === 'approve') {
        if (!job.requiresApproval) throw new ValidationError('Job does not require approval');
        if (job.approvalStatus !== 'pending')
          throw new ValidationError(`Job already ${job.approvalStatus}`);
        job.approvalStatus = 'approved';
        job.approvedBy = 'human';
        await job.save();
      } else if (parsed.data.action === 'reject') {
        if (!job.requiresApproval) throw new ValidationError('Job does not require approval');
        if (job.approvalStatus !== 'pending')
          throw new ValidationError(`Job already ${job.approvalStatus}`);
        job.approvalStatus = 'rejected';
        job.status = 'failed';
        job.error = parsed.data.reason ?? 'Rejected from inbox';
        job.completedAt = new Date();
        await job.save();

        if (job.type === 'plan-approval') {
          const payload = job.payload as Record<string, unknown>;
          const cycleId = payload.cycleId as number;
          const priorRejections = await JobModel.countDocuments({
            type: 'plan-approval',
            status: 'failed',
            'payload.cycleId': cycleId,
            approvalStatus: 'rejected',
          });
          if (priorRejections <= 1) {
            await createJob('spawn', 'agent', {
              role: 'orchestrator',
              cycleId,
              retryContext: {
                previousError: `Human rejected plan: ${job.error}`,
                previousSummary: `Plan rejected from inbox. Replan with feedback: ${job.error}`,
              },
            });
          }
        }
      } else if (parsed.data.action === 'answer') {
        if (job.type !== 'plan-qa') throw new ValidationError('Job is not a plan-qa job');
        if (job.approvalStatus !== 'pending')
          throw new ValidationError(`Job already ${job.approvalStatus}`);
        if (!parsed.data.answers) throw new ValidationError('answers required');

        const payload = job.payload as Record<string, unknown>;
        payload.humanAnswers = parsed.data.answers;
        if (parsed.data.feedback) payload.humanFeedback = parsed.data.feedback;
        job.approvalStatus = 'approved';
        job.status = 'completed';
        job.completedAt = new Date();
        job.payload = payload;
        await job.save();

        const cycleId = payload.cycleId as number;
        await createJob('spawn', 'agent', {
          role: 'orchestrator',
          cycleId,
          retryContext: {
            previousSummary: 'Replanning with human answers to questions',
            humanAnswers: parsed.data.answers,
            humanFeedback: parsed.data.feedback,
          },
        });
      } else {
        throw new ValidationError(`Action ${parsed.data.action} not valid for job`);
      }
    } else if (kind === 'spec') {
      if (parsed.data.action !== 'activate_spec' && parsed.data.action !== 'archive_spec') {
        throw new ValidationError(`Action ${parsed.data.action} not valid for spec`);
      }
      const newState = parsed.data.action === 'activate_spec' ? 'active' : 'archived';
      const spec = await SpecModel.findByIdAndUpdate(
        refId,
        { $set: { state: newState, updatedAt: new Date() } },
        { new: true }
      );
      if (!spec) throw new NotFoundError('Spec', refId);
    } else if (kind === 'task') {
      if (parsed.data.action !== 'approve' && parsed.data.action !== 'reject') {
        throw new ValidationError(`Action ${parsed.data.action} not valid for task PR gate`);
      }
      const task = await TaskModel.findById(refId);
      if (!task) throw new NotFoundError('Task', refId);
      task.reviewVerdict = parsed.data.action === 'approve' ? 'approved' : 'changes-requested';
      task.status = parsed.data.action === 'approve' ? 'done' : 'failed';
      await task.save();
    } else {
      throw new ValidationError(`Unknown inbox kind: ${kind}`);
    }

    broadcast('inbox:resolved', { id });

    // Also broadcast updated count so nav badge refreshes without polling
    const items = await loadInboxItems({});
    broadcast('inbox:new', { count: items.length });

    res.json({ status: 'resolved', id });
  })
);

export default router;
