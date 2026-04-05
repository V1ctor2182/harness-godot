/**
 * Unit tests for spawner.ts helper functions.
 *
 * Tests cover:
 *   - spawnAgent() success path and container creation error path
 *   - unblockDependents()
 *   - maybeAdvanceCycle()
 *   - createFollowUpJobs() for coder role
 *   - createFollowUpJobs() for reviewer role
 *
 * All MongoDB models, SSE manager, job-queue, GitHub service, and container
 * helpers are mocked so no real database or Docker connection is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (set up before module imports) ─────────────────────────────

const mockTaskFind = vi.hoisted(() => vi.fn());
const mockTaskUpdateOne = vi.hoisted(() => vi.fn());
const mockAgentRunCreate = vi.hoisted(() => vi.fn());
const mockAgentRunUpdateOne = vi.hoisted(() => vi.fn());
const mockAgentRunCountDocuments = vi.hoisted(() => vi.fn());
const mockJobFindOne = vi.hoisted(() => vi.fn());
const mockCycleFindById = vi.hoisted(() => vi.fn());
const mockCycleUpdateOne = vi.hoisted(() => vi.fn());
const mockBroadcast = vi.hoisted(() => vi.fn());
const mockCreateJob = vi.hoisted(() => vi.fn());
const mockPersistRetryReviewIssues = vi.hoisted(() => vi.fn());
const mockFindPRByBranch = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../src/services/../../src/models/task.js', () => ({
  TaskModel: {
    find: mockTaskFind,
    updateOne: mockTaskUpdateOne,
  },
}));

vi.mock('../../../src/services/../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    create: mockAgentRunCreate,
    updateOne: mockAgentRunUpdateOne,
    countDocuments: mockAgentRunCountDocuments,
  },
}));

vi.mock('../../../src/services/../../src/models/job.js', () => ({
  JobModel: {
    findOne: mockJobFindOne,
  },
}));

vi.mock('../../../src/services/../../src/models/cycle.js', () => ({
  CycleModel: {
    findById: mockCycleFindById,
    updateOne: mockCycleUpdateOne,
  },
}));

vi.mock('../../../src/services/../../src/models/control.js', () => ({
  ControlModel: {
    findOneAndUpdate: vi.fn().mockResolvedValue(null),
    updateOne: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../../src/services/sse-manager.js', () => ({
  broadcast: mockBroadcast,
}));

vi.mock('../../../src/services/job-queue.js', () => ({
  createJob: mockCreateJob,
  persistRetryReviewIssues: mockPersistRetryReviewIssues,
}));

vi.mock('../../../src/services/github.js', () => ({
  findPRByBranch: mockFindPRByBranch,
  getCIStatus: vi.fn(),
}));

vi.mock('../../../src/services/../../src/config.js', () => ({
  config: {
    githubRepoUrl: 'https://github.com/test-org/test-repo.git',
    coderTimeoutMs: 60000,
    defaultBudgetUsd: 5,
    defaultModel: 'claude-opus-4',
    baseBranch: 'master',
  },
}));

vi.mock('../../../src/services/launcher/context-builder.js', () => ({
  buildContext: vi.fn().mockResolvedValue({
    systemPromptContent: '',
    taskPromptContent: '',
    knowledgeFiles: [],
  }),
  processContextFeedback: vi.fn().mockResolvedValue(undefined),
}));

const mockCreateAgentContainer = vi.hoisted(() => vi.fn());
const mockInjectContext = vi.hoisted(() => vi.fn());
const mockAttachStream = vi.hoisted(() => vi.fn());
const mockStartContainer = vi.hoisted(() => vi.fn());
const mockWaitForContainer = vi.hoisted(() => vi.fn());
const mockCaptureStream = vi.hoisted(() => vi.fn());
const mockRemoveContainer = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/launcher/container.js', () => ({
  createAgentContainer: mockCreateAgentContainer,
  injectContext: mockInjectContext,
  attachStream: mockAttachStream,
  startContainer: mockStartContainer,
  waitForContainer: mockWaitForContainer,
  removeContainer: mockRemoveContainer,
}));

vi.mock('../../../src/services/launcher/stream-capture.js', () => ({
  captureStream: mockCaptureStream,
  emitSystemEvent: vi.fn(),
}));

// ─── Import functions under test (after mocks) ────────────────────────────────

import {
  unblockDependents,
  maybeAdvanceCycle,
  createFollowUpJobs,
  spawnAgent,
} from '../../../src/services/launcher/spawner.js';

// ─── unblockDependents tests ──────────────────────────────────────────────────

describe('unblockDependents', () => {
  const CYCLE_ID = 1;
  const COMPLETED_TASK_ID = 'TASK-001';

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskUpdateOne.mockResolvedValue({});
    mockBroadcast.mockReturnValue(undefined);
    mockCreateJob.mockResolvedValue({ _id: { toString: () => 'job-spawned' } });
  });

  // ── Test 1: Unblocks an eligible task (all dependencies resolved) ─────────

  it('transitions a task from blocked to ready when all its blockers are done', async () => {
    // First find: blocked tasks that reference TASK-001
    mockTaskFind
      .mockReturnValueOnce({
        lean: () => Promise.resolve([{ _id: 'TASK-002', blockedBy: [COMPLETED_TASK_ID] }]),
      })
      // Second find: look up the dep tasks to check their status
      .mockReturnValueOnce({
        lean: () => Promise.resolve([{ _id: COMPLETED_TASK_ID, status: 'done' }]),
      });

    await unblockDependents(COMPLETED_TASK_ID, CYCLE_ID);

    // Task should be updated to ready
    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: 'TASK-002' },
      expect.objectContaining({
        $set: { status: 'ready' },
      })
    );

    // SSE event should be broadcast
    expect(mockBroadcast).toHaveBeenCalledWith(
      'task:status_changed',
      expect.objectContaining({ taskId: 'TASK-002', status: 'ready', cycleId: CYCLE_ID })
    );

    // A spawn job should be created for the newly-ready task
    expect(mockCreateJob).toHaveBeenCalledWith(
      'spawn',
      'agent',
      expect.objectContaining({ role: 'coder', taskId: 'TASK-002', cycleId: CYCLE_ID })
    );
  });

  // ── Test 2: Leaves a partially-blocked task as blocked ────────────────────

  it('leaves a task blocked when it still has unresolved dependencies', async () => {
    // Task has two blockers; only TASK-001 is done, TASK-002 is still in-progress
    mockTaskFind
      .mockReturnValueOnce({
        lean: () =>
          Promise.resolve([{ _id: 'TASK-003', blockedBy: [COMPLETED_TASK_ID, 'TASK-002'] }]),
      })
      .mockReturnValueOnce({
        lean: () =>
          Promise.resolve([
            { _id: COMPLETED_TASK_ID, status: 'done' },
            { _id: 'TASK-002', status: 'in-progress' },
          ]),
      });

    await unblockDependents(COMPLETED_TASK_ID, CYCLE_ID);

    // Task status should NOT be updated
    expect(mockTaskUpdateOne).not.toHaveBeenCalled();
    // No broadcast or spawn job
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(mockCreateJob).not.toHaveBeenCalled();
  });
});

// ─── maybeAdvanceCycle tests ──────────────────────────────────────────────────

describe('maybeAdvanceCycle', () => {
  const CYCLE_ID = 2;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateJob.mockResolvedValue({ _id: { toString: () => 'job-advance' } });
    // Default: no existing advance-cycle job
    mockJobFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  });

  // ── Test 3: Creates advance-cycle job when all tasks are done (review phase) ─

  it('creates an advance-cycle job when all tasks are done in review phase', async () => {
    mockCycleFindById.mockReturnValue({
      lean: () => Promise.resolve({ _id: CYCLE_ID, phase: 'review', status: 'active' }),
    });
    mockTaskFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { _id: 'TASK-001', status: 'done' },
          { _id: 'TASK-002', status: 'done' },
        ]),
    });

    await maybeAdvanceCycle(CYCLE_ID);

    expect(mockCreateJob).toHaveBeenCalledWith(
      'advance-cycle',
      'infra',
      expect.objectContaining({ cycleId: CYCLE_ID })
    );
  });

  // ── Test 4: Creates advance-cycle job when all tasks are in-review (implement)

  it('creates an advance-cycle job when all tasks are in-review in implement phase', async () => {
    mockCycleFindById.mockReturnValue({
      lean: () => Promise.resolve({ _id: CYCLE_ID, phase: 'implement', status: 'active' }),
    });
    mockTaskFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { _id: 'TASK-001', status: 'in-review' },
          { _id: 'TASK-002', status: 'done' },
        ]),
    });

    await maybeAdvanceCycle(CYCLE_ID);

    expect(mockCreateJob).toHaveBeenCalledWith(
      'advance-cycle',
      'infra',
      expect.objectContaining({ cycleId: CYCLE_ID })
    );
  });

  // ── Test 5: Skips advance-cycle when tasks are still in-progress ─────────────

  it('does not create an advance-cycle job when tasks remain in-progress', async () => {
    mockCycleFindById.mockReturnValue({
      lean: () => Promise.resolve({ _id: CYCLE_ID, phase: 'implement', status: 'active' }),
    });
    mockTaskFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { _id: 'TASK-001', status: 'in-progress' },
          { _id: 'TASK-002', status: 'in-review' },
        ]),
    });

    await maybeAdvanceCycle(CYCLE_ID);

    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  // ── Test 6: Skips advance-cycle if one already exists in the queue ────────────

  it('does not create a duplicate advance-cycle job when one is already pending', async () => {
    mockCycleFindById.mockReturnValue({
      lean: () => Promise.resolve({ _id: CYCLE_ID, phase: 'review', status: 'active' }),
    });
    mockTaskFind.mockReturnValue({
      lean: () => Promise.resolve([{ _id: 'TASK-001', status: 'done' }]),
    });
    // Existing advance-cycle job found
    mockJobFindOne.mockReturnValue({
      lean: () => Promise.resolve({ _id: 'existing-job', type: 'advance-cycle' }),
    });

    await maybeAdvanceCycle(CYCLE_ID);

    expect(mockCreateJob).not.toHaveBeenCalled();
  });
});

// ─── createFollowUpJobs — coder role ─────────────────────────────────────────

describe('createFollowUpJobs — coder role', () => {
  const CYCLE_ID = 3;
  const TASK_ID = 'TASK-010';
  const AGENT_RUN_ID = 'coder-abc123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskUpdateOne.mockResolvedValue({});
    mockBroadcast.mockReturnValue(undefined);
    mockCreateJob.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockAgentRunCountDocuments.mockResolvedValue(0);

    // Default: no blocked tasks in unblockDependents (returns empty array)
    mockTaskFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    // Default: cycle not active so maybeAdvanceCycle exits early
    mockCycleFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
  });

  // ── Test 7: Creates wait-for-ci job and sets task to in-review when PR exists ─

  it('creates a wait-for-ci job and sets task to in-review when coder reports a PR number', async () => {
    const structuredOutput = {
      summary: 'Implemented the feature',
      filesChanged: ['src/index.ts'],
      decisions: [],
      contextFeedback: { useful: [], missing: [], unnecessary: [] },
      branch: 'task-010-my-feature',
      prNumber: 42,
    };

    await createFollowUpJobs('coder', AGENT_RUN_ID, CYCLE_ID, TASK_ID, structuredOutput);

    // Task should be updated to in-review
    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: TASK_ID },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'in-review', prNumber: 42 }),
      })
    );

    // SSE event should be broadcast
    expect(mockBroadcast).toHaveBeenCalledWith(
      'task:status_changed',
      expect.objectContaining({ taskId: TASK_ID, status: 'in-review', prNumber: 42 })
    );

    // wait-for-ci job should be created
    const waitForCICall = mockCreateJob.mock.calls.find((call) => call[0] === 'wait-for-ci');
    expect(waitForCICall).toBeDefined();
    expect(waitForCICall![2]).toMatchObject({ taskId: TASK_ID, prNumber: 42 });
  });

  // ── Test 8: No PR in output — falls back to findPRByBranch for recovery ──────

  it('recovers via findPRByBranch when coder output has no prNumber but a PR exists on GitHub', async () => {
    const structuredOutput = {
      summary: 'Implemented the feature',
      filesChanged: ['src/index.ts'],
      decisions: [],
      contextFeedback: { useful: [], missing: [], unnecessary: [] },
      branch: 'task-010-my-feature',
      prNumber: undefined,
    };

    // GitHub has a PR for the branch
    mockFindPRByBranch.mockResolvedValue(55);

    await createFollowUpJobs('coder', AGENT_RUN_ID, CYCLE_ID, TASK_ID, structuredOutput);

    // Task should be updated to in-review using the recovered PR number
    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: TASK_ID },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'in-review', prNumber: 55 }),
      })
    );

    // wait-for-ci should be created with the recovered PR
    const waitForCICall = mockCreateJob.mock.calls.find((call) => call[0] === 'wait-for-ci');
    expect(waitForCICall).toBeDefined();
    expect(waitForCICall![2]).toMatchObject({ taskId: TASK_ID, prNumber: 55 });
  });
});

// ─── createFollowUpJobs — coder role, no-PR retry context ────────────────────

describe('createFollowUpJobs — coder no-PR retry', () => {
  const CYCLE_ID = 6;
  const TASK_ID = 'TASK-040';
  const AGENT_RUN_ID = 'coder-ghi789';

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskUpdateOne.mockResolvedValue({});
    mockBroadcast.mockReturnValue(undefined);
    mockCreateJob.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    // One prior run — under the retry cap so it retries
    mockAgentRunCountDocuments.mockResolvedValue(1);
    // No blocked tasks; cycle not active
    mockTaskFind.mockReturnValue({ lean: () => Promise.resolve([]) });
    mockCycleFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
    // No PR found on GitHub
    mockFindPRByBranch.mockResolvedValue(null);
  });

  // ── Test: retry context includes previousSummary and filesChanged ─────────

  it('populates previousSummary and filesChanged in the retry job retryContext when structured output has them', async () => {
    const structuredOutput = {
      summary: 'Implemented the feature but forgot to open a PR',
      filesChanged: ['src/foo.ts', 'src/bar.ts'],
      decisions: [],
      contextFeedback: { useful: [], missing: [], unnecessary: [] },
      branch: 'task-040-feature',
      prNumber: undefined,
    };

    await createFollowUpJobs('coder', AGENT_RUN_ID, CYCLE_ID, TASK_ID, structuredOutput);

    const spawnCalls = mockCreateJob.mock.calls.filter((call) => call[0] === 'spawn');
    expect(spawnCalls).toHaveLength(1);
    const retryContext = (spawnCalls[0]![2] as Record<string, unknown>)['retryContext'] as Record<
      string,
      unknown
    >;
    expect(retryContext['previousSummary']).toBe('Implemented the feature but forgot to open a PR');
    expect(retryContext['filesChanged']).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  // ── Test: previousError message is unchanged ──────────────────────────────

  it('preserves the existing previousError message in the retry context', async () => {
    const structuredOutput = {
      summary: 'Work done',
      filesChanged: ['src/index.ts'],
      decisions: [],
      contextFeedback: { useful: [], missing: [], unnecessary: [] },
      branch: 'task-040-feature',
      prNumber: undefined,
    };

    await createFollowUpJobs('coder', AGENT_RUN_ID, CYCLE_ID, TASK_ID, structuredOutput);

    const spawnCalls = mockCreateJob.mock.calls.filter((call) => call[0] === 'spawn');
    expect(spawnCalls).toHaveLength(1);
    const retryContext = (spawnCalls[0]![2] as Record<string, unknown>)['retryContext'] as Record<
      string,
      unknown
    >;
    expect(retryContext['previousError']).toBe(
      'You completed the task but did not open a pull request. You MUST push your branch and run gh pr create. The task cannot advance without a PR.'
    );
  });

  // ── Test: graceful handling when structured output has no summary/filesChanged

  it('spawns the retry job without error when structured output has no summary or filesChanged', async () => {
    await createFollowUpJobs('coder', AGENT_RUN_ID, CYCLE_ID, TASK_ID, undefined);

    const spawnCalls = mockCreateJob.mock.calls.filter((call) => call[0] === 'spawn');
    expect(spawnCalls).toHaveLength(1);
    const retryContext = (spawnCalls[0]![2] as Record<string, unknown>)['retryContext'] as Record<
      string,
      unknown
    >;
    expect(retryContext['previousSummary']).toBeUndefined();
    expect(retryContext['filesChanged']).toEqual([]);
  });
});

// ─── createFollowUpJobs — reviewer role ──────────────────────────────────────

describe('createFollowUpJobs — reviewer role', () => {
  const CYCLE_ID = 4;
  const TASK_ID = 'TASK-020';
  const AGENT_RUN_ID = 'reviewer-def456';

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskUpdateOne.mockResolvedValue({});
    mockBroadcast.mockReturnValue(undefined);
    mockCreateJob.mockResolvedValue({ _id: { toString: () => 'job-created' } });
    mockPersistRetryReviewIssues.mockResolvedValue(undefined);
    mockAgentRunCountDocuments.mockResolvedValue(0);

    // Default: no blocked tasks (unblockDependents does nothing)
    mockTaskFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    // Default: cycle not active so maybeAdvanceCycle exits early
    mockCycleFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
  });

  // ── Test 9: Approved verdict → task transitions to 'done' ────────────────────

  it('transitions the task to done when the reviewer approves', async () => {
    const structuredOutput = {
      summary: 'Looks good to me',
      filesChanged: [],
      decisions: [],
      contextFeedback: { useful: [], missing: [], unnecessary: [] },
      reviewVerdict: 'approved' as const,
    };

    await createFollowUpJobs('reviewer', AGENT_RUN_ID, CYCLE_ID, TASK_ID, structuredOutput);

    // Task should be updated to done with approved verdict
    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: TASK_ID },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'done', reviewVerdict: 'approved' }),
      })
    );

    // SSE event should be broadcast
    expect(mockBroadcast).toHaveBeenCalledWith(
      'task:status_changed',
      expect.objectContaining({ taskId: TASK_ID, status: 'done' })
    );

    // No spawn job should be created for the approved path
    const spawnCalls = mockCreateJob.mock.calls.filter((call) => call[0] === 'spawn');
    expect(spawnCalls).toHaveLength(0);
  });

  // ── Test 10: Changes-requested → task reset to ready + new spawn coder job ───

  it('resets the task to ready and spawns a new coder when reviewer requests changes', async () => {
    const structuredOutput = {
      summary: 'Missing error handling in the API endpoint',
      filesChanged: [],
      decisions: [],
      contextFeedback: { useful: [], missing: [], unnecessary: [] },
      reviewVerdict: 'changes-requested' as const,
      issues: [
        {
          file: 'src/api.ts',
          severity: 'error' as const,
          description: 'No error handling on line 42',
        },
      ],
      suggestions: ['Wrap in try/catch'],
    };

    // Under the review cycle cap (0 < MAX_REVIEW_CYCLES = 2)
    mockAgentRunCountDocuments.mockResolvedValue(1);

    await createFollowUpJobs('reviewer', AGENT_RUN_ID, CYCLE_ID, TASK_ID, structuredOutput);

    // Task should be reset to ready
    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: TASK_ID },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'ready', reviewVerdict: 'changes-requested' }),
      })
    );

    // SSE event should be broadcast with 'ready'
    expect(mockBroadcast).toHaveBeenCalledWith(
      'task:status_changed',
      expect.objectContaining({ taskId: TASK_ID, status: 'ready' })
    );

    // A new coder spawn job should be created with review feedback as retry context
    const spawnCalls = mockCreateJob.mock.calls.filter((call) => call[0] === 'spawn');
    expect(spawnCalls).toHaveLength(1);
    const spawnPayload = spawnCalls[0]![2] as Record<string, unknown>;
    expect(spawnPayload['role']).toBe('coder');
    expect(spawnPayload['taskId']).toBe(TASK_ID);
    expect(spawnPayload['cycleId']).toBe(CYCLE_ID);
    expect(spawnPayload['retryContext']).toBeDefined();

    // Error-severity issues should be persisted via persistRetryReviewIssues
    expect(mockPersistRetryReviewIssues).toHaveBeenCalledWith(TASK_ID, [
      { file: 'src/api.ts', severity: 'error', description: 'No error handling on line 42' },
    ]);
  });

  // ── Test 11: Changes-requested with no issues → persistRetryReviewIssues not called ──

  it('does not call persistRetryReviewIssues when reviewer returns no issues', async () => {
    const structuredOutput = {
      summary: 'Some minor issues found',
      filesChanged: [],
      decisions: [],
      contextFeedback: { useful: [], missing: [], unnecessary: [] },
      reviewVerdict: 'changes-requested' as const,
      // no issues field
    };

    mockAgentRunCountDocuments.mockResolvedValue(1);

    await createFollowUpJobs('reviewer', AGENT_RUN_ID, CYCLE_ID, TASK_ID, structuredOutput);

    expect(mockPersistRetryReviewIssues).not.toHaveBeenCalled();
  });
});

// ─── spawnAgent ───────────────────────────────────────────────────────────────
//
// Core unit tests for the spawnAgent() function: success path and container
// creation error path.

describe('spawnAgent', () => {
  const CYCLE_ID = 10;
  const TASK_ID = 'TASK-100';

  beforeEach(() => {
    vi.clearAllMocks();

    // AgentRunModel.create returns a minimal run doc
    mockAgentRunCreate.mockResolvedValue({
      _id: 'coder-spawntest',
      startedAt: new Date('2024-01-01T00:00:00Z'),
    });
    mockAgentRunUpdateOne.mockResolvedValue({});
    mockTaskUpdateOne.mockResolvedValue({});
    mockBroadcast.mockReturnValue(undefined);
    mockCreateJob.mockResolvedValue({ _id: { toString: () => 'job-spawn' } });

    // Happy-path container lifecycle
    mockCreateAgentContainer.mockResolvedValue({
      container: {},
      containerId: 'container-spawn',
    });
    mockInjectContext.mockResolvedValue(undefined);
    mockAttachStream.mockResolvedValue({});
    mockStartContainer.mockResolvedValue(undefined);
    mockWaitForContainer.mockResolvedValue({ exitCode: 0, timedOut: false });
    mockRemoveContainer.mockResolvedValue(undefined);

    mockCaptureStream.mockResolvedValue({
      eventCount: 2,
      completionEvent: undefined,
      structuredOutput: {
        summary: 'done',
        filesChanged: [],
        decisions: [],
        contextFeedback: { useful: [], missing: [], unnecessary: [] },
        branch: 'task-100-spawn',
        prNumber: 101,
      },
    });

    // No blocked tasks; cycle not active (skip follow-up jobs)
    mockTaskFind.mockReturnValue({ lean: () => Promise.resolve([]) });
    mockCycleFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
  });

  // ── Test: success path ────────────────────────────────────────────────────────

  it('resolves with a string agentRunId and calls AgentRunModel.create, createAgentContainer, and removeContainer exactly once', async () => {
    const result = await spawnAgent({ role: 'coder', taskId: TASK_ID, cycleId: CYCLE_ID });

    // Resolves with a string agentRunId in the expected format
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^coder-[a-f0-9]{8}$/);

    // AgentRunModel.create called exactly once
    expect(mockAgentRunCreate).toHaveBeenCalledTimes(1);
    expect(mockAgentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'coder', taskId: TASK_ID, cycleId: CYCLE_ID })
    );

    // createAgentContainer called exactly once
    expect(mockCreateAgentContainer).toHaveBeenCalledTimes(1);

    // removeContainer called once — cleanup runs even on success (finally block)
    expect(mockRemoveContainer).toHaveBeenCalledTimes(1);
  });

  // ── Test: container creation error path ──────────────────────────────────────

  it('calls AgentRunModel.updateOne with $set: { status: "failed" } when createAgentContainer rejects', async () => {
    mockCreateAgentContainer.mockRejectedValue(new Error('Docker daemon unreachable'));

    await expect(spawnAgent({ role: 'coder', taskId: TASK_ID, cycleId: CYCLE_ID })).rejects.toThrow(
      'Docker daemon unreachable'
    );

    // AgentRun record must be updated to 'failed' even though the container never started
    expect(mockAgentRunUpdateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'failed' }),
      })
    );
  });
});

// ─── spawnAgent — in-progress broadcast ──────────────────────────────────────

describe('spawnAgent — task:status_changed in-progress emission', () => {
  const CYCLE_ID = 5;
  const TASK_ID = 'TASK-030';

  beforeEach(() => {
    vi.clearAllMocks();

    // AgentRunModel.create returns a minimal run document
    mockAgentRunCreate.mockResolvedValue({
      _id: 'coder-test01',
      startedAt: new Date(),
    });
    mockAgentRunUpdateOne.mockResolvedValue({});
    mockTaskUpdateOne.mockResolvedValue({});
    mockBroadcast.mockReturnValue(undefined);
    mockCreateJob.mockResolvedValue({ _id: { toString: () => 'job-id' } });

    // Container lifecycle mocks
    const fakeContainer = {};
    mockCreateAgentContainer.mockResolvedValue({
      container: fakeContainer,
      containerId: 'container-abc',
    });
    mockAttachStream.mockResolvedValue({});
    mockWaitForContainer.mockResolvedValue({ exitCode: 0, timedOut: false });
    mockRemoveContainer.mockResolvedValue(undefined);
    mockCaptureStream.mockResolvedValue({
      eventCount: 0,
      completionEvent: undefined,
      structuredOutput: {
        summary: 'done',
        filesChanged: [],
        decisions: [],
        contextFeedback: { useful: [], missing: [], unnecessary: [] },
        branch: 'task-030-slug',
        prNumber: 99,
      },
    });

    // No blocked tasks; cycle not active so follow-up jobs skip
    mockTaskFind.mockReturnValue({ lean: () => Promise.resolve([]) });
    mockCycleFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
  });

  // ── Test 11: spawnAgent emits task:status_changed with in-progress for coder ─

  it('broadcasts task:status_changed with status in-progress when a coder agent is spawned for a task', async () => {
    await spawnAgent({ role: 'coder', taskId: TASK_ID, cycleId: CYCLE_ID });

    expect(mockBroadcast).toHaveBeenCalledWith('task:status_changed', {
      taskId: TASK_ID,
      status: 'in-progress',
      cycleId: CYCLE_ID,
    });
  });
});

// ─── spawnAgent — lifecycle ────────────────────────────────────────────────────

describe('spawnAgent — lifecycle', () => {
  const CYCLE_ID = 8;
  const TASK_ID = 'TASK-060';

  beforeEach(() => {
    vi.clearAllMocks();

    // AgentRun.create returns a doc with startedAt
    mockAgentRunCreate.mockResolvedValue({
      _id: 'coder-lifecycle01',
      startedAt: new Date('2024-01-01T00:00:00Z'),
    });
    mockAgentRunUpdateOne.mockResolvedValue({});
    mockTaskUpdateOne.mockResolvedValue({});
    mockBroadcast.mockReturnValue(undefined);
    mockCreateJob.mockResolvedValue({ _id: { toString: () => 'job-lifecycle' } });

    // Happy-path container lifecycle
    mockCreateAgentContainer.mockResolvedValue({
      container: {},
      containerId: 'container-lifecycle',
    });
    mockInjectContext.mockResolvedValue(undefined);
    mockAttachStream.mockResolvedValue({});
    mockStartContainer.mockResolvedValue(undefined);
    mockWaitForContainer.mockResolvedValue({ exitCode: 0, timedOut: false });
    mockRemoveContainer.mockResolvedValue(undefined);

    // captureStream returns a minimal success result
    mockCaptureStream.mockResolvedValue({
      eventCount: 3,
      completionEvent: undefined,
      structuredOutput: {
        summary: 'done',
        filesChanged: [],
        decisions: [],
        contextFeedback: { useful: [], missing: [], unnecessary: [] },
        branch: 'task-060-slug',
        prNumber: 77,
      },
    });

    // No blocked tasks; cycle not active (skip follow-up jobs)
    mockTaskFind.mockReturnValue({ lean: () => Promise.resolve([]) });
    mockCycleFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
  });

  // ── Test 12: Successful run lifecycle ────────────────────────────────────────

  it('creates AgentRun with starting status, calls all container lifecycle functions, and removes container in finally', async () => {
    await spawnAgent({ role: 'coder', taskId: TASK_ID, cycleId: CYCLE_ID });

    // AgentRun created with 'starting' status
    expect(mockAgentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'starting' })
    );

    // All container lifecycle functions called in order
    expect(mockCreateAgentContainer).toHaveBeenCalled();
    expect(mockInjectContext).toHaveBeenCalled();
    expect(mockAttachStream).toHaveBeenCalled();
    expect(mockStartContainer).toHaveBeenCalled();
    expect(mockWaitForContainer).toHaveBeenCalled();

    // AgentRun updated to 'running' after container creation
    const updateStatuses = mockAgentRunUpdateOne.mock.calls.map(
      (call) => (call[1] as { $set?: { status?: string } })?.$set?.status
    );
    expect(updateStatuses).toContain('running');

    // AgentRun updated to 'completed' at the end
    expect(updateStatuses).toContain('completed');

    // Container removed in finally block
    expect(mockRemoveContainer).toHaveBeenCalled();
  });

  // ── Test 13: Container creation failure ──────────────────────────────────────

  it('sets AgentRun to failed and emits agent:completed with failed status when createAgentContainer throws', async () => {
    mockCreateAgentContainer.mockRejectedValue(new Error('Docker daemon not running'));

    await expect(spawnAgent({ role: 'coder', taskId: TASK_ID, cycleId: CYCLE_ID })).rejects.toThrow(
      'Docker daemon not running'
    );

    // AgentRun updated to 'failed'
    expect(mockAgentRunUpdateOne).toHaveBeenCalledWith(
      { _id: expect.any(String) },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'failed' }),
      })
    );

    // agent:completed broadcast with status 'failed'
    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:completed',
      expect.objectContaining({ status: 'failed' })
    );

    // No further container operations were performed after the failure
    expect(mockInjectContext).not.toHaveBeenCalled();
    expect(mockAttachStream).not.toHaveBeenCalled();
    expect(mockStartContainer).not.toHaveBeenCalled();
    expect(mockWaitForContainer).not.toHaveBeenCalled();
    // containerHandle was never set, so removeContainer must not be called
    expect(mockRemoveContainer).not.toHaveBeenCalled();
  });

  // ── Test 14: captureStream costUsd propagated to AgentRun ────────────────────

  it('stores costUsd from captureStream completion event on the AgentRun document', async () => {
    mockCaptureStream.mockResolvedValue({
      eventCount: 10,
      completionEvent: {
        costUsd: 0.42,
        inputTokens: 5000,
        outputTokens: 300,
        durationMs: 12000,
      },
      structuredOutput: {
        summary: 'done with cost',
        filesChanged: [],
        decisions: [],
        contextFeedback: { useful: [], missing: [], unnecessary: [] },
        branch: 'task-060-cost-test',
        prNumber: 88,
      },
    });

    await spawnAgent({ role: 'coder', taskId: TASK_ID, cycleId: CYCLE_ID });

    // The final AgentRun updateOne call should include costUsd: 0.42
    const costCall = mockAgentRunUpdateOne.mock.calls.find((call) => {
      const $set = (call[1] as { $set?: Record<string, unknown> })?.$set;
      return $set?.costUsd !== undefined;
    });

    expect(costCall).toBeDefined();
    expect((costCall![1] as { $set: Record<string, unknown> }).$set.costUsd).toBe(0.42);
  });
});
