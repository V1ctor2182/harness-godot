import mongoose, { Schema } from 'mongoose';

const tokenUsageSchema = new Schema(
  {
    inputTokens: Number,
    outputTokens: Number,
  },
  { _id: false }
);

const contextFeedbackSchema = new Schema(
  {
    useful: [String],
    missing: [String],
    unnecessary: [String],
  },
  { _id: false }
);

const agentOutputSchema = new Schema(
  {
    summary: String,
    filesChanged: [String],
    decisions: [String],
    branch: String,
    prNumber: Number,
  },
  { _id: false, strict: false }
); // strict: false allows agent-introduced fields

const agentRunSchema = new Schema({
  _id: { type: String, required: true },
  role: { type: String, required: true },
  status: {
    type: String,
    enum: ['starting', 'running', 'completed', 'failed', 'timeout', 'killed'],
    default: 'starting',
  },
  taskId: String,
  cycleId: { type: Number, required: true },
  containerId: String,
  systemPrompt: { type: String, required: true },
  taskPrompt: { type: String, required: true },
  model: { type: String, required: true },
  budgetUsd: { type: Number, required: true },
  costUsd: Number,
  tokenUsage: tokenUsageSchema,
  branch: String,
  prNumber: Number,
  eventCount: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  durationMs: Number,
  timeoutAt: { type: Date, required: true },
  exitCode: Number,
  error: String,
  contextFiles: [String],
  contextFeedback: contextFeedbackSchema,
  output: agentOutputSchema,
  outputParseError: Boolean,
  outputValidationWarnings: [String],
});

agentRunSchema.index({ status: 1 });
agentRunSchema.index({ cycleId: 1 });
agentRunSchema.index({ taskId: 1 });

export const AgentRunModel = mongoose.model('AgentRun', agentRunSchema);
