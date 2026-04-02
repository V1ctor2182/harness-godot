import mongoose, { Schema } from 'mongoose';

const jobSchema = new Schema({
  type: {
    type: String,
    enum: [
      'spawn',
      'wait-for-ci',
      'apply-plan',
      'advance-cycle',
      'curate-inbox',
      'next-cycle',
      'reload',
      'cleanup-prs',
    ],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'failed'],
    default: 'pending',
  },
  pool: {
    type: String,
    enum: ['agent', 'infra'],
    required: true,
  },
  payload: { type: Schema.Types.Mixed, default: {} },
  requiresApproval: { type: Boolean, default: false },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
  },
  approvedBy: String,
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  error: String,
  failedReason: String,
  createdAt: { type: Date, default: Date.now },
  startedAt: Date,
  completedAt: Date,
});

jobSchema.index({ status: 1, pool: 1 });
jobSchema.index({ type: 1, status: 1 });

export const JobModel = mongoose.model('Job', jobSchema);
