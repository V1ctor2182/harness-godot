import mongoose, { Schema } from 'mongoose';

const screenshotSchema = new Schema({
  testResultId: String,
  taskId: { type: String, required: true },
  step: { type: String, required: true },
  filepath: { type: String, required: true },
  aiAnalysis: {
    description: String,
    issues: [String],
    confidence: Number,
  },
  createdAt: { type: Date, default: Date.now },
});

screenshotSchema.index({ taskId: 1 });
screenshotSchema.index({ testResultId: 1 });

export const ScreenshotModel = mongoose.model('Screenshot', screenshotSchema);
