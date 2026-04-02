import mongoose, { Schema } from 'mongoose';

const testFailureDetailSchema = new Schema(
  {
    testName: { type: String, required: true },
    assertion: { type: String, required: true },
    expected: String,
    actual: String,
    line: Number,
    file: String,
  },
  { _id: false }
);

const prdViolationSchema = new Schema(
  {
    prdRef: { type: String, required: true },
    expected: { type: String, required: true },
    actual: { type: String, required: true },
    severity: { type: String, enum: ['error', 'warning'], required: true },
  },
  { _id: false }
);

// Agent-provided fields are NOT required — Claude's JSON may omit them.
// Only server-injected fields (taskId, cycleId, agentRunId) are required.
const testResultSchema = new Schema({
  taskId: { type: String, required: true },
  cycleId: { type: Number, required: true },
  agentRunId: { type: String, required: true },
  layer: { type: String, enum: ['L1', 'L2', 'L3', 'L4'], default: 'L1' },
  status: { type: String, enum: ['passed', 'failed', 'error', 'skipped'], default: 'passed' },
  durationMs: { type: Number, default: 0 },
  totalTests: { type: Number, default: 0 },
  passed: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  failures: [testFailureDetailSchema],
  // L2 performance metrics
  fps: Number,
  nodeCount: Number,
  memoryDeltaMb: Number,
  loadTimeMs: Number,
  // L3 visual
  screenshotIds: [String],
  visualNotes: String,
  // L4 PRD compliance
  prdViolations: [prdViolationSchema],
  createdAt: { type: Date, default: Date.now },
});

testResultSchema.index({ taskId: 1, layer: 1 });
testResultSchema.index({ cycleId: 1 });
testResultSchema.index({ agentRunId: 1 });

export const TestResultModel = mongoose.model('TestResult', testResultSchema);
