import mongoose, { Schema } from 'mongoose';
import { config } from '../config.js';

const agentEventSchema = new Schema({
  agentRunId: { type: String, required: true },
  sequenceNum: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  type: {
    type: String,
    enum: ['text', 'tool_use', 'tool_result', 'error', 'completion', 'system'],
    required: true,
  },
  data: { type: Schema.Types.Mixed, required: true },
});

agentEventSchema.index({ agentRunId: 1, sequenceNum: 1 });
agentEventSchema.index({ agentRunId: 1, type: 1 });
agentEventSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: config.agentEventTtlDays * 24 * 60 * 60 }
);

export const AgentEventModel = mongoose.model('AgentEvent', agentEventSchema);
