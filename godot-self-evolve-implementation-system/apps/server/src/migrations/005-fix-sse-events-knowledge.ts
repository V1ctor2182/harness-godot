import fs from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeFileModel } from '../models/knowledge-file.js';

// knowledge/ lives at the project root, same as in seed-knowledge.ts:
//   local dev:  apps/server/src/migrations/ → up 5 = project root
//   Docker:     apps/server/dist/migrations/ → up 5 = /app (project root)
const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', '..', '..', 'knowledge');

// The _id matches the pattern used by seed-knowledge.ts: `${category}/${filename}`
// sse-events.md maps to category 'specs' per CATEGORY_MAP in seed-knowledge.ts.
const SSE_EVENTS_ID = 'specs/sse-events.md';

function extractSnippet(content: string): string {
  const lines = content.split('\n');
  let pastHeading = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!pastHeading) {
      if (trimmed.startsWith('# ')) {
        pastHeading = true;
      }
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    return trimmed.length > 150 ? trimmed.slice(0, 150) : trimmed;
  }
  return '';
}

export async function up(): Promise<void> {
  const filePath = path.join(KNOWLEDGE_DIR, 'sse-events.md');
  const content = await fs.readFile(filePath, 'utf-8');
  const snippet = extractSnippet(content);

  // Correct the stale DB copy — seed-knowledge uses $setOnInsert so it never
  // updates existing documents. This migration patches the content to match the
  // on-disk version, which fixed the incorrect claim that agent:error was absent
  // from SSEEventType (it was added to the union in Cycle 9) and added
  // documentation for the job:failed event.
  const result = await KnowledgeFileModel.updateOne(
    { _id: SSE_EVENTS_ID },
    {
      $set: {
        snippet,
        content,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        _id: SSE_EVENTS_ID,
        category: 'specs',
        title: 'SSE Event Reference',
        source: { type: 'human' },
        status: 'active',
        qualityScore: 0,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  const action = result.upsertedCount > 0 ? 'Created' : 'Updated';
  console.log(`[migration 005] ${action} knowledge file ${SSE_EVENTS_ID}`);
}
