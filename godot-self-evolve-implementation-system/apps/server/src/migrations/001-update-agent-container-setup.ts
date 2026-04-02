import fs from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeFileModel } from '../models/knowledge-file.js';

// knowledge/ lives at the project root, same as in seed-knowledge.ts:
//   local dev:  apps/server/src/migrations/ → up 5 = project root
//   Docker:     apps/server/dist/migrations/ → up 5 = /app (project root)
const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', '..', '..', 'knowledge');

const KNOWLEDGE_ID = 'specs/agent-container-setup.md';

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
  const filePath = path.join(KNOWLEDGE_DIR, 'agent-container-setup.md');
  const content = await fs.readFile(filePath, 'utf-8');
  const snippet = extractSnippet(content);

  await KnowledgeFileModel.updateOne(
    { _id: KNOWLEDGE_ID },
    { $set: { content, snippet, updatedAt: new Date() } }
  );

  console.log(`[migration 001] Updated KnowledgeFile ${KNOWLEDGE_ID} with current file content`);
}
