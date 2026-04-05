/**
 * Unit tests for the apply-plan job handler in job-queue.ts.
 *
 * All MongoDB models, counter utilities, createJob, and broadcast are mocked
 * so no real database connection is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (set up before module imports) ─────────────────────────────

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
const mockCloseStalePRs = vi.hoisted(() => vi.fn());
const mockValidatePRBodyJSON = vi.hoisted(() => vi.fn());
const mockGetNextCycleId = vi.hoisted(() => vi.fn());
const mockCycleCreate = vi.hoisted(() => vi.fn());
const mockAgentRunFind = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockBroadcast = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockKnowledgeFileUpdateOne = vi.hoisted(() => vi.fn());
const mockKnowledgeFileCountDocuments = vi.hoisted(() => vi.fn());
const mockFsAccess = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../src/models/counter.js', () => ({
  getNextTaskId: mockGetNextTaskId,
  getNextCycleId: mockGetNextCycleId,
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
    create: mockCycleCreate,
  },
}));

vi.mock('../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    findById: mockAgentRunFindById,
    countDocuments: mockAgentRunCountDocuments,
    aggregate: mockAgentRunAggregate,
    find: mockAgentRunFind,
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
    warn: mockLoggerWarn,
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
  closeStalePRs: mockCloseStalePRs,
  validatePRBodyJSON: mockValidatePRBodyJSON,
}));

vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  access: mockFsAccess,
}));

vi.mock('../../src/services/sse-manager.js', () => ({
  broadcast: mockBroadcast,
}));

vi.mock('../../src/models/knowledge-file.js', () => ({
  KnowledgeFileModel: {
    updateOne: mockKnowledgeFileUpdateOne,
    countDocuments: mockKnowledgeFileCountDocuments,
  },
}));

// ─── Import the functions under test (after mocks) ────────────────────────────

import {
  handleApplyPlan,
  handleWaitForCI,
  handleAdvanceCycle,
  detectAndFailStaleJobs,
  handleCleanupPRs,
  handleNextCycle,
  handleReload,
  handleSpawn,
  handleCurateInbox,
  createJob,
  computeCycleMetrics,
  persistRetryReviewIssues,
} from '../../src/services/job-queue.js';
import { RELOAD_TRIGGER_PATH } from '@zombie-farm/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal valid plan with the given number of tasks */
function buildValidPlan(taskCount: number, overrides?: Partial<{ blockedBy: number[] }>[]) {
  return {
    goal: 'Test cycle goal',
    tasks: Array.from({ length: taskCount }, (_, i) => ({
      title: `Task ${i + 1}`,
      description: `Description for task ${i + 1}`,
      type: 'chore',
      priority: 'medium',
      acceptanceCriteria: [`Criterion for task ${i + 1}`, `Criterion 2 for task ${i + 1}`],
      blockedBy: overrides?.[i]?.blockedBy ?? [],
    })),
  };
}

/** Create a fake AgentRun document with a plan attached to its output */
function makeFakeAgentRun(plan: object) {
  return {
    toObject: () => ({
      _id: 'run-abc123',
      role: 'orchestrator',
      output: { plan },
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleApplyPlan', () => {
  const CYCLE_ID = 1;
  const AGENT_RUN_ID = 'run-abc123';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: control allows spawning
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });

    // Default: createJob (via JobModel.create) succeeds
    mockJobCreate.mockResolvedValue({ _id: 'job-001', _id_toString: 'job-001' });
    Object.defineProperty(mockJobCreate.mock, 'returnValue', { configurable: true });

    // Use sequential TASK IDs: TASK-001, TASK-002, etc.
    let taskSeq = 0;
    mockGetNextTaskId.mockImplementation(() => {
      taskSeq++;
      const padded = String(taskSeq).padStart(3, '0');
      return Promise.resolve(`TASK-${padded}`);
    });

    // TaskModel.create resolves successfully
    mockTaskCreate.mockResolvedValue({});

    // TaskModel.updateOne resolves successfully
    mockTaskUpdateOne.mockResolvedValue({});

    // TaskModel.find returns empty array by default
    mockTaskFind.mockResolvedValue([]);

    // AgentRunModel.find returns empty array by default
    mockAgentRunFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

    // TaskModel.findById returns null with .lean() by default
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    // TaskModel.countDocuments returns 0 by default
    mockTaskCountDocuments.mockResolvedValue(0);

    // CycleModel.updateOne resolves successfully
    mockCycleUpdateOne.mockResolvedValue({});

    // CycleModel.findById returns null by default
    mockCycleFindById.mockResolvedValue(null);

    // AgentRunModel.countDocuments returns 0 by default
    mockAgentRunCountDocuments.mockResolvedValue(0);

    // AgentRunModel.aggregate returns empty array by default
    mockAgentRunAggregate.mockResolvedValue([]);

    // maybeAdvanceCycle resolves successfully
    mockMaybeAdvanceCycle.mockResolvedValue(undefined);

    // JobModel.create for createJob helper
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
  });

  // ── Test 1: Valid plan creates correct number of Task documents ──────────────

  it('creates 3 Task documents for a valid 3-task plan', async () => {
    const plan = buildValidPlan(3);
    mockAgentRunFindById.mockResolvedValue(makeFakeAgentRun(plan));

    await handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID });

    expect(mockTaskCreate).toHaveBeenCalledTimes(3);
  });

  // ── Test 2: Task fields are correctly mapped ─────────────────────────────────

  it('sets correct fields on created tasks (title, description, type, priority, acceptanceCriteria, cycleId)', async () => {
    const plan = buildValidPlan(3);
    mockAgentRunFindById.mockResolvedValue(makeFakeAgentRun(plan));

    await handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID });

    const firstCall = mockTaskCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(firstCall['title']).toBe('Task 1');
    expect(firstCall['description']).toBe('Description for task 1');
    expect(firstCall['type']).toBe('chore');
    expect(firstCall['priority']).toBe('medium');
    expect(firstCall['cycleId']).toBe(CYCLE_ID);
    expect(firstCall['acceptanceCriteria']).toEqual([
      'Criterion for task 1',
      'Criterion 2 for task 1',
    ]);
    expect(firstCall['createdBy']).toBe('orchestrator');
  });

  // ── Test 3: Unblocked tasks get status 'ready' ───────────────────────────────

  it('assigns status "ready" to tasks with no blockedBy', async () => {
    const plan = buildValidPlan(3);
    mockAgentRunFindById.mockResolvedValue(makeFakeAgentRun(plan));

    await handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID });

    for (const call of mockTaskCreate.mock.calls) {
      const doc = call[0] as Record<string, unknown>;
      expect(doc['status']).toBe('ready');
      expect((doc['blockedBy'] as string[]).length).toBe(0);
    }
  });

  // ── Test 4: Blocked tasks get status 'blocked' with translated IDs ───────────

  it('assigns status "blocked" and translates blockedBy indices to TASK-IDs', async () => {
    // Task 0: no deps (ready); Task 1: depends on task 0 (blocked); Task 2: depends on task 1 (blocked)
    const plan = buildValidPlan(3, [{ blockedBy: [] }, { blockedBy: [0] }, { blockedBy: [1] }]);
    mockAgentRunFindById.mockResolvedValue(makeFakeAgentRun(plan));

    await handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID });

    const task0 = mockTaskCreate.mock.calls[0][0] as Record<string, unknown>;
    const task1 = mockTaskCreate.mock.calls[1][0] as Record<string, unknown>;
    const task2 = mockTaskCreate.mock.calls[2][0] as Record<string, unknown>;

    expect(task0['status']).toBe('ready');
    expect(task0['blockedBy']).toEqual([]);

    expect(task1['status']).toBe('blocked');
    expect(task1['blockedBy']).toEqual(['TASK-001']); // index 0 → first allocated ID

    expect(task2['status']).toBe('blocked');
    expect(task2['blockedBy']).toEqual(['TASK-002']); // index 1 → second allocated ID
  });

  // ── Test 5: Cycle's taskIds array is updated ─────────────────────────────────

  it('updates the cycle taskIds array with all created task IDs', async () => {
    const plan = buildValidPlan(3);
    mockAgentRunFindById.mockResolvedValue(makeFakeAgentRun(plan));

    await handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { goal: 'Test cycle goal', tasks: ['TASK-001', 'TASK-002', 'TASK-003'] } }
    );
  });

  // ── Test 6: Invalid plan (2 tasks) causes failure without creating tasks ──────

  it('throws and creates no tasks when plan has fewer than 3 tasks', async () => {
    const plan = buildValidPlan(2); // below MIN_PLAN_TASKS (3)
    mockAgentRunFindById.mockResolvedValue(makeFakeAgentRun(plan));

    await expect(handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID })).rejects.toThrow(
      'Plan validation failed'
    );

    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  // ── Test 7: advance-cycle job is created after successful task creation ───────

  it('creates an advance-cycle job after tasks are created', async () => {
    const plan = buildValidPlan(3);
    mockAgentRunFindById.mockResolvedValue(makeFakeAgentRun(plan));

    await handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID });

    // createJob calls JobModel.create internally
    const jobCreateCalls = mockJobCreate.mock.calls;
    const advanceCycleCall = jobCreateCalls.find(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'advance-cycle'
    );
    expect(advanceCycleCall).toBeDefined();
    const jobDoc = advanceCycleCall![0] as Record<string, unknown>;
    expect((jobDoc['payload'] as Record<string, unknown>)['cycleId']).toBe(CYCLE_ID);
  });

  // ── Test 8: Missing AgentRun throws immediately ──────────────────────────────

  it('throws if the AgentRun is not found', async () => {
    mockAgentRunFindById.mockResolvedValue(null);

    await expect(
      handleApplyPlan({ agentRunId: 'nonexistent-run', cycleId: CYCLE_ID })
    ).rejects.toThrow('Agent run nonexistent-run not found');

    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  // ── Test 9: Plan missing plan field throws ────────────────────────────────────

  it('throws if the AgentRun has no plan in output', async () => {
    const fakeRun = { toObject: () => ({ _id: 'run-abc123', output: {} }) };
    mockAgentRunFindById.mockResolvedValue(fakeRun);

    await expect(handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID })).rejects.toThrow(
      'Could not extract plan'
    );

    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  // ── Test 10: Spawn jobs are NOT created for blocked tasks ─────────────────────
  // The apply-plan handler creates an advance-cycle job (not spawn directly).
  // spawn jobs for ready tasks only appear after advance-cycle → implement transition.
  // We verify that JobModel.create is only called once (for advance-cycle), NOT for
  // spawn jobs for individual tasks — blocked or otherwise.

  it('does NOT create spawn jobs directly during apply-plan (deferred to advance-cycle)', async () => {
    const plan = buildValidPlan(3, [
      { blockedBy: [] }, // ready
      { blockedBy: [0] }, // blocked
      { blockedBy: [0] }, // blocked
    ]);
    mockAgentRunFindById.mockResolvedValue(makeFakeAgentRun(plan));

    await handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID });

    const spawnCalls = mockJobCreate.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'spawn'
    );
    expect(spawnCalls).toHaveLength(0);
  });

  // ── Regression test: goal from plan.goal is persisted to the cycle document ──

  it('persists plan.goal to the cycle document (regression for TASK-044 fix)', async () => {
    const plan = { ...buildValidPlan(3), goal: 'A specific orchestrator goal' };
    mockAgentRunFindById.mockResolvedValue(makeFakeAgentRun(plan));

    await handleApplyPlan({ agentRunId: AGENT_RUN_ID, cycleId: CYCLE_ID });

    // The $set payload must contain both goal and tasks
    const updateCall = mockCycleUpdateOne.mock.calls.find((call) =>
      Boolean((call[1] as Record<string, unknown>)['$set'])
    );
    expect(updateCall).toBeDefined();
    const setObj = (updateCall![1] as Record<string, unknown>)['$set'] as Record<string, unknown>;
    expect(setObj['goal']).toBe('A specific orchestrator goal');
    expect(Array.isArray(setObj['tasks'])).toBe(true);
  });
});

// ─── handleWaitForCI tests ────────────────────────────────────────────────────

describe('handleWaitForCI', () => {
  const JOB_ID = 'job-001';
  const TASK_ID = 'TASK-001';
  const PR_NUMBER = 42;
  const CYCLE_ID = 1;

  const fakeTask = {
    _id: TASK_ID,
    status: 'in-review',
    cycleId: CYCLE_ID,
    branch: 'task-001-my-branch',
    type: 'chore',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Restore standard defaults
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockJobUpdateOne.mockResolvedValue({});
    mockTaskUpdateOne.mockResolvedValue({});
    mockMaybeAdvanceCycle.mockResolvedValue(undefined);
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });

    // By default, findById returns a task with .lean() chaining
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(fakeTask) });
    // By default, cycle is in review phase
    mockCycleFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: CYCLE_ID, phase: 'review', status: 'active' }),
    });
    // By default, no existing reviewer job and PR body is valid
    mockJobExists.mockResolvedValue(null);
    mockValidatePRBodyJSON.mockResolvedValue({ valid: true });
  });

  // ── Test 11: CI running → job requeued ───────────────────────────────────────

  it('requeues the job when CI status is running', async () => {
    mockGetCIStatus.mockResolvedValue('running');

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    expect(mockJobUpdateOne).toHaveBeenCalledWith({ _id: JOB_ID }, { $set: { status: 'pending' } });
    // No spawn jobs created
    const spawnCalls = mockJobCreate.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'spawn'
    );
    expect(spawnCalls).toHaveLength(0);
  });

  // ── Test 12: CI passed + cycle in review + task in-review → reviewer spawn ───

  it('spawns a reviewer job when CI passes and cycle is in review phase with task in-review', async () => {
    mockGetCIStatus.mockResolvedValue('passed');

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    const spawnCalls = mockJobCreate.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'spawn'
    );
    expect(spawnCalls).toHaveLength(1);
    const jobDoc = spawnCalls[0]![0] as Record<string, unknown>;
    expect((jobDoc['payload'] as Record<string, unknown>)['role']).toBe('reviewer');
    expect((jobDoc['payload'] as Record<string, unknown>)['taskId']).toBe(TASK_ID);
  });

  // ── Test 13: CI passed + cycle in implement phase → no reviewer spawned ──────

  it('does not spawn reviewer when CI passes but cycle is in implement phase', async () => {
    mockGetCIStatus.mockResolvedValue('passed');
    mockCycleFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: CYCLE_ID, phase: 'implement', status: 'active' }),
    });

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    const spawnCalls = mockJobCreate.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'spawn'
    );
    expect(spawnCalls).toHaveLength(0);
  });

  // ── Test 14: CI failed + coderRuns under cap → task 'ready', retry coder ─────

  it('sets task to ready and spawns retry coder when CI fails and coderRuns is under cap', async () => {
    mockGetCIStatus.mockResolvedValue('failed');
    mockAgentRunCountDocuments.mockResolvedValue(1); // under MAX_RETRY_CODER_RUNS (3)

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // Task should be set to 'ready'
    const readyCall = mockTaskUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'ready'
    );
    expect(readyCall).toBeDefined();

    // A retry coder spawn job should be created
    const spawnCalls = mockJobCreate.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'spawn'
    );
    expect(spawnCalls).toHaveLength(1);
    const jobDoc = spawnCalls[0]![0] as Record<string, unknown>;
    expect((jobDoc['payload'] as Record<string, unknown>)['role']).toBe('coder');
    expect((jobDoc['payload'] as Record<string, unknown>)['taskId']).toBe(TASK_ID);
  });

  // ── Test 15: CI failed + coderRuns at cap → task 'failed', broadcast, no spawn

  it('marks task failed and broadcasts when CI fails and coderRuns is at or above cap', async () => {
    mockGetCIStatus.mockResolvedValue('failed');
    mockAgentRunCountDocuments.mockResolvedValue(3); // equals MAX_RETRY_CODER_RUNS (3)

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // Task should be set to 'failed'
    const failedCall = mockTaskUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'failed'
    );
    expect(failedCall).toBeDefined();

    // broadcast should be called with task:status_changed and status 'failed'
    expect(mockBroadcast).toHaveBeenCalledWith(
      'task:status_changed',
      expect.objectContaining({ taskId: TASK_ID, status: 'failed' })
    );

    // No spawn jobs should be created
    const spawnCalls = mockJobCreate.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'spawn'
    );
    expect(spawnCalls).toHaveLength(0);
  });
});

// ─── handleWaitForCI: reviewer spawn deduplication guard ──────────────────────

describe('handleWaitForCI — reviewer spawn deduplication', () => {
  const TASK_ID = 'TASK-042';
  const CYCLE_ID = 7;
  const PR_NUMBER = 99;
  const JOB_ID = 'job-wait-001';

  /** Minimal task document returned by TaskModel.findById().lean() */
  function makeTask(overrides?: Partial<{ status: string; cycleId: number }>) {
    return {
      _id: TASK_ID,
      cycleId: overrides?.cycleId ?? CYCLE_ID,
      status: overrides?.status ?? 'in-review',
      branch: 'task-042-some-feature',
    };
  }

  /** Minimal cycle document returned by CycleModel.findById().lean() */
  function makeCycle(phase: string) {
    return { _id: CYCLE_ID, phase };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // CI returns 'passed' by default
    mockGetCIStatus.mockResolvedValue('passed');

    // TaskModel.findById(taskId).lean() chain
    mockTaskFindById.mockReturnValue({ lean: () => Promise.resolve(makeTask()) });

    // CycleModel.findById(cycleId).lean() chain
    mockCycleFindById.mockReturnValue({ lean: () => Promise.resolve(makeCycle('review')) });

    // No existing reviewer spawn job by default
    mockJobExists.mockResolvedValue(null);

    // PR body is valid by default
    mockValidatePRBodyJSON.mockResolvedValue({ valid: true });

    // createJob (via JobModel.create) returns a stub
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'new-job' } });

    // JobModel.updateOne resolves (requeue path)
    mockJobUpdateOne.mockResolvedValue({});
  });

  // ── Test A: normal path — no existing job → reviewer spawn is created ─────────

  it('creates a reviewer spawn job when no existing pending/active reviewer job exists', async () => {
    mockJobExists.mockResolvedValue(null); // no existing job

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // JobModel.exists must have been called with the guard query
    expect(mockJobExists).toHaveBeenCalledWith({
      type: 'spawn',
      'payload.role': 'reviewer',
      'payload.taskId': TASK_ID,
      status: { $in: ['pending', 'active'] },
    });

    // A spawn job for the reviewer should have been created
    const spawnCall = mockJobCreate.mock.calls.find((call) => {
      const doc = call[0] as Record<string, unknown>;
      const payload = doc['payload'] as Record<string, unknown>;
      return doc['type'] === 'spawn' && payload['role'] === 'reviewer';
    });
    expect(spawnCall).toBeDefined();
    const payload = (spawnCall![0] as Record<string, unknown>)['payload'] as Record<
      string,
      unknown
    >;
    expect(payload['taskId']).toBe(TASK_ID);
    expect(payload['cycleId']).toBe(CYCLE_ID);
  });

  // ── Test B: race guard — existing job present → no duplicate spawn created ────

  it('does NOT create a reviewer spawn job when a pending/active one already exists', async () => {
    mockJobExists.mockResolvedValue({ _id: 'existing-reviewer-job' }); // guard fires

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // JobModel.exists must still have been called
    expect(mockJobExists).toHaveBeenCalled();

    // No spawn job for reviewer should have been created
    const reviewerSpawnCall = mockJobCreate.mock.calls.find((call) => {
      const doc = call[0] as Record<string, unknown>;
      const payload = doc['payload'] as Record<string, unknown>;
      return doc['type'] === 'spawn' && payload['role'] === 'reviewer';
    });
    expect(reviewerSpawnCall).toBeUndefined();
  });

  // ── Test C: guard not invoked when cycle is not in review phase ───────────────

  it('does not check for existing reviewer job when cycle is not in review phase', async () => {
    mockCycleFindById.mockReturnValue({ lean: () => Promise.resolve(makeCycle('implement')) });

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    expect(mockJobExists).not.toHaveBeenCalled();
  });
});

// ─── handleWaitForCI: validatePRBodyJSON pre-flight check ─────────────────────

describe('handleWaitForCI — validatePRBodyJSON pre-flight', () => {
  const TASK_ID = 'TASK-055';
  const CYCLE_ID = 9;
  const PR_NUMBER = 77;
  const JOB_ID = 'job-preflight-001';

  function makeTask() {
    return {
      _id: TASK_ID,
      cycleId: CYCLE_ID,
      status: 'in-review',
      branch: 'task-055-some-feature',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetCIStatus.mockResolvedValue('passed');
    mockTaskFindById.mockReturnValue({ lean: () => Promise.resolve(makeTask()) });
    mockCycleFindById.mockReturnValue({
      lean: () => Promise.resolve({ _id: CYCLE_ID, phase: 'review' }),
    });
    mockJobExists.mockResolvedValue(null); // no existing reviewer job
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'new-job' } });
    mockJobUpdateOne.mockResolvedValue({});
    mockTaskUpdateOne.mockResolvedValue({});
  });

  // ── Pre-flight fails → coder retry spawned, not reviewer ─────────────────────

  it('spawns a coder retry job (not reviewer) when validatePRBodyJSON returns { valid: false }', async () => {
    mockValidatePRBodyJSON.mockResolvedValue({ valid: false, reason: 'no_json_block' });

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // Should have called validatePRBodyJSON with the PR number
    expect(mockValidatePRBodyJSON).toHaveBeenCalledWith(PR_NUMBER);

    // A coder spawn job should be created
    const coderSpawnCall = mockJobCreate.mock.calls.find((call) => {
      const doc = call[0] as Record<string, unknown>;
      const payload = doc['payload'] as Record<string, unknown>;
      return doc['type'] === 'spawn' && payload['role'] === 'coder';
    });
    expect(coderSpawnCall).toBeDefined();

    // No reviewer spawn job should be created
    const reviewerSpawnCall = mockJobCreate.mock.calls.find((call) => {
      const doc = call[0] as Record<string, unknown>;
      const payload = doc['payload'] as Record<string, unknown>;
      return doc['type'] === 'spawn' && payload['role'] === 'reviewer';
    });
    expect(reviewerSpawnCall).toBeUndefined();
  });

  // ── Pre-flight fails → lastRetryCause set to 'pr_body_invalid' ──────────────

  it('sets lastRetryCause to pr_body_invalid in TaskModel.updateOne when validatePRBodyJSON returns { valid: false }', async () => {
    mockValidatePRBodyJSON.mockResolvedValue({ valid: false, reason: 'no_json_block' });

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // Find the updateOne call that sets status to 'ready'
    const readyCall = mockTaskUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'ready'
    );
    expect(readyCall).toBeDefined();
    const setObj = (readyCall![1] as Record<string, unknown>)['$set'] as Record<string, unknown>;
    expect(setObj['lastRetryCause']).toBe('pr_body_invalid');
  });

  // ── Pre-flight fails (no_json_block) → filesChanged: [] and reviewIssues with error severity ──

  it('sets retryContext.filesChanged to [] and reviewIssues with error severity when reason is no_json_block', async () => {
    mockValidatePRBodyJSON.mockResolvedValue({ valid: false, reason: 'no_json_block' });

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    const coderSpawnCall = mockJobCreate.mock.calls.find((call) => {
      const doc = call[0] as Record<string, unknown>;
      const payload = doc['payload'] as Record<string, unknown>;
      return doc['type'] === 'spawn' && payload['role'] === 'coder';
    });
    expect(coderSpawnCall).toBeDefined();

    const payload = (coderSpawnCall![0] as Record<string, unknown>)['payload'] as Record<
      string,
      unknown
    >;
    const retryContext = payload['retryContext'] as Record<string, unknown>;

    // filesChanged must be empty — not the branch name
    expect(retryContext['filesChanged']).toEqual([]);

    // reviewIssues must have exactly one error-severity entry
    const reviewIssues = retryContext['reviewIssues'] as Array<Record<string, unknown>>;
    expect(reviewIssues).toHaveLength(1);
    expect(reviewIssues[0]['severity']).toBe('error');

    // description must mention 'heredoc' or 'Git Workflow section' and name the failure
    const description = reviewIssues[0]['description'] as string;
    expect(description.toLowerCase()).toMatch(/heredoc|git workflow section/i);
    expect(description).toMatch(/no.*json.*block|json.*fenced block/i);

    // previousError must not be set
    expect(retryContext['previousError']).toBeUndefined();
  });

  // ── Pre-flight fails (missing_acv_array) → different description than no_json_block ──

  it('uses a reason-specific reviewIssues description for missing_acv_array vs no_json_block', async () => {
    // Get no_json_block description
    mockValidatePRBodyJSON.mockResolvedValue({ valid: false, reason: 'no_json_block' });
    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    const noJsonCall = mockJobCreate.mock.calls.find((call) => {
      const doc = call[0] as Record<string, unknown>;
      const payload = doc['payload'] as Record<string, unknown>;
      return doc['type'] === 'spawn' && payload['role'] === 'coder';
    });
    const noJsonPayload = (noJsonCall![0] as Record<string, unknown>)['payload'] as Record<
      string,
      unknown
    >;
    const noJsonRetryContext = noJsonPayload['retryContext'] as Record<string, unknown>;
    const noJsonIssues = noJsonRetryContext['reviewIssues'] as Array<Record<string, unknown>>;
    const noJsonDescription = noJsonIssues[0]['description'] as string;

    // Reset and test missing_acv_array
    vi.clearAllMocks();
    mockGetCIStatus.mockResolvedValue('passed');
    mockTaskFindById.mockReturnValue({ lean: () => Promise.resolve(makeTask()) });
    mockCycleFindById.mockReturnValue({
      lean: () => Promise.resolve({ _id: CYCLE_ID, phase: 'review' }),
    });
    mockJobExists.mockResolvedValue(null);
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'new-job' } });
    mockJobUpdateOne.mockResolvedValue({});
    mockTaskUpdateOne.mockResolvedValue({});

    mockValidatePRBodyJSON.mockResolvedValue({ valid: false, reason: 'missing_acv_array' });
    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    const acvCall = mockJobCreate.mock.calls.find((call) => {
      const doc = call[0] as Record<string, unknown>;
      const payload = doc['payload'] as Record<string, unknown>;
      return doc['type'] === 'spawn' && payload['role'] === 'coder';
    });
    const acvPayload = (acvCall![0] as Record<string, unknown>)['payload'] as Record<
      string,
      unknown
    >;
    const acvRetryContext = acvPayload['retryContext'] as Record<string, unknown>;
    const acvIssues = acvRetryContext['reviewIssues'] as Array<Record<string, unknown>>;
    const acvDescription = acvIssues[0]['description'] as string;

    // The two descriptions should differ
    expect(acvDescription).not.toBe(noJsonDescription);

    // Both should mention heredoc/Git Workflow section
    expect(acvDescription.toLowerCase()).toMatch(/heredoc|git workflow section/i);

    // The acv description should mention acceptanceCriteriaVerification
    expect(acvDescription.toLowerCase()).toContain(
      'acceptancecriteriaverifcation'.toLowerCase().slice(0, 20)
    );
  });

  // ── Pre-flight passes → reviewer spawned as normal ───────────────────────────

  it('spawns a reviewer job (not coder retry) when validatePRBodyJSON returns { valid: true }', async () => {
    mockValidatePRBodyJSON.mockResolvedValue({ valid: true });

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // Should have called validatePRBodyJSON with the PR number
    expect(mockValidatePRBodyJSON).toHaveBeenCalledWith(PR_NUMBER);

    // A reviewer spawn job should be created
    const reviewerSpawnCall = mockJobCreate.mock.calls.find((call) => {
      const doc = call[0] as Record<string, unknown>;
      const payload = doc['payload'] as Record<string, unknown>;
      return doc['type'] === 'spawn' && payload['role'] === 'reviewer';
    });
    expect(reviewerSpawnCall).toBeDefined();

    // No coder retry spawn job should be created
    const coderSpawnCall = mockJobCreate.mock.calls.find((call) => {
      const doc = call[0] as Record<string, unknown>;
      const payload = doc['payload'] as Record<string, unknown>;
      return doc['type'] === 'spawn' && payload['role'] === 'coder';
    });
    expect(coderSpawnCall).toBeUndefined();
  });
});

// ─── handleAdvanceCycle tests ─────────────────────────────────────────────────

describe('handleAdvanceCycle', () => {
  const CYCLE_ID = 1;

  beforeEach(() => {
    vi.clearAllMocks();

    // Restore standard defaults
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockCycleUpdateOne.mockResolvedValue({});
    mockTaskFind.mockResolvedValue([]);
    mockTaskCountDocuments.mockResolvedValue(0);
    mockAgentRunAggregate.mockResolvedValue([]);
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });

    // For createJob coder spawns, TaskModel.findById is called to check task type.
    // Return null so requiresApproval stays false (no task type check).
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    // KnowledgeFileModel.updateOne resolves successfully (used by generateCycleRetrospective)
    mockKnowledgeFileUpdateOne.mockResolvedValue({});

    // AgentRunModel.find returns no integrator runs by default
    mockAgentRunFind.mockResolvedValue([]);
  });

  // ── Test 16: plan → implement: spawns coder jobs for ready tasks ──────────────

  it('transitions plan → implement and spawns coder jobs for each ready task', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'plan', status: 'active' });
    mockTaskFind.mockResolvedValue([{ _id: 'TASK-001' }, { _id: 'TASK-002' }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { phase: 'implement' } }
    );
    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:phase_changed',
      expect.objectContaining({ cycleId: CYCLE_ID, phase: 'implement', previousPhase: 'plan' })
    );
    const spawnCalls = mockJobCreate.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'spawn'
    );
    expect(spawnCalls).toHaveLength(2);
    for (const call of spawnCalls) {
      expect((call[0] as Record<string, unknown>)['payload']).toMatchObject({ role: 'coder' });
    }
  });

  // ── Test 17: implement → review: spawns reviewer jobs for in-review tasks ─────

  it('transitions implement → review and spawns reviewer jobs for in-review tasks', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'implement', status: 'active' });
    mockTaskFind.mockResolvedValue([{ _id: 'TASK-001' }, { _id: 'TASK-002' }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { phase: 'review' } }
    );
    const spawnCalls = mockJobCreate.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'spawn'
    );
    expect(spawnCalls).toHaveLength(2);
    for (const call of spawnCalls) {
      expect((call[0] as Record<string, unknown>)['payload']).toMatchObject({ role: 'reviewer' });
    }
  });

  // ── Test 18: review → integrate: spawns integrator job ───────────────────────

  it('transitions review → integrate and spawns an integrator job', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'review', status: 'active' });
    // doneTasks > 0 so the cycle does not fail
    mockTaskCountDocuments.mockResolvedValue(2);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { phase: 'integrate' } }
    );
    const spawnCalls = mockJobCreate.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'spawn'
    );
    expect(spawnCalls).toHaveLength(1);
    expect((spawnCalls[0]![0] as Record<string, unknown>)['payload']).toMatchObject({
      role: 'integrator',
    });
  });

  // ── Test 19: integrate → retrospect: creates curate-inbox job ────────────────

  it('transitions integrate → retrospect and creates a curate-inbox job', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'integrate', status: 'active' });

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      { $set: { phase: 'retrospect' } }
    );
    const curateCall = mockJobCreate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'curate-inbox'
    );
    expect(curateCall).toBeDefined();
  });

  // ── Test 20: retrospect → completed: cycle status 'completed', next-cycle job ─

  it('marks cycle completed and creates next-cycle job with requiresApproval when advancing from retrospect', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'retrospect', status: 'active' });
    // computeCycleMetrics will call countDocuments twice
    mockTaskCountDocuments.mockResolvedValue(0);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'completed' }) })
    );
    const nextCycleCall = mockJobCreate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'next-cycle'
    );
    expect(nextCycleCall).toBeDefined();
    // requiresApproval: true is passed to JobModel.create
    expect((nextCycleCall![0] as Record<string, unknown>)['requiresApproval']).toBe(true);
  });

  // ── Test 21: retrospect → completed: auto-generates retrospective knowledge file ─

  it('creates a retrospective knowledge file with task descriptions and files-changed section', async () => {
    mockCycleFindById.mockResolvedValue({
      _id: CYCLE_ID,
      phase: 'retrospect',
      status: 'active',
      goal: 'Test cycle goal',
    });
    mockTaskCountDocuments.mockResolvedValue(3);
    mockAgentRunAggregate.mockResolvedValue([{ total: 1.5 }]);
    mockTaskFind.mockResolvedValue([
      {
        _id: 'TASK-001',
        title: 'Task one',
        type: 'feature',
        status: 'done',
        prNumber: 42,
        description: 'Implements the new widget feature',
        acceptanceCriteria: ['Widget renders', 'Widget is tested'],
      },
      {
        _id: 'TASK-002',
        title: 'Task two',
        type: 'bug',
        status: 'failed',
        prNumber: undefined,
        description: 'Fixes the broken login flow',
        acceptanceCriteria: [],
      },
    ]);
    mockAgentRunFind.mockResolvedValue([
      { output: { filesChanged: ['src/widget.ts', 'src/login.ts'] } },
    ]);
    mockKnowledgeFileUpdateOne.mockResolvedValue({});

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockKnowledgeFileUpdateOne).toHaveBeenCalledWith(
      { _id: `retrospectives/cycle-${CYCLE_ID}.md` },
      expect.objectContaining({
        $set: expect.objectContaining({
          category: 'retrospectives',
          title: `Cycle ${CYCLE_ID} Retrospective`,
          content: expect.stringContaining('Implements the new widget feature'),
        }),
        $setOnInsert: expect.objectContaining({
          _id: `retrospectives/cycle-${CYCLE_ID}.md`,
        }),
      }),
      { upsert: true }
    );

    // Verify files-changed section is present
    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const content = (callArgs[1] as Record<string, Record<string, string>>)['$set']['content'];
    expect(content).toContain('## Files Changed');
    expect(content).toContain('src/widget.ts');
    expect(content).toContain('src/login.ts');

    // Verify acceptance criteria count is shown
    expect(content).toContain('2 acceptance criteria');

    // Verify Goal Assessment section is present (between header and ## Tasks)
    expect(content).toContain('## Goal Assessment');
    expect(content).toContain('Test cycle goal');
    // tasksCompleted=3 from mock, tasksTotal=2 from mockTaskFind (2 tasks)
    expect(content).toContain('3 of 2 tasks completed');
    // completion rate 3/2 >= 0.5, but 3 !== 2 → Partially achieved
    expect(content).toContain('**Verdict:** Partially achieved');
    expect(content.indexOf('## Goal Assessment')).toBeLessThan(content.indexOf('## Tasks'));

    // Verify snippet includes outcome verdict
    const snippet = (callArgs[1] as Record<string, Record<string, string>>)['$set']['snippet'];
    expect(snippet).toContain('Outcome: Partially achieved');
  });

  // ── Test 21b: retrospect → completed: omits Files Changed section when not available ─

  it('omits Files Changed section when integrator run has no filesChanged', async () => {
    mockCycleFindById.mockResolvedValue({
      _id: CYCLE_ID,
      phase: 'retrospect',
      status: 'active',
      goal: 'Test cycle goal',
    });
    mockTaskCountDocuments.mockResolvedValue(1);
    mockAgentRunAggregate.mockResolvedValue([{ total: 0.5 }]);
    mockTaskFind.mockResolvedValue([
      {
        _id: 'TASK-001',
        title: 'Task one',
        type: 'feature',
        status: 'done',
        prNumber: undefined,
        description: 'Some task description',
        acceptanceCriteria: ['Criterion one'],
      },
    ]);
    // Integrator run present but no filesChanged in output
    mockAgentRunFind.mockResolvedValue([{ output: { summary: 'Integration done' } }]);
    mockKnowledgeFileUpdateOne.mockResolvedValue({});

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const content = (callArgs[1] as Record<string, Record<string, string>>)['$set']['content'];
    expect(content).not.toContain('## Files Changed');
    // Description is still present
    expect(content).toContain('Some task description');
    // tasksCompleted=1, tasksTotal=1 → Fully achieved
    expect(content).toContain('## Goal Assessment');
    expect(content).toContain('1 of 1 tasks completed');
    expect(content).toContain('**Verdict:** Fully achieved');
    const snippet = (callArgs[1] as Record<string, Record<string, string>>)['$set']['snippet'];
    expect(snippet).toContain('Outcome: Fully achieved');
  });

  // ── Test 21c–21e: goal assessment verdict logic ───────────────────────────────

  it('sets verdict to "Fully achieved" when all tasks are completed', async () => {
    mockCycleFindById.mockResolvedValue({
      _id: CYCLE_ID,
      phase: 'retrospect',
      status: 'active',
      goal: 'Build all features',
    });
    // 3 tasks completed, 0 failed
    mockTaskCountDocuments.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    mockAgentRunAggregate.mockResolvedValue([{ total: 0 }]);
    mockTaskFind.mockResolvedValue([
      { _id: 'TASK-001', title: 'T1', type: 'feature', status: 'done' },
      { _id: 'TASK-002', title: 'T2', type: 'feature', status: 'done' },
      { _id: 'TASK-003', title: 'T3', type: 'feature', status: 'done' },
    ]);
    mockAgentRunFind.mockResolvedValue([]);
    mockKnowledgeFileUpdateOne.mockResolvedValue({});

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const content = (callArgs[1] as Record<string, Record<string, string>>)['$set']['content'];
    expect(content).toContain('3 of 3 tasks completed');
    expect(content).toContain('**Verdict:** Fully achieved');
    const snippet = (callArgs[1] as Record<string, Record<string, string>>)['$set']['snippet'];
    expect(snippet).toContain('Outcome: Fully achieved');
  });

  it('sets verdict to "Partially achieved" when ≥50% but not all tasks completed', async () => {
    mockCycleFindById.mockResolvedValue({
      _id: CYCLE_ID,
      phase: 'retrospect',
      status: 'active',
      goal: 'Build some features',
    });
    // 2 of 4 tasks completed (50%)
    mockTaskCountDocuments.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    mockAgentRunAggregate.mockResolvedValue([{ total: 0 }]);
    mockTaskFind.mockResolvedValue([
      { _id: 'TASK-001', title: 'T1', type: 'feature', status: 'done' },
      { _id: 'TASK-002', title: 'T2', type: 'feature', status: 'done' },
      { _id: 'TASK-003', title: 'T3', type: 'feature', status: 'failed' },
      { _id: 'TASK-004', title: 'T4', type: 'feature', status: 'failed' },
    ]);
    mockAgentRunFind.mockResolvedValue([]);
    mockKnowledgeFileUpdateOne.mockResolvedValue({});

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const content = (callArgs[1] as Record<string, Record<string, string>>)['$set']['content'];
    expect(content).toContain('2 of 4 tasks completed');
    expect(content).toContain('**Verdict:** Partially achieved');
    const snippet = (callArgs[1] as Record<string, Record<string, string>>)['$set']['snippet'];
    expect(snippet).toContain('Outcome: Partially achieved');
  });

  it('sets verdict to "Not achieved" when <50% of tasks completed', async () => {
    mockCycleFindById.mockResolvedValue({
      _id: CYCLE_ID,
      phase: 'retrospect',
      status: 'active',
      goal: 'Build many features',
    });
    // 1 of 4 tasks completed (25%)
    mockTaskCountDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(3);
    mockAgentRunAggregate.mockResolvedValue([{ total: 0 }]);
    mockTaskFind.mockResolvedValue([
      { _id: 'TASK-001', title: 'T1', type: 'feature', status: 'done' },
      { _id: 'TASK-002', title: 'T2', type: 'feature', status: 'failed' },
      { _id: 'TASK-003', title: 'T3', type: 'feature', status: 'failed' },
      { _id: 'TASK-004', title: 'T4', type: 'feature', status: 'failed' },
    ]);
    mockAgentRunFind.mockResolvedValue([]);
    mockKnowledgeFileUpdateOne.mockResolvedValue({});

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const content = (callArgs[1] as Record<string, Record<string, string>>)['$set']['content'];
    expect(content).toContain('1 of 4 tasks completed');
    expect(content).toContain('**Verdict:** Not achieved');
    const snippet = (callArgs[1] as Record<string, Record<string, string>>)['$set']['snippet'];
    expect(snippet).toContain('Outcome: Not achieved');
  });

  // ── Test 22: integrate with zero done tasks → cycle failed, next-cycle job ────

  it('marks cycle failed and creates next-cycle job when advancing to integrate with zero done tasks', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'review', status: 'active' });
    // doneTasks === 0 triggers failure path
    mockTaskCountDocuments.mockResolvedValue(0);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'failed' }) })
    );
    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:failed',
      expect.objectContaining({ cycleId: CYCLE_ID })
    );
    const nextCycleCall = mockJobCreate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'next-cycle'
    );
    expect(nextCycleCall).toBeDefined();
    // No phase update should have been applied
    const phaseUpdateCalls = mockCycleUpdateOne.mock.calls.filter(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['phase'] !==
          undefined
    );
    expect(phaseUpdateCalls).toHaveLength(0);
  });
});

// ─── detectAndFailStaleJobs tests ─────────────────────────────────────────────

describe('detectAndFailStaleJobs', () => {
  const CODER_TIMEOUT_MS = 1_800_000; // 30 minutes (config default)
  const INFRA_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  /** Build a minimal active job document */
  function makeActiveJob(overrides: {
    id?: string;
    type?: string;
    pool?: string;
    role?: string;
    startedAt?: Date;
  }) {
    const id = overrides.id ?? 'job-stale-001';
    return {
      _id: { toString: () => id },
      type: overrides.type ?? 'spawn',
      pool: overrides.pool ?? 'agent',
      status: 'active',
      payload: overrides.role ? { role: overrides.role } : {},
      startedAt: overrides.startedAt ?? new Date(Date.now() - CODER_TIMEOUT_MS - 1000),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockJobUpdateOne.mockResolvedValue({});
    // Default: no active jobs
    mockJobFind.mockReturnValue({ lean: () => Promise.resolve([]) });
  });

  // ── Test A: fresh active job is NOT marked stale ───────────────────────────

  it('does not fail a fresh active spawn job that has not exceeded its timeout', async () => {
    const freshJob = makeActiveJob({
      type: 'spawn',
      role: 'coder',
      startedAt: new Date(Date.now() - 1000), // 1 second ago — well within timeout
    });
    mockJobFind.mockReturnValue({ lean: () => Promise.resolve([freshJob]) });

    await detectAndFailStaleJobs();

    expect(mockJobUpdateOne).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  // ── Test B: aged spawn job exceeding role timeout IS marked failed ─────────

  it('marks a coder spawn job failed when it exceeds CODER_TIMEOUT_MS', async () => {
    const staleJob = makeActiveJob({
      id: 'job-stale-coder',
      type: 'spawn',
      pool: 'agent',
      role: 'coder',
      startedAt: new Date(Date.now() - CODER_TIMEOUT_MS - 5000), // exceeded by 5s
    });
    mockJobFind.mockReturnValue({ lean: () => Promise.resolve([staleJob]) });

    await detectAndFailStaleJobs();

    // Job should be marked failed with failedReason
    expect(mockJobUpdateOne).toHaveBeenCalledWith(
      { _id: staleJob._id },
      {
        $set: {
          status: 'failed',
          failedReason: 'timeout — stale job detected',
          completedAt: expect.any(Date),
        },
      }
    );

    // SSE broadcast should have been emitted
    expect(mockBroadcast).toHaveBeenCalledWith(
      'job:failed',
      expect.objectContaining({
        jobId: 'job-stale-coder',
        type: 'spawn',
        reason: 'timeout — stale job detected',
      })
    );

    // Structured warn log should have been emitted
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-stale-coder', type: 'spawn', role: 'coder' }),
      'Stale job detected and failed'
    );
  });

  // ── Test C: aged infra job exceeding 10 minutes IS marked failed ───────────

  it('marks an infra job failed when it exceeds the 10-minute infra timeout', async () => {
    const staleInfraJob = makeActiveJob({
      id: 'job-stale-infra',
      type: 'advance-cycle',
      pool: 'infra',
      startedAt: new Date(Date.now() - INFRA_TIMEOUT_MS - 1000), // exceeded by 1s
    });
    mockJobFind.mockReturnValue({ lean: () => Promise.resolve([staleInfraJob]) });

    await detectAndFailStaleJobs();

    expect(mockJobUpdateOne).toHaveBeenCalledWith(
      { _id: staleInfraJob._id },
      {
        $set: {
          status: 'failed',
          failedReason: 'timeout — stale job detected',
          completedAt: expect.any(Date),
        },
      }
    );

    expect(mockBroadcast).toHaveBeenCalledWith(
      'job:failed',
      expect.objectContaining({
        jobId: 'job-stale-infra',
        type: 'advance-cycle',
        reason: 'timeout — stale job detected',
      })
    );

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-stale-infra', type: 'advance-cycle' }),
      'Stale job detected and failed'
    );
  });

  // ── Test D: curate-inbox job exceeding agent timeout IS marked stale ─────────
  // Regression guard: curate-inbox must use the agent-level timeout (coderTimeoutMs),
  // not the 10-minute infra timeout. A regression would make this test fail because
  // a 9-minute-old job would incorrectly be failed.

  it('curate-inbox job exceeding agent timeout is marked stale', async () => {
    const staleJob = makeActiveJob({
      id: 'job-stale-curate',
      type: 'curate-inbox',
      pool: 'agent',
      // No role field — curate-inbox payload contains only cycleId in production
      startedAt: new Date(Date.now() - CODER_TIMEOUT_MS - 1),
    });
    // curate-inbox payload has no 'role' key, so set it explicitly
    staleJob.payload = { cycleId: 9 };
    mockJobFind.mockReturnValue({ lean: () => Promise.resolve([staleJob]) });

    await detectAndFailStaleJobs();

    expect(mockJobUpdateOne).toHaveBeenCalledWith(
      { _id: staleJob._id },
      {
        $set: {
          status: 'failed',
          failedReason: 'timeout — stale job detected',
          completedAt: expect.any(Date),
        },
      }
    );

    expect(mockBroadcast).toHaveBeenCalledWith(
      'job:failed',
      expect.objectContaining({
        jobId: 'job-stale-curate',
        type: 'curate-inbox',
        reason: 'timeout — stale job detected',
      })
    );

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-stale-curate', type: 'curate-inbox' }),
      'Stale job detected and failed'
    );
  });

  // ── Test E: curate-inbox job under 9 minutes is NOT marked stale ─────────────
  // 9 minutes is below both the infra timeout (10 min) and the agent timeout
  // (coderTimeoutMs = 30 min), so the job must survive either way.

  it('curate-inbox job started 9 minutes ago is NOT failed', async () => {
    const nineMinutesMs = 9 * 60 * 1000;
    const freshJob = makeActiveJob({
      id: 'job-fresh-curate',
      type: 'curate-inbox',
      pool: 'agent',
      startedAt: new Date(Date.now() - nineMinutesMs),
    });
    freshJob.payload = { cycleId: 9 };
    mockJobFind.mockReturnValue({ lean: () => Promise.resolve([freshJob]) });

    await detectAndFailStaleJobs();

    expect(mockJobUpdateOne).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  // ── Test F: curate-inbox job between infra and agent timeout is NOT stale ─────
  // This is the core regression guard: a job that is 11 minutes old sits between
  // the old infra timeout (10 min) and the correct agent timeout (coderTimeoutMs
  // = 30 min). Under the old (broken) logic it would have been failed; under the
  // fixed logic it must NOT be failed.

  it('curate-inbox job between infra timeout and agent timeout is NOT failed', async () => {
    const elevenMinutesMs = 11 * 60 * 1000;
    const midRangeJob = makeActiveJob({
      id: 'job-midrange-curate',
      type: 'curate-inbox',
      pool: 'agent',
      startedAt: new Date(Date.now() - elevenMinutesMs),
    });
    midRangeJob.payload = { cycleId: 9 };
    mockJobFind.mockReturnValue({ lean: () => Promise.resolve([midRangeJob]) });

    await detectAndFailStaleJobs();

    expect(mockJobUpdateOne).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });
});

// ─── handleCleanupPRs tests ───────────────────────────────────────────────────

describe('handleCleanupPRs', () => {
  const CYCLE_ID = 5;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCloseStalePRs.mockResolvedValue(undefined);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });
  });

  // ── Test A: stale PR numbers are passed to closeStalePRs ──────────────────

  it('closes stale PRs that are not in the merged set', async () => {
    // Tasks: task1 is done with PR 10 (merged), task2 is failed with no PR
    mockTaskFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'TASK-001', status: 'done', prNumber: 10 },
        { _id: 'TASK-002', status: 'failed', prNumber: undefined },
      ]),
    });
    // Agent runs: coder runs for PRs 10, 20, 30
    mockAgentRunFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'run-1', prNumber: 10 },
        { _id: 'run-2', prNumber: 20 },
        { _id: 'run-3', prNumber: 30 },
      ]),
    });

    await handleCleanupPRs({ cycleId: CYCLE_ID });

    // PR 10 is merged (done task), so only 20 and 30 are stale
    expect(mockCloseStalePRs).toHaveBeenCalledWith(expect.arrayContaining([20, 30]));
    const stalePRsArg = mockCloseStalePRs.mock.calls[0]![0] as number[];
    expect(stalePRsArg).not.toContain(10);
  });

  // ── Test B: no closeStalePRs call when all PRs are merged ─────────────────

  it('does not call closeStalePRs when all PRs belong to done tasks', async () => {
    // Task done with PR 42
    mockTaskFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'TASK-003', status: 'done', prNumber: 42 }]),
    });
    // Agent run with the same PR 42
    mockAgentRunFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'run-4', prNumber: 42 }]),
    });

    await handleCleanupPRs({ cycleId: CYCLE_ID });

    expect(mockCloseStalePRs).not.toHaveBeenCalled();
  });

  // ── Test C: no agent runs → no stale PRs → closeStalePRs not called ───────

  it('does not call closeStalePRs when there are no coder agent runs with PRs', async () => {
    mockTaskFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockAgentRunFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

    await handleCleanupPRs({ cycleId: CYCLE_ID });

    expect(mockCloseStalePRs).not.toHaveBeenCalled();
  });
});

// ─── handleNextCycle tests ────────────────────────────────────────────────────

describe('handleNextCycle', () => {
  const NEW_CYCLE_ID = 7;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNextCycleId.mockResolvedValue(NEW_CYCLE_ID);
    mockCycleCreate.mockResolvedValue({});
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });
  });

  // ── Test A: creates cycle with status 'active' ─────────────────────────────

  it('creates a new cycle document with status active and phase plan', async () => {
    await handleNextCycle({});

    expect(mockCycleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: NEW_CYCLE_ID,
        phase: 'plan',
        status: 'active',
      })
    );
  });

  // ── Test B: creates orchestrator spawn job ─────────────────────────────────

  it('creates a spawn job for the orchestrator role', async () => {
    await handleNextCycle({});

    const spawnCall = mockJobCreate.mock.calls.find((call) => {
      const doc = call[0] as Record<string, unknown>;
      const payload = doc['payload'] as Record<string, unknown>;
      return doc['type'] === 'spawn' && payload['role'] === 'orchestrator';
    });
    expect(spawnCall).toBeDefined();
    const payload = (spawnCall![0] as Record<string, unknown>)['payload'] as Record<
      string,
      unknown
    >;
    expect(payload['cycleId']).toBe(NEW_CYCLE_ID);
  });

  // ── Test C: throws when system is paused ──────────────────────────────────

  it('throws when control mode is paused', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'paused',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });

    await expect(handleNextCycle({})).rejects.toThrow('System is paused');

    expect(mockCycleCreate).not.toHaveBeenCalled();
  });
});

// ─── handleReload tests ───────────────────────────────────────────────────────

describe('handleReload', () => {
  const CYCLE_ID = 3;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
  });

  // ── Test A: writes trigger file to RELOAD_TRIGGER_PATH ────────────────────

  it('writes the trigger file to RELOAD_TRIGGER_PATH', async () => {
    await handleReload({ cycleId: CYCLE_ID });

    expect(mockWriteFile).toHaveBeenCalledWith(RELOAD_TRIGGER_PATH, expect.any(String), 'utf-8');
  });

  // ── Test B: broadcasts system:reload_triggered SSE event ──────────────────

  it('broadcasts system:reload_triggered SSE event with cycleId', async () => {
    await handleReload({ cycleId: CYCLE_ID });

    expect(mockBroadcast).toHaveBeenCalledWith('system:reload_triggered', { cycleId: CYCLE_ID });
  });
});

// ─── createJob auto-approval tests ───────────────────────────────────────────

describe('createJob auto-approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
  });

  // ── Test A: coder task not in autoApprovalCategories → requiresApproval ───

  it('sets requiresApproval: true for coder tasks whose type is not in autoApprovalCategories', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: ['feature'], // 'chore' not included
    });
    // Task with type 'chore'
    mockTaskFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'TASK-010', type: 'chore', cycleId: 1 }),
    });

    await createJob('spawn', 'agent', { role: 'coder', taskId: 'TASK-010', cycleId: 1 });

    const createCall = mockJobCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(createCall['requiresApproval']).toBe(true);
  });

  // ── Test B: coder task in autoApprovalCategories → no requiresApproval ────

  it('does not set requiresApproval for coder tasks whose type is in autoApprovalCategories', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: ['feature'],
    });
    // Task with type 'feature' — matches autoApprovalCategories
    mockTaskFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'TASK-011', type: 'feature', cycleId: 1 }),
    });

    await createJob('spawn', 'agent', { role: 'coder', taskId: 'TASK-011', cycleId: 1 });

    const createCall = mockJobCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(createCall['requiresApproval']).toBe(false);
  });

  // ── Test C: apply-plan always gets requiresApproval: true ─────────────────

  it('always sets requiresApproval: true for apply-plan jobs', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: ['feature', 'chore', 'bug', 'test'], // even with all types approved
    });

    await createJob('apply-plan', 'infra', { agentRunId: 'run-001', cycleId: 1 });

    const createCall = mockJobCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(createCall['requiresApproval']).toBe(true);
  });
});

// ─── generateCycleRetrospective tests (via handleAdvanceCycle from retrospect) ─

describe('generateCycleRetrospective', () => {
  const CYCLE_ID = 5;
  const CYCLE_GOAL = 'Build the new payments module';

  beforeEach(() => {
    vi.clearAllMocks();

    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockCycleUpdateOne.mockResolvedValue({});
    mockTaskCountDocuments.mockResolvedValue(0);
    mockAgentRunAggregate.mockResolvedValue([]);
    mockKnowledgeFileUpdateOne.mockResolvedValue({});
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    // Cycle in retrospect phase with a stated goal
    mockCycleFindById.mockResolvedValue({
      _id: CYCLE_ID,
      phase: 'retrospect',
      status: 'active',
      goal: CYCLE_GOAL,
    });
  });

  // ── Test: KnowledgeFileModel.updateOne called with correct category ──────────

  it('calls KnowledgeFileModel.updateOne with category: retrospectives', async () => {
    mockTaskFind.mockResolvedValue([]);
    mockAgentRunFind.mockResolvedValue([]);
    mockTaskCountDocuments.mockResolvedValue(0);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockKnowledgeFileUpdateOne).toHaveBeenCalledWith(
      { _id: `retrospectives/cycle-${CYCLE_ID}.md` },
      expect.objectContaining({
        $set: expect.objectContaining({
          category: 'retrospectives',
        }),
      }),
      { upsert: true }
    );
  });

  // ── Test: title contains the cycle ID ────────────────────────────────────────

  it('calls KnowledgeFileModel.updateOne with a title containing the cycle ID', async () => {
    mockTaskFind.mockResolvedValue([]);
    mockAgentRunFind.mockResolvedValue([]);
    mockTaskCountDocuments.mockResolvedValue(0);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const setDoc = (callArgs![1] as Record<string, Record<string, string>>)['$set'];
    expect(setDoc['title']).toContain(String(CYCLE_ID));
  });

  // ── Test: content includes task titles ────────────────────────────────────────

  it('includes task titles in the retrospective markdown content', async () => {
    mockTaskFind.mockResolvedValue([
      {
        _id: 'TASK-010',
        title: 'Implement payment gateway',
        type: 'feature',
        status: 'done',
        prNumber: 77,
        description: 'Integrates the payment gateway API',
        acceptanceCriteria: ['API connected', 'Tests pass'],
      },
      {
        _id: 'TASK-011',
        title: 'Write integration tests',
        type: 'test',
        status: 'done',
        prNumber: 78,
        description: 'Adds full integration test coverage',
        acceptanceCriteria: [],
      },
    ]);
    mockAgentRunFind.mockResolvedValue([]);
    mockTaskCountDocuments.mockResolvedValue(2);
    mockAgentRunAggregate.mockResolvedValue([{ total: 0.8 }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const content = (callArgs![1] as Record<string, Record<string, string>>)['$set']['content'];
    expect(content).toContain('Implement payment gateway');
    expect(content).toContain('Write integration tests');
    expect(content).toContain('TASK-010');
    expect(content).toContain('TASK-011');
  });

  // ── Test: content includes ## Goal Assessment section with goal and verdict ──

  it('includes ## Goal Assessment section with goal string and verdict', async () => {
    mockTaskFind.mockResolvedValue([
      {
        _id: 'TASK-010',
        title: 'Payment gateway',
        type: 'feature',
        status: 'done',
        prNumber: 77,
        description: 'Integrates the gateway',
        acceptanceCriteria: [],
      },
      {
        _id: 'TASK-011',
        title: 'Tests',
        type: 'test',
        status: 'done',
        prNumber: 78,
        description: 'Test coverage',
        acceptanceCriteria: [],
      },
    ]);
    mockAgentRunFind.mockResolvedValue([]);
    mockTaskCountDocuments.mockResolvedValue(2);
    mockAgentRunAggregate.mockResolvedValue([{ total: 1.0 }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const content = (callArgs![1] as Record<string, Record<string, string>>)['$set']['content'];
    expect(content).toContain('## Goal Assessment');
    expect(content).toContain(CYCLE_GOAL);
    // All tasks done → Fully achieved
    expect(content).toContain('Fully achieved');
  });

  // ── Test: Goal Assessment verdict = "Partially achieved" when ≥50% done ─────

  it('uses "Partially achieved" verdict when at least half of tasks are completed', async () => {
    mockTaskFind.mockResolvedValue([
      {
        _id: 'TASK-010',
        title: 'Done task',
        type: 'feature',
        status: 'done',
        prNumber: 10,
        description: 'A done task',
        acceptanceCriteria: [],
      },
      {
        _id: 'TASK-011',
        title: 'Failed task',
        type: 'feature',
        status: 'failed',
        prNumber: undefined,
        description: 'A failed task',
        acceptanceCriteria: [],
      },
    ]);
    mockAgentRunFind.mockResolvedValue([]);
    // 1 done, 1 failed → countDocuments returns 1 for done
    mockTaskCountDocuments.mockResolvedValue(1);
    mockAgentRunAggregate.mockResolvedValue([{ total: 0.5 }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const content = (callArgs![1] as Record<string, Record<string, string>>)['$set']['content'];
    expect(content).toContain('## Goal Assessment');
    expect(content).toContain('Partially achieved');
  });

  // ── Test: Goal Assessment verdict = "Not achieved" when <50% done ────────────

  it('uses "Not achieved" verdict when fewer than half of tasks are completed', async () => {
    mockTaskFind.mockResolvedValue([
      {
        _id: 'TASK-010',
        title: 'Done task',
        type: 'feature',
        status: 'done',
        prNumber: 10,
        description: 'A done task',
        acceptanceCriteria: [],
      },
      {
        _id: 'TASK-011',
        title: 'Failed task 1',
        type: 'feature',
        status: 'failed',
        prNumber: undefined,
        description: 'A failed task',
        acceptanceCriteria: [],
      },
      {
        _id: 'TASK-012',
        title: 'Failed task 2',
        type: 'feature',
        status: 'failed',
        prNumber: undefined,
        description: 'Another failed task',
        acceptanceCriteria: [],
      },
    ]);
    mockAgentRunFind.mockResolvedValue([]);
    // 1 done out of 3 — below 50%
    mockTaskCountDocuments.mockResolvedValue(1);
    mockAgentRunAggregate.mockResolvedValue([{ total: 0.3 }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const content = (callArgs![1] as Record<string, Record<string, string>>)['$set']['content'];
    expect(content).toContain('## Goal Assessment');
    expect(content).toContain('Not achieved');
  });

  // ── Test: content includes ## Metrics section ─────────────────────────────────

  it('includes ## Metrics section with task counts and cost', async () => {
    mockTaskFind.mockResolvedValue([
      {
        _id: 'TASK-020',
        title: 'Task alpha',
        type: 'chore',
        status: 'done',
        prNumber: 5,
        description: 'A task',
        acceptanceCriteria: [],
      },
    ]);
    mockAgentRunFind.mockResolvedValue([]);
    mockTaskCountDocuments.mockResolvedValue(1);
    mockAgentRunAggregate.mockResolvedValue([{ total: 2.5 }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const callArgs = mockKnowledgeFileUpdateOne.mock.calls[0];
    const content = (callArgs![1] as Record<string, Record<string, string>>)['$set']['content'];
    expect(content).toContain('## Metrics');
    expect(content).toContain('Tasks completed:');
    expect(content).toContain('Tasks failed:');
    expect(content).toContain('Total cost:');
  });
});

// ─── handleAdvanceCycle: zero-tasks-completed before integrate ────────────────

describe('handleAdvanceCycle — zero tasks completed before integrate', () => {
  const CYCLE_ID = 9;

  beforeEach(() => {
    vi.clearAllMocks();

    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockCycleUpdateOne.mockResolvedValue({});
    mockAgentRunAggregate.mockResolvedValue([]);
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockKnowledgeFileUpdateOne.mockResolvedValue({});
  });

  // ── Test: cycle status set to 'failed' when zero done tasks before integrate ─

  it('marks cycle status failed when advancing from review with zero completed tasks', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'review', status: 'active' });
    // zero done tasks
    mockTaskCountDocuments.mockResolvedValue(0);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'failed' }) })
    );
  });

  // ── Test: cycle:failed SSE event emitted with previousPhase ─────────────────

  it('broadcasts cycle:failed SSE event with previousPhase when zero tasks completed', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'review', status: 'active' });
    mockTaskCountDocuments.mockResolvedValue(0);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:failed',
      expect.objectContaining({ cycleId: CYCLE_ID, previousPhase: 'review' })
    );
  });

  // ── Test: no phase update applied when cycle fails before integrate ───────────

  it('does not update the cycle phase when the cycle fails before integrate', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'review', status: 'active' });
    mockTaskCountDocuments.mockResolvedValue(0);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const phaseUpdateCalls = mockCycleUpdateOne.mock.calls.filter(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['phase'] !==
          undefined
    );
    expect(phaseUpdateCalls).toHaveLength(0);
  });

  // ── Test: next-cycle job created when cycle fails before integrate ────────────

  it('creates a next-cycle job requiring approval when cycle fails before integrate', async () => {
    mockCycleFindById.mockResolvedValue({ _id: CYCLE_ID, phase: 'review', status: 'active' });
    mockTaskCountDocuments.mockResolvedValue(0);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    const nextCycleCall = mockJobCreate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'next-cycle'
    );
    expect(nextCycleCall).toBeDefined();
    expect((nextCycleCall![0] as Record<string, unknown>)['requiresApproval']).toBe(true);
  });
});

// ─── handleAdvanceCycle: partial task failure ─────────────────────────────────

describe('handleAdvanceCycle — partial task failure metrics', () => {
  const CYCLE_ID = 11;

  beforeEach(() => {
    vi.clearAllMocks();

    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockCycleUpdateOne.mockResolvedValue({});
    mockTaskFind.mockResolvedValue([]);
    mockKnowledgeFileUpdateOne.mockResolvedValue({});
    mockAgentRunFind.mockResolvedValue([]);
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  // ── Test: cycle completes with correct tasksCompleted/tasksFailed split ───────

  it('marks cycle completed with correct tasksCompleted and tasksFailed when some tasks failed', async () => {
    mockCycleFindById.mockResolvedValue({
      _id: CYCLE_ID,
      phase: 'retrospect',
      status: 'active',
      goal: 'Partial success cycle',
    });

    // 3 done, 2 failed
    mockTaskCountDocuments
      .mockResolvedValueOnce(3) // tasksCompleted (status: 'done')
      .mockResolvedValueOnce(2); // tasksFailed (status: 'failed')

    mockAgentRunAggregate.mockResolvedValue([{ total: 1.2 }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockCycleUpdateOne).toHaveBeenCalledWith(
      { _id: CYCLE_ID },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'completed',
          metrics: expect.objectContaining({
            tasksCompleted: 3,
            tasksFailed: 2,
          }),
        }),
      })
    );
  });

  // ── Test: cycle:completed SSE event carries correct metrics split ─────────────

  it('emits cycle:completed SSE with the correct tasksCompleted and tasksFailed metrics', async () => {
    mockCycleFindById.mockResolvedValue({
      _id: CYCLE_ID,
      phase: 'retrospect',
      status: 'active',
      goal: 'Partial success cycle',
    });

    // 4 done, 1 failed
    mockTaskCountDocuments
      .mockResolvedValueOnce(4) // done
      .mockResolvedValueOnce(1); // failed

    mockAgentRunAggregate.mockResolvedValue([{ total: 2.0 }]);

    await handleAdvanceCycle({ cycleId: CYCLE_ID });

    expect(mockBroadcast).toHaveBeenCalledWith(
      'cycle:completed',
      expect.objectContaining({
        cycleId: CYCLE_ID,
        metrics: expect.objectContaining({
          tasksCompleted: 4,
          tasksFailed: 1,
        }),
      })
    );
  });
});

// ─── computeCycleMetrics — goalCoverage tests ─────────────────────────────────

describe('computeCycleMetrics — goalCoverage', () => {
  const CYCLE_ID = 99;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: zero tasks, zero cost/duration
    mockTaskCountDocuments.mockResolvedValue(0);
    mockAgentRunAggregate.mockResolvedValue([]);
    // Default: no completed tasks (titles)
    mockTaskFind.mockResolvedValue([]);
  });

  // ── goalCoverage = 1.0 when all goal keywords appear in completed task titles ─

  it('computes goalCoverage of 1.0 when all goal keywords appear in completed task titles', async () => {
    // 'add' is 3 chars → filtered; 'streaming' and 'pipeline' are kept as keywords
    const goalString = 'add streaming pipeline';

    mockTaskCountDocuments
      .mockResolvedValueOnce(2) // tasksCompleted
      .mockResolvedValueOnce(0); // tasksFailed

    // Completed tasks whose titles contain all goal keywords
    mockTaskFind.mockResolvedValue([
      { title: 'Implement streaming capture' },
      { title: 'Build pipeline processor' },
    ]);

    const metrics = await computeCycleMetrics(CYCLE_ID, goalString);

    expect(metrics.goalCoverage).toBeCloseTo(1.0);
  });

  // ── goalCoverage = 0.0 when no goal keywords appear in completed task titles ──

  it('computes goalCoverage of 0.0 when no goal keywords appear in completed task titles', async () => {
    // 'improve' is in GOAL_STOP_WORDS; 'streaming' and 'pipeline' are keywords
    const goalString = 'improve streaming pipeline';

    mockTaskCountDocuments
      .mockResolvedValueOnce(2) // tasksCompleted
      .mockResolvedValueOnce(0); // tasksFailed

    // Completed tasks whose titles do NOT contain 'streaming' or 'pipeline'
    mockTaskFind.mockResolvedValue([
      { title: 'Fix broken login flow' },
      { title: 'Refactor config loader' },
    ]);

    const metrics = await computeCycleMetrics(CYCLE_ID, goalString);

    expect(metrics.goalCoverage).toBe(0.0);
  });

  // ── goalCoverage defaults to 1.0 when extractGoalKeywords finds no keywords ──

  it('defaults goalCoverage to 1.0 when the goal contains only stop words and short tokens', async () => {
    // All tokens are ≤3 chars or stop words → extractGoalKeywords returns []
    const goalString = 'the and for';

    mockTaskCountDocuments.mockResolvedValue(0);
    mockTaskFind.mockResolvedValue([]);

    const metrics = await computeCycleMetrics(CYCLE_ID, goalString);

    expect(metrics.goalCoverage).toBe(1.0);
  });

  // ── camelCase goal term matches kebab-case task title ─────────────────────

  it('gives goalCoverage > 0 when goal contains camelCase term matching a kebab-case task title', async () => {
    // 'contextBuilder' expands to 'context builder' → keywords ['context', 'builder']
    const goalString = 'fix contextBuilder performance';

    mockTaskCountDocuments
      .mockResolvedValueOnce(1) // tasksCompleted
      .mockResolvedValueOnce(0); // tasksFailed

    // Task title uses kebab-case — 'context-builder' splits to 'context' and 'builder'
    mockTaskFind.mockResolvedValue([{ title: 'Improve context-builder caching' }]);

    const metrics = await computeCycleMetrics(CYCLE_ID, goalString);

    expect(metrics.goalCoverage).toBeGreaterThan(0);
  });
});

// ─── computeCycleMetrics — tasksRetried / tasksPassedFirstReview ───────────────

describe('computeCycleMetrics — tasksRetried and tasksPassedFirstReview', () => {
  const CYCLE_ID = 100;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskCountDocuments.mockResolvedValue(0);
    mockTaskFind.mockResolvedValue([]);
    mockAgentRunAggregate.mockResolvedValue([]);
  });

  // ── both fields computed correctly for a mix of first-pass and retried tasks ─

  it('computes tasksRetried and tasksPassedFirstReview for a mix of first-pass and retried tasks', async () => {
    // 2 done tasks, 1 failed task
    mockTaskCountDocuments
      .mockResolvedValueOnce(2) // done
      .mockResolvedValueOnce(1); // failed

    // Completed tasks: TASK-001 and TASK-002
    mockTaskFind.mockResolvedValue([
      { _id: 'TASK-001', title: 'Implement feature' },
      { _id: 'TASK-002', title: 'Fix bug' },
    ]);

    // Aggregates in Promise.all order: cost, duration, coder run counts
    mockAgentRunAggregate
      .mockResolvedValueOnce([]) // cost
      .mockResolvedValueOnce([]) // duration
      .mockResolvedValueOnce([
        { _id: 'TASK-001', count: 1 }, // done, passed first review
        { _id: 'TASK-002', count: 2 }, // done, retried once
        { _id: 'TASK-003', count: 1 }, // failed task — not in done set
      ]);

    const metrics = await computeCycleMetrics(CYCLE_ID, '');

    // TASK-002 had count > 1
    expect(metrics.tasksRetried).toBe(1);
    // TASK-001: done + count === 1
    expect(metrics.tasksPassedFirstReview).toBe(1);
  });

  // ── fields are absent when no coder AgentRun data exists ──────────────────

  it('returns undefined for tasksRetried and tasksPassedFirstReview when no coder AgentRun data exists', async () => {
    mockTaskCountDocuments.mockResolvedValue(0);
    mockTaskFind.mockResolvedValue([]);
    // All aggregates return empty (default from beforeEach)
    mockAgentRunAggregate.mockResolvedValue([]);

    const metrics = await computeCycleMetrics(CYCLE_ID, '');

    expect(metrics.tasksRetried).toBeUndefined();
    expect(metrics.tasksPassedFirstReview).toBeUndefined();
  });

  // ── all tasks pass on first attempt ──────────────────────────────────────

  it('sets tasksRetried to 0 and tasksPassedFirstReview equals done count when all tasks pass first review', async () => {
    mockTaskCountDocuments
      .mockResolvedValueOnce(3) // done
      .mockResolvedValueOnce(0); // failed

    mockTaskFind.mockResolvedValue([
      { _id: 'TASK-010', title: 'Task ten' },
      { _id: 'TASK-011', title: 'Task eleven' },
      { _id: 'TASK-012', title: 'Task twelve' },
    ]);

    mockAgentRunAggregate
      .mockResolvedValueOnce([]) // cost
      .mockResolvedValueOnce([]) // duration
      .mockResolvedValueOnce([
        { _id: 'TASK-010', count: 1 },
        { _id: 'TASK-011', count: 1 },
        { _id: 'TASK-012', count: 1 },
      ]);

    const metrics = await computeCycleMetrics(CYCLE_ID, '');

    expect(metrics.tasksRetried).toBe(0);
    expect(metrics.tasksPassedFirstReview).toBe(3);
  });
});

// ─── handleSpawn tests ────────────────────────────────────────────────────────

describe('handleSpawn', () => {
  const CYCLE_ID = 7;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnAgent.mockResolvedValue(undefined);
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
  });

  // ── Test A: throws when spending cap is reached ───────────────────────────

  it('throws "Spending cap reached" when spentUsd >= spendingCapUsd', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: 5.0,
      spentUsd: 5.0, // exactly at cap
      autoApprovalCategories: [],
    });

    await expect(
      handleSpawn({ role: 'coder', taskId: 'TASK-001', cycleId: CYCLE_ID })
    ).rejects.toThrow('Spending cap reached');

    expect(mockSpawnAgent).not.toHaveBeenCalled();
  });

  it('throws "Spending cap reached" when spentUsd exceeds spendingCapUsd', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: 5.0,
      spentUsd: 6.5, // over cap
      autoApprovalCategories: [],
    });

    await expect(
      handleSpawn({ role: 'coder', taskId: 'TASK-001', cycleId: CYCLE_ID })
    ).rejects.toThrow('Spending cap reached');

    expect(mockSpawnAgent).not.toHaveBeenCalled();
  });

  // ── Test B: calls spawnAgent when spending is under cap ───────────────────

  it('calls spawnAgent when spentUsd is below spendingCapUsd', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: 5.0,
      spentUsd: 2.5, // well under cap
      autoApprovalCategories: [],
    });

    await handleSpawn({ role: 'coder', taskId: 'TASK-002', cycleId: CYCLE_ID });

    expect(mockSpawnAgent).toHaveBeenCalledOnce();
    expect(mockSpawnAgent).toHaveBeenCalledWith({
      role: 'coder',
      taskId: 'TASK-002',
      cycleId: CYCLE_ID,
      retryContext: undefined,
    });
  });

  it('calls spawnAgent when spendingCapUsd is null (no cap set)', async () => {
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 999,
      autoApprovalCategories: [],
    });

    await handleSpawn({ role: 'orchestrator', cycleId: CYCLE_ID });

    expect(mockSpawnAgent).toHaveBeenCalledOnce();
    expect(mockSpawnAgent).toHaveBeenCalledWith({
      role: 'orchestrator',
      taskId: undefined,
      cycleId: CYCLE_ID,
      retryContext: undefined,
    });
  });
});

// ─── handleCurateInbox tests ──────────────────────────────────────────────────

describe('handleCurateInbox', () => {
  const CYCLE_ID = 4;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: inbox is empty
    mockKnowledgeFileCountDocuments.mockResolvedValue(0);

    // Default: fs.access resolves (Docker path accessible)
    mockFsAccess.mockResolvedValue(undefined);

    // createJob (via JobModel.create) succeeds
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });

    // spawnAgent succeeds
    mockSpawnAgent.mockResolvedValue(undefined);

    // getOrCreateControl for createJob coder check (not needed here but defensive)
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });

    // TaskModel.findById used inside createJob for coder spawn approval check
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  // ── Test A: spawns curator via spawnAgent when inbox count > 0 ───────────

  it('calls spawnAgent with role "curator" when inboxCount > 0', async () => {
    mockKnowledgeFileCountDocuments.mockResolvedValue(3);

    await handleCurateInbox({ cycleId: CYCLE_ID });

    expect(mockSpawnAgent).toHaveBeenCalledOnce();
    expect(mockSpawnAgent).toHaveBeenCalledWith({
      role: 'curator',
      cycleId: CYCLE_ID,
      taskId: undefined,
    });
  });

  // ── Test B: does NOT call spawnAgent when inbox count === 0 ──────────────

  it('does NOT call spawnAgent when inboxCount === 0', async () => {
    mockKnowledgeFileCountDocuments.mockResolvedValue(0);

    await handleCurateInbox({ cycleId: CYCLE_ID });

    expect(mockSpawnAgent).not.toHaveBeenCalled();
  });

  // ── Test C: always creates advance-cycle job regardless of inbox count ────

  it('creates advance-cycle job when inbox is empty', async () => {
    mockKnowledgeFileCountDocuments.mockResolvedValue(0);

    await handleCurateInbox({ cycleId: CYCLE_ID });

    const advanceCall = mockJobCreate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'advance-cycle'
    );
    expect(advanceCall).toBeDefined();
    expect((advanceCall![0] as Record<string, unknown>)['payload']).toMatchObject({
      cycleId: CYCLE_ID,
    });
  });

  it('creates advance-cycle job when inbox has items', async () => {
    mockKnowledgeFileCountDocuments.mockResolvedValue(5);

    await handleCurateInbox({ cycleId: CYCLE_ID });

    const advanceCall = mockJobCreate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'advance-cycle'
    );
    expect(advanceCall).toBeDefined();
    expect((advanceCall![0] as Record<string, unknown>)['payload']).toMatchObject({
      cycleId: CYCLE_ID,
    });
  });

  // ── Test D: creates reload job when docker path is accessible ────────────

  it('creates reload job when fs.access resolves (docker path accessible)', async () => {
    mockFsAccess.mockResolvedValue(undefined);
    mockKnowledgeFileCountDocuments.mockResolvedValue(0);

    await handleCurateInbox({ cycleId: CYCLE_ID });

    const reloadCall = mockJobCreate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'reload'
    );
    expect(reloadCall).toBeDefined();
    expect((reloadCall![0] as Record<string, unknown>)['payload']).toMatchObject({
      cycleId: CYCLE_ID,
    });
  });

  // ── Test E: skips reload job silently when docker path is inaccessible ────

  it('skips reload job silently when fs.access rejects (not in Docker)', async () => {
    mockFsAccess.mockRejectedValue(new Error('ENOENT: no such file or directory'));
    mockKnowledgeFileCountDocuments.mockResolvedValue(0);

    // Should not throw
    await expect(handleCurateInbox({ cycleId: CYCLE_ID })).resolves.toBeUndefined();

    const reloadCall = mockJobCreate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'reload'
    );
    expect(reloadCall).toBeUndefined();

    // advance-cycle should still be created
    const advanceCall = mockJobCreate.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)['type'] === 'advance-cycle'
    );
    expect(advanceCall).toBeDefined();
  });
});

// ─── persistRetryReviewIssues tests ──────────────────────────────────────────

describe('persistRetryReviewIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskUpdateOne.mockResolvedValue({});
  });

  // ── Calls TaskModel.updateOne with error-severity issues from reviewer output ──

  it('persists error-severity issues from a reviewer changes-requested result as lastRetryReviewIssues', async () => {
    // Simulate a reviewer AgentRun result with reviewVerdict: 'changes-requested'
    // and issues including one error-severity entry
    const reviewerAgentRunIssues = [
      { severity: 'error', file: 'src/foo.ts', description: 'Missing regression test' },
    ];

    await persistRetryReviewIssues('TASK-001', reviewerAgentRunIssues);

    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: 'TASK-001' },
      {
        $set: {
          lastRetryReviewIssues: [
            { severity: 'error', file: 'src/foo.ts', description: 'Missing regression test' },
          ],
        },
      }
    );
  });

  // ── Non-error issues are filtered out; only error-severity issues are persisted ──

  it('filters out non-error issues and only persists error-severity entries', async () => {
    const reviewerAgentRunIssues = [
      { severity: 'warning', file: 'src/bar.ts', description: 'Style issue' },
      { severity: 'error', file: 'src/foo.ts', description: 'Missing regression test' },
      { severity: 'info', file: 'src/baz.ts', description: 'Consider refactoring' },
    ];

    await persistRetryReviewIssues('TASK-042', reviewerAgentRunIssues);

    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: 'TASK-042' },
      {
        $set: {
          lastRetryReviewIssues: [
            { severity: 'error', file: 'src/foo.ts', description: 'Missing regression test' },
          ],
        },
      }
    );
  });

  // ── No-op when there are no error-severity issues ────────────────────────────

  it('does not call TaskModel.updateOne when there are no error-severity issues', async () => {
    const reviewerAgentRunIssues = [
      { severity: 'warning', file: 'src/bar.ts', description: 'Style issue' },
    ];

    await persistRetryReviewIssues('TASK-001', reviewerAgentRunIssues);

    expect(mockTaskUpdateOne).not.toHaveBeenCalled();
  });

  // ── No-op when issues array is empty ─────────────────────────────────────────

  it('does not call TaskModel.updateOne when issues array is empty', async () => {
    await persistRetryReviewIssues('TASK-001', []);

    expect(mockTaskUpdateOne).not.toHaveBeenCalled();
  });
});

// ─── handleWaitForCI: lastRetryCause tracking ─────────────────────────────────

describe('handleWaitForCI — lastRetryCause: ci_failure', () => {
  const JOB_ID = 'job-ci-001';
  const TASK_ID = 'TASK-501';
  const PR_NUMBER = 77;
  const CYCLE_ID = 20;

  const fakeTask = {
    _id: TASK_ID,
    status: 'in-review',
    cycleId: CYCLE_ID,
    branch: 'task-501-my-branch',
    type: 'feature',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockJobCreate.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockJobUpdateOne.mockResolvedValue({});
    mockTaskUpdateOne.mockResolvedValue({});
    mockMaybeAdvanceCycle.mockResolvedValue(undefined);
    mockGetOrCreateControl.mockResolvedValue({
      mode: 'active',
      spendingCapUsd: null,
      spentUsd: 0,
      autoApprovalCategories: [],
    });
    mockTaskFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(fakeTask) });
    mockCycleFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: CYCLE_ID, phase: 'implement', status: 'active' }),
    });
  });

  it('sets lastRetryCause to ci_failure on TaskModel.updateOne when CI fails and retry coder is scheduled', async () => {
    mockGetCIStatus.mockResolvedValue('failed');
    mockAgentRunCountDocuments.mockResolvedValue(1); // under MAX_RETRY_CODER_RUNS (3)

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // Find the updateOne call that sets status to 'ready'
    const readyCall = mockTaskUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'ready'
    );
    expect(readyCall).toBeDefined();
    const setFields = (readyCall![1] as Record<string, unknown>)['$set'] as Record<string, unknown>;
    expect(setFields['lastRetryCause']).toBe('ci_failure');
  });

  it('does NOT set lastRetryCause when CI fails but coder is at the retry cap', async () => {
    mockGetCIStatus.mockResolvedValue('failed');
    mockAgentRunCountDocuments.mockResolvedValue(3); // at MAX_RETRY_CODER_RUNS (3)

    await handleWaitForCI(JOB_ID, { taskId: TASK_ID, prNumber: PR_NUMBER });

    // The only updateOne should set status to 'failed', not 'ready', and no lastRetryCause
    const failedCall = mockTaskUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['status'] ===
          'failed'
    );
    expect(failedCall).toBeDefined();
    // Ensure no call set lastRetryCause
    const anyWithCause = mockTaskUpdateOne.mock.calls.find(
      (call) =>
        (call[1] as Record<string, unknown>)['$set'] &&
        ((call[1] as Record<string, unknown>)['$set'] as Record<string, unknown>)['lastRetryCause']
    );
    expect(anyWithCause).toBeUndefined();
  });
});

// ─── computeCycleMetrics — tasksRetriedByReviewer / tasksRetriedByCi ──────────

describe('computeCycleMetrics — tasksRetriedByReviewer and tasksRetriedByCi', () => {
  const CYCLE_ID = 200;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskCountDocuments.mockResolvedValue(0);
    mockTaskFind.mockResolvedValue([]);
    mockAgentRunAggregate.mockResolvedValue([]);
  });

  it('returns correct tasksRetriedByReviewer and tasksRetriedByCi for a mixed-cause cycle', async () => {
    // countDocuments calls in Promise.all order:
    // 1. done, 2. failed, 3. review_rejection, 4. ci_failure, 5. pr_body_invalid, 6. any cause exists
    mockTaskCountDocuments
      .mockResolvedValueOnce(4) // done
      .mockResolvedValueOnce(1) // failed
      .mockResolvedValueOnce(2) // review_rejection
      .mockResolvedValueOnce(1) // ci_failure
      .mockResolvedValueOnce(0) // pr_body_invalid
      .mockResolvedValueOnce(3); // any cause exists (2 + 1)

    mockTaskFind.mockResolvedValue([]);
    mockAgentRunAggregate.mockResolvedValue([]);

    const metrics = await computeCycleMetrics(CYCLE_ID, '');

    expect(metrics.tasksRetriedByReviewer).toBe(2);
    expect(metrics.tasksRetriedByCi).toBe(1);
  });

  it('returns undefined for both fields when no tasks in the cycle have lastRetryCause set', async () => {
    // countDocuments calls in Promise.all order:
    // 1. done, 2. failed, 3. review_rejection, 4. ci_failure, 5. pr_body_invalid, 6. any cause exists
    mockTaskCountDocuments
      .mockResolvedValueOnce(3) // done
      .mockResolvedValueOnce(0) // failed
      .mockResolvedValueOnce(0) // review_rejection
      .mockResolvedValueOnce(0) // ci_failure
      .mockResolvedValueOnce(0) // pr_body_invalid
      .mockResolvedValueOnce(0); // any cause exists → 0 means none

    mockTaskFind.mockResolvedValue([]);
    mockAgentRunAggregate.mockResolvedValue([]);

    const metrics = await computeCycleMetrics(CYCLE_ID, '');

    expect(metrics.tasksRetriedByReviewer).toBeUndefined();
    expect(metrics.tasksRetriedByCi).toBeUndefined();
    expect(metrics.tasksRetriedByPrBody).toBeUndefined();
  });

  it('returns 0 for tasksRetriedByCi when all retries were review rejections', async () => {
    mockTaskCountDocuments
      .mockResolvedValueOnce(3) // done
      .mockResolvedValueOnce(0) // failed
      .mockResolvedValueOnce(3) // review_rejection
      .mockResolvedValueOnce(0) // ci_failure
      .mockResolvedValueOnce(0) // pr_body_invalid
      .mockResolvedValueOnce(3); // any cause exists

    mockTaskFind.mockResolvedValue([]);
    mockAgentRunAggregate.mockResolvedValue([]);

    const metrics = await computeCycleMetrics(CYCLE_ID, '');

    expect(metrics.tasksRetriedByReviewer).toBe(3);
    expect(metrics.tasksRetriedByCi).toBe(0);
  });

  // ── Regression: tasksRetriedByPrBody populated when pr_body_invalid tasks exist ─

  it('returns correct tasksRetriedByPrBody when tasks have pr_body_invalid cause', async () => {
    // countDocuments calls in Promise.all order:
    // 1. done, 2. failed, 3. review_rejection, 4. ci_failure, 5. pr_body_invalid, 6. any cause exists
    mockTaskCountDocuments
      .mockResolvedValueOnce(3) // done
      .mockResolvedValueOnce(0) // failed
      .mockResolvedValueOnce(1) // review_rejection
      .mockResolvedValueOnce(0) // ci_failure
      .mockResolvedValueOnce(2) // pr_body_invalid
      .mockResolvedValueOnce(3); // any cause exists (1 + 0 + 2)

    mockTaskFind.mockResolvedValue([]);
    mockAgentRunAggregate.mockResolvedValue([]);

    const metrics = await computeCycleMetrics(CYCLE_ID, '');

    expect(metrics.tasksRetriedByPrBody).toBe(2);
    expect(metrics.tasksRetriedByReviewer).toBe(1);
    expect(metrics.tasksRetriedByCi).toBe(0);
  });
});
