import { KnowledgeFileModel } from '../models/knowledge-file.js';

const STALE_PHRASE = '"gh" (GitHub CLI) is NOT installed';

export async function up(): Promise<void> {
  const result = await KnowledgeFileModel.updateMany(
    { content: { $regex: STALE_PHRASE, $options: 'i' } },
    { $set: { status: 'archived', updatedAt: new Date() } }
  );

  console.log(
    `[migration 002] Archived ${result.modifiedCount} stale knowledge document(s) containing "${STALE_PHRASE}"`
  );
}
