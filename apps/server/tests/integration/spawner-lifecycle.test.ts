/**
 * Integration tests for spawnAgent() full container lifecycle.
 *
 * Tests cover:
 *   - AgentRun document creation with 'starting' status
 *   - Status transition to 'completed' on success, 'failed' on error
 *   - agent:started and agent:completed SSE events broadcast with correct payloads
 *   - Task status set to 'in-progress' when taskId is provided
 *   - Container always removed in finally block even when captureStream throws
 *   - system:spending_warning SSE event fires when cost exceeds the warning threshold
 *
 * All MongoDB models, SSE manager, job-queue, and container helpers are mocked
 * so no real database or Docker daemon is required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (set up before module imports) ─────────────────────────────

const mockAgentRunCreate = vi.hoisted(() => vi.fn());
const mockAgentRunUpdateOne = vi.hoisted(() => vi.fn());
const mockAgentRunCountDocuments = vi.hoisted(() => vi.fn());
const mockTaskUpdateOne = vi.hoisted(() => vi.fn());
const mockTaskFind = vi.hoisted(() => vi.fn());
const mockControlFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockControlUpdateOne = vi.hoisted(() => vi.fn());
const mockJobFindOne = vi.hoisted(() => vi.fn());
const mockCycleFindById = vi.hoisted(() => vi.fn());

const mockBroadcast = vi.hoisted(() => vi.fn());
const mockBuildContext = vi.hoisted(() => vi.fn());
const mockProcessContextFeedback = vi.hoisted(() => vi.fn());

const mockCreateAgentContainer = vi.hoisted(() => vi.fn());
const mockInjectContext = vi.hoisted(() => vi.fn());
const mockAttachStream = vi.hoisted(() => vi.fn());
const mockStartContainer = vi.hoisted(() => vi.fn());
const mockWaitForContainer = vi.hoisted(() => vi.fn());
const mockRemoveContainer = vi.hoisted(() => vi.fn());
const mockCaptureStream = vi.hoisted(() => vi.fn());
const mockEmitSystemEvent = vi.hoisted(() => vi.fn());
const mockCreateJob = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    create: mockAgentRunCreate,
    updateOne: mockAgentRunUpdateOne,
    countDocuments: mockAgentRunCountDocuments,
  },
}));

vi.mock('../../src/models/task.js', () => ({
  TaskModel: {
    updateOne: mockTaskUpdateOne,
    find: mockTaskFind,
  },
}));

vi.mock('../../src/models/control.js', () => ({
  ControlModel: {
    findOneAndUpdate: mockControlFindOneAndUpdate,
    updateOne: mockControlUpdateOne,
  },
}));

vi.mock('../../src/models/job.js', () => ({
  JobModel: {
    findOne: mockJobFindOne,
  },
}));

vi.mock('../../src/models/cycle.js', () => ({
  CycleModel: {
    findById: mockCycleFindById,
    updateOne: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../src/services/sse-manager.js', () => ({
  broadcast: mockBroadcast,
}));

vi.mock('../../src/services/launcher/context-builder.js', () => ({
  buildContext: mockBuildContext,
  processContextFeedback: mockProcessContextFeedback,
}));

vi.mock('../../src/services/launcher/container.js', () => ({
  createAgentContainer: mockCreateAgentContainer,
  injectContext: mockInjectContext,
  attachStream: mockAttachStream,
  startContainer: mockStartContainer,
  waitForContainer: mockWaitForContainer,
  removeContainer: mockRemoveContainer,
}));

vi.mock('../../src/services/launcher/stream-capture.js', () => ({
  captureStream: mockCaptureStream,
  emitSystemEvent: mockEmitSystemEvent,
}));

vi.mock('../../src/services/job-queue.js', () => ({
  createJob: mockCreateJob,
}));

vi.mock('../../src/services/github.js', () => ({
  findPRByBranch: vi.fn().mockResolvedValue(null),
  getCIStatus: vi.fn(),
}));

vi.mock('../../src/config.js', () => ({
  config: {
    githubRepoUrl: 'https://github.com/test-org/test-repo.git',
    coderTimeoutMs: 60_000,
    defaultBudgetUsd: 5,
    defaultModel: 'claude-opus-4',
    baseBranch: 'master',
  },
}));

// ─── Import function under test (after mocks) ─────────────────────────────────

import { spawnAgent } from '../../src/services/launcher/spawner.js';

// ─── Shared test fixtures ─────────────────────────────────────────────────────

/** A fake Docker container object — only needs to satisfy removeContainer(container) */
const FAKE_CONTAINER = { id: 'fake-container-id' };

/** Default successful capture result returned by captureStream */
const SUCCESS_CAPTURE_RESULT = {
  eventCount: 5,
  completionEvent: undefined,
  structuredOutput: undefined,
};

function setupDefaultMocks(): void {
  // context builder
  mockBuildContext.mockResolvedValue({
    systemPromptContent: 'system prompt',
    taskPromptContent: 'task prompt',
    knowledgeFiles: [],
  });
  mockProcessContextFeedback.mockResolvedValue(undefined);

  // AgentRun model — create returns a doc with startedAt so durationMs can be computed
  mockAgentRunCreate.mockResolvedValue({
    _id: expect.any(String),
    startedAt: new Date(Date.now() - 1000), // 1 second ago
  });
  mockAgentRunUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockAgentRunCountDocuments.mockResolvedValue(0);

  // Task model
  mockTaskUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockTaskFind.mockReturnValue({ lean: () => Promise.resolve([]) });

  // Control model — default: no spending cap set
  mockControlFindOneAndUpdate.mockResolvedValue(null);
  mockControlUpdateOne.mockResolvedValue({});

  // Job model
  mockJobFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

  // Cycle model
  mockCycleFindById.mockReturnValue({ lean: () => Promise.resolve(null) });

  // Container operations
  mockCreateAgentContainer.mockResolvedValue({
    container: FAKE_CONTAINER,
    containerId: 'fake-container-id',
  });
  mockInjectContext.mockResolvedValue(undefined);
  mockAttachStream.mockResolvedValue({
    /* fake readable stream */
  });
  mockStartContainer.mockResolvedValue(undefined);
  mockWaitForContainer.mockResolvedValue({ exitCode: 0, timedOut: false });
  mockRemoveContainer.mockResolvedValue(undefined);

  // Stream capture
  mockCaptureStream.mockResolvedValue(SUCCESS_CAPTURE_RESULT);
  mockEmitSystemEvent.mockResolvedValue(undefined);

  // Job queue
  mockCreateJob.mockResolvedValue({ _id: { toString: () => 'job-123' } });

  // SSE broadcast (sync)
  mockBroadcast.mockReturnValue(undefined);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('spawnAgent() — full lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ── Test 1: AgentRun starts with 'starting' status ───────────────────────

  it('creates an AgentRun document with status "starting" before container ops begin', async () => {
    await spawnAgent({ role: 'coder', cycleId: 1 });

    expect(mockAgentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'coder',
        cycleId: 1,
        status: 'starting',
      })
    );
  });

  // ── Test 2: AgentRun transitions to 'completed' on success ───────────────

  it('transitions AgentRun status to "completed" when container exits cleanly', async () => {
    mockWaitForContainer.mockResolvedValue({ exitCode: 0, timedOut: false });

    await spawnAgent({ role: 'coder', cycleId: 1 });

    // The final updateOne call should set status to 'completed'
    const updateCalls = mockAgentRunUpdateOne.mock.calls;
    const finalUpdate = updateCalls[updateCalls.length - 1];
    expect(finalUpdate[1]).toMatchObject({
      $set: expect.objectContaining({ status: 'completed' }),
    });
  });

  // ── Test 3: AgentRun transitions to 'failed' on non-zero exit code ───────

  it('transitions AgentRun status to "failed" when container exits with non-zero code', async () => {
    mockWaitForContainer.mockResolvedValue({ exitCode: 1, timedOut: false });

    await spawnAgent({ role: 'coder', cycleId: 1 });

    const updateCalls = mockAgentRunUpdateOne.mock.calls;
    const finalUpdate = updateCalls[updateCalls.length - 1];
    expect(finalUpdate[1]).toMatchObject({ $set: expect.objectContaining({ status: 'failed' }) });
  });

  // ── Test 4: AgentRun transitions to 'timeout' when timedOut ──────────────

  it('transitions AgentRun status to "timeout" when waitForContainer reports timedOut', async () => {
    mockWaitForContainer.mockResolvedValue({ exitCode: 1, timedOut: true });

    await spawnAgent({ role: 'coder', cycleId: 1 });

    const updateCalls = mockAgentRunUpdateOne.mock.calls;
    const finalUpdate = updateCalls[updateCalls.length - 1];
    expect(finalUpdate[1]).toMatchObject({ $set: expect.objectContaining({ status: 'timeout' }) });
  });

  // ── Test 5: agent:started SSE event is broadcast ─────────────────────────

  it('broadcasts agent:started SSE event with correct payload', async () => {
    await spawnAgent({ role: 'coder', taskId: 'TASK-001', cycleId: 2 });

    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:started',
      expect.objectContaining({
        role: 'coder',
        taskId: 'TASK-001',
        cycleId: 2,
      })
    );
    // agentRunId should be present and be a string
    const startedCall = mockBroadcast.mock.calls.find((call) => call[0] === 'agent:started');
    expect(startedCall).toBeDefined();
    expect(typeof startedCall![1].agentRunId).toBe('string');
  });

  // ── Test 6: agent:completed SSE event is broadcast on success ────────────

  it('broadcasts agent:completed SSE event with status "completed" on success', async () => {
    mockWaitForContainer.mockResolvedValue({ exitCode: 0, timedOut: false });

    await spawnAgent({ role: 'coder', cycleId: 1 });

    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:completed',
      expect.objectContaining({
        role: 'coder',
        cycleId: 1,
        exitCode: 0,
        costUsd: 0,
        status: 'completed',
      })
    );
  });

  // ── Test 7: agent:completed SSE event is broadcast on failure ────────────

  it('broadcasts agent:completed SSE event with status "failed" when captureStream throws', async () => {
    mockCaptureStream.mockRejectedValue(new Error('Stream read error'));

    await expect(spawnAgent({ role: 'coder', cycleId: 1 })).rejects.toThrow('Stream read error');

    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:completed',
      expect.objectContaining({
        role: 'coder',
        cycleId: 1,
        exitCode: -1,
        costUsd: 0,
        status: 'failed',
      })
    );
  });

  // ── Test 8: Task status set to 'in-progress' when taskId provided ─────────

  it('updates task status to "in-progress" and assigns agentRunId when taskId is provided', async () => {
    await spawnAgent({ role: 'coder', taskId: 'TASK-007', cycleId: 3 });

    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: 'TASK-007' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'in-progress',
        }),
      })
    );
  });

  // ── Test 9: Task status NOT updated when taskId is absent ─────────────────

  it('does not update any task status when no taskId is provided', async () => {
    // No taskId — role-level agent (e.g. orchestrator)
    await spawnAgent({ role: 'orchestrator', cycleId: 1 });

    // TaskModel.updateOne should not have been called for in-progress
    const inProgressCalls = mockTaskUpdateOne.mock.calls.filter(
      (call) => call[1]?.$set?.status === 'in-progress'
    );
    expect(inProgressCalls).toHaveLength(0);
  });

  // ── Test 10: Container removed even when captureStream throws ─────────────

  it('removes the container in the finally block even when captureStream throws', async () => {
    mockCaptureStream.mockRejectedValue(new Error('Unexpected stream failure'));

    // spawnAgent should re-throw the error
    await expect(spawnAgent({ role: 'coder', cycleId: 1 })).rejects.toThrow(
      'Unexpected stream failure'
    );

    // removeContainer must have been called despite the error
    expect(mockRemoveContainer).toHaveBeenCalledWith(FAKE_CONTAINER);
  });

  // ── Test 11: Container removed on success path too ───────────────────────

  it('removes the container after a successful run', async () => {
    await spawnAgent({ role: 'coder', cycleId: 1 });

    expect(mockRemoveContainer).toHaveBeenCalledWith(FAKE_CONTAINER);
    expect(mockRemoveContainer).toHaveBeenCalledTimes(1);
  });

  // ── Test 12: Container NOT removed when createAgentContainer throws ───────

  it('does not call removeContainer when container creation itself fails', async () => {
    mockCreateAgentContainer.mockRejectedValue(new Error('Docker daemon unavailable'));

    await expect(spawnAgent({ role: 'coder', cycleId: 1 })).rejects.toThrow(
      'Docker daemon unavailable'
    );

    expect(mockRemoveContainer).not.toHaveBeenCalled();
  });

  // ── Test 13: Spending warning SSE fires when cost exceeds threshold ────────

  it('broadcasts system:spending_warning when cumulative cost exceeds the warning threshold', async () => {
    // captureStream returns a completion event with non-trivial cost
    mockCaptureStream.mockResolvedValue({
      eventCount: 3,
      completionEvent: {
        costUsd: 0.5,
        inputTokens: 10_000,
        outputTokens: 2_000,
        durationMs: 5_000,
      },
      structuredOutput: undefined,
    });

    // After incrementing spentUsd, the control doc shows 85% usage (above 80% threshold)
    mockControlFindOneAndUpdate.mockResolvedValue({
      _id: 'singleton',
      spentUsd: 4.25,
      spendingCapUsd: 5.0,
    });

    await spawnAgent({ role: 'coder', cycleId: 1 });

    expect(mockBroadcast).toHaveBeenCalledWith(
      'system:spending_warning',
      expect.objectContaining({
        spentUsd: 4.25,
        spendingCapUsd: 5.0,
        percentUsed: 85,
        action: 'paused',
      })
    );
  });

  // ── Test 14: Spending warning uses 'hard_cap' action when at or above cap ──

  it('uses action "hard_cap" in spending_warning when spent >= cap', async () => {
    mockCaptureStream.mockResolvedValue({
      eventCount: 2,
      completionEvent: {
        costUsd: 1.0,
        inputTokens: 20_000,
        outputTokens: 3_000,
        durationMs: 8_000,
      },
      structuredOutput: undefined,
    });

    // Exactly at the cap
    mockControlFindOneAndUpdate.mockResolvedValue({
      _id: 'singleton',
      spentUsd: 5.0,
      spendingCapUsd: 5.0,
    });

    await spawnAgent({ role: 'coder', cycleId: 1 });

    const warningCall = mockBroadcast.mock.calls.find(
      (call) => call[0] === 'system:spending_warning'
    );
    expect(warningCall).toBeDefined();
    expect(warningCall![1].action).toBe('hard_cap');
    expect(warningCall![1].percentUsed).toBe(100);
  });

  // ── Test 15: No spending_warning when no completion event ─────────────────

  it('does not broadcast system:spending_warning when captureStream returns no completion event', async () => {
    mockCaptureStream.mockResolvedValue({
      eventCount: 1,
      completionEvent: undefined,
      structuredOutput: undefined,
    });

    await spawnAgent({ role: 'coder', cycleId: 1 });

    const warningCall = mockBroadcast.mock.calls.find(
      (call) => call[0] === 'system:spending_warning'
    );
    expect(warningCall).toBeUndefined();
  });

  // ── Test 16: AgentRun stores costUsd from completion event ────────────────

  it('persists costUsd and tokenUsage to AgentRun when captureStream returns a completion event', async () => {
    mockCaptureStream.mockResolvedValue({
      eventCount: 4,
      completionEvent: {
        costUsd: 0.142,
        inputTokens: 45_000,
        outputTokens: 1_200,
        durationMs: 87_432,
      },
      structuredOutput: undefined,
    });
    // No spending cap to avoid spending_warning side effect
    mockControlFindOneAndUpdate.mockResolvedValue(null);

    await spawnAgent({ role: 'coder', cycleId: 1 });

    const updateCalls = mockAgentRunUpdateOne.mock.calls;
    const finalUpdate = updateCalls[updateCalls.length - 1];
    expect(finalUpdate[1]).toMatchObject({
      $set: expect.objectContaining({
        costUsd: 0.142,
        tokenUsage: { inputTokens: 45_000, outputTokens: 1_200 },
      }),
    });
  });
});
