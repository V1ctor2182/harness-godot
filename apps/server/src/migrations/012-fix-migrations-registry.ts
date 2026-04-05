import fs from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeFileModel } from '../models/knowledge-file.js';

// knowledge/ lives at the project root, same as in seed-knowledge.ts:
//   local dev:  apps/server/src/migrations/ → up 5 = project root
//   Docker:     apps/server/dist/migrations/ → up 5 = /app (project root)
const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', '..', '..', 'knowledge');

// seed-knowledge.ts assigns files not in CATEGORY_MAP to 'specs' by default,
// so migrations.md is stored under 'specs/migrations.md'.
const MIGRATIONS_DOC_ID = 'specs/migrations.md';

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
  const filePath = path.join(KNOWLEDGE_DIR, 'migrations.md');
  const content = await fs.readFile(filePath, 'utf-8');
  const snippet = extractSnippet(content);

  // Patch (or create) the MongoDB copy so it matches the corrected on-disk
  // registry. The DB copy was severely out of date — it listed only migrations
  // 001 and 002 while migrations 003 through 011 existed on disk.
  const result = await KnowledgeFileModel.updateOne(
    { _id: MIGRATIONS_DOC_ID },
    {
      $set: {
        content,
        snippet,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        _id: MIGRATIONS_DOC_ID,
        category: 'specs',
        title: 'Migrations',
        source: { type: 'human' },
        status: 'active',
        qualityScore: 0,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  const action = result.upsertedCount > 0 ? 'Created' : 'Updated';
  console.log(`[migration 012] ${action} knowledge file ${MIGRATIONS_DOC_ID}`);
}
