import { ControlModel } from '../models/control.js';

const DEFAULT_CATEGORIES = ['feature', 'bug', 'chore', 'refactor', 'test'];

export async function up(): Promise<void> {
  // Only update if autoApprovalCategories is missing or empty.
  // This makes the migration idempotent: a second run finds no matching
  // document (field is now populated) and performs no write.
  const result = await ControlModel.updateOne(
    {
      _id: 'singleton',
      $or: [
        { autoApprovalCategories: { $exists: false } },
        { autoApprovalCategories: { $size: 0 } },
      ],
    },
    {
      $set: { autoApprovalCategories: DEFAULT_CATEGORIES },
    }
  );

  if (result.matchedCount === 0) {
    console.log('[migration 015] autoApprovalCategories already populated — no update needed');
  } else {
    console.log(
      `[migration 015] Set autoApprovalCategories to [${DEFAULT_CATEGORIES.join(', ')}] on control singleton`
    );
  }
}
