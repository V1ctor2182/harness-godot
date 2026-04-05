import mongoose, { Schema } from 'mongoose';
const testResultSchema = new Schema({
  taskId: { type: String, required: true },
  cycleId: { type: Number, required: true },
  agentRunId: { type: String, required: true },
  layer: { type: String, default: 'L1' },
  status: { type: String, default: 'passed' },
  durationMs: { type: Number, default: 0 },
  totalTests: { type: Number, default: 0 },
  passed: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  failures: [{ type: Schema.Types.Mixed }],
  fps: Number, nodeCount: Number, memoryDeltaMb: Number, loadTimeMs: Number,
  screenshotIds: [String], visualNotes: String,
  prdViolations: [{ type: Schema.Types.Mixed }],
  createdAt: { type: Date, default: Date.now },
});
testResultSchema.index({ taskId: 1, layer: 1 });
export const TestResultModel = mongoose.model('TestResult', testResultSchema);
