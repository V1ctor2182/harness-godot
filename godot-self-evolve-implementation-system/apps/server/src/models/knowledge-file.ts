import mongoose, { Schema } from 'mongoose';

const knowledgeSourceSchema = new Schema(
  {
    type: { type: String, enum: ['human', 'agent'], required: true },
    agentRunId: String,
    taskId: String,
    cycleId: Number,
  },
  { _id: false }
);

const knowledgeFileSchema = new Schema({
  _id: { type: String, required: true },
  category: {
    type: String,
    enum: [
      'skills',
      'decisions',
      'specs',
      'journal',
      'inbox',
      'pruned',
      'retrospective',
      'retrospectives',
    ],
    required: true,
  },
  title: { type: String, required: true },
  snippet: { type: String, required: true },
  content: { type: String, required: true },
  status: {
    type: String,
    enum: ['active', 'processed', 'archived'],
    default: 'active',
  },
  source: { type: knowledgeSourceSchema, required: true },
  qualityScore: { type: Number, default: 0 },
  lastReferencedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

knowledgeFileSchema.index({ category: 1, status: 1 });

export const KnowledgeFileModel = mongoose.model('KnowledgeFile', knowledgeFileSchema);
