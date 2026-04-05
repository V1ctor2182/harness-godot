import fs from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeFileModel } from '../models/knowledge-file.js';

// knowledge/ lives at the project root, same as in seed-knowledge.ts:
//   local dev:  apps/server/src/migrations/ → up 5 = project root
//   Docker:     apps/server/dist/migrations/ → up 5 = /app (project root)
const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', '..', '..', 'knowledge');

const RETROSPECTIVE_ID = 'retrospectives/cycle-9.md';
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

const CYCLE_COMPLETED_SECTION = `
### \`cycle:completed\`

Emitted when a cycle finishes successfully (after the retrospect phase completes). Source: \`job-queue.ts\`.

\`\`\`json
{
  "cycleId": 3,
  "metrics": {
    "tasksCompleted": 5,
    "tasksFailed": 0,
    "totalCostUsd": 1.24,
    "totalDurationMs": 3600000
  }
}
\`\`\`

- \`metrics\` is the final \`Cycle.metrics\` object (populated at cycle completion)

### \`cycle:failed\`

Emitted when a cycle fails (all tasks failed before reaching the integrate phase). Source: \`job-queue.ts\`.

\`\`\`json
{
  "cycleId": 3,
  "previousPhase": "implement"
}
\`\`\`

- \`previousPhase\` is the phase the cycle was in when failure was detected
`;

export async function up(): Promise<void> {
  // Step 1: Create or upsert the Cycle 9 retrospective knowledge file
  const retroFilePath = path.join(KNOWLEDGE_DIR, 'cycle-9-retrospective.md');
  const retroContent = await fs.readFile(retroFilePath, 'utf-8');
  const retroSnippet = extractSnippet(retroContent);

  const retroResult = await KnowledgeFileModel.updateOne(
    { _id: RETROSPECTIVE_ID },
    {
      $set: {
        category: 'retrospective',
        title: 'Cycle 9 Retrospective',
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
  console.log(`[migration 003] ${retroAction} knowledge file ${RETROSPECTIVE_ID}`);

  // Step 2: Update the SSE Event Reference knowledge file to include
  // cycle:completed and cycle:failed events
  const sseDoc = await KnowledgeFileModel.findById(SSE_EVENTS_ID).lean();

  if (!sseDoc) {
    console.warn(
      `[migration 003] SSE Event Reference document (${SSE_EVENTS_ID}) not found — skipping SSE update`
    );
    return;
  }

  // Only add the section if it's not already present (idempotency)
  if (sseDoc.content.includes('cycle:completed') && sseDoc.content.includes('cycle:failed')) {
    console.log(
      `[migration 003] SSE Event Reference already contains cycle:completed and cycle:failed — skipping`
    );
    return;
  }

  // Insert cycle:completed / cycle:failed before the "## Job Events" section
  const insertionMarker = '## Job Events (Global)';
  if (!sseDoc.content.includes(insertionMarker)) {
    console.warn(
      `[migration 003] Could not find insertion point "${insertionMarker}" in SSE Event Reference — appending to end`
    );
    const updatedContent = sseDoc.content.trimEnd() + '\n' + CYCLE_COMPLETED_SECTION;
    await KnowledgeFileModel.updateOne(
      { _id: SSE_EVENTS_ID },
      { $set: { content: updatedContent, updatedAt: new Date() } }
    );
  } else {
    const updatedContent = sseDoc.content.replace(
      `## Job Events (Global)`,
      CYCLE_COMPLETED_SECTION.trimStart() + '\n---\n\n## Job Events (Global)'
    );
    await KnowledgeFileModel.updateOne(
      { _id: SSE_EVENTS_ID },
      { $set: { content: updatedContent, updatedAt: new Date() } }
    );
  }

  console.log(
    `[migration 003] Updated SSE Event Reference (${SSE_EVENTS_ID}) with cycle:completed and cycle:failed events`
  );
}
