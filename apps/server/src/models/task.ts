import mongoose, { Schema } from 'mongoose';

const activityEntrySchema = new Schema(
  {
    timestamp: { type: Date, default: Date.now },
    action: { type: String, required: true },
    agentRunId: String,
  },
  { _id: false }
);

const taskSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['backlog', 'ready', 'in-progress', 'in-review', 'done', 'blocked', 'failed'],
      default: 'backlog',
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
    },
    type: {
      type: String,
      enum: ['feature', 'bug', 'chore', 'refactor', 'test'],
      required: true,
    },
    cycleId: { type: Number, required: true },
    blockedBy: [{ type: String }],
    branch: String,
    prNumber: Number,
    prUrl: String,
    assignedTo: String,
    createdBy: { type: String, required: true },
    acceptanceCriteria: [{ type: String }],
    activityLog: [activityEntrySchema],
    ciStatus: {
      type: String,
      enum: ['pending', 'running', 'passed', 'failed'],
    },
    reviewVerdict: {
      type: String,
      enum: ['approved', 'changes-requested'],
    },
    retryCount: { type: Number, default: 0 },
    lastRetryCause: {
      type: String,
      enum: ['ci_failure', 'review_rejection', 'no_pr', 'pr_body_invalid'],
    },
    lastRetryReviewIssues: [
      {
        file: { type: String, required: true },
        line: { type: Number },
        severity: { type: String, required: true },
        description: { type: String, required: true },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

taskSchema.index({ status: 1, cycleId: 1 });
taskSchema.index({ cycleId: 1 });

export const TaskModel = mongoose.model('Task', taskSchema);
