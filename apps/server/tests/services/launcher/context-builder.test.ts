/**
 * Unit tests for context-builder.ts
 *
 * Tests cover:
 *   - buildContext() for orchestrator role: system prompt, cycle summary, human message,
 *     dynamic knowledge injection, static knowledge exclusion
 *   - buildContext() for coder role: task title, description, acceptanceCriteria, blockedBy
 *   - buildContext() for integrator role: topologically-sorted branch list
 *   - buildContext() with retryContext: previous error and review feedback
 *   - processContextFeedback(): quality score increments/decrements/clamping, inbox creation,
 *     inbox deduplication
 *
 * All fs, MongoDB model calls, and getOrCreateControl are mocked (vi.mock).
 * No real database or filesystem access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (set up before module imports) ─────────────────────────────

const mockFsExistsSync = vi.hoisted(() => vi.fn(() => true));
const mockFsReadFileSync = vi.hoisted(() =>
  vi.fn((filePath: unknown, _encoding?: unknown): string => {
    const p = String(filePath);
    if (p.endsWith('package.json')) return '{"workspaces":["packages/*"]}';
    if (p.endsWith('orchestrator.md')) return 'SYSTEM: orchestrator prompt';
    if (p.endsWith('coder.md')) return 'SYSTEM: coder prompt';
    if (p.endsWith('integrator.md')) return 'SYSTEM: integrator prompt';
    if (p.endsWith('boot.md')) return 'Static boot content';
    if (p.endsWith('conventions.md')) return 'Static conventions content';
    if (p.endsWith('glossary.md')) return 'Static glossary content';
    return 'Unknown file content';
  })
);

const mockCycleFindById = vi.hoisted(() => vi.fn());
const mockCycleFind = vi.hoisted(() => vi.fn());
const mockTaskFindById = vi.hoisted(() => vi.fn());
const mockTaskFind = vi.hoisted(() => vi.fn());
const mockKnowledgeFindById = vi.hoisted(() => vi.fn());
const mockKnowledgeFind = vi.hoisted(() => vi.fn());
const mockKnowledgeFindOne = vi.hoisted(() => vi.fn());
const mockKnowledgeUpdateOne = vi.hoisted(() => vi.fn());
const mockKnowledgeCreate = vi.hoisted(() => vi.fn());
const mockAgentRunUpdateOne = vi.hoisted(() => vi.fn());
const mockGetOrCreateControl = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockFsExistsSync,
    readFileSync: mockFsReadFileSync,
  },
  existsSync: mockFsExistsSync,
  readFileSync: mockFsReadFileSync,
}));

vi.mock('../../../src/services/../../src/models/cycle.js', () => ({
  CycleModel: {
    findById: mockCycleFindById,
    find: mockCycleFind,
  },
}));

vi.mock('../../../src/services/../../src/models/task.js', () => ({
  TaskModel: {
    findById: mockTaskFindById,
    find: mockTaskFind,
  },
}));

vi.mock('../../../src/services/../../src/models/knowledge-file.js', () => ({
  KnowledgeFileModel: {
    find: mockKnowledgeFind,
    findById: mockKnowledgeFindById,
    findOne: mockKnowledgeFindOne,
    updateOne: mockKnowledgeUpdateOne,
    create: mockKnowledgeCreate,
  },
}));

vi.mock('../../../src/services/../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    updateOne: mockAgentRunUpdateOne,
  },
}));

vi.mock('../../../src/services/../../src/models/control.js', () => ({
  getOrCreateControl: mockGetOrCreateControl,
}));

// ─── Import functions under test (after mocks) ────────────────────────────────

import {
  buildContext,
  processContextFeedback,
  extractKeywords,
} from '../../../src/services/launcher/context-builder.js';
import {
  QUALITY_SCORE_MIN,
  QUALITY_SCORE_MAX,
  QUALITY_SCORE_USEFUL_DELTA,
  QUALITY_SCORE_UNNECESSARY_DELTA,
  QUALITY_SCORE_DECAY,
} from '@harness/shared';

// ─── Helper: create chainable Mongoose query stub ─────────────────────────────

function chainable(result: unknown) {
  const obj = {
    lean: () => Promise.resolve(result),
    sort: () => obj,
    limit: () => obj,
  };
  return obj;
}

// ─── buildContext — orchestrator role ─────────────────────────────────────────

describe('buildContext — orchestrator role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue({ humanMessage: '', autoApprovalCategories: [] });
    mockCycleFindById.mockReturnValue(
      chainable({ _id: 1, goal: 'Build something great', phase: 'plan' })
    );
    mockCycleFind.mockReturnValue(chainable([]));
    mockKnowledgeFind.mockReturnValue(chainable([]));
    // TaskModel.find is called per-cycle when building the task-type breakdown
    mockTaskFind.mockReturnValue(chainable([]));
  });

  // ── Test 1: Loads system prompt from agents/orchestrator.md ───────────────

  it('loads system prompt from agents/orchestrator.md', async () => {
    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    expect(ctx.systemPromptContent).toBe('SYSTEM: orchestrator prompt');
  });

  // ── Test 2: Injects cycle goal and phase ─────────────────────────────────

  it('injects cycle goal and phase into task prompt', async () => {
    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    expect(ctx.taskPromptContent).toContain('Build something great');
    expect(ctx.taskPromptContent).toContain('plan');
  });

  // ── Test 3: Injects human message when present ───────────────────────────

  it('injects human message when humanMessage is set on control', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      humanMessage: 'Please focus on performance.',
      autoApprovalCategories: [],
    });

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    expect(ctx.taskPromptContent).toContain('Operator Message');
    expect(ctx.taskPromptContent).toContain('Please focus on performance.');
  });

  // ── Test 4: Omits operator section when humanMessage is blank ────────────

  it('does not inject operator message section when humanMessage is empty', async () => {
    mockGetOrCreateControl.mockResolvedValue({ humanMessage: '', autoApprovalCategories: [] });

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    expect(ctx.taskPromptContent).not.toContain('Operator Message');
  });

  // ── Test 5: Dynamic knowledge files injected in quality-score order ───────

  it('injects dynamic knowledge files sorted by quality score (highest first)', async () => {
    const lowScore = {
      _id: 'decisions/use-postgres',
      title: 'Use PostgreSQL',
      content: 'We chose Postgres.',
      qualityScore: 5,
    };
    const highScore = {
      _id: 'specs/container-setup',
      title: 'Container Setup',
      content: 'Containers run as....',
      qualityScore: 10,
    };
    // DB returns docs already sorted descending by qualityScore
    mockKnowledgeFind.mockReturnValue(chainable([highScore, lowScore]));

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    expect(ctx.taskPromptContent).toContain('Container Setup');
    expect(ctx.taskPromptContent).toContain('Use PostgreSQL');

    const containerIdx = ctx.taskPromptContent.indexOf('Container Setup');
    const postgresIdx = ctx.taskPromptContent.indexOf('Use PostgreSQL');
    expect(containerIdx).toBeLessThan(postgresIdx);
  });

  // ── Test 6: Static knowledge IDs excluded from dynamic query ─────────────

  it('passes $nin filter with static knowledge IDs to exclude them from dynamic query', async () => {
    await buildContext({ role: 'orchestrator', cycleId: 1 });

    const findArg = mockKnowledgeFind.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(findArg?.['_id']).toMatchObject({
      $nin: expect.arrayContaining(['specs/boot.md', 'skills/conventions.md', 'specs/glossary.md']),
    });
  });

  // ── Test 7: Recent completed cycle summaries for orchestrator ─────────────

  it('injects recent completed cycle summaries for orchestrator role', async () => {
    mockCycleFind.mockReturnValue(
      chainable([{ _id: 5, goal: 'Improve dashboard', summary: 'Added charts and filters.' }])
    );
    // Per-cycle task query for task-type breakdown
    mockTaskFind.mockReturnValue(chainable([]));

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 6 });

    expect(ctx.taskPromptContent).toContain('Recent Cycle Summaries');
    expect(ctx.taskPromptContent).toContain('Improve dashboard');
    expect(ctx.taskPromptContent).toContain('Added charts and filters.');
  });

  // ── Test: Orchestrator task-type breakdown section ────────────────────────

  it('injects task-type breakdown section with correct counts for each recent cycle', async () => {
    mockCycleFind.mockReturnValue(
      chainable([
        { _id: 20, goal: 'Cycle 20 goal', summary: 'Summary 20.' },
        { _id: 19, goal: 'Cycle 19 goal', summary: 'Summary 19.' },
      ])
    );
    // First call (cycle 20): 3 features, 1 chore, 1 test
    // Second call (cycle 19): 2 bugs
    mockTaskFind
      .mockReturnValueOnce(
        chainable([
          {
            _id: 'TASK-090',
            type: 'feature',
            cycleId: 20,
            title: 'Add spending analytics endpoint',
          },
          { _id: 'TASK-091', type: 'feature', cycleId: 20, title: 'Fix knowledge sync' },
          { _id: 'TASK-092', type: 'feature', cycleId: 20, title: 'Improve integrator prompt' },
          { _id: 'TASK-093', type: 'chore', cycleId: 20, title: 'Write cycle 19 retrospective' },
          { _id: 'TASK-094', type: 'test', cycleId: 20, title: 'Add context-builder tests' },
        ])
      )
      .mockReturnValueOnce(
        chainable([
          { _id: 'TASK-085', type: 'bug', cycleId: 19, title: 'Fix SSE event handling' },
          { _id: 'TASK-086', type: 'bug', cycleId: 19, title: 'Fix orphan container recovery' },
        ])
      );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 21 });

    expect(ctx.taskPromptContent).toContain('Recent Cycle Task Breakdown');
    expect(ctx.taskPromptContent).toContain('Cycle 20 task types');
    // Type counts are present in new format: "- feature (3): ..."
    expect(ctx.taskPromptContent).toContain('feature (3)');
    expect(ctx.taskPromptContent).toContain('chore (1)');
    expect(ctx.taskPromptContent).toContain('test (1)');
    expect(ctx.taskPromptContent).toContain('Cycle 19 task types');
    expect(ctx.taskPromptContent).toContain('bug (2)');
    // Task titles appear alongside type counts
    expect(ctx.taskPromptContent).toContain('Add spending analytics endpoint');
    expect(ctx.taskPromptContent).toContain('Fix knowledge sync');
    expect(ctx.taskPromptContent).toContain('Improve integrator prompt');
    expect(ctx.taskPromptContent).toContain('Fix SSE event handling');
    expect(ctx.taskPromptContent).toContain('Fix orphan container recovery');
  });

  // ── Test: Task titles with empty strings are omitted from title list ───────

  it('omits tasks with empty titles from the title list but still counts them', async () => {
    mockCycleFind.mockReturnValue(
      chainable([{ _id: 30, goal: 'Cycle 30 goal', summary: 'Summary 30.' }])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        { _id: 'TASK-100', type: 'feature', cycleId: 30, title: 'Valid title' },
        { _id: 'TASK-101', type: 'feature', cycleId: 30, title: '' },
        { _id: 'TASK-102', type: 'feature', cycleId: 30, title: '   ' },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 31 });

    // Count still reflects all 3 tasks
    expect(ctx.taskPromptContent).toContain('feature (3)');
    // Only the non-empty title appears
    expect(ctx.taskPromptContent).toContain('Valid title');
  });

  // ── Test: Failed task annotation on type lines ────────────────────────────

  it('appends [N failed: title] annotation when tasks have status failed', async () => {
    mockCycleFind.mockReturnValue(
      chainable([{ _id: 40, goal: 'Cycle 40 goal', summary: 'Summary 40.' }])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        {
          _id: 'TASK-110',
          type: 'feature',
          cycleId: 40,
          title: 'Add new endpoint',
          status: 'done',
        },
        { _id: 'TASK-111', type: 'feature', cycleId: 40, title: 'Fix auth flow', status: 'done' },
        {
          _id: 'TASK-112',
          type: 'feature',
          cycleId: 40,
          title: 'Improve dashboard',
          status: 'failed',
        },
        {
          _id: 'TASK-113',
          type: 'chore',
          cycleId: 40,
          title: 'Write retrospective',
          status: 'done',
        },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 41 });

    // Type line for feature should show [1 failed: Improve dashboard]
    expect(ctx.taskPromptContent).toContain('[1 failed: Improve dashboard]');
    // The full feature line format
    expect(ctx.taskPromptContent).toContain(
      'feature (3): Add new endpoint, Fix auth flow, Improve dashboard [1 failed: Improve dashboard]'
    );
    // Chore line should have no failed annotation
    expect(ctx.taskPromptContent).toContain('chore (1): Write retrospective');
    expect(ctx.taskPromptContent).not.toContain('chore (1): Write retrospective [');
  });

  // ── Test: No failed annotation when no tasks failed ───────────────────────

  it('omits failed annotation when no tasks have status failed', async () => {
    mockCycleFind.mockReturnValue(
      chainable([{ _id: 42, goal: 'Cycle 42 goal', summary: 'Summary 42.' }])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        { _id: 'TASK-120', type: 'feature', cycleId: 42, title: 'Add feature A', status: 'done' },
        { _id: 'TASK-121', type: 'feature', cycleId: 42, title: 'Add feature B', status: 'done' },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 43 });

    expect(ctx.taskPromptContent).toContain('feature (2): Add feature A, Add feature B');
    expect(ctx.taskPromptContent).not.toContain('[');
  });

  // ── Test: Outcome summary line shown when cycle has metrics ───────────────

  it('appends outcome summary line after type breakdown when cycle has metrics', async () => {
    mockCycleFind.mockReturnValue(
      chainable([
        {
          _id: 44,
          goal: 'Cycle 44 goal',
          summary: 'Summary 44.',
          metrics: {
            tasksCompleted: 4,
            tasksFailed: 1,
            totalCostUsd: 2.5,
            totalDurationMs: 3600000,
          },
        },
      ])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        { _id: 'TASK-130', type: 'feature', cycleId: 44, title: 'Alpha', status: 'done' },
        { _id: 'TASK-131', type: 'feature', cycleId: 44, title: 'Beta', status: 'failed' },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 45 });

    expect(ctx.taskPromptContent).toContain('Outcome: 4/5 tasks completed, cost $2.50');
  });

  // ── Test: Outcome summary line omitted when cycle has no metrics ──────────

  it('omits outcome summary line when cycle has no metrics', async () => {
    mockCycleFind.mockReturnValue(
      chainable([{ _id: 46, goal: 'Cycle 46 goal', summary: 'Summary 46.' }])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        { _id: 'TASK-140', type: 'chore', cycleId: 46, title: 'Do stuff', status: 'done' },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 47 });

    expect(ctx.taskPromptContent).not.toContain('Outcome:');
  });

  // ── Test: goalCoverage injected into outcome line when defined ────────────

  it('includes goal coverage percentage in outcome line when metrics.goalCoverage is defined', async () => {
    mockCycleFind.mockReturnValue(
      chainable([
        {
          _id: 50,
          goal: 'Cycle 50 goal',
          summary: 'Summary 50.',
          metrics: {
            tasksCompleted: 4,
            tasksFailed: 1,
            totalCostUsd: 3.0,
            totalDurationMs: 3600000,
            goalCoverage: 0.85,
          },
        },
      ])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        { _id: 'TASK-200', type: 'feature', cycleId: 50, title: 'Task A', status: 'done' },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 51 });

    expect(ctx.taskPromptContent).toContain('goal coverage: 85%');
    expect(ctx.taskPromptContent).toContain(
      'Outcome: 4/5 tasks completed, cost $3.00, goal coverage: 85%'
    );
  });

  // ── Test: goalCoverage absent when metrics.goalCoverage is undefined ───────

  it('omits goal coverage suffix when metrics.goalCoverage is undefined', async () => {
    mockCycleFind.mockReturnValue(
      chainable([
        {
          _id: 51,
          goal: 'Cycle 51 goal',
          summary: 'Summary 51.',
          metrics: {
            tasksCompleted: 3,
            tasksFailed: 0,
            totalCostUsd: 1.5,
            totalDurationMs: 1800000,
          },
        },
      ])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([{ _id: 'TASK-210', type: 'chore', cycleId: 51, title: 'Task B', status: 'done' }])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 52 });

    expect(ctx.taskPromptContent).toContain('Outcome: 3/3 tasks completed, cost $1.50');
    expect(ctx.taskPromptContent).not.toContain('goal coverage');
    expect(ctx.taskPromptContent).not.toContain('undefined%');
  });

  // ── Test: Review quality line appears when tasksRetried is defined ─────────

  it('includes review quality line in outcome section when metrics.tasksRetried is defined', async () => {
    mockCycleFind.mockReturnValue(
      chainable([
        {
          _id: 55,
          goal: 'Cycle 55 goal',
          summary: 'Summary 55.',
          metrics: {
            tasksCompleted: 4,
            tasksFailed: 0,
            totalCostUsd: 2.0,
            totalDurationMs: 3600000,
            tasksRetried: 2,
            tasksPassedFirstReview: 2,
          },
        },
      ])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        { _id: 'TASK-220', type: 'feature', cycleId: 55, title: 'Task A', status: 'done' },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 56 });

    expect(ctx.taskPromptContent).toContain('Review quality:');
    expect(ctx.taskPromptContent).toContain(
      'Review quality: 2 passed first review, 2 required retry'
    );
  });

  // ── Test: Review quality line omitted when tasksRetried is undefined ───────

  it('omits review quality line when metrics.tasksRetried is undefined', async () => {
    mockCycleFind.mockReturnValue(
      chainable([
        {
          _id: 56,
          goal: 'Cycle 56 goal',
          summary: 'Summary 56.',
          metrics: {
            tasksCompleted: 3,
            tasksFailed: 0,
            totalCostUsd: 1.0,
            totalDurationMs: 1800000,
          },
        },
      ])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([{ _id: 'TASK-230', type: 'chore', cycleId: 56, title: 'Task B', status: 'done' }])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 57 });

    expect(ctx.taskPromptContent).not.toContain('Review quality:');
    expect(ctx.taskPromptContent).not.toContain('passed first review');
    expect(ctx.taskPromptContent).not.toContain('required retry');
  });

  // ── Test: Auto-approval categories listed when non-empty ──────────────────

  it('injects auto-approval categories section listing configured types', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      humanMessage: '',
      autoApprovalCategories: ['chore', 'feature', 'bug', 'refactor', 'test'],
    });

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    expect(ctx.taskPromptContent).toContain('Auto-Approval Categories');
    expect(ctx.taskPromptContent).toContain('chore');
    expect(ctx.taskPromptContent).toContain('feature');
    expect(ctx.taskPromptContent).toContain('skip the human review gate');
  });

  // ── Test: Note shown when auto-approval list is empty ────────────────────

  it('notes that all tasks require human review when autoApprovalCategories is empty', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      humanMessage: '',
      autoApprovalCategories: [],
    });

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    expect(ctx.taskPromptContent).toContain('Auto-Approval Categories');
    expect(ctx.taskPromptContent).toContain('All tasks require human review');
  });

  // ── Test: orchestrator keyword boost — tier 1 title match wins ─────────────

  it('promotes keyword-matching knowledge file using cycle goal keywords (three-tier boost)', async () => {
    // Cycle goal contains "queue" and "timeout" — the specific file matches in title,
    // the generic file does not, even though generic has a higher qualityScore.
    mockCycleFindById.mockReturnValue(
      chainable({ _id: 1, goal: 'fix job queue timeout handling', phase: 'implement' })
    );

    // DB returns files sorted by qualityScore descending.
    // 'Generic Architecture' (score 20): no keyword match → tier 3
    // 'Job Queue Reference' (score 5): 'queue' in title → tier 1
    // Expected order after boost: Job Queue Reference first, then Generic Architecture
    mockKnowledgeFind.mockReturnValue(
      chainable([
        {
          _id: 'specs/generic-architecture',
          title: 'Generic Architecture',
          snippet: 'High-level system design.',
          content: 'Nothing about queues here.',
          qualityScore: 20,
        },
        {
          _id: 'specs/job-queue-reference',
          title: 'Job Queue Reference',
          snippet: 'How the job queue works.',
          content: 'Details about queue timeout and retry logic.',
          qualityScore: 5,
        },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    const genericIdx = ctx.taskPromptContent.indexOf('Generic Architecture');
    const queueIdx = ctx.taskPromptContent.indexOf('Job Queue Reference');

    expect(genericIdx).toBeGreaterThan(-1);
    expect(queueIdx).toBeGreaterThan(-1);
    // Job Queue Reference (keyword match in title) must appear before Generic Architecture
    expect(queueIdx).toBeLessThan(genericIdx);
  });

  it('applies all three tiers for orchestrator keyword boost', async () => {
    mockCycleFindById.mockReturnValue(
      chainable({ _id: 1, goal: 'improve streaming pipeline performance', phase: 'implement' })
    );

    mockKnowledgeFind.mockReturnValue(
      chainable([
        {
          _id: 'specs/high-score-generic',
          title: 'High Score Generic',
          snippet: 'General info.',
          content: 'Nothing relevant.',
          qualityScore: 30,
        },
        {
          _id: 'specs/content-match',
          title: 'Server Reference',
          snippet: 'Reference docs.',
          content: 'This covers streaming event pipeline internals and performance tuning.',
          qualityScore: 15,
        },
        {
          _id: 'specs/title-match',
          title: 'Streaming Pipeline Guide',
          snippet: 'How the streaming pipeline works.',
          content: 'Guide content.',
          qualityScore: 5,
        },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    const tier1Idx = ctx.taskPromptContent.indexOf('Streaming Pipeline Guide');
    const tier2Idx = ctx.taskPromptContent.indexOf('Server Reference');
    const tier3Idx = ctx.taskPromptContent.indexOf('High Score Generic');

    expect(tier1Idx).toBeGreaterThan(-1);
    expect(tier2Idx).toBeGreaterThan(-1);
    expect(tier3Idx).toBeGreaterThan(-1);
    // Tier 1 (title match) must come before tier 2 (content match) before tier 3 (no match)
    expect(tier1Idx).toBeLessThan(tier2Idx);
    expect(tier2Idx).toBeLessThan(tier3Idx);
  });

  // ── Tests: orchestrator keyword boost — recentCycles fallback ─────────────

  describe('orchestrator boost — recentCycles fallback', () => {
    // ── Test: placeholder goal + non-empty recentCycles → boost from previous cycle ──

    it('uses recentCycles[0].goal keywords when cycle.goal is the placeholder', async () => {
      // Current cycle has the placeholder goal (orchestrator not yet run)
      mockCycleFindById.mockReturnValue(
        chainable({ _id: 1, goal: 'Awaiting orchestrator plan', phase: 'plan' })
      );
      // Most recent completed cycle goal contains 'streaming' and 'pipeline'
      mockCycleFind.mockReturnValue(
        chainable([{ _id: 9, goal: 'Fix the streaming pipeline', summary: 'Pipeline fixed.' }])
      );
      mockTaskFind.mockReturnValue(chainable([]));

      // DB returns high-score generic file before low-score streaming file (quality-score order)
      mockKnowledgeFind.mockReturnValue(
        chainable([
          {
            _id: 'specs/generic-arch',
            title: 'Generic Architecture',
            snippet: 'High-level system design.',
            content: 'Nothing about streaming here.',
            qualityScore: 20,
          },
          {
            _id: 'specs/streaming-guide',
            title: 'Streaming Pipeline Guide',
            snippet: 'How the streaming pipeline works.',
            content: 'Streaming pipeline internals.',
            qualityScore: 5,
          },
        ])
      );

      const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

      const genericIdx = ctx.taskPromptContent.indexOf('Generic Architecture');
      const streamingIdx = ctx.taskPromptContent.indexOf('Streaming Pipeline Guide');

      expect(genericIdx).toBeGreaterThan(-1);
      expect(streamingIdx).toBeGreaterThan(-1);
      // 'streaming' and 'pipeline' match keywords from recentCycles[0].goal →
      // Streaming Pipeline Guide (tier 1) must appear before Generic Architecture (tier 3)
      expect(streamingIdx).toBeLessThan(genericIdx);
    });

    // ── Test: placeholder goal + empty recentCycles → no boost ───────────────

    it('applies no keyword boost when cycle.goal is placeholder and recentCycles is empty', async () => {
      // Current cycle still has the placeholder goal
      mockCycleFindById.mockReturnValue(
        chainable({ _id: 1, goal: 'Awaiting orchestrator plan', phase: 'plan' })
      );
      // No recent completed cycles — nothing to fall back on
      mockCycleFind.mockReturnValue(chainable([]));

      // DB returns high-score generic first, then low-score streaming file
      mockKnowledgeFind.mockReturnValue(
        chainable([
          {
            _id: 'specs/generic-arch',
            title: 'Generic Architecture',
            snippet: 'High-level system design.',
            content: 'Nothing about streaming here.',
            qualityScore: 20,
          },
          {
            _id: 'specs/streaming-guide',
            title: 'Streaming Pipeline Guide',
            snippet: 'Streaming info.',
            content: 'Streaming pipeline details.',
            qualityScore: 5,
          },
        ])
      );

      const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

      const genericIdx = ctx.taskPromptContent.indexOf('Generic Architecture');
      const streamingIdx = ctx.taskPromptContent.indexOf('Streaming Pipeline Guide');

      expect(genericIdx).toBeGreaterThan(-1);
      expect(streamingIdx).toBeGreaterThan(-1);
      // No boost: original quality-score order preserved — Generic Architecture (score 20) first
      expect(genericIdx).toBeLessThan(streamingIdx);
    });

    // ── Test: non-placeholder goal → uses current cycle goal, not previous ────

    it('uses current cycle.goal keywords (not previous cycle) when goal is not the placeholder', async () => {
      // Current cycle has a real, non-placeholder goal containing 'streaming'
      mockCycleFindById.mockReturnValue(
        chainable({ _id: 5, goal: 'Fix the streaming pipeline', phase: 'implement' })
      );
      // Previous cycle has a completely different, unrelated goal
      mockCycleFind.mockReturnValue(
        chainable([{ _id: 4, goal: 'Add analytics dashboard', summary: 'Dashboard added.' }])
      );
      mockTaskFind.mockReturnValue(chainable([]));

      // DB returns high-score generic first, then low-score streaming file
      mockKnowledgeFind.mockReturnValue(
        chainable([
          {
            _id: 'specs/generic-arch',
            title: 'Generic Architecture',
            snippet: 'High-level system design.',
            content: 'Nothing relevant.',
            qualityScore: 20,
          },
          {
            _id: 'specs/streaming-guide',
            title: 'Streaming Pipeline Guide',
            snippet: 'How streaming works.',
            content: 'Streaming pipeline internals.',
            qualityScore: 5,
          },
        ])
      );

      const ctx = await buildContext({ role: 'orchestrator', cycleId: 5 });

      const genericIdx = ctx.taskPromptContent.indexOf('Generic Architecture');
      const streamingIdx = ctx.taskPromptContent.indexOf('Streaming Pipeline Guide');

      expect(genericIdx).toBeGreaterThan(-1);
      expect(streamingIdx).toBeGreaterThan(-1);
      // Current cycle goal 'Fix the streaming pipeline' → 'streaming' keyword boosts
      // Streaming Pipeline Guide to tier 1, before Generic Architecture (tier 3)
      expect(streamingIdx).toBeLessThan(genericIdx);
    });
  });

  // ── Test: lastRetryReviewIssues injected into task-breakdown section ────────

  it('injects lastRetryReviewIssues descriptions into task-breakdown section for completed cycles', async () => {
    mockCycleFind.mockReturnValue(
      chainable([{ _id: 60, goal: 'Cycle 60 goal', summary: 'Summary 60.' }])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        {
          _id: 'TASK-300',
          type: 'feature',
          cycleId: 60,
          title: 'Add retry logic',
          status: 'done',
          lastRetryReviewIssues: [
            {
              severity: 'error',
              file: 'src/bar.ts',
              description: 'No regression test added',
            },
          ],
        },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 61 });

    expect(ctx.taskPromptContent).toContain('No regression test added');
  });

  // ── Test: lastRetryCause emitted when set on task ─────────────────────────

  it('emits "Retry cause:" line when lastRetryCause is set on a task with retry issues', async () => {
    mockCycleFind.mockReturnValue(
      chainable([{ _id: 70, goal: 'Cycle 70 goal', summary: 'Summary 70.' }])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        {
          _id: 'TASK-400',
          type: 'feature',
          cycleId: 70,
          title: 'Add feature X',
          status: 'done',
          lastRetryCause: 'review_rejection',
          lastRetryReviewIssues: [
            { severity: 'error', file: 'src/foo.ts', description: 'Missing test coverage' },
          ],
        },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 71 });

    expect(ctx.taskPromptContent).toContain('Retry cause: review_rejection');
  });

  // ── Test: no "Retry cause:" line when lastRetryCause is absent ───────────

  it('omits "Retry cause:" line when lastRetryCause is not set', async () => {
    mockCycleFind.mockReturnValue(
      chainable([{ _id: 72, goal: 'Cycle 72 goal', summary: 'Summary 72.' }])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        {
          _id: 'TASK-401',
          type: 'feature',
          cycleId: 72,
          title: 'Add feature Y',
          status: 'done',
          lastRetryReviewIssues: [
            { severity: 'error', file: 'src/bar.ts', description: 'Docs not updated' },
          ],
        },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 73 });

    expect(ctx.taskPromptContent).not.toContain('Retry cause:');
  });

  // ── Test: lastRetryCause emitted when lastRetryReviewIssues is empty (pr_body_invalid) ──

  it('emits "Retry cause: pr_body_invalid" and parenthetical when retryCount > 0 but lastRetryReviewIssues is empty', async () => {
    mockCycleFind.mockReturnValue(
      chainable([{ _id: 73, goal: 'Cycle 73 goal', summary: 'Summary 73.' }])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        {
          _id: 'TASK-402',
          type: 'feature',
          cycleId: 73,
          title: 'Add feature Z',
          status: 'done',
          retryCount: 1,
          lastRetryCause: 'pr_body_invalid',
          lastRetryReviewIssues: [],
        },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 74 });

    expect(ctx.taskPromptContent).toContain('Retry cause: pr_body_invalid');
    expect(ctx.taskPromptContent).toContain(
      '(no reviewer issues — coder was retried by pre-flight check)'
    );
  });

  // ── Test: no retry block when both lastRetryCause and lastRetryReviewIssues absent ──

  it('emits no retry block when lastRetryCause is absent, lastRetryReviewIssues is empty, and retryCount is 0', async () => {
    mockCycleFind.mockReturnValue(
      chainable([{ _id: 74, goal: 'Cycle 74b goal', summary: 'Summary 74b.' }])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        {
          _id: 'TASK-403',
          type: 'chore',
          cycleId: 74,
          title: 'No retry task',
          status: 'done',
          retryCount: 0,
          lastRetryReviewIssues: [],
        },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 75 });

    expect(ctx.taskPromptContent).not.toContain('Retry issues for No retry task');
    expect(ctx.taskPromptContent).not.toContain('Retry cause:');
    expect(ctx.taskPromptContent).not.toContain('pre-flight check');
  });

  // ── Test: Review breakdown line when both metrics are present ─────────────

  it('emits "Review breakdown:" line when tasksRetriedByReviewer and tasksRetriedByCi are set', async () => {
    mockCycleFind.mockReturnValue(
      chainable([
        {
          _id: 74,
          goal: 'Cycle 74 goal',
          summary: 'Summary 74.',
          metrics: {
            tasksCompleted: 5,
            tasksFailed: 0,
            totalCostUsd: 2.0,
            totalDurationMs: 3600000,
            tasksRetried: 3,
            tasksPassedFirstReview: 2,
            tasksRetriedByReviewer: 2,
            tasksRetriedByCi: 1,
          },
        },
      ])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        { _id: 'TASK-410', type: 'feature', cycleId: 74, title: 'Task A', status: 'done' },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 75 });

    expect(ctx.taskPromptContent).toContain('Review breakdown: 2 by reviewer, 1 by CI');
  });

  // ── Test: Review breakdown absent when both metrics absent ────────────────

  it('omits "Review breakdown:" line when both tasksRetriedByReviewer and tasksRetriedByCi are absent', async () => {
    mockCycleFind.mockReturnValue(
      chainable([
        {
          _id: 76,
          goal: 'Cycle 76 goal',
          summary: 'Summary 76.',
          metrics: {
            tasksCompleted: 3,
            tasksFailed: 0,
            totalCostUsd: 1.0,
            totalDurationMs: 1800000,
            tasksRetried: 1,
            tasksPassedFirstReview: 2,
          },
        },
      ])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([{ _id: 'TASK-420', type: 'chore', cycleId: 76, title: 'Task B', status: 'done' }])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 77 });

    expect(ctx.taskPromptContent).not.toContain('Review breakdown:');
  });

  // ── Regression: tasksRetriedByPrBody > 0 → 'PR body invalid' appears in breakdown ──

  it('includes "PR body invalid" in breakdown when tasksRetriedByPrBody is positive', async () => {
    mockCycleFind.mockReturnValue(
      chainable([
        {
          _id: 78,
          goal: 'Cycle 78 goal',
          summary: 'Summary 78.',
          metrics: {
            tasksCompleted: 5,
            tasksFailed: 0,
            totalCostUsd: 2.5,
            totalDurationMs: 3600000,
            tasksRetried: 3,
            tasksPassedFirstReview: 2,
            tasksRetriedByReviewer: 1,
            tasksRetriedByCi: 0,
            tasksRetriedByPrBody: 2,
          },
        },
      ])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        { _id: 'TASK-430', type: 'feature', cycleId: 78, title: 'Task A', status: 'done' },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 79 });

    expect(ctx.taskPromptContent).toContain('Review breakdown:');
    expect(ctx.taskPromptContent).toContain('2 by PR body invalid');
  });

  // ── Regression: tasksRetriedByPrBody absent → 'PR body invalid' absent from breakdown ──

  it('does not include "PR body invalid" in breakdown when tasksRetriedByPrBody is absent', async () => {
    mockCycleFind.mockReturnValue(
      chainable([
        {
          _id: 80,
          goal: 'Cycle 80 goal',
          summary: 'Summary 80.',
          metrics: {
            tasksCompleted: 3,
            tasksFailed: 0,
            totalCostUsd: 1.5,
            totalDurationMs: 2700000,
            tasksRetried: 1,
            tasksPassedFirstReview: 2,
            tasksRetriedByReviewer: 1,
            tasksRetriedByCi: 0,
            // tasksRetriedByPrBody intentionally absent
          },
        },
      ])
    );
    mockTaskFind.mockReturnValueOnce(
      chainable([
        { _id: 'TASK-440', type: 'feature', cycleId: 80, title: 'Task B', status: 'done' },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 81 });

    expect(ctx.taskPromptContent).toContain('Review breakdown:');
    expect(ctx.taskPromptContent).not.toContain('PR body invalid');
  });
});

// ─── buildContext — coder role ────────────────────────────────────────────────

describe('buildContext — coder role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue({ humanMessage: '' });
    mockCycleFindById.mockReturnValue(chainable({ _id: 2, goal: 'Fix bugs', phase: 'implement' }));
    mockKnowledgeFind.mockReturnValue(chainable([]));
  });

  // ── Test 8: Loads system prompt from agents/coder.md ─────────────────────

  it('loads system prompt from agents/coder.md', async () => {
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-001',
        title: 'My task',
        description: 'Do stuff',
        acceptanceCriteria: [],
        blockedBy: [],
        type: 'feature',
        priority: 'high',
      })
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 2, taskId: 'TASK-001' });

    expect(ctx.systemPromptContent).toBe('SYSTEM: coder prompt');
  });

  // ── Test 9: Injects task title and description ───────────────────────────

  it('injects task id, title, and description into task prompt', async () => {
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-001',
        title: 'Implement login',
        description: 'Build the login flow with OAuth support',
        acceptanceCriteria: [],
        blockedBy: [],
        type: 'feature',
        priority: 'high',
      })
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 2, taskId: 'TASK-001' });

    expect(ctx.taskPromptContent).toContain('TASK-001');
    expect(ctx.taskPromptContent).toContain('Implement login');
    expect(ctx.taskPromptContent).toContain('Build the login flow with OAuth support');
  });

  // ── Test 10: Injects acceptance criteria ─────────────────────────────────

  it('injects numbered acceptance criteria when present', async () => {
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-002',
        title: 'Add tests',
        description: 'Write unit tests',
        acceptanceCriteria: ['All tests pass', 'Coverage > 80%'],
        blockedBy: [],
        type: 'test',
        priority: 'medium',
      })
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 2, taskId: 'TASK-002' });

    expect(ctx.taskPromptContent).toContain('Acceptance Criteria');
    expect(ctx.taskPromptContent).toContain('All tests pass');
    expect(ctx.taskPromptContent).toContain('Coverage > 80%');
  });

  // ── Test 11: Injects blockedBy list when task has dependencies ────────────

  it('injects blockedBy dependency list when task has blockers', async () => {
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-003',
        title: 'Deploy',
        description: 'Deploy the application',
        acceptanceCriteria: [],
        blockedBy: ['TASK-001', 'TASK-002'],
        type: 'chore',
        priority: 'low',
      })
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 2, taskId: 'TASK-003' });

    expect(ctx.taskPromptContent).toContain('Blocked by');
    expect(ctx.taskPromptContent).toContain('TASK-001');
    expect(ctx.taskPromptContent).toContain('TASK-002');
  });

  // ── Test: keyword-boosted knowledge ranking for coder role ────────────────

  it('promotes keyword-matching knowledge file above non-matching file of equal/lower quality', async () => {
    // Task about "routing" — the routing-specific file has a lower qualityScore
    // but should be boosted above the generic high-score file.
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-050',
        title: 'Refactor routing layer',
        description: 'Improve the Express routing pattern for all API endpoints',
        acceptanceCriteria: [],
        blockedBy: [],
        type: 'refactor',
        priority: 'medium',
      })
    );

    // DB returns files already sorted by qualityScore descending.
    // 'Generic Guide' has score 10 (high), 'Routing Patterns' has score 5 (lower).
    // Without keyword boost, Generic Guide would appear first.
    // With keyword boost, 'Routing Patterns' should appear first because its title
    // matches the keyword "routing" from the task.
    mockKnowledgeFind.mockReturnValue(
      chainable([
        {
          _id: 'specs/generic-guide',
          title: 'Generic Guide',
          snippet: 'Generic information about the system.',
          content: 'Generic content.',
          qualityScore: 10,
        },
        {
          _id: 'specs/routing-patterns',
          title: 'Routing Patterns',
          snippet: 'How routing is structured in Express.',
          content: 'Routing content.',
          qualityScore: 5,
        },
      ])
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 2, taskId: 'TASK-050' });

    const genericIdx = ctx.taskPromptContent.indexOf('Generic Guide');
    const routingIdx = ctx.taskPromptContent.indexOf('Routing Patterns');

    expect(genericIdx).toBeGreaterThan(-1);
    expect(routingIdx).toBeGreaterThan(-1);
    // Routing Patterns (keyword match) must appear before Generic Guide (no match)
    expect(routingIdx).toBeLessThan(genericIdx);
  });

  // ── Test: three-tier keyword ranking ──────────────────────────────────────

  it('ranks files: title/snippet match (tier1) > content-body match (tier2) > no match (tier3)', async () => {
    // Task about "pagination" — three files ordered by tier, not just quality score.
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-060',
        title: 'Add pagination support',
        description: 'Implement pagination for the API list endpoints',
        acceptanceCriteria: [],
        blockedBy: [],
        type: 'feature',
        priority: 'medium',
      })
    );

    // DB returns files already sorted by qualityScore descending.
    // 'High Score Generic' (score 20): no keyword in title, snippet, or content → tier 3
    // 'Medium Score Content' (score 10): keyword "pagination" only in content body → tier 2
    // 'Low Score Title' (score 5): keyword "pagination" in title → tier 1
    // Expected output order: Low Score Title, Medium Score Content, High Score Generic
    mockKnowledgeFind.mockReturnValue(
      chainable([
        {
          _id: 'specs/high-score-generic',
          title: 'High Score Generic',
          snippet: 'General information.',
          content: 'Nothing relevant here at all.',
          qualityScore: 20,
        },
        {
          _id: 'specs/medium-score-content',
          title: 'Server API Reference',
          snippet: 'Reference for the server API.',
          content: 'This document covers pagination of list results in the API.',
          qualityScore: 10,
        },
        {
          _id: 'specs/low-score-title',
          title: 'Pagination Guide',
          snippet: 'How to paginate results.',
          content: 'Details about pagination implementation.',
          qualityScore: 5,
        },
      ])
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 2, taskId: 'TASK-060' });

    const tier1Idx = ctx.taskPromptContent.indexOf('Pagination Guide');
    const tier2Idx = ctx.taskPromptContent.indexOf('Server API Reference');
    const tier3Idx = ctx.taskPromptContent.indexOf('High Score Generic');

    expect(tier1Idx).toBeGreaterThan(-1);
    expect(tier2Idx).toBeGreaterThan(-1);
    expect(tier3Idx).toBeGreaterThan(-1);
    // Tier 1 (title match) must come before tier 2 (content-body match)
    expect(tier1Idx).toBeLessThan(tier2Idx);
    // Tier 2 (content-body match) must come before tier 3 (no match)
    expect(tier2Idx).toBeLessThan(tier3Idx);
  });

  // ── Test: acceptanceCriteria keywords boost knowledge ranking ─────────────

  it('promotes a knowledge file whose title matches a keyword from acceptanceCriteria above a file that only matches the task title', async () => {
    // Task title/description mention "oauth" — the oauth-specific file matches the title keyword.
    // acceptanceCriteria mention "ratelimit" — the rate-limit file only matches via criteria.
    // Both files have lower qualityScore than the generic file.
    // Without acceptanceCriteria in keyword extraction, 'Rate Limit Reference' (score 3)
    // would not be boosted at all.  With the fix it is promoted to tier 1 alongside
    // the oauth file, and both appear before the no-match generic file.
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-070',
        title: 'Add OAuth support',
        description: 'Integrate OAuth provider into the application',
        acceptanceCriteria: ['The ratelimit middleware must reject requests beyond 100 per minute'],
        blockedBy: [],
        type: 'feature',
        priority: 'high',
      })
    );

    // DB returns files sorted by qualityScore descending.
    // 'Generic Guide' (score 20): no keyword match → tier 3
    // 'OAuth Patterns' (score 10): 'oauth' in title → tier 1 (from task title)
    // 'Rate Limit Reference' (score 3): 'ratelimit' in title → tier 1 (from acceptanceCriteria)
    mockKnowledgeFind.mockReturnValue(
      chainable([
        {
          _id: 'specs/generic-guide',
          title: 'Generic Guide',
          snippet: 'General information about the system.',
          content: 'Nothing relevant here at all.',
          qualityScore: 20,
        },
        {
          _id: 'specs/oauth-patterns',
          title: 'OAuth Patterns',
          snippet: 'How to integrate OAuth into the app.',
          content: 'Details about OAuth integration.',
          qualityScore: 10,
        },
        {
          _id: 'specs/rate-limit-reference',
          title: 'Rate Limit Reference',
          snippet: 'How the ratelimit middleware works.',
          content: 'Details about ratelimit configuration.',
          qualityScore: 3,
        },
      ])
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 2, taskId: 'TASK-070' });

    const genericIdx = ctx.taskPromptContent.indexOf('Generic Guide');
    const oauthIdx = ctx.taskPromptContent.indexOf('OAuth Patterns');
    const rateLimitIdx = ctx.taskPromptContent.indexOf('Rate Limit Reference');

    expect(genericIdx).toBeGreaterThan(-1);
    expect(oauthIdx).toBeGreaterThan(-1);
    expect(rateLimitIdx).toBeGreaterThan(-1);
    // Rate Limit Reference matched via acceptanceCriteria → tier 1, must appear before Generic Guide (tier 3)
    expect(rateLimitIdx).toBeLessThan(genericIdx);
    // OAuth Patterns matched via task title → tier 1, must also appear before Generic Guide (tier 3)
    expect(oauthIdx).toBeLessThan(genericIdx);
  });

  // ── Test: empty acceptanceCriteria does not change keyword ranking ─────────

  it('produces identical knowledge ranking when acceptanceCriteria is an empty array', async () => {
    // Baseline task with acceptanceCriteria: [] — ranking is driven purely by qualityScore
    // plus keywords from title/description.  This regression test ensures that joining
    // an empty array adds no extra tokens and does not alter the existing keyword set.
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-071',
        title: 'Refactor caching layer',
        description: 'Improve caching performance across the board',
        acceptanceCriteria: [],
        blockedBy: [],
        type: 'refactor',
        priority: 'medium',
      })
    );

    // Two files: one matches "caching" from the task title (tier 1), one does not (tier 3).
    // With an empty acceptanceCriteria the keyword set is still {"refactor", "caching",
    // "performance", ...} — the same as before the change.
    mockKnowledgeFind.mockReturnValue(
      chainable([
        {
          _id: 'specs/generic-guide',
          title: 'Generic Guide',
          snippet: 'General information.',
          content: 'Nothing relevant here at all.',
          qualityScore: 20,
        },
        {
          _id: 'specs/caching-guide',
          title: 'Caching Guide',
          snippet: 'How caching works in the system.',
          content: 'Details about caching strategies.',
          qualityScore: 5,
        },
      ])
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 2, taskId: 'TASK-071' });

    const genericIdx = ctx.taskPromptContent.indexOf('Generic Guide');
    const cachingIdx = ctx.taskPromptContent.indexOf('Caching Guide');

    expect(genericIdx).toBeGreaterThan(-1);
    expect(cachingIdx).toBeGreaterThan(-1);
    // Caching Guide matches "caching" from task title → tier 1, must come before Generic Guide (tier 3)
    expect(cachingIdx).toBeLessThan(genericIdx);
  });

  // ── Test: acceptanceCriteria keyword boost with uniquekeywordxyz ──────────

  it('boosts knowledge file matching acceptanceCriteria keyword (uniquekeywordxyz) above non-matching file', async () => {
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-080',
        title: 'Add new feature',
        description: 'Implement the new feature endpoint',
        acceptanceCriteria: ['uniquekeywordxyz must be verified'],
        blockedBy: [],
        type: 'feature',
        priority: 'high',
      })
    );

    // DB returns files sorted by qualityScore descending.
    // 'Unrelated Guide' (score 20): no keyword match → tier 3
    // 'Uniquekeywordxyz Reference' (score 5): 'uniquekeywordxyz' in title → tier 1
    // Expected order: Uniquekeywordxyz Reference first (boosted via acceptanceCriteria keyword)
    mockKnowledgeFind.mockReturnValue(
      chainable([
        {
          _id: 'specs/unrelated-guide',
          title: 'Unrelated Guide',
          snippet: 'General information about the system.',
          content: 'Nothing relevant here at all.',
          qualityScore: 20,
        },
        {
          _id: 'specs/uniquekeywordxyz-reference',
          title: 'Uniquekeywordxyz Reference',
          snippet: 'How uniquekeywordxyz works.',
          content: 'Details about uniquekeywordxyz configuration.',
          qualityScore: 5,
        },
      ])
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 2, taskId: 'TASK-080' });

    const unrelatedIdx = ctx.taskPromptContent.indexOf('Unrelated Guide');
    const uniqueIdx = ctx.taskPromptContent.indexOf('Uniquekeywordxyz Reference');

    expect(unrelatedIdx).toBeGreaterThan(-1);
    expect(uniqueIdx).toBeGreaterThan(-1);
    // 'Uniquekeywordxyz Reference' matched via acceptanceCriteria keyword → tier 1,
    // must appear before 'Unrelated Guide' (tier 3) despite lower quality score
    expect(uniqueIdx).toBeLessThan(unrelatedIdx);
  });
});

// ─── buildContext — integrator role ──────────────────────────────────────────

describe('buildContext — integrator role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue({ humanMessage: '' });
    mockCycleFindById.mockReturnValue(
      chainable({ _id: 3, goal: 'Integrate work', phase: 'integrate' })
    );
    mockKnowledgeFind.mockReturnValue(chainable([]));
  });

  // ── Test 12: Loads system prompt from agents/integrator.md ───────────────

  it('loads system prompt from agents/integrator.md', async () => {
    mockTaskFind.mockReturnValue(chainable([]));

    const ctx = await buildContext({ role: 'integrator', cycleId: 3 });

    expect(ctx.systemPromptContent).toBe('SYSTEM: integrator prompt');
  });

  // ── Test 13: Injects branch list for done tasks ───────────────────────────

  it('injects branch list with task id, branch name, and title', async () => {
    mockTaskFind.mockReturnValue(
      chainable([
        {
          _id: 'TASK-001',
          title: 'Feature A',
          branch: 'task-001-feature-a',
          blockedBy: [],
          prNumber: 10,
        },
        {
          _id: 'TASK-002',
          title: 'Feature B',
          branch: 'task-002-feature-b',
          blockedBy: [],
          prNumber: 11,
        },
      ])
    );

    const ctx = await buildContext({ role: 'integrator', cycleId: 3 });

    expect(ctx.taskPromptContent).toContain('Branches to Merge');
    expect(ctx.taskPromptContent).toContain('task-001-feature-a');
    expect(ctx.taskPromptContent).toContain('task-002-feature-b');
    expect(ctx.taskPromptContent).toContain('Feature A');
    expect(ctx.taskPromptContent).toContain('PR #10');
  });

  // ── Test 14: Topological sort — dependency comes before dependent ─────────

  it('lists branches so dependency comes before dependent (topological order)', async () => {
    // TASK-002 depends on TASK-001 — TASK-001 must appear first in output
    mockTaskFind.mockReturnValue(
      chainable([
        {
          _id: 'TASK-002',
          title: 'Feature B',
          branch: 'task-002-feature-b',
          blockedBy: ['TASK-001'],
          prNumber: undefined,
        },
        {
          _id: 'TASK-001',
          title: 'Feature A',
          branch: 'task-001-feature-a',
          blockedBy: [],
          prNumber: undefined,
        },
      ])
    );

    const ctx = await buildContext({ role: 'integrator', cycleId: 3 });

    const idx001 = ctx.taskPromptContent.indexOf('task-001-feature-a');
    const idx002 = ctx.taskPromptContent.indexOf('task-002-feature-b');

    // TASK-001 has no dependencies and should be listed before TASK-002
    expect(idx001).toBeGreaterThan(-1);
    expect(idx002).toBeGreaterThan(-1);
    expect(idx001).toBeLessThan(idx002);
  });
});

// ─── buildContext — retryContext ──────────────────────────────────────────────

describe('buildContext — retryContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue({ humanMessage: '' });
    mockCycleFindById.mockReturnValue(
      chainable({ _id: 4, goal: 'Retry work', phase: 'implement' })
    );
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-005',
        title: 'Fix issue',
        description: 'Fix the critical bug',
        acceptanceCriteria: [],
        blockedBy: [],
        type: 'bug',
        priority: 'high',
      })
    );
    mockKnowledgeFind.mockReturnValue(chainable([]));
  });

  // ── Test 15: Injects previous error from retryContext ────────────────────

  it('injects previous error and retry header when retryContext has previousError', async () => {
    const ctx = await buildContext({
      role: 'coder',
      cycleId: 4,
      taskId: 'TASK-005',
      retryContext: { previousError: 'TypeScript compilation failed' },
    });

    expect(ctx.taskPromptContent).toContain('Retry Context');
    expect(ctx.taskPromptContent).toContain('TypeScript compilation failed');
  });

  // ── Test 16: Injects reviewer feedback issues and suggestions ─────────────

  it('injects review issues and suggestions from retryContext', async () => {
    const ctx = await buildContext({
      role: 'coder',
      cycleId: 4,
      taskId: 'TASK-005',
      retryContext: {
        previousSummary: 'Partial fix applied',
        reviewIssues: [
          {
            file: 'src/api.ts',
            line: 42,
            severity: 'error',
            description: 'Unhandled promise rejection',
          },
        ],
        reviewSuggestions: ['Wrap DB calls in try/catch'],
      },
    });

    expect(ctx.taskPromptContent).toContain('Review Issues');
    expect(ctx.taskPromptContent).toContain('src/api.ts');
    expect(ctx.taskPromptContent).toContain('Unhandled promise rejection');
    expect(ctx.taskPromptContent).toContain('Reviewer Suggestions');
    expect(ctx.taskPromptContent).toContain('Wrap DB calls in try/catch');
  });

  // ── Test 17: error-only issues appear under MUST FIX only ────────────────

  it('places error-severity issues under MUST FIX and does not emit Reviewer Warnings', async () => {
    const ctx = await buildContext({
      role: 'coder',
      cycleId: 4,
      taskId: 'TASK-005',
      retryContext: {
        reviewIssues: [
          { file: 'src/foo.ts', severity: 'error', description: 'Missing null check' },
        ],
      },
    });

    expect(ctx.taskPromptContent).toContain('## Review Issues (MUST FIX)');
    expect(ctx.taskPromptContent).toContain('Missing null check');
    expect(ctx.taskPromptContent).not.toContain('## Reviewer Warnings');
  });

  // ── Test 18: warning-only issues appear under Reviewer Warnings only ──────

  it('places warning-severity issues under Reviewer Warnings and does not emit MUST FIX', async () => {
    const ctx = await buildContext({
      role: 'coder',
      cycleId: 4,
      taskId: 'TASK-005',
      retryContext: {
        reviewIssues: [
          { file: 'src/bar.ts', severity: 'warning', description: 'Consider extracting helper' },
        ],
      },
    });

    expect(ctx.taskPromptContent).toContain('## Reviewer Warnings');
    expect(ctx.taskPromptContent).toContain('Consider extracting helper');
    expect(ctx.taskPromptContent).not.toContain('## Review Issues (MUST FIX)');
  });

  // ── Test 19: mixed severity — errors in MUST FIX, warnings in Warnings ────

  it('separates mixed-severity issues: errors under MUST FIX, warnings under Reviewer Warnings', async () => {
    const ctx = await buildContext({
      role: 'coder',
      cycleId: 4,
      taskId: 'TASK-005',
      retryContext: {
        reviewIssues: [
          { file: 'src/a.ts', severity: 'error', description: 'Breaking change' },
          { file: 'src/b.ts', severity: 'warning', description: 'Style issue' },
        ],
      },
    });

    expect(ctx.taskPromptContent).toContain('## Review Issues (MUST FIX)');
    expect(ctx.taskPromptContent).toContain('Breaking change');
    expect(ctx.taskPromptContent).toContain('## Reviewer Warnings');
    expect(ctx.taskPromptContent).toContain('Style issue');

    // Verify cross-contamination: each entry appears in the right section
    const mustFixIdx = ctx.taskPromptContent.indexOf('## Review Issues (MUST FIX)');
    const warnIdx = ctx.taskPromptContent.indexOf('## Reviewer Warnings');
    const breakingIdx = ctx.taskPromptContent.indexOf('Breaking change');
    const styleIdx = ctx.taskPromptContent.indexOf('Style issue');

    expect(mustFixIdx).toBeLessThan(breakingIdx);
    expect(warnIdx).toBeLessThan(styleIdx);
    // MUST FIX section comes before Reviewer Warnings section
    expect(mustFixIdx).toBeLessThan(warnIdx);
    // The warning entry is NOT inside the MUST FIX block (it appears after the Warnings heading)
    expect(styleIdx).toBeGreaterThan(warnIdx);
  });

  // ── Test 20: info-severity issues appear under Reviewer Warnings ──────────

  it('places info-severity issues under Reviewer Warnings, not MUST FIX', async () => {
    const ctx = await buildContext({
      role: 'coder',
      cycleId: 4,
      taskId: 'TASK-005',
      retryContext: {
        reviewIssues: [
          { file: 'src/c.ts', severity: 'info', description: 'Optional refactor suggestion' },
        ],
      },
    });

    expect(ctx.taskPromptContent).toContain('## Reviewer Warnings');
    expect(ctx.taskPromptContent).toContain('Optional refactor suggestion');
    expect(ctx.taskPromptContent).not.toContain('## Review Issues (MUST FIX)');
  });
});

// ─── buildContext — role-based retrospective filtering ────────────────────────

describe('buildContext — role-based retrospective filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue({ humanMessage: '', autoApprovalCategories: [] });
    mockCycleFindById.mockReturnValue(
      chainable({ _id: 5, goal: 'Cycle goal', phase: 'implement' })
    );
    mockKnowledgeFind.mockReturnValue(chainable([]));
  });

  // ── Test: coder role excludes low-quality retrospective files ─────────────

  it('passes $or filter excluding retrospectives with low qualityScore for coder role', async () => {
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-010',
        title: 'Code task',
        description: 'Do code things',
        acceptanceCriteria: [],
        blockedBy: [],
        type: 'feature',
        priority: 'high',
      })
    );

    await buildContext({ role: 'coder', cycleId: 5, taskId: 'TASK-010' });

    const findArg = mockKnowledgeFind.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(findArg?.['$or']).toEqual([
      { category: { $ne: 'retrospectives' } },
      { qualityScore: { $gte: 3 } },
    ]);
  });

  // ── Test: coder role content — low-quality retrospective excluded ──────────

  it('does not include low-quality retrospective content in coder context', async () => {
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-011',
        title: 'Another code task',
        description: 'More code things',
        acceptanceCriteria: [],
        blockedBy: [],
        type: 'feature',
        priority: 'high',
      })
    );

    // Simulate DB returning only non-retrospective files (query filter applied by DB)
    mockKnowledgeFind.mockReturnValue(
      chainable([
        {
          _id: 'specs/some-spec',
          title: 'Some Spec',
          content: 'Spec content',
          qualityScore: 5,
          category: 'specs',
        },
      ])
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 5, taskId: 'TASK-011' });

    // Verify that the $or filter was passed — DB would have excluded the low-quality retro
    const findArg = mockKnowledgeFind.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(findArg?.['$or']).toBeDefined();
    expect(ctx.taskPromptContent).toContain('Some Spec');
  });

  // ── Test: reviewer role also gets retrospective filter ────────────────────

  it('passes $or filter excluding retrospectives for reviewer role', async () => {
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-012',
        title: 'Review task',
        description: 'Review some code',
        acceptanceCriteria: [],
        blockedBy: [],
        type: 'refactor',
        priority: 'medium',
      })
    );

    await buildContext({ role: 'reviewer', cycleId: 5, taskId: 'TASK-012' });

    const findArg = mockKnowledgeFind.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(findArg?.['$or']).toEqual([
      { category: { $ne: 'retrospectives' } },
      { qualityScore: { $gte: 3 } },
    ]);
  });

  // ── Test: orchestrator role includes all categories (no $or filter) ────────

  it('does not add $or filter for orchestrator role — all categories included', async () => {
    await buildContext({ role: 'orchestrator', cycleId: 5 });

    const findArg = mockKnowledgeFind.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(findArg?.['$or']).toBeUndefined();
  });

  // ── Test: orchestrator receives retrospective file content ─────────────────

  it('includes retrospective content in orchestrator context', async () => {
    mockCycleFind.mockReturnValue(chainable([]));
    mockKnowledgeFind.mockReturnValue(
      chainable([
        {
          _id: 'retrospectives/cycle-10',
          title: 'Cycle 10 Retrospective',
          content: 'We learned many lessons.',
          qualityScore: 1,
          category: 'retrospectives',
        },
      ])
    );

    const ctx = await buildContext({ role: 'orchestrator', cycleId: 5 });

    expect(ctx.taskPromptContent).toContain('Cycle 10 Retrospective');
    expect(ctx.taskPromptContent).toContain('We learned many lessons.');
  });

  // ── Test: integrator role also has no $or filter ──────────────────────────

  it('does not add $or filter for integrator role — all categories included', async () => {
    mockTaskFind.mockReturnValue(chainable([]));

    await buildContext({ role: 'integrator', cycleId: 5 });

    const findArg = mockKnowledgeFind.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(findArg?.['$or']).toBeUndefined();
  });
});

// ─── processContextFeedback ───────────────────────────────────────────────────

describe('processContextFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentRunUpdateOne.mockResolvedValue({});
    mockKnowledgeUpdateOne.mockResolvedValue({});
    mockKnowledgeCreate.mockResolvedValue({});
    mockKnowledgeFindOne.mockResolvedValue(null);
  });

  // ── Test 17: Updates agentRun record with feedback ────────────────────────

  it('saves context feedback to the agentRun record', async () => {
    const feedback = { useful: [], unnecessary: [], missing: [] };

    await processContextFeedback('agent-run-1', feedback);

    expect(mockAgentRunUpdateOne).toHaveBeenCalledWith(
      { _id: 'agent-run-1' },
      { $set: { contextFeedback: feedback } }
    );
  });

  // ── Test 18: Increments quality score for useful files ────────────────────

  it('increments quality score for files marked as useful', async () => {
    const kf = { _id: 'specs/container-setup', qualityScore: 5 };
    mockKnowledgeFindById.mockResolvedValue(kf);

    await processContextFeedback('agent-run-2', {
      useful: ['specs/container-setup'],
      unnecessary: [],
      missing: [],
    });

    const updateCall = mockKnowledgeUpdateOne.mock.calls[0]!;
    const newScore = (updateCall[1] as Record<string, Record<string, number>>)['$set']![
      'qualityScore'
    ]!;
    const expectedScore = Math.min(
      QUALITY_SCORE_MAX,
      kf.qualityScore * QUALITY_SCORE_DECAY + QUALITY_SCORE_USEFUL_DELTA
    );
    expect(newScore).toBeCloseTo(expectedScore, 5);
    expect(newScore).toBeGreaterThan(kf.qualityScore * QUALITY_SCORE_DECAY);
  });

  // ── Test 19: Decrements quality score for unnecessary files ──────────────

  it('decrements quality score for files marked as unnecessary', async () => {
    const kf = { _id: 'decisions/old-decision', qualityScore: 3 };
    mockKnowledgeFindById.mockResolvedValue(kf);

    await processContextFeedback('agent-run-3', {
      useful: [],
      unnecessary: ['decisions/old-decision'],
      missing: [],
    });

    const updateCall = mockKnowledgeUpdateOne.mock.calls[0]!;
    const newScore = (updateCall[1] as Record<string, Record<string, number>>)['$set']![
      'qualityScore'
    ]!;
    const expectedScore = Math.max(
      QUALITY_SCORE_MIN,
      kf.qualityScore * QUALITY_SCORE_DECAY + QUALITY_SCORE_UNNECESSARY_DELTA
    );
    expect(newScore).toBeCloseTo(expectedScore, 5);
    expect(newScore).toBeLessThan(kf.qualityScore);
  });

  // ── Test 20: Clamps quality score to QUALITY_SCORE_MAX ───────────────────

  it('clamps quality score to QUALITY_SCORE_MAX when useful delta would exceed it', async () => {
    const kf = { _id: 'specs/popular', qualityScore: 99.9 };
    mockKnowledgeFindById.mockResolvedValue(kf);

    await processContextFeedback('agent-run-4', {
      useful: ['specs/popular'],
      unnecessary: [],
      missing: [],
    });

    const updateCall = mockKnowledgeUpdateOne.mock.calls[0]!;
    const newScore = (updateCall[1] as Record<string, Record<string, number>>)['$set']![
      'qualityScore'
    ]!;
    expect(newScore).toBeLessThanOrEqual(QUALITY_SCORE_MAX);
  });

  // ── Test 21: Clamps quality score to QUALITY_SCORE_MIN ───────────────────

  it('clamps quality score to QUALITY_SCORE_MIN when unnecessary delta would go below it', async () => {
    const kf = { _id: 'specs/useless', qualityScore: -9.9 };
    mockKnowledgeFindById.mockResolvedValue(kf);

    await processContextFeedback('agent-run-5', {
      useful: [],
      unnecessary: ['specs/useless'],
      missing: [],
    });

    const updateCall = mockKnowledgeUpdateOne.mock.calls[0]!;
    const newScore = (updateCall[1] as Record<string, Record<string, number>>)['$set']![
      'qualityScore'
    ]!;
    expect(newScore).toBeGreaterThanOrEqual(QUALITY_SCORE_MIN);
  });

  // ── Auto-prune: score clamped to QUALITY_SCORE_MIN sets status 'pruned' ───

  it('sets status to pruned when qualityScore clamps to QUALITY_SCORE_MIN', async () => {
    // Start near min so unnecessary delta pushes it to exactly QUALITY_SCORE_MIN
    const kf = { _id: 'specs/floor-file', qualityScore: -9.9 };
    mockKnowledgeFindById.mockResolvedValue(kf);

    await processContextFeedback('agent-run-prune-1', {
      useful: [],
      unnecessary: ['specs/floor-file'],
      missing: [],
    });

    const updateCall = mockKnowledgeUpdateOne.mock.calls[0]!;
    const setArg = (updateCall[1] as Record<string, Record<string, unknown>>)['$set']!;
    expect(setArg['qualityScore']).toBe(QUALITY_SCORE_MIN);
    expect(setArg['status']).toBe('pruned');
  });

  it('does NOT set status to pruned when qualityScore is above QUALITY_SCORE_MIN', async () => {
    // Score of 0 with unnecessary delta will go to ~-1.5 (well above QUALITY_SCORE_MIN of -10)
    const kf = { _id: 'specs/mid-file', qualityScore: 0 };
    mockKnowledgeFindById.mockResolvedValue(kf);

    await processContextFeedback('agent-run-prune-2', {
      useful: [],
      unnecessary: ['specs/mid-file'],
      missing: [],
    });

    const updateCall = mockKnowledgeUpdateOne.mock.calls[0]!;
    const setArg = (updateCall[1] as Record<string, Record<string, unknown>>)['$set']!;
    expect(setArg['qualityScore']).toBeGreaterThan(QUALITY_SCORE_MIN);
    expect(setArg['status']).toBeUndefined();
  });

  it('sets status to pruned when file already at QUALITY_SCORE_MIN receives another unnecessary mark', async () => {
    // File already at floor; any further unnecessary feedback keeps it at floor → prune
    const kf = { _id: 'specs/already-floor', qualityScore: QUALITY_SCORE_MIN };
    mockKnowledgeFindById.mockResolvedValue(kf);

    await processContextFeedback('agent-run-prune-3', {
      useful: [],
      unnecessary: ['specs/already-floor'],
      missing: [],
    });

    const updateCall = mockKnowledgeUpdateOne.mock.calls[0]!;
    const setArg = (updateCall[1] as Record<string, Record<string, unknown>>)['$set']!;
    expect(setArg['qualityScore']).toBe(QUALITY_SCORE_MIN);
    expect(setArg['status']).toBe('pruned');
  });

  // ── Test 22: Creates inbox entry for missing knowledge topic ──────────────

  it('creates an inbox entry when a missing knowledge topic is reported', async () => {
    await processContextFeedback('agent-run-6', {
      useful: [],
      unnecessary: [],
      missing: ['How to configure Redis caching'],
    });

    expect(mockKnowledgeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'inbox',
        title: 'How to configure Redis caching',
        source: expect.objectContaining({ type: 'agent', agentRunId: 'agent-run-6' }),
      })
    );
  });

  // ── Test 23: Deduplication — second call with same topic skips creation ───

  it('does not create a duplicate inbox entry when the same missing topic already exists', async () => {
    // First call: no existing inbox entry → creates one
    mockKnowledgeFindOne.mockResolvedValueOnce(null);

    await processContextFeedback('agent-run-7', {
      useful: [],
      unnecessary: [],
      missing: ['Redis caching'],
    });

    expect(mockKnowledgeCreate).toHaveBeenCalledTimes(1);

    // Reset create mock count; findOne now finds an existing entry
    mockKnowledgeCreate.mockClear();
    mockKnowledgeFindOne.mockResolvedValue({ _id: 'inbox/existing', title: 'Redis caching' });

    await processContextFeedback('agent-run-8', {
      useful: [],
      unnecessary: [],
      missing: ['Redis caching'],
    });

    // create should NOT have been called a second time
    expect(mockKnowledgeCreate).not.toHaveBeenCalled();
  });

  // ── Test: file not found in DB is silently skipped ────────────────────────

  it('silently skips quality score update when knowledge file is not found in DB', async () => {
    mockKnowledgeFindById.mockResolvedValue(null);

    await expect(
      processContextFeedback('agent-run-9', {
        useful: ['specs/nonexistent'],
        unnecessary: [],
        missing: [],
      })
    ).resolves.not.toThrow();

    // updateOne should not be called if the file was not found
    expect(mockKnowledgeUpdateOne).not.toHaveBeenCalled();
  });

  // ── Test: both useful and unnecessary applied together ───────────────────

  it('applies cumulative delta when a file appears in both useful and unnecessary', async () => {
    const kf = { _id: 'specs/ambiguous', qualityScore: 5 };
    mockKnowledgeFindById.mockResolvedValue(kf);

    await processContextFeedback('agent-run-10', {
      useful: ['specs/ambiguous'],
      unnecessary: ['specs/ambiguous'],
      missing: [],
    });

    const updateCall = mockKnowledgeUpdateOne.mock.calls[0]!;
    const newScore = (updateCall[1] as Record<string, Record<string, number>>)['$set']![
      'qualityScore'
    ]!;
    const expectedScore = Math.max(
      QUALITY_SCORE_MIN,
      Math.min(
        QUALITY_SCORE_MAX,
        kf.qualityScore * QUALITY_SCORE_DECAY +
          QUALITY_SCORE_USEFUL_DELTA +
          QUALITY_SCORE_UNNECESSARY_DELTA
      )
    );
    expect(newScore).toBeCloseTo(expectedScore, 5);
  });

  // ── Test: multiple missing topics each create their own inbox entry ───────

  it('creates separate inbox entries for each distinct missing topic', async () => {
    mockKnowledgeFindOne.mockResolvedValue(null);

    await processContextFeedback('agent-run-11', {
      useful: [],
      unnecessary: [],
      missing: ['Topic Alpha details', 'Topic Beta details'],
    });

    expect(mockKnowledgeCreate).toHaveBeenCalledTimes(2);
  });
});

// ─── extractKeywords ──────────────────────────────────────────────────────────

describe('extractKeywords', () => {
  // ── Test: returns significant keywords from plain text ────────────────────

  it('returns lowercased tokens from text', () => {
    // After camelCase expansion: 'TypeScript' → 'Type Script' → ['type', 'script']
    // 'MongoDB' → 'Mongo DB' → ['mongo'] (db is filtered for length < 4)
    const result = extractKeywords('TypeScript MongoDB');
    expect(result).toContain('type');
    expect(result).toContain('script');
    expect(result).toContain('mongo');
  });

  // ── Test: filters out tokens shorter than 4 characters ───────────────────

  it('excludes tokens with fewer than 4 characters', () => {
    // "at", "in", "to", "an" are all < 4 chars
    const result = extractKeywords('at in to an');
    expect(result).toHaveLength(0);
  });

  it('includes tokens with exactly 4 characters', () => {
    // "port" is exactly 4 chars and not a stop word — should be included
    const result = extractKeywords('port');
    expect(result).toContain('port');
  });

  it('excludes tokens with 3 or fewer characters', () => {
    // "run", "log", "map" are 3 chars — all excluded
    const result = extractKeywords('run log map');
    expect(result).toHaveLength(0);
  });

  // ── Test: stop words are excluded ────────────────────────────────────────

  it('excludes common stop words like "the", "and", "with", "from"', () => {
    const result = extractKeywords('the system and with from their should would');
    expect(result).not.toContain('the');
    expect(result).not.toContain('and');
    expect(result).not.toContain('with');
    expect(result).not.toContain('from');
    expect(result).not.toContain('their');
    expect(result).not.toContain('should');
    expect(result).not.toContain('would');
    // "system" is NOT a stop word — should be included
    expect(result).toContain('system');
  });

  it('excludes domain-specific stop words like "task", "update", "change"', () => {
    const result = extractKeywords('task update change improve changes');
    expect(result).not.toContain('task');
    expect(result).not.toContain('update');
    expect(result).not.toContain('change');
    expect(result).not.toContain('improve');
    expect(result).not.toContain('changes');
  });

  // ── Test: duplicates are removed ──────────────────────────────────────────

  it('removes duplicate keywords so each keyword appears only once', () => {
    const result = extractKeywords('knowledge knowledge knowledge');
    expect(result).toEqual(['knowledge']);
    expect(result).toHaveLength(1);
  });

  it('deduplicates case-insensitively since all tokens are lowercased', () => {
    // All three are the same word after lowercasing
    const result = extractKeywords('Pipeline pipeline PIPELINE');
    expect(result).toHaveLength(1);
    expect(result).toContain('pipeline');
  });

  // ── Test: splits on punctuation and whitespace ────────────────────────────

  it('splits on punctuation and whitespace, returning individual tokens', () => {
    const result = extractKeywords('context-builder, streaming; events');
    expect(result).toContain('context');
    expect(result).toContain('builder');
    expect(result).toContain('streaming');
    expect(result).toContain('events');
  });

  // ── Test: camelCase splitting ──────────────────────────────────────────────

  it('splits camelCase identifiers into component tokens', () => {
    const result = extractKeywords('contextBuilder');
    expect(result).toContain('context');
    expect(result).toContain('builder');
    // The compound identifier must not appear unsplit
    expect(result).not.toContain('contextbuilder');
  });

  it('splits multi-word camelCase correctly', () => {
    const result = extractKeywords('streamCapture jobQueue');
    expect(result).toContain('stream');
    expect(result).toContain('capture');
    expect(result).toContain('queue');
  });

  // ── Test: hyphenated term splitting ──────────────────────────────────────

  it('splits hyphenated terms into component tokens', () => {
    const result = extractKeywords('stream-capture');
    expect(result).toContain('stream');
    expect(result).toContain('capture');
  });

  // ── Test: acronyms within camelCase are preserved as tokens ───────────────

  it('handles acronyms in camelCase without throwing', () => {
    // 'SSE' is 3 chars so filtered; 'Event' → 'event' passes (5 chars)
    const result = extractKeywords('SSEEvent');
    expect(result).toContain('event');
  });

  // ── Test: empty string returns empty array ────────────────────────────────

  it('returns an empty array for empty input', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  // ── Test: returns empty array when all tokens are stop words or too short ─

  it('returns empty array when all tokens are filtered out', () => {
    const result = extractKeywords('the and for but not');
    expect(result).toHaveLength(0);
  });
});

// ─── buildContext — static bootstrap files always included ───────────────────

describe('buildContext — static bootstrap files always included', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue({ humanMessage: '', autoApprovalCategories: [] });
    mockCycleFindById.mockReturnValue(chainable({ _id: 1, goal: 'Test cycle', phase: 'plan' }));
    mockCycleFind.mockReturnValue(chainable([]));
    mockKnowledgeFind.mockReturnValue(chainable([]));
    mockTaskFind.mockReturnValue(chainable([]));
  });

  it('always includes boot.md, conventions.md, and glossary.md in knowledgeFiles', async () => {
    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    expect(ctx.knowledgeFiles).toContain('knowledge/boot.md');
    expect(ctx.knowledgeFiles).toContain('knowledge/conventions.md');
    expect(ctx.knowledgeFiles).toContain('knowledge/glossary.md');
  });

  it('includes static file content in task prompt regardless of quality score', async () => {
    // Static files are loaded from disk (mocked), not from DB
    const ctx = await buildContext({ role: 'orchestrator', cycleId: 1 });

    expect(ctx.taskPromptContent).toContain('Static boot content');
    expect(ctx.taskPromptContent).toContain('Static conventions content');
    expect(ctx.taskPromptContent).toContain('Static glossary content');
  });

  it('includes static files even when dynamic knowledge query returns nothing', async () => {
    // Dynamic query returns empty — static files should still appear
    mockKnowledgeFind.mockReturnValue(chainable([]));

    const ctx = await buildContext({ role: 'coder', cycleId: 1 });

    expect(ctx.knowledgeFiles).toContain('knowledge/boot.md');
    expect(ctx.knowledgeFiles).toContain('knowledge/conventions.md');
    expect(ctx.knowledgeFiles).toContain('knowledge/glossary.md');
  });
});

// ─── buildContext — tier quality-score ordering within tier ──────────────────

describe('buildContext — quality-score order preserved within each tier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue({ humanMessage: '' });
    mockCycleFindById.mockReturnValue(
      chainable({ _id: 7, goal: 'Quality ordering test', phase: 'implement' })
    );
    mockKnowledgeFind.mockReturnValue(chainable([]));
  });

  it('preserves quality-score order among tier-1 matches (highest quality first)', async () => {
    mockTaskFindById.mockReturnValue(
      chainable({
        _id: 'TASK-070',
        title: 'Implement streaming pipeline',
        description: 'Build the streaming pipeline for events',
        acceptanceCriteria: [],
        blockedBy: [],
        type: 'feature',
        priority: 'high',
      })
    );

    // Both files match "streaming" in their title (tier 1).
    // DB returns them sorted by quality score descending.
    // The order within tier 1 should be preserved.
    mockKnowledgeFind.mockReturnValue(
      chainable([
        {
          _id: 'specs/streaming-high',
          title: 'Streaming Overview',
          snippet: 'Overview of streaming.',
          content: 'Streaming architecture details.',
          qualityScore: 15,
        },
        {
          _id: 'specs/streaming-low',
          title: 'Streaming Edge Cases',
          snippet: 'Edge cases in streaming.',
          content: 'Streaming edge case details.',
          qualityScore: 7,
        },
      ])
    );

    const ctx = await buildContext({ role: 'coder', cycleId: 7, taskId: 'TASK-070' });

    const highIdx = ctx.taskPromptContent.indexOf('Streaming Overview');
    const lowIdx = ctx.taskPromptContent.indexOf('Streaming Edge Cases');

    expect(highIdx).toBeGreaterThan(-1);
    expect(lowIdx).toBeGreaterThan(-1);
    // Higher quality score should still appear first within tier 1
    expect(highIdx).toBeLessThan(lowIdx);
  });
});

// ─── buildContext — coder task-type guidance notes ────────────────────────────

describe('buildContext — coder task-type guidance notes', () => {
  function makeTask(type: string) {
    return {
      _id: 'TASK-200',
      title: 'Some task',
      description: 'Some description',
      acceptanceCriteria: [],
      blockedBy: [],
      type,
      priority: 'medium',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue({ humanMessage: '' });
    mockCycleFindById.mockReturnValue(
      chainable({ _id: 10, goal: 'Test cycle', phase: 'implement' })
    );
    mockKnowledgeFind.mockReturnValue(chainable([]));
  });

  // ── bug note appears for coder with bug task ──────────────────────────────

  it('injects bug guidance note after Type/Priority line for coder with bug task', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('bug')));

    const ctx = await buildContext({ role: 'coder', cycleId: 10, taskId: 'TASK-200' });

    expect(ctx.taskPromptContent).toContain(
      'Bug fix: add or update a test that would have caught this bug before marking criteria met.'
    );
    // Note appears after Type/Priority line
    const typePriorityIdx = ctx.taskPromptContent.indexOf('Type: bug | Priority:');
    const noteIdx = ctx.taskPromptContent.indexOf('Bug fix:');
    expect(typePriorityIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(typePriorityIdx);
  });

  // ── refactor note appears for coder with refactor task ───────────────────

  it('injects refactor guidance note after Type/Priority line for coder with refactor task', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('refactor')));

    const ctx = await buildContext({ role: 'coder', cycleId: 10, taskId: 'TASK-200' });

    expect(ctx.taskPromptContent).toContain('Refactor: all existing tests must pass unchanged.');
    const typePriorityIdx = ctx.taskPromptContent.indexOf('Type: refactor | Priority:');
    const noteIdx = ctx.taskPromptContent.indexOf('Refactor:');
    expect(typePriorityIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(typePriorityIdx);
  });

  // ── test note appears for coder with test task ───────────────────────────

  it('injects test guidance note after Type/Priority line for coder with test task', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('test')));

    const ctx = await buildContext({ role: 'coder', cycleId: 10, taskId: 'TASK-200' });

    expect(ctx.taskPromptContent).toContain(
      'Test task: run the affected test file in isolation first'
    );
    const typePriorityIdx = ctx.taskPromptContent.indexOf('Type: test | Priority:');
    const noteIdx = ctx.taskPromptContent.indexOf('Test task:');
    expect(typePriorityIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(typePriorityIdx);
  });

  // ── feature note appears for coder with feature task ─────────────────────

  it('injects feature guidance note after Type/Priority line for coder with feature task', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('feature')));

    const ctx = await buildContext({ role: 'coder', cycleId: 10, taskId: 'TASK-200' });

    expect(ctx.taskPromptContent).toContain(
      'Feature: add tests for the new behavior before opening the PR.'
    );
    const typePriorityIdx = ctx.taskPromptContent.indexOf('Type: feature | Priority:');
    const noteIdx = ctx.taskPromptContent.indexOf('Feature:');
    expect(typePriorityIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(typePriorityIdx);
  });

  // ── no note for chore task ────────────────────────────────────────────────

  it('does NOT inject any guidance note for coder with chore task', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('chore')));

    const ctx = await buildContext({ role: 'coder', cycleId: 10, taskId: 'TASK-200' });

    // None of the type-specific notes should appear
    expect(ctx.taskPromptContent).not.toContain('Bug fix:');
    expect(ctx.taskPromptContent).not.toContain('Refactor:');
    expect(ctx.taskPromptContent).not.toContain('Test task:');
    expect(ctx.taskPromptContent).not.toContain('Feature:');
  });

  // ── coder refactor note does NOT appear for reviewer role ────────────────

  it('does NOT inject coder refactor guidance note when role is reviewer', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('refactor')));

    const ctx = await buildContext({ role: 'reviewer', cycleId: 10, taskId: 'TASK-200' });

    expect(ctx.taskPromptContent).not.toContain(
      'Refactor: all existing tests must pass unchanged.'
    );
  });
});

// ─── buildContext — reviewer task-type guidance notes ─────────────────────────

describe('buildContext — reviewer task-type guidance notes', () => {
  function makeTask(type: string) {
    return {
      _id: 'TASK-300',
      title: 'Some task',
      description: 'Some description',
      acceptanceCriteria: [],
      blockedBy: [],
      type,
      priority: 'medium',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue({ humanMessage: '' });
    mockCycleFindById.mockReturnValue(chainable({ _id: 10, goal: 'Test cycle', phase: 'review' }));
    mockKnowledgeFind.mockReturnValue(chainable([]));
  });

  // ── bug note appears for reviewer with bug task ───────────────────────────

  it('injects reviewer bug note when role is reviewer and task type is bug', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('bug')));

    const ctx = await buildContext({ role: 'reviewer', cycleId: 10, taskId: 'TASK-300' });

    expect(ctx.taskPromptContent).toContain(
      'Verify a regression test was added that would have caught this bug.'
    );
    const typePriorityIdx = ctx.taskPromptContent.indexOf('Type: bug | Priority:');
    const noteIdx = ctx.taskPromptContent.indexOf('Verify a regression test was added');
    expect(typePriorityIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(typePriorityIdx);
  });

  // ── refactor note appears for reviewer with refactor task ─────────────────

  it('injects reviewer refactor note when role is reviewer and task type is refactor', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('refactor')));

    const ctx = await buildContext({ role: 'reviewer', cycleId: 10, taskId: 'TASK-300' });

    expect(ctx.taskPromptContent).toContain(
      'Verify no existing test had to change behavior to accommodate the refactor'
    );
    const typePriorityIdx = ctx.taskPromptContent.indexOf('Type: refactor | Priority:');
    const noteIdx = ctx.taskPromptContent.indexOf('Verify no existing test had to change');
    expect(typePriorityIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(typePriorityIdx);
  });

  // ── feature note appears for reviewer with feature task ───────────────────

  it('injects reviewer feature note when role is reviewer and task type is feature', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('feature')));

    const ctx = await buildContext({ role: 'reviewer', cycleId: 10, taskId: 'TASK-300' });

    expect(ctx.taskPromptContent).toContain(
      'Verify the PR includes tests covering the new behavior.'
    );
    const typePriorityIdx = ctx.taskPromptContent.indexOf('Type: feature | Priority:');
    const noteIdx = ctx.taskPromptContent.indexOf('Verify the PR includes tests covering');
    expect(typePriorityIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(typePriorityIdx);
  });

  // ── test note appears for reviewer with test task ─────────────────────────

  it('injects reviewer test note when role is reviewer and task type is test', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('test')));

    const ctx = await buildContext({ role: 'reviewer', cycleId: 10, taskId: 'TASK-300' });

    expect(ctx.taskPromptContent).toContain(
      'Verify the new tests run in isolation without real DB or Docker calls.'
    );
    const typePriorityIdx = ctx.taskPromptContent.indexOf('Type: test | Priority:');
    const noteIdx = ctx.taskPromptContent.indexOf('Verify the new tests run in isolation');
    expect(typePriorityIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(typePriorityIdx);
  });

  // ── no note for chore task (reviewer) ────────────────────────────────────

  it('does NOT inject any guidance note for reviewer with chore task', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('chore')));

    const ctx = await buildContext({ role: 'reviewer', cycleId: 10, taskId: 'TASK-300' });

    expect(ctx.taskPromptContent).not.toContain('Verify a regression test');
    expect(ctx.taskPromptContent).not.toContain('Verify no existing test');
    expect(ctx.taskPromptContent).not.toContain('Verify the PR includes tests');
    expect(ctx.taskPromptContent).not.toContain('Verify the new tests run in isolation');
  });

  // ── reviewer notes do NOT contain coder-style notes ───────────────────────

  it('does NOT inject coder-style notes for reviewer role', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('bug')));

    const ctx = await buildContext({ role: 'reviewer', cycleId: 10, taskId: 'TASK-300' });

    expect(ctx.taskPromptContent).not.toContain(
      'Bug fix: add or update a test that would have caught this bug before marking criteria met.'
    );
  });

  // ── coder notes are unaffected (non-regression) ───────────────────────────

  it('coder role still receives task-type notes unaffected by reviewer extension', async () => {
    mockTaskFindById.mockReturnValue(chainable(makeTask('bug')));

    const ctx = await buildContext({ role: 'coder', cycleId: 10, taskId: 'TASK-300' });

    // Coder should still receive coder-specific bug note
    expect(ctx.taskPromptContent).toContain(
      'Bug fix: add or update a test that would have caught this bug before marking criteria met.'
    );
    // Coder should NOT receive reviewer-specific bug note
    expect(ctx.taskPromptContent).not.toContain('Verify a regression test was added');
  });
});
