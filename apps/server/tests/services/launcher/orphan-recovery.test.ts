/**
 * Unit tests for orphan-recovery.ts
 *
 * Tests cover all 7 scenarios for reconcileOrphans():
 *   1. Docker not available → early return, no container ops
 *   2. No orphaned containers → no removes
 *   3. Container with no zombie-farm.agent-run-id label → removeContainer called
 *   4. Container with label but no AgentRun document → removeContainer called
 *   5. Container with label and terminal AgentRun (status 'completed') → removeContainer, no retry
 *   6. Container with label and in-progress AgentRun with taskId under retry cap → mark failed, remove, createJob
 *   7. Container with in-progress AgentRun but taskId retryCount at/above cap → no createJob
 *
 * Tests for recoverStaleTasks():
 *   8. No stuck tasks → early return
 *   9. Task with still-active agent run → skip
 *  10. Task with terminated run but existing job → skip
 *  11. Task with completed run and PR → create wait-for-ci job
 *  12. Task with failed run under retry cap → set ready + create spawn job
 *  13. Task with failed run over retry cap → mark failed
 *  14. maybeAdvanceCycle called for affected cycles
 *
 * All Docker operations and MongoDB model calls are mocked — no real connections made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (must be created before module imports) ────────────────────

const mockIsDockerAvailable = vi.hoisted(() => vi.fn());
const mockFindOrphanedContainers = vi.hoisted(() => vi.fn());
const mockDockerGetContainer = vi.hoisted(() => vi.fn());
const mockRemoveContainer = vi.hoisted(() => vi.fn());
const mockAgentRunFindById = vi.hoisted(() => vi.fn());
const mockAgentRunUpdateOne = vi.hoisted(() => vi.fn());
const mockAgentRunAggregate = vi.hoisted(() => vi.fn());
const mockAgentRunCountDocuments = vi.hoisted(() => vi.fn());
const mockTaskFindById = vi.hoisted(() => vi.fn());
const mockTaskFind = vi.hoisted(() => vi.fn());
const mockTaskUpdateOne = vi.hoisted(() => vi.fn());
const mockJobExists = vi.hoisted(() => vi.fn());
const mockJobUpdateMany = vi.hoisted(() => vi.fn());
const mockCreateJob = vi.hoisted(() => vi.fn());
const mockControlFindById = vi.hoisted(() => vi.fn());
const mockControlUpdateOne = vi.hoisted(() => vi.fn());
const mockBroadcast = vi.hoisted(() => vi.fn());
const mockMaybeAdvanceCycle = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../src/lib/docker.js', () => ({
  isDockerAvailable: mockIsDockerAvailable,
  docker: {
    getContainer: mockDockerGetContainer,
  },
}));

vi.mock('../../../src/services/launcher/container.js', () => ({
  findOrphanedContainers: mockFindOrphanedContainers,
  removeContainer: mockRemoveContainer,
}));

vi.mock('../../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    findById: mockAgentRunFindById,
    updateOne: mockAgentRunUpdateOne,
    aggregate: mockAgentRunAggregate,
    countDocuments: mockAgentRunCountDocuments,
  },
}));

vi.mock('../../../src/models/task.js', () => ({
  TaskModel: {
    findById: mockTaskFindById,
    find: mockTaskFind,
    updateOne: mockTaskUpdateOne,
  },
}));

vi.mock('../../../src/models/job.js', () => ({
  JobModel: {
    exists: mockJobExists,
    updateMany: mockJobUpdateMany,
  },
}));

vi.mock('../../../src/services/job-queue.js', () => ({
  createJob: mockCreateJob,
}));

vi.mock('../../../src/services/sse-manager.js', () => ({
  broadcast: mockBroadcast,
}));

vi.mock('../../../src/models/control.js', () => ({
  ControlModel: {
    findById: mockControlFindById,
    updateOne: mockControlUpdateOne,
  },
}));

vi.mock('../../../src/services/launcher/spawner.js', () => ({
  maybeAdvanceCycle: mockMaybeAdvanceCycle,
}));

// ─── Import function under test (after mocks) ─────────────────────────────────

import {
  failInterruptedJobs,
  reconcileOrphans,
  recoverStaleTasks,
} from '../../../src/services/launcher/orphan-recovery.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContainerInfo(
  overrides: {
    Id?: string;
    Labels?: Record<string, string> | null;
  } = {}
) {
  return {
    Id: overrides.Id ?? 'container-abc123',
    Labels: overrides.Labels !== undefined ? overrides.Labels : { 'zombie-farm.agent-run-id': 'run-001' },
  };
}

// A fake container object (the result of docker.getContainer())
const fakeContainer = { id: 'container-abc123' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('failInterruptedJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks all active jobs as failed', async () => {
    mockJobUpdateMany.mockResolvedValue({ modifiedCount: 3 });

    await failInterruptedJobs();

    expect(mockJobUpdateMany).toHaveBeenCalledWith(
      { status: 'active' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          failedReason: 'server restart: job was active when server shut down',
        }),
      })
    );
  });

  it('does nothing when no active jobs exist', async () => {
    mockJobUpdateMany.mockResolvedValue({ modifiedCount: 0 });

    await failInterruptedJobs();

    expect(mockJobUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe('reconcileOrphans', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no spending drift so reconcileSpending is a no-op
    mockAgentRunAggregate.mockResolvedValue([{ total: 10 }]);
    mockControlFindById.mockResolvedValue({ spentUsd: 10 });
    mockControlUpdateOne.mockResolvedValue({});

    mockDockerGetContainer.mockReturnValue(fakeContainer);
    mockRemoveContainer.mockResolvedValue(undefined);
    mockAgentRunUpdateOne.mockResolvedValue({});
    mockCreateJob.mockResolvedValue({ _id: 'job-001' });
  });

  // ── Scenario 1: Docker not available ──────────────────────────────────────

  it('returns early without any container ops when Docker is not available', async () => {
    mockIsDockerAvailable.mockResolvedValue(false);

    await reconcileOrphans();

    expect(mockFindOrphanedContainers).not.toHaveBeenCalled();
    expect(mockRemoveContainer).not.toHaveBeenCalled();
    expect(mockAgentRunFindById).not.toHaveBeenCalled();
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  // ── Scenario 2: No orphaned containers ────────────────────────────────────

  it('does nothing when there are no orphaned containers', async () => {
    mockIsDockerAvailable.mockResolvedValue(true);
    mockFindOrphanedContainers.mockResolvedValue([]);

    await reconcileOrphans();

    expect(mockRemoveContainer).not.toHaveBeenCalled();
    expect(mockAgentRunFindById).not.toHaveBeenCalled();
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  // ── Scenario 3: Container with no zombie-farm.agent-run-id label ──────────────

  it('removes a container that has no zombie-farm.agent-run-id label', async () => {
    mockIsDockerAvailable.mockResolvedValue(true);
    const container = makeContainerInfo({ Labels: {} }); // no agent-run-id label
    mockFindOrphanedContainers.mockResolvedValue([container]);

    await reconcileOrphans();

    expect(mockDockerGetContainer).toHaveBeenCalledWith(container.Id);
    expect(mockRemoveContainer).toHaveBeenCalledWith(fakeContainer);
    // No AgentRun lookup needed
    expect(mockAgentRunFindById).not.toHaveBeenCalled();
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  // ── Scenario 4: Container with label but no AgentRun document ────────────

  it('removes the container when there is no matching AgentRun document', async () => {
    mockIsDockerAvailable.mockResolvedValue(true);
    const container = makeContainerInfo({ Labels: { 'zombie-farm.agent-run-id': 'run-ghost' } });
    mockFindOrphanedContainers.mockResolvedValue([container]);
    mockAgentRunFindById.mockResolvedValue(null);

    await reconcileOrphans();

    expect(mockAgentRunFindById).toHaveBeenCalledWith('run-ghost');
    expect(mockRemoveContainer).toHaveBeenCalledWith(fakeContainer);
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  // ── Scenario 5: Terminal AgentRun (status 'completed') ───────────────────

  it('removes a stale container for a completed AgentRun without creating a retry job', async () => {
    mockIsDockerAvailable.mockResolvedValue(true);
    const container = makeContainerInfo({ Labels: { 'zombie-farm.agent-run-id': 'run-done' } });
    mockFindOrphanedContainers.mockResolvedValue([container]);
    mockAgentRunFindById.mockResolvedValue({
      _id: 'run-done',
      status: 'completed',
      role: 'coder',
      taskId: 'TASK-001',
      cycleId: 1,
      output: {},
    });

    await reconcileOrphans();

    expect(mockRemoveContainer).toHaveBeenCalledWith(fakeContainer);
    // Should NOT attempt to mark the run failed or create a retry job
    expect(mockAgentRunUpdateOne).not.toHaveBeenCalled();
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  // ── Scenario 6: In-progress AgentRun with taskId under retry cap ─────────

  it('marks an in-progress run as failed, removes the container, and creates a retry job when under the retry cap', async () => {
    mockIsDockerAvailable.mockResolvedValue(true);
    const container = makeContainerInfo({ Labels: { 'zombie-farm.agent-run-id': 'run-active' } });
    mockFindOrphanedContainers.mockResolvedValue([container]);
    mockAgentRunFindById.mockResolvedValue({
      _id: 'run-active',
      status: 'running',
      role: 'coder',
      taskId: 'TASK-002',
      cycleId: 2,
      output: { summary: 'Partial work done' },
    });
    // retryCount = 0 < DEFAULT_MAX_RETRIES (3)
    mockTaskFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'TASK-002', retryCount: 0 }),
    });

    await reconcileOrphans();

    // Run should be marked as failed
    expect(mockAgentRunUpdateOne).toHaveBeenCalledWith(
      { _id: 'run-active' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          error: 'server restart: orphaned container',
        }),
      })
    );

    // Container should be removed
    expect(mockRemoveContainer).toHaveBeenCalledWith(fakeContainer);

    // A retry spawn job should be created
    expect(mockCreateJob).toHaveBeenCalledWith(
      'spawn',
      'agent',
      expect.objectContaining({
        role: 'coder',
        taskId: 'TASK-002',
        cycleId: 2,
        retryContext: expect.objectContaining({
          previousError: 'server restart: orphaned container',
          previousSummary: 'Partial work done',
        }),
      })
    );
  });

  // ── Scenario 7: In-progress AgentRun but retryCount at/above cap ─────────

  it('does not create a retry job when the task retryCount is at or above the cap', async () => {
    mockIsDockerAvailable.mockResolvedValue(true);
    const container = makeContainerInfo({ Labels: { 'zombie-farm.agent-run-id': 'run-maxed' } });
    mockFindOrphanedContainers.mockResolvedValue([container]);
    mockAgentRunFindById.mockResolvedValue({
      _id: 'run-maxed',
      status: 'running',
      role: 'coder',
      taskId: 'TASK-003',
      cycleId: 3,
      output: null,
    });
    // retryCount = 3 >= DEFAULT_MAX_RETRIES (3) — at the cap
    mockTaskFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'TASK-003', retryCount: 3 }),
    });

    await reconcileOrphans();

    // Run should still be marked failed and container removed
    expect(mockAgentRunUpdateOne).toHaveBeenCalledWith(
      { _id: 'run-maxed' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'failed' }),
      })
    );
    expect(mockRemoveContainer).toHaveBeenCalledWith(fakeContainer);

    // But NO retry job should be created
    expect(mockCreateJob).not.toHaveBeenCalled();
  });
});

// ─── recoverStaleTasks ───────────────────────────────────────────────────────

describe('recoverStaleTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateJob.mockResolvedValue('job-001');
    mockTaskUpdateOne.mockResolvedValue({});
    mockBroadcast.mockReturnValue(undefined);
    mockMaybeAdvanceCycle.mockResolvedValue(undefined);
  });

  // ── Scenario 8: No stuck tasks ──────────────────────────────────────────

  it('returns early when no tasks are in non-terminal states', async () => {
    mockTaskFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

    await recoverStaleTasks();

    expect(mockAgentRunFindById).not.toHaveBeenCalled();
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  // ── Scenario 9: Task with still-active agent run that has a live handler ──

  it('skips tasks whose assigned agent run still has an active spawn job', async () => {
    mockTaskFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'TASK-010',
          status: 'in-progress',
          assignedTo: 'coder-abc',
          cycleId: 5,
          retryCount: 0,
        },
      ]),
    });
    mockAgentRunFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'coder-abc', status: 'running' }),
    });
    // There IS an active spawn job handling this run
    mockJobExists.mockResolvedValue({ _id: 'active-spawn-job' });

    await recoverStaleTasks();

    // Should not recover — the spawn job is still processing
    expect(mockCreateJob).not.toHaveBeenCalled();
    expect(mockTaskUpdateOne).not.toHaveBeenCalled();
    expect(mockAgentRunUpdateOne).not.toHaveBeenCalled();
  });

  // ── Scenario 9b: Ghost run — running status but no handler ────────────────

  it('marks abandoned running agent runs as failed and recovers the task', async () => {
    mockTaskFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'TASK-010b',
          status: 'in-progress',
          assignedTo: 'coder-ghost',
          cycleId: 5,
          retryCount: 0,
        },
      ]),
    });
    mockAgentRunFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'coder-ghost',
        status: 'running',
        error: undefined,
      }),
    });
    // No active spawn job — the handler is gone
    mockJobExists.mockResolvedValue(null);
    mockAgentRunCountDocuments.mockResolvedValue(1); // under cap

    await recoverStaleTasks();

    // Should mark the agent run as failed
    expect(mockAgentRunUpdateOne).toHaveBeenCalledWith(
      { _id: 'coder-ghost' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          error: 'server restart: agent run handler lost',
        }),
      })
    );

    // Should set task to ready and create retry spawn
    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: 'TASK-010b' },
      expect.objectContaining({ $set: { status: 'ready' } })
    );
    expect(mockCreateJob).toHaveBeenCalledWith(
      'spawn',
      'agent',
      expect.objectContaining({
        role: 'coder',
        taskId: 'TASK-010b',
        cycleId: 5,
      })
    );
  });

  // ── Scenario 10: Task with terminated run but existing job ──────────────

  it('skips tasks that already have a pending/active job', async () => {
    mockTaskFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'TASK-011',
          status: 'in-progress',
          assignedTo: 'coder-def',
          cycleId: 5,
          retryCount: 0,
        },
      ]),
    });
    mockAgentRunFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'coder-def', status: 'failed' }),
    });
    mockJobExists.mockResolvedValue({ _id: 'existing-job' }); // truthy = job exists

    await recoverStaleTasks();

    expect(mockCreateJob).not.toHaveBeenCalled();
    expect(mockTaskUpdateOne).not.toHaveBeenCalled();
  });

  // ── Scenario 11: Completed run with PR → create wait-for-ci ─────────────

  it('restores the CI wait flow for a completed run with a PR', async () => {
    mockTaskFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'TASK-012',
          status: 'in-progress',
          assignedTo: 'coder-ghi',
          cycleId: 6,
          retryCount: 0,
          prNumber: 42,
        },
      ]),
    });
    mockAgentRunFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'coder-ghi', status: 'completed' }),
    });
    mockJobExists.mockResolvedValue(null); // no existing jobs

    await recoverStaleTasks();

    // Should set task to in-review
    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: 'TASK-012' },
      expect.objectContaining({
        $set: { status: 'in-review' },
      })
    );

    // Should create wait-for-ci job
    expect(mockCreateJob).toHaveBeenCalledWith('wait-for-ci', 'infra', {
      taskId: 'TASK-012',
      prNumber: 42,
    });

    // Should check cycle advancement
    expect(mockMaybeAdvanceCycle).toHaveBeenCalledWith(6);
  });

  // ── Scenario 12: Failed run under retry cap → ready + spawn ─────────────

  it('sets task to ready and creates a retry spawn when under the coder run cap', async () => {
    mockTaskFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'TASK-013',
          status: 'in-progress',
          assignedTo: 'coder-jkl',
          cycleId: 7,
          retryCount: 0,
        },
      ]),
    });
    mockAgentRunFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'coder-jkl',
        status: 'failed',
        error: 'Container exited with code 1',
        output: { summary: 'partial work' },
      }),
    });
    mockJobExists.mockResolvedValue(null);
    mockAgentRunCountDocuments.mockResolvedValue(1); // 1 coder run < MAX_RETRY_CODER_RUNS (3)

    await recoverStaleTasks();

    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: 'TASK-013' },
      expect.objectContaining({
        $set: { status: 'ready' },
      })
    );

    expect(mockCreateJob).toHaveBeenCalledWith(
      'spawn',
      'agent',
      expect.objectContaining({
        role: 'coder',
        taskId: 'TASK-013',
        cycleId: 7,
        retryContext: expect.objectContaining({
          previousError: 'Container exited with code 1',
        }),
      })
    );

    expect(mockBroadcast).toHaveBeenCalledWith('task:status_changed', {
      taskId: 'TASK-013',
      status: 'ready',
      cycleId: 7,
    });
  });

  // ── Scenario 13: Failed run over retry cap → mark failed ────────────────

  it('marks the task as failed when coder run count exceeds the cap', async () => {
    mockTaskFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'TASK-014',
          status: 'in-progress',
          assignedTo: 'coder-mno',
          cycleId: 8,
          retryCount: 5,
        },
      ]),
    });
    mockAgentRunFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'coder-mno',
        status: 'failed',
        error: 'Container exited with code 1',
      }),
    });
    mockJobExists.mockResolvedValue(null);
    mockAgentRunCountDocuments.mockResolvedValue(5); // 5 >= MAX_RETRY_CODER_RUNS (3)

    await recoverStaleTasks();

    expect(mockTaskUpdateOne).toHaveBeenCalledWith(
      { _id: 'TASK-014' },
      expect.objectContaining({
        $set: { status: 'failed' },
      })
    );

    expect(mockBroadcast).toHaveBeenCalledWith('task:status_changed', {
      taskId: 'TASK-014',
      status: 'failed',
      cycleId: 8,
    });

    // No spawn job should be created
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  // ── Scenario 14: maybeAdvanceCycle called for affected cycles ────────────

  it('calls maybeAdvanceCycle for each affected cycle after recovery', async () => {
    mockTaskFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'TASK-015',
          status: 'in-progress',
          assignedTo: 'coder-p',
          cycleId: 9,
          retryCount: 10,
        },
        {
          _id: 'TASK-016',
          status: 'in-progress',
          assignedTo: 'coder-q',
          cycleId: 10,
          retryCount: 10,
        },
      ]),
    });
    // Both runs are terminal
    mockAgentRunFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ status: 'failed', error: 'crash' }),
    });
    mockJobExists.mockResolvedValue(null);
    mockAgentRunCountDocuments.mockResolvedValue(10); // over cap → both fail

    await recoverStaleTasks();

    expect(mockMaybeAdvanceCycle).toHaveBeenCalledWith(9);
    expect(mockMaybeAdvanceCycle).toHaveBeenCalledWith(10);
    expect(mockMaybeAdvanceCycle).toHaveBeenCalledTimes(2);
  });
});
