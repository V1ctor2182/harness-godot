import mongoose, { Schema } from 'mongoose';

const cycleMetricsSchema = new Schema(
  {
    tasksCompleted: { type: Number, default: 0 },
    tasksFailed: { type: Number, default: 0 },
    totalCostUsd: { type: Number, default: 0 },
    totalDurationMs: { type: Number, default: 0 },
    goalCoverage: { type: Number },
    tasksRetried: { type: Number },
    tasksPassedFirstReview: { type: Number },
    tasksRetriedByReviewer: { type: Number },
    tasksRetriedByCi: { type: Number },
    tasksRetriedByPrBody: { type: Number },
  },
  { _id: false }
);

const cycleSchema = new Schema({
  _id: { type: Number, required: true },
  goal: { type: String, required: true },
  phase: {
    type: String,
    enum: ['plan', 'implement', 'review', 'integrate', 'retrospect'],
    default: 'plan',
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'failed'],
    default: 'active',
  },
  tasks: [{ type: String }],
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  summary: String,
  metrics: cycleMetricsSchema,
});

cycleSchema.index({ status: 1 });

export const CycleModel = mongoose.model('Cycle', cycleSchema);
