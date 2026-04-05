import { Router } from 'express';
import { z } from 'zod';
import { JobModel } from '../models/job.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';

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

    job.approvalStatus = 'rejected';
    job.status = 'failed';
    job.error = parsed.data.reason ?? 'Rejected by human';
    job.completedAt = new Date();
    await job.save();

    res.json(job);
  })
);

export default router;
