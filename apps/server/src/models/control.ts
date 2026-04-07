import mongoose, { Schema } from 'mongoose';

const cycleOverrideSchema = new Schema(
  {
    paused: Boolean,
    humanMessage: String,
  },
  { _id: false }
);

const controlSchema = new Schema({
  _id: { type: String, default: 'singleton' },
  mode: {
    type: String,
    enum: ['active', 'paused', 'killed'],
    default: 'active',
  },
  humanMessage: String,
  spendingCapUsd: Number,
  spentUsd: { type: Number, default: 0 },
  cycleOverrides: {
    type: Map,
    of: cycleOverrideSchema,
    default: {},
  },
  autoApprovalCategories: {
    type: [String],
    default: ['feature', 'bug', 'chore', 'refactor', 'test'],
  },
  operationMode: {
    type: String,
    enum: ['auto', 'supervised', 'manual'],
    default: 'supervised',
  },
  updatedAt: { type: Date, default: Date.now },
});

export const ControlModel = mongoose.model('Control', controlSchema);

export async function getOrCreateControl() {
  let control = await ControlModel.findById('singleton');
  if (!control) {
    control = await ControlModel.create({ _id: 'singleton' });
  }
  return control;
}
