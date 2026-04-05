import mongoose, { Schema } from 'mongoose';

const migrationSchema = new Schema({
  _id: { type: String, required: true },
  appliedAt: { type: Date, default: Date.now },
});

export const MigrationModel = mongoose.model('Migration', migrationSchema);
