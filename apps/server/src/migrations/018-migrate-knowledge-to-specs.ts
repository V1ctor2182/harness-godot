import { KnowledgeFileModel } from '../models/knowledge-file.js';
import { SpecModel } from '../models/spec.js';
import { RoomModel } from '../models/room.js';

/**
 * Migrate active KnowledgeFile documents to Spec documents in the Room+Spec system.
 *
 * Mapping:
 * - boot.md        → 00-project-room, type=context
 * - conventions.md  → 00-project-room, type=convention
 * - glossary.md     → 00-project-room, type=context
 * - decisions       → keyword-match room, type=decision
 * - specs           → keyword-match room, type varies
 * - inbox           → keyword-match room, type=context, state=draft
 * - retrospectives  → SKIP (journal entries, not specs)
 *
 * Soft migration: KnowledgeFiles are archived, not deleted.
 * Idempotent: existing Spec IDs are skipped.
 */

const STATIC_MAP: Record<string, { roomId: string; type: string }> = {
  'specs/boot.md': { roomId: '00-project-room', type: 'context' },
  'skills/conventions.md': { roomId: '00-project-room', type: 'convention' },
  'specs/glossary.md': { roomId: '00-project-room', type: 'context' },
};

const CATEGORY_TYPE_MAP: Record<string, string> = {
  decisions: 'decision',
  specs: 'context',
  skills: 'convention',
  inbox: 'context',
  journal: 'context',
};

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .split(/[\s\W]+/)
    .filter((w) => w.length >= 4);
}

async function findBestRoom(title: string): Promise<string> {
  const keywords = extractKeywords(title);
  if (keywords.length === 0) return '00-project-room';

  const rooms = await RoomModel.find({}, { _id: 1, name: 1 }).lean();
  for (const room of rooms) {
    const roomIdLower = (room._id as string).toLowerCase();
    const roomNameLower = (room.name as string).toLowerCase();
    for (const kw of keywords) {
      if (roomIdLower.includes(kw) || roomNameLower.includes(kw)) {
        return room._id as string;
      }
    }
  }
  return '00-project-room';
}

export async function up(): Promise<void> {
  const knowledgeFiles = await KnowledgeFileModel.find({
    status: { $in: ['active', 'processed'] },
  }).lean();

  let migrated = 0;
  let skipped = 0;
  let skippedRetro = 0;

  for (const kf of knowledgeFiles) {
    const kfId = kf._id as string;
    const category = kf.category as string;

    // Skip retrospectives (journal entries)
    if (category === 'retrospectives' || category === 'retrospective') {
      skippedRetro++;
      continue;
    }

    // Determine spec ID
    const specId = `migrated-${kfId.replace(/[/\\]/g, '-')}`;

    // Check idempotency
    const existing = await SpecModel.findById(specId);
    if (existing) {
      skipped++;
      continue;
    }

    // Determine target room and type
    let roomId: string;
    let specType: string;

    const staticEntry = STATIC_MAP[kfId];
    if (staticEntry) {
      roomId = staticEntry.roomId;
      specType = staticEntry.type;
    } else {
      roomId = await findBestRoom(kf.title as string);
      specType = CATEGORY_TYPE_MAP[category] ?? 'context';
    }

    const state = category === 'inbox' ? 'draft' : 'active';

    await SpecModel.create({
      _id: specId,
      roomId,
      type: specType,
      state,
      title: kf.title,
      summary: (kf.snippet as string) ?? '',
      detail: kf.content,
      provenance: {
        source_type: 'codebase_extraction',
        confidence: 0.7,
        source_ref: `migrated from KnowledgeFile ${kfId}`,
      },
      tags: [],
      relations: [],
      anchors: [],
      qualityScore: (kf.qualityScore as number) ?? 0,
      createdAt: kf.createdAt,
      updatedAt: new Date(),
    });

    // Archive the KnowledgeFile (soft migration)
    await KnowledgeFileModel.updateOne(
      { _id: kfId },
      { $set: { status: 'archived', updatedAt: new Date() } }
    );

    migrated++;
  }

  console.log(
    `[018-migrate-knowledge-to-specs] Migrated: ${migrated}, Skipped (existing): ${skipped}, Skipped (retrospectives): ${skippedRetro}`
  );
}
