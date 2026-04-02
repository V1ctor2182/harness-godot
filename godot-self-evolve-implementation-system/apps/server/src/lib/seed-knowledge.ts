import fs from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeFileModel } from '../models/knowledge-file.js';

// knowledge/ lives at the project root, which is 4 levels above this file:
//   local dev:  apps/server/src/lib/ → up 4 = project root
//   Docker:     apps/server/dist/lib/ → up 4 = /app (project root)
const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', '..', '..', 'knowledge');

const EXACT_CATEGORY_MAP: Record<string, string> = {
  'boot.md': 'specs',
  'glossary.md': 'specs',
  'badge-classes.md': 'specs',
  'sse-events.md': 'specs',
  'conventions.md': 'skills',
  'known-issues.md': 'journal',
};

// Pattern for disk-seeded retrospective files like cycle-17-retrospective.md
const RETROSPECTIVE_PATTERN = /^cycle-\d+-retrospective\.md$/;

function getCategoryForFile(filename: string): string {
  if (EXACT_CATEGORY_MAP[filename] !== undefined) {
    return EXACT_CATEGORY_MAP[filename];
  }
  if (RETROSPECTIVE_PATTERN.test(filename)) {
    return 'retrospectives';
  }
  return 'specs';
}

export function extractTitle(content: string): string {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
  }
  return '';
}

export function extractSnippet(content: string): string {
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
    // Skip empty lines and sub-headings until we find a paragraph
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    // First non-empty, non-heading line after the title
    return trimmed.length > 150 ? trimmed.slice(0, 150) : trimmed;
  }
  return '';
}

export async function seedKnowledge(): Promise<void> {
  let files: string[];
  try {
    const entries = await fs.readdir(KNOWLEDGE_DIR);
    files = entries.filter((f) => f.endsWith('.md'));
  } catch (err) {
    console.error(`[seed-knowledge] Could not read knowledge directory at ${KNOWLEDGE_DIR}:`, err);
    return;
  }

  if (files.length === 0) {
    console.log('[seed-knowledge] No .md files found in knowledge/');
    return;
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const filename of files) {
    const filePath = path.join(KNOWLEDGE_DIR, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    const category = getCategoryForFile(filename);
    const id = `${category}/${filename}`;
    const title = extractTitle(content);
    const snippet = extractSnippet(content);

    const existing = await KnowledgeFileModel.findOne({ _id: id }).lean();

    if (!existing) {
      // New file — insert with all fields; preserve qualityScore default
      await KnowledgeFileModel.updateOne(
        { _id: id },
        {
          $setOnInsert: {
            _id: id,
            category,
            title,
            snippet,
            content,
            source: { type: 'human' },
            status: 'active',
            qualityScore: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
      inserted++;
    } else if (existing.content === content) {
      // On-disk content matches DB — nothing to do
      unchanged++;
    } else {
      // Content changed — update text fields only; preserve agent-derived metadata
      // (qualityScore, lastReferencedAt, source, status)
      await KnowledgeFileModel.updateOne(
        { _id: id },
        { $set: { title, snippet, content, updatedAt: new Date() } }
      );
      updated++;
    }
  }

  console.log(
    `[seed-knowledge] Done. Inserted: ${inserted}, Updated: ${updated}, Unchanged: ${unchanged}`
  );
}
