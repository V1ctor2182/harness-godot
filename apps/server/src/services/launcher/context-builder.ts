import fs from 'node:fs';
import path from 'node:path';
import { KnowledgeFileModel } from '../../models/knowledge-file.js';
import { AgentRunModel } from '../../models/agent-run.js';
import { CycleModel } from '../../models/cycle.js';
import { TaskModel } from '../../models/task.js';
import { getOrCreateControl } from '../../models/control.js';
import type { ContextFeedback, RetryContext } from '@zombie-farm/shared';
import {
  QUALITY_SCORE_USEFUL_DELTA,
  QUALITY_SCORE_UNNECESSARY_DELTA,
  QUALITY_SCORE_DECAY,
  QUALITY_SCORE_MIN,
  QUALITY_SCORE_MAX,
} from '@zombie-farm/shared';

interface AgentContext {
  systemPromptContent: string;
  taskPromptContent: string;
  knowledgeFiles: string[];
}

// Bug #3 fix: Detect repo root via .git/ or project.godot instead of package.json only
function findRepoRoot(): string {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (fs.existsSync(path.join(dir, 'project.godot'))) return dir;
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) return dir;
      } catch { /* ignore parse errors */ }
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not find repo root (no .git, project.godot, or package.json with workspaces)');
}

const REPO_ROOT = findRepoRoot();
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');
const KNOWLEDGE_DIR = path.join(REPO_ROOT, 'knowledge');

// MongoDB _id values for the static bootstrap files that are always injected from disk.
// These are excluded from the dynamic knowledge query to prevent duplicates.
export const STATIC_KNOWLEDGE_IDS = ['specs/boot.md', 'skills/conventions.md', 'specs/glossary.md'];

// Roles that focus on code — retrospective knowledge files add token cost without relevance
// unless they have demonstrated value (qualityScore >= RETROSPECTIVE_MIN_QUALITY_SCORE).
const CODE_FOCUSED_ROLES = ['coder', 'reviewer'];
const RETROSPECTIVE_MIN_QUALITY_SCORE = 3;

// Default and boosted knowledge selection limits
const DYNAMIC_KNOWLEDGE_LIMIT_DEFAULT = 10;
const DYNAMIC_KNOWLEDGE_LIMIT_TASK = 15;

// Common English stop words filtered out during keyword extraction
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'had',
  'her',
  'was',
  'one',
  'our',
  'out',
  'day',
  'get',
  'has',
  'him',
  'his',
  'how',
  'man',
  'new',
  'now',
  'old',
  'see',
  'two',
  'way',
  'who',
  'boy',
  'did',
  'its',
  'let',
  'put',
  'say',
  'she',
  'too',
  'use',
  'that',
  'this',
  'with',
  'have',
  'from',
  'they',
  'will',
  'been',
  'when',
  'there',
  'into',
  'each',
  'then',
  'than',
  'what',
  'some',
  'more',
  'also',
  'about',
  'which',
  'their',
  'would',
  'other',
  'these',
  'should',
  'could',
  'make',
  'like',
  'time',
  'just',
  'know',
  'take',
  'long',
  'does',
  'only',
  'come',
  'over',
  'such',
  'even',
  'most',
  'after',
  'first',
  'well',
  'many',
  'much',
  'through',
  'where',
  'being',
  'those',
  'while',
  'before',
  'same',
  'both',
  'task',
  'adds',
  'adds',
  'update',
  'updates',
  'improve',
  'improves',
  'change',
  'changes',
]);

/**
 * Extract significant keywords from text for task-relevance matching.
 * Expands camelCase and hyphenated compound identifiers before splitting so
 * that e.g. 'contextBuilder' yields ['context', 'builder'] and
 * 'stream-capture' yields ['stream', 'capture'].
 * Then lowercases, splits on whitespace/punctuation, and filters out
 * stop words and tokens shorter than 4 characters.
 */
export function extractKeywords(text: string): string[] {
  // Expand camelCase boundaries:
  //   1. lowercase→uppercase: 'contextBuilder' → 'context Builder'
  //   2. consecutive-caps→single-cap: 'parseSSEEvent' → 'parse SSE Event'
  // Bug #8 fix: Also split snake_case (GDScript convention)
  const expanded = text
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  return [
    ...new Set(
      expanded
        .toLowerCase()
        .split(/[\s\W]+/)
        .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
    ),
  ];
}

/**
 * Returns a short, actionable guidance note for the given task type and role.
 * Returns null for 'chore' (no note needed) or unrecognized roles.
 */
function getTaskTypeNote(taskType: string, role: string): string | null {
  if (role === 'coder') {
    switch (taskType) {
      case 'bug':
        return 'Bug fix: add or update a test that would have caught this bug before marking criteria met.';
      case 'refactor':
        return 'Refactor: all existing tests must pass unchanged. Do not change external behavior — if a test must change, the refactor has drifted into a feature.';
      case 'test':
        return 'Test task: write GUT tests (extends GutTest) in tests/unit/. Run with `godot --headless -s addons/gut/gut_cmdln.gd` before submitting.';
      case 'feature':
        return 'Feature: add GUT tests for the new behavior before opening the PR. Use static typing (:=, -> void) throughout.';
      default:
        return null;
    }
  }
  if (role === 'reviewer') {
    switch (taskType) {
      case 'bug':
        return 'Verify a regression test was added that would have caught this bug.';
      case 'refactor':
        return 'Verify no existing test had to change behavior to accommodate the refactor — any test modification is a sign the refactor has drifted into a feature.';
      case 'feature':
        return 'Verify the PR includes tests covering the new behavior.';
      case 'test':
        return 'Verify the new tests run in isolation without real DB or Docker calls.';
      default:
        return null;
    }
  }
  return null;
}

/**
 * Apply a three-tier keyword boost to a mutable knowledge-doc array in-place.
 * Tier 1 — keyword found in title or snippet (highest relevance)
 * Tier 2 — keyword found in content body (first 500 chars)
 * Tier 3 — no keyword match
 * Quality-score order is preserved within each tier (stable partition).
 * If keywords is empty the array is left unchanged.
 */
function applyKeywordBoost<T extends { title: string; snippet?: string; content: string }>(
  docs: T[],
  keywords: string[]
): void {
  if (keywords.length === 0) return;
  const matchesTitleOrSnippet = (kf: { title: string; snippet?: string }): boolean =>
    keywords.some(
      (kw) => kf.title.toLowerCase().includes(kw) || (kf.snippet?.toLowerCase() ?? '').includes(kw)
    );
  const matchesContentBody = (kf: { content: string }): boolean =>
    keywords.some((kw) => kf.content.toLowerCase().substring(0, 500).includes(kw));
  const tier1 = docs.filter(matchesTitleOrSnippet);
  const tier2 = docs.filter((kf) => !matchesTitleOrSnippet(kf) && matchesContentBody(kf));
  const tier3 = docs.filter((kf) => !matchesTitleOrSnippet(kf) && !matchesContentBody(kf));
  docs.length = 0;
  docs.push(...tier1, ...tier2, ...tier3);
}

export async function buildContext(params: {
  role: string;
  taskId?: string;
  cycleId: number;
  retryContext?: RetryContext;
}): Promise<AgentContext> {
  const { role, taskId, cycleId, retryContext } = params;

  // Load system prompt
  const promptPath = path.join(AGENTS_DIR, `${role}.md`);
  const systemPromptContent = fs.readFileSync(promptPath, 'utf-8');

  // Fetch control singleton for operator directives
  const control = await getOrCreateControl();

  // Build task prompt
  const taskPromptParts: string[] = [];
  const knowledgeFiles: string[] = [];

  // Add cycle context
  const cycle = await CycleModel.findById(cycleId).lean();
  if (cycle) {
    taskPromptParts.push(`# Cycle ${cycleId}\nGoal: ${cycle.goal}\nPhase: ${cycle.phase}\n`);
  }

  // Add operator message if set — appears after cycle context and before task-specific context
  if (control.humanMessage && control.humanMessage.trim().length > 0) {
    taskPromptParts.push(`\n# Operator Message\n${control.humanMessage}\n`);
  }

  // Fetch task upfront so it's available for both context building and keyword extraction
  const task = taskId ? await TaskModel.findById(taskId).lean() : null;

  // Add task context if this is a task-specific agent
  if (taskId) {
    if (task) {
      taskPromptParts.push(`# Task: ${task._id}\n`);
      taskPromptParts.push(`Title: ${task.title}\n`);
      taskPromptParts.push(`Description: ${task.description}\n`);
      taskPromptParts.push(`Type: ${task.type} | Priority: ${task.priority}\n`);
      if (role === 'coder' || role === 'reviewer') {
        const typeNote = getTaskTypeNote(task.type, role);
        if (typeNote) {
          taskPromptParts.push(`${typeNote}\n`);
        }
      }
      if (task.acceptanceCriteria.length > 0) {
        taskPromptParts.push(`\n## Acceptance Criteria\n`);
        task.acceptanceCriteria.forEach((c, i) => {
          taskPromptParts.push(`${i + 1}. ${c}\n`);
        });
      }
      if (task.branch) {
        taskPromptParts.push(`Branch: ${task.branch}\n`);
      }
      if (task.prNumber) {
        taskPromptParts.push(`PR: #${task.prNumber}\n`);
      }
      if (task.ciStatus) {
        taskPromptParts.push(`CI: ${task.ciStatus}\n`);
      }
      if (task.blockedBy.length > 0) {
        taskPromptParts.push(`\nBlocked by: ${task.blockedBy.join(', ')}\n`);
      }
    }
  }

  // Add retry context
  if (retryContext) {
    taskPromptParts.push(`\n# Retry Context\nThis is a retry of a previous failed attempt.\n`);
    if (retryContext.previousError) {
      taskPromptParts.push(`Previous error: ${retryContext.previousError}\n`);
    }
    if (retryContext.previousSummary) {
      taskPromptParts.push(`Previous summary: ${retryContext.previousSummary}\n`);
    }
    if (retryContext.reviewIssues?.length) {
      const errorIssues = retryContext.reviewIssues.filter((i) => i.severity === 'error');
      const warnIssues = retryContext.reviewIssues.filter((i) => i.severity !== 'error');
      if (errorIssues.length) {
        taskPromptParts.push(`\n## Review Issues (MUST FIX)\n`);
        for (const issue of errorIssues) {
          const loc = issue.line ? `${issue.file}:${issue.line}` : issue.file;
          taskPromptParts.push(`- **[${issue.severity}]** \`${loc}\`: ${issue.description}\n`);
        }
      }
      if (warnIssues.length) {
        taskPromptParts.push(`\n## Reviewer Warnings\n`);
        for (const issue of warnIssues) {
          const loc = issue.line ? `${issue.file}:${issue.line}` : issue.file;
          taskPromptParts.push(`- **[${issue.severity}]** \`${loc}\`: ${issue.description}\n`);
        }
      }
    }
    if (retryContext.reviewSuggestions?.length) {
      taskPromptParts.push(`\n## Reviewer Suggestions\n`);
      for (const suggestion of retryContext.reviewSuggestions) {
        taskPromptParts.push(`- ${suggestion}\n`);
      }
    }
    if (retryContext.reviewDecisions?.length) {
      taskPromptParts.push(`\n## Reviewer Decisions\n`);
      for (const decision of retryContext.reviewDecisions) {
        taskPromptParts.push(`- ${decision}\n`);
      }
    }
    if (retryContext.filesChanged?.length) {
      taskPromptParts.push(`\n## Previously Changed Files\n`);
      for (const file of retryContext.filesChanged) {
        taskPromptParts.push(`- \`${file}\`\n`);
      }
    }
  }

  // Select knowledge files
  // Static bootstrap files are always included first from disk.
  const staticFiles = ['boot.md', 'conventions.md', 'glossary.md'];
  for (const file of staticFiles) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      taskPromptParts.push(`\n---\n# Knowledge: ${file}\n${content}\n`);
      knowledgeFiles.push(`knowledge/${file}`);
    }
  }

  // Dynamic knowledge files sorted by quality score, excluding static files already injected above.
  // For code-focused roles (coder, reviewer), retrospective-category files are excluded unless
  // their qualityScore is high enough to justify the token cost.
  const baseFilter: Record<string, unknown> = {
    status: 'active',
    _id: { $nin: STATIC_KNOWLEDGE_IDS },
  };

  if (CODE_FOCUSED_ROLES.includes(role)) {
    baseFilter['$or'] = [
      { category: { $ne: 'retrospectives' } },
      { qualityScore: { $gte: RETROSPECTIVE_MIN_QUALITY_SCORE } },
    ];
  }

  // Increase the selection pool for task-specific coder/reviewer runs so keyword
  // boosting has more candidates to reorder within.
  const dynamicLimit =
    taskId && CODE_FOCUSED_ROLES.includes(role)
      ? DYNAMIC_KNOWLEDGE_LIMIT_TASK
      : DYNAMIC_KNOWLEDGE_LIMIT_DEFAULT;

  const dynamicKnowledge = await KnowledgeFileModel.find(baseFilter)
    .sort({ qualityScore: -1 })
    .limit(dynamicLimit)
    .lean();

  // For task-specific coder/reviewer runs, promote knowledge files that contain
  // task keywords.  Three tiers preserve quality-score order within each tier:
  //   Tier 1 — keyword found in title or snippet
  //   Tier 2 — keyword found in content body (first 500 chars) but not title/snippet
  //   Tier 3 — no keyword match anywhere
  if (taskId && CODE_FOCUSED_ROLES.includes(role) && task) {
    const keywords = extractKeywords(
      `${task.title} ${task.description} ${task.acceptanceCriteria.join(' ')}`
    );
    applyKeywordBoost(dynamicKnowledge, keywords);
  }

  // For orchestrator runs, apply the same three-tier keyword boost using the
  // cycle goal as the keyword source.  The orchestrator gets the full dynamic
  // pool re-ranked by goal relevance so that planning context surfaces first.
  // When the cycle goal is still the placeholder ('Awaiting orchestrator plan'),
  // fall back to the most recent completed cycle's goal for meaningful keywords.
  // If no completed cycles exist yet, skip the boost (fall through to quality-score order).
  const recentCycles =
    role === 'orchestrator'
      ? await CycleModel.find({ status: 'completed' }).sort({ _id: -1 }).limit(3).lean()
      : [];

  if (role === 'orchestrator' && cycle) {
    const PLACEHOLDER = 'Awaiting orchestrator plan';
    let keywordSource: string | null = cycle.goal;
    if (cycle.goal === PLACEHOLDER) {
      keywordSource = recentCycles.length > 0 ? recentCycles[0].goal : null;
    }
    if (keywordSource !== null) {
      const keywords = extractKeywords(keywordSource);
      applyKeywordBoost(dynamicKnowledge, keywords);
    }
  }

  for (const kf of dynamicKnowledge) {
    taskPromptParts.push(`\n---\n# Knowledge: ${kf.title}\n${kf.content}\n`);
    knowledgeFiles.push(kf._id);
  }

  // Add task branches for integrator
  if (role === 'integrator') {
    const tasks = await TaskModel.find({ cycleId, status: 'done' }).lean();

    if (tasks.length > 0) {
      taskPromptParts.push(`\n# Branches to Merge\n`);
      taskPromptParts.push(
        `Merge these branches into \`${process.env['BASE_BRANCH'] ?? 'master'}\` in the order listed (respects dependency graph).\n\n`
      );

      // Topological sort by blockedBy for correct merge order
      const sorted = topologicalSort(tasks);

      for (const t of sorted) {
        const branch = t.branch ?? `task-${t._id.toLowerCase()}`;
        taskPromptParts.push(`- **${t._id}**: branch \`${branch}\` — ${t.title}`);
        if (t.prNumber) taskPromptParts.push(` (PR #${t.prNumber})`);
        taskPromptParts.push(`\n`);
      }
    }
  }

  // Add auto-approval categories for orchestrator so it can plan task types optimally
  if (role === 'orchestrator') {
    const categories = control.autoApprovalCategories;
    if (categories.length > 0) {
      taskPromptParts.push(
        `\n# Auto-Approval Categories\nThe following task types skip the human review gate: [${categories.join(', ')}]\n`
      );
    } else {
      taskPromptParts.push(
        `\n# Auto-Approval Categories\nAll tasks require human review (no auto-approval categories are configured).\n`
      );
    }
  }

  // Add previous cycle summaries and task-type breakdown for orchestrator
  if (role === 'orchestrator') {
    if (recentCycles.length > 0) {
      taskPromptParts.push(`\n# Recent Cycle Summaries\n`);
      for (const c of recentCycles) {
        taskPromptParts.push(
          `\n## Cycle ${c._id}: ${c.goal}\n${c.summary ?? 'No summary available.'}\n`
        );
      }

      // Task-type breakdown — gives the orchestrator concrete data on historical
      // work distribution so it can detect overinvestment in any category.
      taskPromptParts.push(`\n# Recent Cycle Task Breakdown\n`);
      for (const c of recentCycles) {
        const cycleTasks = await TaskModel.find({ cycleId: c._id }).lean();
        const typeCounts: Record<string, number> = {};
        for (const t of cycleTasks) {
          typeCounts[t.type] = (typeCounts[t.type] ?? 0) + 1;
        }
        taskPromptParts.push(`\n## Cycle ${c._id} task types\n`);
        const typeTitles: Record<string, string[]> = {};
        const typeFailedTitles: Record<string, string[]> = {};
        for (const t of cycleTasks) {
          if (!typeTitles[t.type]) typeTitles[t.type] = [];
          if (!typeFailedTitles[t.type]) typeFailedTitles[t.type] = [];
          if (t.title && t.title.trim().length > 0) {
            typeTitles[t.type].push(t.title);
            if (t.status === 'failed') {
              typeFailedTitles[t.type].push(t.title);
            }
          }
        }
        for (const [type, count] of Object.entries(typeCounts)) {
          const titles = typeTitles[type] ?? [];
          const failedTitles = typeFailedTitles[type] ?? [];
          let line: string;
          if (titles.length > 0) {
            line = `- ${type} (${count}): ${titles.join(', ')}`;
          } else {
            line = `- ${type}: ${count}`;
          }
          if (failedTitles.length > 0) {
            line += ` [${failedTitles.length} failed: ${failedTitles.join(', ')}]`;
          }
          taskPromptParts.push(`${line}\n`);
        }
        // Retry issue details — shows WHY tasks were retried, not just that they were.
        for (const t of cycleTasks) {
          const hasReviewIssues = t.lastRetryReviewIssues && t.lastRetryReviewIssues.length > 0;
          const hasCause = t.lastRetryCause && (t.retryCount ?? 0) > 0;
          if (hasReviewIssues || hasCause) {
            taskPromptParts.push(`  Retry issues for ${t.title}:\n`);
            if (t.lastRetryCause) {
              taskPromptParts.push(`  Retry cause: ${t.lastRetryCause}\n`);
            }
            if (hasReviewIssues) {
              for (const issue of t.lastRetryReviewIssues) {
                taskPromptParts.push(`  - ${issue.description}\n`);
              }
            } else {
              taskPromptParts.push(
                `  (no reviewer issues — coder was retried by pre-flight check)\n`
              );
            }
          }
        }
        // Cycle-level outcome summary — helps the orchestrator gauge overall health
        if (c.metrics) {
          const total = (c.metrics.tasksCompleted ?? 0) + (c.metrics.tasksFailed ?? 0);
          const cost = (c.metrics.totalCostUsd ?? 0).toFixed(2);
          const coverageSuffix =
            c.metrics.goalCoverage != null
              ? `, goal coverage: ${Math.round(c.metrics.goalCoverage * 100)}%`
              : '';
          taskPromptParts.push(
            `- Outcome: ${c.metrics.tasksCompleted}/${total} tasks completed, cost $${cost}${coverageSuffix}\n`
          );
          if (c.metrics.tasksRetried != null && c.metrics.tasksPassedFirstReview != null) {
            taskPromptParts.push(
              `- Review quality: ${c.metrics.tasksPassedFirstReview} passed first review, ${c.metrics.tasksRetried} required retry\n`
            );
          }
          if (
            c.metrics.tasksRetriedByReviewer != null ||
            c.metrics.tasksRetriedByCi != null ||
            c.metrics.tasksRetriedByPrBody != null
          ) {
            const byReviewer = c.metrics.tasksRetriedByReviewer ?? 0;
            const byCi = c.metrics.tasksRetriedByCi ?? 0;
            let breakdownLine = `- Review breakdown: ${byReviewer} by reviewer, ${byCi} by CI`;
            if (c.metrics.tasksRetriedByPrBody != null && c.metrics.tasksRetriedByPrBody > 0) {
              breakdownLine += `, ${c.metrics.tasksRetriedByPrBody} by PR body invalid`;
            }
            taskPromptParts.push(breakdownLine + '\n');
          }
        }
      }
    }
  }

  return {
    systemPromptContent,
    taskPromptContent: taskPromptParts.join(''),
    knowledgeFiles,
  };
}

export async function processContextFeedback(
  agentRunId: string,
  feedback: ContextFeedback
): Promise<void> {
  // Update AgentRun
  await AgentRunModel.updateOne({ _id: agentRunId }, { $set: { contextFeedback: feedback } });

  // Update quality scores for referenced knowledge files

  const allFiles = [...new Set([...feedback.useful, ...feedback.unnecessary])];

  for (const filePath of allFiles) {
    const kf = await KnowledgeFileModel.findById(filePath);
    if (!kf) continue;

    let delta = 0;
    if (feedback.useful.includes(filePath)) delta += QUALITY_SCORE_USEFUL_DELTA;
    if (feedback.unnecessary.includes(filePath)) delta += QUALITY_SCORE_UNNECESSARY_DELTA;

    const newScore = Math.max(
      QUALITY_SCORE_MIN,
      Math.min(QUALITY_SCORE_MAX, (kf.qualityScore ?? 0) * QUALITY_SCORE_DECAY + delta)
    );

    const updateFields: Record<string, unknown> = {
      qualityScore: newScore,
      lastReferencedAt: new Date(),
    };
    if (newScore <= QUALITY_SCORE_MIN) {
      updateFields['status'] = 'pruned';
    }

    await KnowledgeFileModel.updateOne({ _id: filePath }, { $set: updateFields });
  }

  // Create inbox entries for missing knowledge
  for (const missing of feedback.missing) {
    // Escape regex special chars to prevent invalid regex errors from agent-provided text
    const escaped = missing.substring(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingInbox = await KnowledgeFileModel.findOne({
      category: 'inbox',
      title: { $regex: escaped, $options: 'i' },
    });
    if (!existingInbox) {
      await KnowledgeFileModel.create({
        _id: `inbox/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        category: 'inbox',
        title: missing,
        snippet: missing.substring(0, 150),
        content: `Agent reported missing knowledge: ${missing}\nSource run: ${agentRunId}`,
        source: { type: 'agent', agentRunId },
      });
    }
  }
}

// Topological sort for task merge ordering — most dependents first
function topologicalSort(
  tasks: Array<{ _id: string; blockedBy: string[]; [key: string]: unknown }>
): typeof tasks {
  const idSet = new Set(tasks.map((t) => t._id));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const t of tasks) {
    inDegree.set(t._id, 0);
    adj.set(t._id, []);
  }

  for (const t of tasks) {
    for (const dep of t.blockedBy) {
      if (idSet.has(dep)) {
        adj.get(dep)!.push(t._id);
        inDegree.set(t._id, (inDegree.get(t._id) ?? 0) + 1);
      }
    }
  }

  // Count transitive dependents for each task (DFS from each node)
  const dependentCount = new Map<string, number>();
  function countDependents(id: string, visited: Set<string>): number {
    let count = 0;
    for (const neighbor of adj.get(id) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        count += 1 + countDependents(neighbor, visited);
      }
    }
    return count;
  }
  for (const t of tasks) {
    dependentCount.set(t._id, countDependents(t._id, new Set()));
  }

  // Use a priority queue (sort by most dependents first among ready tasks)
  const ready: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) ready.push(id);
  }
  ready.sort((a, b) => (dependentCount.get(b) ?? 0) - (dependentCount.get(a) ?? 0));

  const sorted: typeof tasks = [];
  const taskMap = new Map(tasks.map((t) => [t._id, t]));

  while (ready.length > 0) {
    const id = ready.shift()!;
    sorted.push(taskMap.get(id)!);
    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) ready.push(neighbor);
    }
    // Re-sort after adding newly ready tasks
    ready.sort((a, b) => (dependentCount.get(b) ?? 0) - (dependentCount.get(a) ?? 0));
  }

  // Append any remaining tasks (shouldn't happen if no cycles)
  for (const t of tasks) {
    if (!sorted.includes(t)) sorted.push(t);
  }

  return sorted;
}
