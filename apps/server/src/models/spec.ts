import mongoose, { Schema } from 'mongoose';

const specProvenanceSchema = new Schema(
  {
    source_type: {
      type: String,
      enum: ['human', 'prd_extraction', 'codebase_extraction', 'agent_sediment', 'curator_review'],
      required: true,
    },
    confidence: { type: Number, required: true },
    source_ref: String,
    agentRunId: String,
    cycleId: Number,
    cycle_tag: String,
  },
  { _id: false }
);

const specRelationSchema = new Schema(
  {
    target: { type: String, required: true },
    type: {
      type: String,
      enum: ['depends_on', 'conflicts_with', 'supersedes', 'relates_to'],
      required: true,
    },
  },
  { _id: false }
);

const specAnchorSchema = new Schema(
  {
    file: { type: String, required: true },
    symbol: String,
    line_range: String,
  },
  { _id: false }
);

const specSchema = new Schema({
  _id: { type: String, required: true },
  roomId: { type: String, required: true },
  type: {
    type: String,
    enum: ['intent', 'decision', 'constraint', 'contract', 'convention', 'change', 'context'],
    required: true,
  },
  state: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft',
  },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  detail: { type: String, default: '' },
  provenance: { type: specProvenanceSchema, required: true },
  qualityScore: { type: Number, default: 0 },
  lastReferencedAt: Date,
  relations: { type: [specRelationSchema], default: [] },
  anchors: { type: [specAnchorSchema], default: [] },
  tags: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

specSchema.index({ roomId: 1, type: 1, state: 1 });
specSchema.index({ qualityScore: -1 });
specSchema.index({ tags: 1 });

export const SpecModel = mongoose.model('Spec', specSchema);
