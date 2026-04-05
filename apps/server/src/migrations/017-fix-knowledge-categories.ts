import { KnowledgeFileModel } from '../models/knowledge-file.js';

/**
 * Fix category misclassification for retrospective and journal disk files.
 *
 * Before this fix, seed-knowledge.ts defaulted all unrecognised .md filenames
 * to category 'specs'. This caused two problems:
 *
 * 1. Disk-seeded retrospective files (e.g. knowledge/cycle-17-retrospective.md)
 *    were stored as `specs/cycle-*-retrospective.md` instead of
 *    `retrospectives/cycle-*-retrospective.md`. The context-builder applies a
 *    quality-score threshold filter for the 'retrospectives' category to limit
 *    token overhead — but entries in 'specs' bypassed that filter.
 *
 * 2. `knowledge/known-issues.md` describes open bugs and future work and
 *    belongs in the 'journal' category, not 'specs'.
 *
 * This migration is idempotent: it deletes the old document and inserts a new
 * one with the corrected _id and category (MongoDB does not support renaming
 * _id in-place). If the target _id already exists the old one is still removed
 * to avoid stale duplicates.
 */
export async function up(): Promise<void> {
  let reclassified = 0;
  let skipped = 0;

  // --- 1. Retrospective files: specs/cycle-*-retrospective.md ─────────────────
  const retroDocs = await KnowledgeFileModel.find({
    _id: /^specs\/cycle-\d+-retrospective\.md$/,
  }).lean();

  for (const doc of retroDocs) {
    const oldId = doc._id as string;
    const filename = oldId.replace(/^specs\//, '');
    const newId = `retrospectives/${filename}`;

    // Ensure the target slot is free — remove any stale entry if present
    await KnowledgeFileModel.deleteOne({ _id: newId });

    // Insert with corrected category and _id, preserving all other fields
    await KnowledgeFileModel.updateOne(
      { _id: newId },
      {
        $setOnInsert: {
          _id: newId,
          category: 'retrospectives',
          title: doc.title,
          snippet: doc.snippet,
          content: doc.content,
          source: doc.source,
          status: doc.status,
          qualityScore: doc.qualityScore ?? 0,
          lastReferencedAt: doc.lastReferencedAt,
          createdAt: doc.createdAt,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Remove the old misclassified entry
    await KnowledgeFileModel.deleteOne({ _id: oldId });

    console.log(`[migration 017] Reclassified ${oldId} → ${newId}`);
    reclassified++;
  }

  // --- 2. known-issues.md: specs/known-issues.md ──────────────────────────────
  const knownIssuesDoc = await KnowledgeFileModel.findById('specs/known-issues.md').lean();

  if (knownIssuesDoc) {
    const newId = 'journal/known-issues.md';

    // Ensure the target slot is free
    await KnowledgeFileModel.deleteOne({ _id: newId });

    await KnowledgeFileModel.updateOne(
      { _id: newId },
      {
        $setOnInsert: {
          _id: newId,
          category: 'journal',
          title: knownIssuesDoc.title,
          snippet: knownIssuesDoc.snippet,
          content: knownIssuesDoc.content,
          source: knownIssuesDoc.source,
          status: knownIssuesDoc.status,
          qualityScore: knownIssuesDoc.qualityScore ?? 0,
          lastReferencedAt: knownIssuesDoc.lastReferencedAt,
          createdAt: knownIssuesDoc.createdAt,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    await KnowledgeFileModel.deleteOne({ _id: 'specs/known-issues.md' });

    console.log('[migration 017] Reclassified specs/known-issues.md → journal/known-issues.md');
    reclassified++;
  } else {
    console.log('[migration 017] specs/known-issues.md not found — skipping');
    skipped++;
  }

  console.log(`[migration 017] Done — ${reclassified} reclassified, ${skipped} not found`);
}
