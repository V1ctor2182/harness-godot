import { Router } from 'express';
import { z } from 'zod';
import { JobModel } from '../models/job.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';
import { createJob } from '../services/job-queue.js';

const router = Router();

const approvalBodySchema = z.object({
  reason: z.string().optional(),
});

// List jobs
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;

    const jobs = await JobModel.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json(jobs);
  })
);

// Get single job
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const job = await JobModel.findById(id).lean();
    if (!job) throw new NotFoundError('Job', id);
    res.json(job);
  })
);

// Approve a job
router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const parsed = approvalBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const id = req.params.id as string;
    const job = await JobModel.findById(id);
    if (!job) throw new NotFoundError('Job', id);
    if (!job.requiresApproval) throw new ValidationError('Job does not require approval');
    if (job.approvalStatus !== 'pending')
      throw new ValidationError(`Job already ${job.approvalStatus}`);

    job.approvalStatus = 'approved';
    job.approvedBy = 'human';
    await job.save();

    res.json(job);
  })
);

// Reject a job
router.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const parsed = approvalBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const id = req.params.id as string;
    const job = await JobModel.findById(id);
    if (!job) throw new NotFoundError('Job', id);
    if (!job.requiresApproval) throw new ValidationError('Job does not require approval');
    if (job.approvalStatus !== 'pending')
      throw new ValidationError(`Job already ${job.approvalStatus}`);

    const reason = parsed.data.reason ?? 'Rejected by human';

    job.approvalStatus = 'rejected';
    job.status = 'failed';
    job.error = reason;
    job.completedAt = new Date();
    await job.save();

    // Plan-approval rejection: re-spawn orchestrator with feedback (max 1 retry)
    if (job.type === 'plan-approval') {
      const payload = job.payload as Record<string, unknown>;
      const cycleId = payload.cycleId as number;

      // Count how many plan-approval jobs have been rejected for this cycle
      const priorRejections = await JobModel.countDocuments({
        type: 'plan-approval',
        status: 'failed',
        'payload.cycleId': cycleId,
        approvalStatus: 'rejected',
      });

      if (priorRejections <= 1) {
        // First rejection (the one we just saved) → replan
        await createJob('spawn', 'agent', {
          role: 'orchestrator',
          cycleId,
          retryContext: {
            previousError: `Human rejected plan: ${reason}`,
            previousSummary: `Plan rejected by human operator. Replan with this feedback: ${reason}`,
          },
        });
      }
      // 2+ rejections: cycle stalls — human must create a new cycle or manually intervene
    }

    res.json(job);
  })
);

// Answer plan Q&A questions
const answerBodySchema = z.object({
  answers: z.record(z.string()),
  feedback: z.string().optional(),
});

router.post(
  '/:id/answer',
  asyncHandler(async (req, res) => {
    const parsed = answerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const id = req.params.id as string;
    const job = await JobModel.findById(id);
    if (!job) throw new NotFoundError('Job', id);
    if (job.type !== 'plan-qa') throw new ValidationError('Job is not a plan-qa job');
    if (job.approvalStatus !== 'pending')
      throw new ValidationError(`Job already ${job.approvalStatus}`);

    const payload = job.payload as Record<string, unknown>;
    payload.humanAnswers = parsed.data.answers;
    if (parsed.data.feedback) {
      payload.humanFeedback = parsed.data.feedback;
    }

    job.approvalStatus = 'approved';
    job.status = 'completed';
    job.completedAt = new Date();
    job.payload = payload;
    await job.save();

    // Re-spawn orchestrator with human answers (not counted as retry)
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

    res.json({ status: 'answered', jobId: id });
  })
);

export default router;
