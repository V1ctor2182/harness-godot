import mongoose, { Schema } from 'mongoose';
import { TASK_ID_PREFIX, TASK_ID_PAD_LENGTH } from '@harness/shared';

const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const CounterModel = mongoose.model('Counter', counterSchema);

export async function getNextSequence(name: string): Promise<number> {
  const result = await CounterModel.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result!.seq;
}

export async function getNextCycleId(): Promise<number> {
  return getNextSequence('cycle');
}

export async function getNextTaskId(): Promise<string> {
  const seq = await getNextSequence('task');
  const padded = String(seq).padStart(TASK_ID_PAD_LENGTH, '0');
  return `${TASK_ID_PREFIX}${padded}`;
}
