import mongoose, { Schema } from 'mongoose';

const roomSchema = new Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  parent: { type: String, default: null },
  type: {
    type: String,
    enum: ['project', 'epic', 'feature'],
    required: true,
  },
  owner: { type: String, default: 'backend' },
  lifecycle: {
    type: String,
    enum: ['planning', 'active', 'stable', 'archived'],
    default: 'planning',
  },
  depends_on: { type: [String], default: [] },
  contributors: { type: [String], default: [] },
  path: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

roomSchema.index({ parent: 1 });
roomSchema.index({ lifecycle: 1 });

export const RoomModel = mongoose.model('Room', roomSchema);
