import fs from 'node:fs';
import path from 'node:path';
import { KnowledgeFileModel } from '../../models/knowledge-file.js';
import { RoomModel } from '../../models/room.js';
import { SpecModel } from '../../models/spec.js';
import { AgentRunModel } from '../../models/agent-run.js';
import { CycleModel } from '../../models/cycle.js';
import { TaskModel } from '../../models/task.js';
import { getOrCreateControl } from '../../models/control.js';
import type { ContextFeedback, ContextSnapshot, RetryContext } from '@zombie-farm/shared';
import {
  QUALITY_SCORE_USEFUL_DELTA,
  QUALITY_SCORE_UNNECESSARY_DELTA,
  QUALITY_SCORE_DECAY,
  QUALITY_SCORE_MIN,
  QUALITY_SCORE_MAX,
  SPEC_TYPE_PRIORITY,
} from '@zombie-farm/shared';

interface AgentContext {
  systemPromptContent: string;
  taskPromptContent: string;
  knowledgeFiles: string[];
  contextSnapshot?: ContextSnapshot;
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
function applyKeywordBoost<T extends { title: string; snippet?: string; summary?: string; content?: string; detail?: string }>(
  docs: T[],
  keywords: string[]
): void {
  if (keywords.length === 0) return;
  const matchesTitleOrSnippet = (kf: T): boolean =>
    keywords.some(
      (kw) =>
        kf.title.toLowerCase().includes(kw) ||
        (kf.snippet?.toLowerCase() ?? '').includes(kw) ||
        (kf.summary?.toLowerCase() ?? '').includes(kw)
    );
  const matchesContentBody = (kf: T): boolean => {
    const body = kf.content ?? kf.detail ?? '';
    return keywords.some((kw) => body.toLowerCase().substring(0, 500).includes(kw));
  };
  const tier1 = docs.filter(matchesTitleOrSnippet);
  const tier2 = docs.filter((kf) => !matchesTitleOrSnippet(kf) && matchesContentBody(kf));
  const tier3 = docs.filter((kf) => !matchesTitleOrSnippet(kf) && !matchesContentBody(kf));
  docs.length = 0;
  docs.push(...tier1, ...tier2, ...tier3);
}

// ─── Role → Harness Room mapping ────────────────────────────────────
const ROLE_ROOM_MAP: Record<string, string> = {
  orchestrator: '02-01-orchestrator',
  coder: '02-02-coder',
  tester: '02-03-tester',
  reviewer: '02-04-reviewer',
  integrator: '02-05-integrator',
  curator: '02-06-curator',
};

const TOKEN_BUDGET = 8000;
const CHARS_PER_TOKEN = 4;

interface SpecWithMeta {
  _id: string;
  roomId: string;
  type: string;
  state: string;
  title: string;
  summary: string;
  detail: string;
  qualityScore: number;
  tags: string[];
}

/**
 * Select relevant Room specs for an agent context.
 * Returns sorted, truncated specs within token budget + snapshot metadata.
 */
async function selectRoomSpecs(params: {
  role: string;
  taskId?: string;
  task?: Record<string, unknown> | null;
  cycleId: number;
  cycleGoal?: string;
}): Promise<{ specs: SpecWithMeta[]; snapshot: ContextSnapshot }> {
  const { role, task, cycleGoal } = params;

  // Step 1: Determine relevant rooms
  const roomIds = new Set<string>();
  roomIds.add('00-project-room');

  // Role-specific harness room
  const roleRoom = ROLE_ROOM_MAP[role];
  if (roleRoom) roomIds.add(roleRoom);

  // Task keyword matching against room names/IDs
  if (task) {
    const taskText = [
      task.title as string ?? '',
      task.description as string ?? '',
      ...(task.acceptanceCriteria as string[] ?? []),
    ].join(' ');
    const keywords = extractKeywords(taskText);

    if (keywords.length > 0) {
      const allRooms = await RoomModel.find({}, { _id: 1, name: 1 }).lean();
      for (const room of allRooms) {
        const roomIdLower = (room._id as string).toLowerCase();
        const roomNameLower = (room.name as string).toLowerCase();
        for (const kw of keywords) {
          if (roomIdLower.includes(kw) || roomNameLower.includes(kw)) {
            roomIds.add(room._id as string);
            break;
          }
        }
      }
    }

    // GodotPlanTask.featureRooms direct include
    const featureRooms = task.featureRooms as string[] | undefined;
    if (featureRooms) {
      for (const fr of featureRooms) roomIds.add(fr);
    }

    // GodotPlanTask.prdRefs → game rooms under 10-game-rooms
    const prdRefs = task.prdRefs as string[] | undefined;
    if (prdRefs && prdRefs.length > 0) {
      roomIds.add('10-game-rooms');
    }
  }

  // Orchestrator: also match rooms by cycle goal keywords
  if (role === 'orchestrator' && cycleGoal) {
    const goalKeywords = extractKeywords(cycleGoal);
    if (goalKeywords.length > 0) {
      const allRooms = await RoomModel.find({}, { _id: 1, name: 1 }).lean();
      for (const room of allRooms) {
        const roomIdLower = (room._id as string).toLowerCase();
        const roomNameLower = (room.name as string).toLowerCase();
        for (const kw of goalKeywords) {
          if (roomIdLower.includes(kw) || roomNameLower.includes(kw)) {
            roomIds.add(room._id as string);
            break;
          }
        }
      }
    }
  }

  // Step 2: Collect specs + inheritance
  const specMap = new Map<string, SpecWithMeta>();

  // For each relevant room, get active specs
  for (const roomId of roomIds) {
    const specs = await SpecModel.find({ roomId, state: 'active' }).lean();
    for (const s of specs) {
      specMap.set(s._id as string, s as unknown as SpecWithMeta);
    }
  }

  // Walk parent chains: collect constraint + convention specs from ancestors
  const visitedParents = new Set<string>();
  for (const roomId of roomIds) {
    let currentId: string | null = roomId;
    while (currentId) {
      if (visitedParents.has(currentId)) break;
      visitedParents.add(currentId);
      const room = await RoomModel.findById(currentId, { parent: 1 }).lean();
      if (!room || !room.parent) break;
      currentId = room.parent as string;
      // Collect only constraint and convention from ancestors (inheritance)
      const inheritedSpecs = await SpecModel.find({
        roomId: currentId,
        state: 'active',
        type: { $in: ['constraint', 'convention'] },
      }).lean();
      for (const s of inheritedSpecs) {
        if (!specMap.has(s._id as string)) {
          specMap.set(s._id as string, s as unknown as SpecWithMeta);
        }
      }
    }
  }

  // Step 3: Sort by type priority, then keyword boost within each tier, then qualityScore
  let sortedSpecs = Array.from(specMap.values());

  // First: sort by type priority + qualityScore
  sortedSpecs.sort((a, b) => {
    const pa = SPEC_TYPE_PRIORITY[a.type] ?? 99;
    const pb = SPEC_TYPE_PRIORITY[b.type] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
  });

  // Then: apply keyword boost WITHIN each type tier (stable partition preserves
  // the qualityScore order within each keyword-match tier)
  if (task) {
    const taskText = [
      task.title as string ?? '',
      task.description as string ?? '',
      ...(task.acceptanceCriteria as string[] ?? []),
    ].join(' ');
    const keywords = extractKeywords(taskText);

    // Group by type, boost within each group, reassemble
    const typeGroups = new Map<string, SpecWithMeta[]>();
    for (const spec of sortedSpecs) {
      if (!typeGroups.has(spec.type)) typeGroups.set(spec.type, []);
      typeGroups.get(spec.type)!.push(spec);
    }
    const boosted: SpecWithMeta[] = [];
    // Iterate in type priority order
    const typeOrder = [...typeGroups.keys()].sort(
      (a, b) => (SPEC_TYPE_PRIORITY[a] ?? 99) - (SPEC_TYPE_PRIORITY[b] ?? 99)
    );
    for (const type of typeOrder) {
      const group = typeGroups.get(type)!;
      applyKeywordBoost(group, keywords);
      boosted.push(...group);
    }
    sortedSpecs = boosted;
  }

  // Step 4: Truncate to token budget
  let tokenCount = 0;
  const accepted: SpecWithMeta[] = [];
  const truncated: string[] = [];

  for (const spec of sortedSpecs) {
    const specTokens = Math.ceil((spec.detail?.length ?? 0) / CHARS_PER_TOKEN);
    if (tokenCount + specTokens > TOKEN_BUDGET && spec.type !== 'constraint') {
      truncated.push(spec._id);
      continue;
    }
    tokenCount += specTokens;
    accepted.push(spec);
  }

  const snapshot: ContextSnapshot = {
    specIds: accepted.map((s) => s._id),
    roomIds: Array.from(roomIds),
    tokenCount,
    truncated,
  };

  return { specs: accepted, snapshot };
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

  // ─── Knowledge Selection: Room+Spec (primary) or KnowledgeFile (fallback) ───
  let contextSnapshot: ContextSnapshot | undefined;

  const specCount = await SpecModel.countDocuments();
  if (specCount > 0) {
    // Primary path: Room-aware spec selection
    // Determine cycle goal for orchestrator keyword matching
    let cycleGoal: string | undefined;
    if (role === 'orchestrator' && cycle) {
      const PLACEHOLDER = 'Awaiting orchestrator plan';
      if (cycle.goal !== PLACEHOLDER) {
        cycleGoal = cycle.goal as string;
      } else {
        const recentCompleted = await CycleModel.findOne({ status: 'completed' })
          .sort({ _id: -1 })
          .lean();
        cycleGoal = recentCompleted?.goal as string | undefined;
      }
    }

    const { specs, snapshot } = await selectRoomSpecs({
      role,
      taskId,
      task: task as Record<string, unknown> | null,
      cycleId,
      cycleGoal,
    });

    contextSnapshot = snapshot;

    for (const spec of specs) {
      taskPromptParts.push(`\n---\n# [${spec.type}] ${spec.title}\n${spec.detail}\n`);
      knowledgeFiles.push(spec._id);
    }

    // Update lastReferencedAt for all injected specs
    if (snapshot.specIds.length > 0) {
      await SpecModel.updateMany(
        { _id: { $in: snapshot.specIds } },
        { $set: { lastReferencedAt: new Date() } }
      );
    }
  } else {
    // Fallback: KnowledgeFile-based selection (will be removed in M7)
    const staticFiles = ['boot.md', 'conventions.md', 'glossary.md'];
    for (const file of staticFiles) {
      const filePath = path.join(KNOWLEDGE_DIR, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        taskPromptParts.push(`\n---\n# Knowledge: ${file}\n${content}\n`);
        knowledgeFiles.push(`knowledge/${file}`);
      }
    }

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
    const dynamicLimit =
      taskId && CODE_FOCUSED_ROLES.includes(role)
        ? DYNAMIC_KNOWLEDGE_LIMIT_TASK
        : DYNAMIC_KNOWLEDGE_LIMIT_DEFAULT;

    const dynamicKnowledge = await KnowledgeFileModel.find(baseFilter)
      .sort({ qualityScore: -1 })
      .limit(dynamicLimit)
      .lean();

    if (taskId && CODE_FOCUSED_ROLES.includes(role) && task) {
      const keywords = extractKeywords(
        `${task.title} ${task.description} ${task.acceptanceCriteria.join(' ')}`
      );
      applyKeywordBoost(dynamicKnowledge, keywords);
    }

    for (const kf of dynamicKnowledge) {
      taskPromptParts.push(`\n---\n# Knowledge: ${kf.title}\n${kf.content}\n`);
      knowledgeFiles.push(kf._id);
    }
  }

  // Fetch recent cycles for orchestrator (needed below regardless of spec/knowledge path)
  const recentCycles =
    role === 'orchestrator'
      ? await CycleModel.find({ status: 'completed' }).sort({ _id: -1 }).limit(3).lean()
      : [];

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
    contextSnapshot,
  };
}

export async function processContextFeedback(
  agentRunId: string,
  feedback: ContextFeedback
): Promise<void> {
  // Update AgentRun
  await AgentRunModel.updateOne({ _id: agentRunId }, { $set: { contextFeedback: feedback } });

  // Update quality scores for referenced Specs (Room+Spec system)
  const allSpecs = [
    ...new Set([...(feedback.useful_specs ?? []), ...(feedback.unnecessary_specs ?? [])]),
  ];

  for (const specId of allSpecs) {
    const spec = await SpecModel.findById(specId);
    if (!spec) continue;

    let delta = 0;
    if (feedback.useful_specs?.includes(specId)) delta += QUALITY_SCORE_USEFUL_DELTA;
    if (feedback.unnecessary_specs?.includes(specId)) delta += QUALITY_SCORE_UNNECESSARY_DELTA;

    const newScore = Math.max(
      QUALITY_SCORE_MIN,
      Math.min(QUALITY_SCORE_MAX, (spec.qualityScore ?? 0) * QUALITY_SCORE_DECAY + delta)
    );

    const updateFields: Record<string, unknown> = {
      qualityScore: newScore,
      lastReferencedAt: new Date(),
      updatedAt: new Date(),
    };
    if (newScore <= QUALITY_SCORE_MIN) {
      updateFields['state'] = 'archived';
    }

    await SpecModel.updateOne({ _id: specId }, { $set: updateFields });
  }

  // Update quality scores for referenced KnowledgeFiles (legacy, kept until M7)
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

  // Create draft specs for missing knowledge (in best-matching room, or 00-project-room)
  for (const missing of feedback.missing) {
    const keywords = extractKeywords(missing);
    let bestRoom = '00-project-room';

    if (keywords.length > 0) {
      const allRooms = await RoomModel.find({}, { _id: 1, name: 1 }).lean();
      for (const room of allRooms) {
        const roomIdLower = (room._id as string).toLowerCase();
        const roomNameLower = (room.name as string).toLowerCase();
        if (keywords.some((kw) => roomIdLower.includes(kw) || roomNameLower.includes(kw))) {
          bestRoom = room._id as string;
          break;
        }
      }
    }

    const specId = `context-${bestRoom}-${Date.now().toString(36)}`;
    const existingSpec = await SpecModel.findOne({
      roomId: bestRoom,
      title: { $regex: missing.substring(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
      state: { $ne: 'archived' },
    });

    if (!existingSpec) {
      await SpecModel.create({
        _id: specId,
        roomId: bestRoom,
        type: 'context',
        state: 'draft',
        title: missing,
        summary: missing.substring(0, 150),
        detail: `Agent reported missing knowledge: ${missing}\nSource run: ${agentRunId}`,
        provenance: {
          source_type: 'agent_sediment',
          confidence: 0.3,
          agentRunId,
        },
        tags: keywords,
        relations: [],
        anchors: [],
        qualityScore: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
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
