/**
 * Integration tests for the cycle phase state machine in job-queue.ts.
 *
 * These tests exercise the full advance-cycle state machine end-to-end by
 * chaining multiple handler calls that simulate how the system progresses
 * through phases: plan → implement → review → integrate → retrospect → complete.
 *
 * All MongoDB models, spawner, and SSE broadcast are mocked — no real database
 * or Docker daemon is required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (set up before module imports) ──────────────────────────────

const mockGetNextTaskId = vi.hoisted(() => vi.fn<() => Promise<string>>());
const mockTaskCreate = vi.hoisted(() => vi.fn());
const mockTaskFind = vi.hoisted(() => vi.fn());
const mockTaskFindById = vi.hoisted(() => vi.fn());
const mockTaskUpdateOne = vi.hoisted(() => vi.fn());
const mockTaskCountDocuments = vi.hoisted(() => vi.fn());
const mockCycleUpdateOne = vi.hoisted(() => vi.fn());
const mockCycleFindById = vi.hoisted(() => vi.fn());
const mockAgentRunFindById = vi.hoisted(() => vi.fn());
const mockAgentRunCountDocuments = vi.hoisted(() => vi.fn());
const mockAgentRunAggregate = vi.hoisted(() => vi.fn());
const mockJobCreate = vi.hoisted(() => vi.fn());
const mockJobUpdateOne = vi.hoisted(() => vi.fn());
const mockJobFindById = vi.hoisted(() => vi.fn());
const mockJobExists = vi.hoisted(() => vi.fn());
const mockJobFind = vi.hoisted(() => vi.fn());
const mockGetOrCreateControl = vi.hoisted(() => vi.fn());
const mockSpawnAgent = vi.hoisted(() => vi.fn());
const mockMaybeAdvanceCycle = vi.hoisted(() => vi.fn());
const mockGetCIStatus = vi.hoisted(() => vi.fn());
const mockBroadcast = vi.hoisted(() => vi.fn());

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../src/models/counter.js', () => ({
  getNextTaskId: mockGetNextTaskId,
  getNextCycleId: vi.fn(),
  getNextSequence: vi.fn(),
}));

vi.mock('../../src/models/task.js', () => ({
  TaskModel: {
    create: mockTaskCreate,
    find: mockTaskFind,
    findById: mockTaskFindById,
    updateOne: mockTaskUpdateOne,
    countDocuments: mockTaskCountDocuments,
  },
}));

vi.mock('../../src/models/cycle.js', () => ({
  CycleModel: {
    updateOne: mockCycleUpdateOne,
    findById: mockCycleFindById,
    create: vi.fn(),
  },
}));

vi.mock('../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    findById: mockAgentRunFindById,
    countDocuments: mockAgentRunCountDocuments,
    aggregate: mockAgentRunAggregate,
    find: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/models/job.js', () => ({
  JobModel: {
    create: mockJobCreate,
    updateOne: mockJobUpdateOne,
    findById: mockJobFindById,
    exists: mockJobExists,
    find: mockJobFind,
    aggregate: vi.fn().mockResolvedValue([]),
    findOneAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/models/control.js', () => ({
  getOrCreateControl: mockGetOrCreateControl,
  ControlModel: {},
}));

vi.mock('../../src/services/launcher/spawner.js', () => ({
  spawnAgent: mockSpawnAgent,
  maybeAdvanceCycle: mockMaybeAdvanceCycle,
}));

vi.mock('../../src/services/github.js', () => ({
  getCIStatus: mockGetCIStatus,
  closeStalePRs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/sse-manager.js', () => ({
  broadcast: mockBroadcast,
}));

vi.mock('../../src/models/knowledge-file.js', () => ({
  KnowledgeFileModel: {
    updateOne: vi.fn().mockResolvedValue({}),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

// ─── Import functions under test (after mocks) ────────────────────────────────

import {
  handleApplyPlan,
  handleAdvanceCycle,
  handleWaitForCI,
} from '../../src/services/job-queue.js';

// ─── Shared defaults ──────────────────────────────────────────────────────────

const DEFAULT_CONTROL = {
  mode: 'active',
  spendingCapUsd: null,
  spentUsd: 0,
  autoApprovalCategories: [],
};

/** Helper to extract all spawn job payloads from JobModel.create calls */
function getSpawnJobPayloads(): Array<Record<string, unknown>> {
  return mockJobCreate.mock.calls
    .filter((call) => (call[0] as Record<string, unknown>)['type'] === 'spawn')
    .map((call) => (call[0] as Record<string, unknown>)['payload'] as Record<string, unknown>);
}

/** Helper to get all jobs of a specific type from JobModel.create calls */
function getJobsOfType(type: string): Array<Record<string, unknown>> {
  return mockJobCreate.mock.calls
    .filter((call) => (call[0] as Record<string, unknown>)['type'] === type)
    .map((call) => call[0] as Record<string, unknown>);
}

/** Build a valid 3-task plan payload for handleApplyPlan */
function buildPlan(taskCount = 3) {
  return {
    goal: 'Integration test goal',
    tasks: Array.from({ length: taskCount }, (_, i) => ({
      title: `Task ${i + 1}`,
      description: `Description for task ${i + 1}`,
      type: 'chore',
      priority: 'medium',
      acceptanceCriteria: [`Criterion ${i + 1}`, `Criterion ${i + 1}b`],
      blockedBy: [],
    })),
  };
}

function makeFakeAgentRun(plan: object) {
  return {
    toObject: () => ({
      _id: 'run-orch-001',
      role: 'orchestrator',
      output: { plan },
    }),
  };
}

// ─── Test 1: plan → implement ──────────────────────────────────────────────────
//
// When the orchestrator completes, handleApplyPlan creates tasks and an
// advance-cycle job. When that advance-cycle job fires, the cycle transitions
// from 'plan' to 'implement' and coder spawn jobs are created for each ready task.

describe('Cycle phase transition: plan → implement', () => {
  const CYCLE_ID = 1;
  const AGENT_RUN_ID = 'run-orch-001';

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetOrCreateControl.mockResolvedValue(DEFAULT_CONTROL);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockTaskCreate.mockResolvedValue({});
    mockTaskUpdateOne.mockResolvedValue({});
    mockCycleUpdateOne.mockResolvedValue({});
    mockTaskFind.mockResolvedValue([]);
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockTaskCountDocuments.mockResolvedValue(0);
    mockAgentRunAggregate.mockResolvedValue([]);

    let taskSeq = 0;
    mockGetNextTaskId.mockImplementation(() => {
      taskSeq++;
      return Promise.resolve(`TASK-${String(taskSeq).padStart(3, '0')}`);
    });
  });

  it('applies plan and transitions from plan to implement, spawning a coder per ready task', async () => {
    const plan = buildPlan(3);
    mockAgentRunFindById.mockResolvedValue(makeFakeAgentRun(plan));

    // Step 1: Orchestrator completes — apply the plan
    await handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID });

    // Tasks should be created
    expect(mockTaskCreate).toHaveBeenCalledTimes(3);
    // An advance-cycle job should have been enqueued
    const advanceCycleJobs = getJobsOfType('advance-cycle');
    expect(advanceCycleJobs).toHaveLength(1);

    // Clear call history to isolate Step 2
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue(DEFAULT_CONTROL);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-step2' } });
    mockCycleUpdateOne.mockResolvedValue({});
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    // Step 2: advance-cycle job fires — cycle is in 'plan', 3 ready tasks exist
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'plan', status: 'active' });
    mockTaskFind.mockResolvedValue([{ _id: 'TASK-001' }, { _id: 'TASK-002' }, { _id: 'TASK-003' }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    // Cycle should now be in 'implement'
    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { phase: 'implement' } }
    );

    // SSE event should be broadcast
    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:phase_changed',
      expect.objectContaining({ cycleId: CYCLE_ID, phase: 'implement', previousPhase: 'plan' })
    );

    // One coder spawn job per ready task
    const spawnPayloads = getSpawnJobPayloads();
    expect(spawnPayloads).toHaveLength(3);
    for (const payload of spawnPayloads) {
      expect(payload['role']).toBe('coder');
      expect(payload['cycleId']).toBe(CYCLE_ID);
    }
  });

  it('does not spawn any coder jobs if no tasks are in ready state', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'plan', status: 'active' });
    // No ready tasks
    mockTaskFind.mockResolvedValue([]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { phase: 'implement' } }
    );
    const spawnPayloads = getSpawnJobPayloads();
    expect(spawnPayloads).toHaveLength(0);
  });
});

// ─── Test 2: implement → review ───────────────────────────────────────────────
//
// When all coder tasks have submitted PRs (status 'in-review'), the advance-cycle
// handler transitions the cycle from 'implement' to 'review' and spawns a reviewer
// for each in-review task.

describe('Cycle phase transition: implement → review', () => {
  const CYCLE_ID = 2;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetOrCreateControl.mockResolvedValue(DEFAULT_CONTROL);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockCycleUpdateOne.mockResolvedValue({});
    mockTaskFind.mockResolvedValue([]);
    mockTaskCountDocuments.mockResolvedValue(0);
    mockAgentRunAggregate.mockResolvedValue([]);
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  it('transitions from implement to review and spawns a reviewer for each in-review task', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'implement', status: 'active' });
    // Two tasks with PRs submitted
    mockTaskFind.mockResolvedValue([{ _id: 'TASK-010' }, { _id: 'TASK-011' }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    // Phase updated to 'review'
    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { phase: 'review' } }
    );

    // SSE broadcast
    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:phase_changed',
      expect.objectContaining({ cycleId: CYCLE_ID, phase: 'review', previousPhase: 'implement' })
    );

    // One reviewer spawn per in-review task
    const spawnPayloads = getSpawnJobPayloads();
    expect(spawnPayloads).toHaveLength(2);
    for (const payload of spawnPayloads) {
      expect(payload['role']).toBe('reviewer');
      expect(payload['cycleId']).toBe(CYCLE_ID);
    }
  });

  it('spawns no reviewers when there are no in-review tasks', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'implement', status: 'active' });
    mockTaskFind.mockResolvedValue([]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { phase: 'review' } }
    );
    const spawnPayloads = getSpawnJobPayloads();
    expect(spawnPayloads).toHaveLength(0);
  });
});

// ─── Test 3: review → integrate ───────────────────────────────────────────────
//
// When all reviewers have approved tasks (status 'done'), advance-cycle transitions
// from 'review' to 'integrate' and spawns a single integrator agent.

describe('Cycle phase transition: review → integrate', () => {
  const CYCLE_ID = 3;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetOrCreateControl.mockResolvedValue(DEFAULT_CONTROL);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockCycleUpdateOne.mockResolvedValue({});
    mockTaskFind.mockResolvedValue([]);
    mockAgentRunAggregate.mockResolvedValue([]);
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  it('transitions from review to integrate and spawns a single integrator agent', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'review', status: 'active' });
    // doneTasks > 0: cycle won't be marked failed
    mockTaskCountDocuments.mockResolvedValue(3);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    // Phase updated to 'integrate'
    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { phase: 'integrate' } }
    );

    // SSE broadcast
    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:phase_changed',
      expect.objectContaining({ cycleId: CYCLE_ID, phase: 'integrate', previousPhase: 'review' })
    );

    // One integrator spawn job (no taskId — cycle-level agent)
    const spawnPayloads = getSpawnJobPayloads();
    expect(spawnPayloads).toHaveLength(1);
    expect(spawnPayloads[0]!['role']).toBe('integrator');
    expect(spawnPayloads[0]!['cycleId']).toBe(CYCLE_ID);
    expect(spawnPayloads[0]!['taskId']).toBeUndefined();
  });

  it('fails the cycle (not integrator spawn) when zero tasks are done entering integrate phase', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'review', status: 'active' });
    // doneTasks === 0 triggers the cycle-failure path
    mockTaskCountDocuments.mockResolvedValue(0);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    // Cycle should be marked 'failed', not 'integrate'
    const updateCall = mockCycleUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'failed'
    );
    expect(updateCall).toBeDefined();

    // No phase update to 'integrate'
    const phaseUpdateToIntegrate = mockCycleUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['phase'] ===
          'integrate'
    );
    expect(phaseUpdateToIntegrate).toBeUndefined();

    // cycle:failed broadcast
    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:failed',
      expect.objectContaining({ cycleId: CYCLE_ID })
    );

    // No integrator spawn — next-cycle job should be created instead
    const spawnPayloads = getSpawnJobPayloads();
    expect(spawnPayloads).toHaveLength(0);
    const nextCycleJobs = getJobsOfType('next-cycle');
    expect(nextCycleJobs).toHaveLength(1);
  });
});

// ─── Test 4: integrate → retrospect ───────────────────────────────────────────
//
// After the integrator completes, advance-cycle transitions the cycle from
// 'integrate' to 'retrospect' and creates a curate-inbox job.

describe('Cycle phase transition: integrate → retrospect', () => {
  const CYCLE_ID = 4;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetOrCreateControl.mockResolvedValue(DEFAULT_CONTROL);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockCycleUpdateOne.mockResolvedValue({});
    mockTaskFind.mockResolvedValue([]);
    mockTaskCountDocuments.mockResolvedValue(0);
    mockAgentRunAggregate.mockResolvedValue([]);
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  it('transitions from integrate to retrospect and creates a curate-inbox job', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'integrate', status: 'active' });

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    // Phase updated to 'retrospect'
    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { phase: 'retrospect' } }
    );

    // SSE broadcast
    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:phase_changed',
      expect.objectContaining({
        cycleId: CYCLE_ID,
        phase: 'retrospect',
        previousPhase: 'integrate',
      })
    );

    // curate-inbox job should be created (not a spawn job)
    const curateJobs = getJobsOfType('curate-inbox');
    expect(curateJobs).toHaveLength(1);
    const curatePayload = curateJobs[0]!['payload'] as Record<string, unknown>;
    expect(curatePayload['cycleId']).toBe(CYCLE_ID);

    // No integrator spawn on this transition
    const spawnPayloads = getSpawnJobPayloads();
    expect(spawnPayloads).toHaveLength(0);
  });
});

// ─── Test 5: retrospect → complete ────────────────────────────────────────────
//
// After the retrospect phase finishes, advance-cycle marks the cycle as
// 'completed', computes metrics, and creates a next-cycle job (requiring approval).

describe('Cycle phase transition: retrospect → complete', () => {
  const CYCLE_ID = 5;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetOrCreateControl.mockResolvedValue(DEFAULT_CONTROL);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockCycleUpdateOne.mockResolvedValue({});
    mockTaskFind.mockResolvedValue([]);
    mockAgentRunAggregate.mockResolvedValue([]);
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  it('marks cycle completed and creates a next-cycle job requiring approval', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'retrospect', status: 'active' });
    // computeCycleMetrics uses countDocuments twice (done + failed tasks)
    mockTaskCountDocuments.mockResolvedValue(0);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    // Cycle should be marked 'completed'
    const completedUpdate = mockCycleUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'completed'
    );
    expect(completedUpdate).toBeDefined();
    // completedAt should be set
    const setPayload = (completedUpdate![1] as Record<string, unknown>)['$set'] as Record<
      string,
      unknown
    >;
    expect(setPayload['completedAt']).toBeInstanceOf(Date);

    // No phase change broadcast (we jumped to completed)
    const phaseChangeBroadcast = mockBroadcast.mock.calls.find(
      (call) => call[0] === 'cycle:phase_changed'
    );
    expect(phaseChangeBroadcast).toBeUndefined();

    // cycle:completed SSE event should be broadcast
    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:completed',
      expect.objectContaining({ cycleId: CYCLE_ID })
    );

    // next-cycle job created with requiresApproval: true
    const nextCycleJobs = getJobsOfType('next-cycle');
    expect(nextCycleJobs).toHaveLength(1);
    expect(nextCycleJobs[0]!['requiresApproval']).toBe(true);
    const nextCyclePayload = nextCycleJobs[0]!['payload'] as Record<string, unknown>;
    expect(nextCyclePayload['previousCycleId']).toBe(CYCLE_ID);
  });

  it('includes computed metrics in the completed cycle update', async () => {
    // Use a goal with meaningful keywords so goalCoverage is computed via keyword matching.
    // Keywords extracted (length >= 4, not stop words): improve, reliability, test, coverage
    mockCycleFindById.mockResolvedValue({
      _id: CYCLE_ID,
      phase: 'retrospect',
      status: 'active',
      goal: 'improve reliability and test coverage',
    });
    // 2 done tasks, 1 failed task
    mockTaskCountDocuments
      .mockResolvedValueOnce(2) // done tasks
      .mockResolvedValueOnce(1); // failed tasks
    // Aggregate returns cost and duration totals
    mockAgentRunAggregate
      .mockResolvedValueOnce([{ total: 0.42 }]) // totalCostUsd
      .mockResolvedValueOnce([{ total: 300000 }]); // totalDurationMs
    // Done task titles that cover all 4 goal keywords → goalCoverage = 4/4 = 1.0
    mockTaskFind.mockResolvedValue([
      { title: 'improve reliability', status: 'done' },
      { title: 'test coverage improvements', status: 'done' },
    ]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const completedUpdate = mockCycleUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'completed'
    );
    expect(completedUpdate).toBeDefined();
    const setPayload = (completedUpdate![1] as Record<string, unknown>)['$set'] as Record<
      string,
      unknown
    >;
    const metrics = setPayload['metrics'] as Record<string, unknown>;
    expect(metrics['tasksCompleted']).toBe(2);
    expect(metrics['tasksFailed']).toBe(1);
    expect(metrics['totalCostUsd']).toBe(0.42);
    expect(metrics['totalDurationMs']).toBe(300000);
    // goalCoverage must be persisted as a number in [0, 1]
    expect(typeof metrics['goalCoverage']).toBe('number');
    expect(metrics['goalCoverage']).toBeGreaterThanOrEqual(0);
    expect(metrics['goalCoverage']).toBeLessThanOrEqual(1);
    // All 4 goal keywords (improve, reliability, test, coverage) appear in task titles
    expect(metrics['goalCoverage']).toBe(1);

    // cycle:completed SSE broadcast must also include metrics.goalCoverage
    const completedBroadcast = mockBroadcast.mock.calls.find(
      (call) => call[0] === 'cycle:completed'
    );
    expect(completedBroadcast).toBeDefined();
    const broadcastMetrics = (completedBroadcast![1] as Record<string, unknown>)[
      'metrics'
    ] as Record<string, unknown>;
    expect(typeof broadcastMetrics['goalCoverage']).toBe('number');
    expect(broadcastMetrics['goalCoverage']).toBe(1);
  });
});

// ─── Test 6: failed-task path ──────────────────────────────────────────────────
//
// Two failure scenarios:
//   a) CI fails but the task is under the retry cap — task reset to 'ready',
//      a new coder spawn job is created.
//   b) CI fails and the task has exhausted all retries — task is marked 'failed'
//      and broadcast as failed (no spawn job).

describe('Failed-task path: CI failure handling', () => {
  const CYCLE_ID = 6;
  const TASK_ID = 'TASK-099';
  const PR_NUMBER = 77;
  const JOB_ID = 'job-wait-099';

  function makeTask(overrides?: Partial<{ status: string; branch: string }>) {
    return {
      _id: TASK_ID,
      status: overrides?.status ?? 'in-review',
      cycleId: CYCLE_ID,
      branch: overrides?.branch ?? 'task-099-feature',
      type: 'chore',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetOrCreateControl.mockResolvedValue(DEFAULT_CONTROL);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockJobUpdateOne.mockResolvedValue({});
    mockTaskUpdateOne.mockResolvedValue({});
    mockMaybeAdvanceCycle.mockResolvedValue(undefined);

    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(makeTask()) });
    mockCycleFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: CYCLE_ID, phase: 'implement', status: 'active' }),
    });
  });

  it('retries task with a new coder spawn when CI fails and task is under the retry cap', async () => {
    mockGetCIStatus.mockResolvedValue('failed');
    // 1 coder run so far — under MAX_RETRY_CODER_RUNS (3)
    mockAgentRunCountDocuments.mockResolvedValue(1);

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // Task should be set back to 'ready'
    const readyUpdate = mockTaskUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'ready'
    );
    expect(readyUpdate).toBeDefined();

    // A new coder spawn job should be created
    const spawnPayloads = getSpawnJobPayloads();
    expect(spawnPayloads).toHaveLength(1);
    expect(spawnPayloads[0]!['role']).toBe('coder');
    expect(spawnPayloads[0]!['taskId']).toBe(TASK_ID);
    expect(spawnPayloads[0]!['cycleId']).toBe(CYCLE_ID);
    // Retry context should carry the previous error
    const retryContext = spawnPayloads[0]!['retryContext'] as Record<string, unknown>;
    expect(retryContext['previousError']).toContain(`PR #${PR_NUMBER}`);
  });

  it('marks task failed (no retry) when CI fails and task has exhausted the retry cap', async () => {
    mockGetCIStatus.mockResolvedValue('failed');
    // 3 coder runs — at MAX_RETRY_CODER_RUNS (3), exhausted
    mockAgentRunCountDocuments.mockResolvedValue(3);

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // Task should be marked 'failed'
    const failedUpdate = mockTaskUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'failed'
    );
    expect(failedUpdate).toBeDefined();

    // SSE broadcast should be called with 'failed'
    expect(mockBroadcast).toHaveBeenCalledWith(
      'task:status_changed',
      expect.objectContaining({ taskId: TASK_ID, status: 'failed' })
    );

    // No new spawn job should be created
    const spawnPayloads = getSpawnJobPayloads();
    expect(spawnPayloads).toHaveLength(0);
  });

  it('does not retry and marks task failed when retry cap is exceeded (over cap)', async () => {
    mockGetCIStatus.mockResolvedValue('failed');
    // More than MAX_RETRY_CODER_RUNS: definitely exhausted
    mockAgentRunCountDocuments.mockResolvedValue(5);

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    const failedUpdate = mockTaskUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'failed'
    );
    expect(failedUpdate).toBeDefined();

    const spawnPayloads = getSpawnJobPayloads();
    expect(spawnPayloads).toHaveLength(0);
  });
});

// ─── Test 7: Full state machine sequence ──────────────────────────────────────
//
// This test exercises the complete cycle lifecycle by calling handleAdvanceCycle
// once for each phase transition in sequence, verifying each resulting state.

describe('Full cycle state machine: end-to-end phase sequence', () => {
  const CYCLE_ID = 10;

  /** Track the simulated cycle phase as we advance through the state machine */
  let currentPhase: string;

  beforeEach(() => {
    vi.clearAllMocks();
    currentPhase = 'plan';

    mockGetOrCreateControl.mockResolvedValue(DEFAULT_CONTROL);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockCycleUpdateOne.mockImplementation((_filter: unknown, update: Record<string, unknown>) => {
      const $set = update['$set'] as Record<string, unknown> | undefined;
      if ($set?.['phase']) currentPhase = $set['phase'] as string;
      return Promise.resolve({});
    });
    mockTaskFind.mockResolvedValue([]);
    mockAgentRunAggregate.mockResolvedValue([]);
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockTaskCountDocuments.mockResolvedValue(1); // at least 1 done task for review→integrate
  });

  it('advances through all five phases in order without error', async () => {
    const phases = ['plan', 'implement', 'review', 'integrate', 'retrospect'] as const;
    const expectedTransitions = [
      { from: 'plan', to: 'implement' },
      { from: 'implement', to: 'review' },
      { from: 'review', to: 'integrate' },
      { from: 'integrate', to: 'retrospect' },
    ] as const;

    for (const { from, to } of expectedTransitions) {
      vi.clearAllMocks();
      mockGetOrCreateControl.mockResolvedValue(DEFAULT_CONTROL);
      mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
      mockCycleUpdateOne.mockResolvedValue({});
      mockTaskFind.mockResolvedValue([]);
      mockTaskCountDocuments.mockResolvedValue(1);
      mockAgentRunAggregate.mockResolvedValue([]);
      mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: from, status: 'active' });

      await handleAdvanceCycle({ cycleId: CYCLE_ID });

      expect(mockCycleUpdateOne).toHaveBeenCalledWith({ _id: CYCLE_ID }, { $set: { phase: to } });
      expect(mockBroadcast).toHaveBeenCalledWith(
        'cycle:phase_changed',
        expect.objectContaining({ cycleId: CYCLE_ID, phase: to, previousPhase: from })
      );
    }

    // Final transition: retrospect → complete
    vi.clearAllMocks();
    mockGetOrCreateControl.mockResolvedValue(DEFAULT_CONTROL);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-last' } });
    mockCycleUpdateOne.mockResolvedValue({});
    mockTaskCountDocuments.mockResolvedValue(0);
    mockAgentRunAggregate.mockResolvedValue([]);
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'retrospect', status: 'active' });

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    // Cycle should be completed
    const completedUpdate = mockCycleUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'completed'
    );
    expect(completedUpdate).toBeDefined();

    // cycle:completed SSE event should be broadcast with correct cycleId
    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:completed',
      expect.objectContaining({ cycleId: CYCLE_ID })
    );

    // next-cycle job with approval requirement
    const nextCycleJobs = getJobsOfType('next-cycle');
    expect(nextCycleJobs).toHaveLength(1);
    expect(nextCycleJobs[0]!['requiresApproval']).toBe(true);

    // Verify all 5 phase identifiers in the spec
    const allPhases: string[] = phases.slice();
    expect(allPhases).toEqual(['plan', 'implement', 'review', 'integrate', 'retrospect']);
  });

  it('skips a non-active cycle (status !== active) without any updates', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'plan', status: 'completed' });

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    // No updates should have been applied
    expect(mockCycleUpdateOne).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(mockJobCreate).not.toHaveBeenCalled();
  });

  it('throws if the cycle document does not exist', async () => {
    mockCycleFindById.mockResolvedValue(null);

    await expect(handleAdvanceCycle({ cycleId: 999 })).rejects.toThrow('Cycle 999 not found');
  });
});
