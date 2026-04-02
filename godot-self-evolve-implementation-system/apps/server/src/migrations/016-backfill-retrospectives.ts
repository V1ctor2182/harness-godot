import { KnowledgeFileModel } from '../models/knowledge-file.js';
import { CycleModel } from '../models/cycle.js';
import { TaskModel } from '../models/task.js';
import { AgentRunModel } from '../models/agent-run.js';

/**
 * Backfill retrospective knowledge entries for cycles 20–25.
 *
 * Cycles 1–19 were handled by manual migrations (001–014). The auto-generator
 * added in Cycle 21 (via generateCycleRetrospective in job-queue.ts) should
 * have seeded entries for cycles 20+ at cycle completion, but it silently
 * failed for cycles 21–25 when exceptions in the generator caused the
 * advance-cycle job to retry and skip the retrospective step.
 *
 * This migration is idempotent: it upserts using the same deterministic ID
 * format used by the auto-generator (`retrospectives/cycle-{N}.md`), so
 * re-running it cannot duplicate or corrupt entries.
 */

const FIRST_AUTO_GENERATED_CYCLE = 20;

function buildContent(
  cycleId: number,
  goal: string,
  completedAt: Date,
  summary: string | undefined,
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    totalCostUsd: number;
    totalDurationMs: number;
  },
  taskLines: string,
  filesChangedSection: string
): string {
  const dateStr = completedAt.toISOString().slice(0, 10);
  const tasksCompleted = metrics.tasksCompleted;
  const totalTasks = tasksCompleted + metrics.tasksFailed;
  const completionRate = totalTasks > 0 ? tasksCompleted / totalTasks : 0;
  const verdict =
    completionRate === 1
      ? 'Fully achieved'
      : completionRate >= 0.5
        ? 'Partially achieved'
        : 'Not achieved';

  const summarySection = summary ? `\n## Summary\n\n${summary}\n` : '';

  return `# Cycle ${cycleId} Retrospective

**Date completed:** ${dateStr}
**Goal:** ${goal}

## Goal Assessment

**Goal:** ${goal}
${tasksCompleted} of ${totalTasks} tasks completed
**Verdict:** ${verdict}
${summarySection}
## Tasks

${taskLines || '_No tasks_'}

## Metrics

- Tasks completed: ${metrics.tasksCompleted}
- Tasks failed: ${metrics.tasksFailed}
- Total cost: $${metrics.totalCostUsd.toFixed(4)}
- Total duration: ${Math.round(metrics.totalDurationMs / 1000)}s
${filesChangedSection}`;
}

export async function up(): Promise<void> {
  // Find all completed cycles from FIRST_AUTO_GENERATED_CYCLE onward
  const cycles = await CycleModel.find({
    _id: { $gte: FIRST_AUTO_GENERATED_CYCLE },
    status: 'completed',
  })
    .sort({ _id: 1 })
    .lean();

  if (cycles.length === 0) {
    console.log('[migration 016] No completed cycles >= 20 found — nothing to backfill');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const cycle of cycles) {
    const cycleId = cycle._id as number;
    const id = `retrospectives/cycle-${cycleId}.md`;

    // Check if already present — skip to avoid unnecessary DB writes
    const existing = await KnowledgeFileModel.findById(id).lean();
    if (existing) {
      console.log(`[migration 016] Cycle ${cycleId} already has knowledge entry — skipping`);
      skipped++;
      continue;
    }

    const tasks = await TaskModel.find({ cycleId }).lean();

    const taskLines = tasks
      .map((t) => {
        const pr = t.prNumber ? ` (PR #${t.prNumber})` : '';
        const rawDesc = t.description as string | undefined;
        const truncatedDesc = rawDesc
          ? rawDesc.length > 300
            ? rawDesc.slice(0, 300) + '…'
            : rawDesc
          : '';
        const criteria = t.acceptanceCriteria as string[] | undefined;
        const criteriaNote =
          criteria && criteria.length > 0 ? ` | ${criteria.length} acceptance criteria` : '';
        const descLine = truncatedDesc ? `\n  ${truncatedDesc}${criteriaNote}` : '';
        return `- **${t._id}** — ${t.title} | type: ${t.type} | status: ${t.status}${pr}${descLine}`;
      })
      .join('\n');

    // Collect files changed from integrator run output
    const integratorRuns = await AgentRunModel.find({ cycleId, role: 'integrator' }).lean();
    const filesChanged: string[] = [];
    for (const run of integratorRuns) {
      const runOutput = run.output as { filesChanged?: string[] } | undefined;
      if (runOutput?.filesChanged && runOutput.filesChanged.length > 0) {
        filesChanged.push(...runOutput.filesChanged);
      }
    }
    const filesChangedSection =
      filesChanged.length > 0
        ? `\n## Files Changed\n\n${filesChanged.map((f) => `- ${f}`).join('\n')}\n`
        : '';

    const completedAt = cycle.completedAt ?? new Date();
    const metrics = cycle.metrics ?? {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalCostUsd: 0,
      totalDurationMs: 0,
    };

    const content = buildContent(
      cycleId,
      cycle.goal as string,
      completedAt,
      cycle.summary as string | undefined,
      metrics,
      taskLines,
      filesChangedSection
    );

    const dateStr = completedAt.toISOString().slice(0, 10);
    const snippet = `Cycle ${cycleId} completed on ${dateStr}. ${metrics.tasksCompleted} tasks done, ${metrics.tasksFailed} failed. Cost: $${metrics.totalCostUsd.toFixed(4)}. Goal: ${(cycle.goal as string).slice(0, 100)}.`;

    await KnowledgeFileModel.updateOne(
      { _id: id },
      {
        $set: {
          category: 'retrospectives',
          title: `Cycle ${cycleId} Retrospective`,
          snippet,
          content,
          status: 'active',
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: id,
          source: { type: 'agent' as const, cycleId },
          qualityScore: 0,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    console.log(`[migration 016] Created knowledge entry ${id}`);
    created++;
  }

  console.log(
    `[migration 016] Done — ${created} created, ${skipped} already present (${cycles.length} total cycles checked)`
  );
}
