import fs from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeFileModel } from '../models/knowledge-file.js';

// knowledge/ lives at the project root, same as in seed-knowledge.ts:
//   local dev:  apps/server/src/migrations/ → up 5 = project root
//   Docker:     apps/server/dist/migrations/ → up 5 = /app (project root)
const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', '..', '..', 'knowledge');

const RETROSPECTIVE_ID = 'retrospectives/cycle-14-retrospective.md';

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
  const retroFilePath = path.join(KNOWLEDGE_DIR, 'cycle-14-retrospective.md');
  const retroContent = await fs.readFile(retroFilePath, 'utf-8');
  const retroSnippet = extractSnippet(retroContent);

  const retroResult = await KnowledgeFileModel.updateOne(
    { _id: RETROSPECTIVE_ID },
    {
      $set: {
        category: 'retrospectives',
        title: 'Cycle 14 Retrospective',
        snippet: retroSnippet,
        content: retroContent,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        _id: RETROSPECTIVE_ID,
        source: { type: 'human' },
        status: 'active',
        qualityScore: 0,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  const retroAction = retroResult.upsertedCount > 0 ? 'Created' : 'Updated';
  console.log(`[migration 007] ${retroAction} knowledge file ${RETROSPECTIVE_ID}`);
}
