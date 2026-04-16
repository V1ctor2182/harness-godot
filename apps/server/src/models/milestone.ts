import mongoose, { Schema } from 'mongoose';

const milestoneSchema = new Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  goals: { type: [String], default: [] },
  features: { type: [String], default: [] },
  dependsOn: { type: [String], default: [] },
  estimatedWeeks: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['proposed', 'planned', 'active', 'completed', 'blocked', 'archived'],
    default: 'planned',
  },
  source: {
    type: String,
    enum: ['human', 'orchestrator'],
    default: 'human',
  },
  prdRef: String,

  cycles: { type: [Number], default: [] },
  startedAt: Date,
  completedAt: Date,
  totalCostUsd: { type: Number, default: 0 },

  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

milestoneSchema.index({ status: 1 });
milestoneSchema.index({ order: 1 });

export const MilestoneModel = mongoose.model('Milestone', milestoneSchema);
