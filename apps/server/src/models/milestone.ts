import mongoose, { Schema } from 'mongoose';

const milestoneSchema = new Schema({
  _id: { type: String, required: true }, // e.g. "M8"
  name: { type: String, required: true },
  description: { type: String, default: '' },
  goals: { type: [String], default: [] },
  features: { type: [String], default: [] },
  dependsOn: { type: [String], default: [] },
  estimatedWeeks: { type: Number, default: 0 },

  // Runtime-written fields
  status: {
    type: String,
    enum: ['planned', 'active', 'completed', 'blocked'],
    default: 'planned',
  },
  cycles: { type: [Number], default: [] },
  startedAt: Date,
  completedAt: Date,
  totalCostUsd: { type: Number, default: 0 },
  lastSyncedAt: { type: Date, default: Date.now },

  // Ordering for roadmap display
  order: { type: Number, default: 0 },
});

milestoneSchema.index({ status: 1 });
milestoneSchema.index({ order: 1 });

export const MilestoneModel = mongoose.model('Milestone', milestoneSchema);
