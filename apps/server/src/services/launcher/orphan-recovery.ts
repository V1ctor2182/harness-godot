import { AgentRunModel } from '../../models/agent-run.js';
import { TaskModel } from '../../models/task.js';
import { JobModel } from '../../models/job.js';
import { findOrphanedContainers, removeContainer } from './container.js';
import { docker } from '../../lib/docker.js';
import { isDockerAvailable } from '../../lib/docker.js';
import { createJob } from '../job-queue.js';
import { DEFAULT_MAX_RETRIES, MAX_RETRY_CODER_RUNS } from '@ludus/shared';
import { broadcast } from '../sse-manager.js';

/**
 * Fail any jobs still marked 'active' from a previous server lifetime.
 * These handlers were interrupted by shutdown and will never complete.
 * Must run before orphan recovery and stale task recovery so that
 * subsequent job-exists checks see accurate state.
 */
export async function failInterruptedJobs(): Promise<void> {
  const result = await JobModel.updateMany(
    { status: 'active' },
    {
      $set: {
        status: 'failed',
        failedReason: 'server restart: job was active when server shut down',
        completedAt: new Date(),
      },
    }
  );
  if (result.modifiedCount > 0) {
    console.log(
      `Failed ${result.modifiedCount} interrupted active job(s) from previous server lifetime`
    );
  }
}

export async function reconcileOrphans(): Promise<void> {
  if (!(await isDockerAvailable())) {
    console.log('Docker not available — skipping orphan recovery');
    return;
  }

  console.log('Scanning for orphaned agent containers...');
  const orphans = await findOrphanedContainers();

  if (orphans.length === 0) {
    console.log('No orphaned containers found');
    return;
  }

  console.log(`Found ${orphans.length} orphaned container(s)`);

  for (const info of orphans) {
    const containerId = info.Id;
    // Read both new and legacy label keys so the first boot after the
    // Phase A rename still cleans up containers started under the old label.
    const agentRunId =
      info.Labels?.['harness.agent-run-id'] ?? info.Labels?.['zombie-farm.agent-run-id'];
    const container = docker.getContainer(containerId);

    if (!agentRunId) {
      // No matching agent run — fully orphaned
      console.log(`Removing fully orphaned container ${containerId.slice(0, 12)}`);
      await removeContainer(container);
      continue;
    }

    const run = await AgentRunModel.findById(agentRunId);

    if (!run) {
      console.log(`Removing container ${containerId.slice(0, 12)} — no AgentRun document`);
      await removeContainer(container);
      continue;
    }

    if (['completed', 'failed', 'timeout', 'killed'].includes(run.status)) {
      // Already terminal — just clean up the container
      console.log(`Removing stale container for ${agentRunId} (status: ${run.status})`);
      await removeContainer(container);
      continue;
    }

    // Run was in progress when server died
    console.log(`Recovering orphaned run ${agentRunId} (status: ${run.status})`);

    await AgentRunModel.updateOne(
      { _id: agentRunId },
      {
        $set: {
          status: 'failed',
          error: 'server restart: orphaned container',
          completedAt: new Date(),
        },
      }
    );

    await removeContainer(container);

    // Create retry job if within retry limit
    if (run.taskId) {
      const task = await (
        await import('../../models/task.js')
      ).TaskModel.findById(run.taskId).lean();
      const retryCount = task?.retryCount ?? 0;
      if (retryCount < DEFAULT_MAX_RETRIES) {
        await createJob('spawn', 'agent', {
          role: run.role,
          taskId: run.taskId,
          cycleId: run.cycleId,
          retryContext: {
            previousError: 'server restart: orphaned container',
            previousSummary: run.output?.summary,
          },
        });
      }
    }
  }

  // Also reconcile spending
  await reconcileSpending();
}

async function reconcileSpending(): Promise<void> {
  const { ControlModel } = await import('../../models/control.js');

  const result = await AgentRunModel.aggregate([
    { $match: { costUsd: { $exists: true, $ne: null } } },
    { $group: { _id: null, total: { $sum: '$costUsd' } } },
  ]);

  const actualTotal = result[0]?.total ?? 0;
  const control = await ControlModel.findById('singleton');

  if (control && Math.abs(control.spentUsd - actualTotal) > 0.01) {
    console.log(`Spending reconciliation: ${control.spentUsd} → ${actualTotal}`);
    await ControlModel.updateOne({ _id: 'singleton' }, { $set: { spentUsd: actualTotal } });
  }
}

/**
 * Recover tasks stuck in non-terminal states whose assigned agent runs have
 * already terminated (or whose handler was lost) but whose follow-up
 * processing was interrupted (e.g. by an ungraceful server shutdown).
 *
 * Catches two scenarios that reconcileOrphans() misses:
 *   1. Agent run is terminal but no follow-up job was created
 *   2. Agent run is still 'running'/'starting' but the container is gone
 *      and the spawn job was failed by failInterruptedJobs()
 *
 * For case 2, we first mark the agent run as failed before proceeding
 * with the same retry/fail logic.
 */
export async function recoverStaleTasks(): Promise<void> {
  const TERMINAL_RUN_STATUSES = ['completed', 'failed', 'timeout', 'killed'];

  // Find tasks stuck in in-progress or in-review
  const stuckTasks = await TaskModel.find({
    status: { $in: ['in-progress', 'in-review'] },
    assignedTo: { $exists: true, $ne: null },
  }).lean();

  if (stuckTasks.length === 0) return;

  console.log(`Checking ${stuckTasks.length} non-terminal task(s) for stale state...`);

  const affectedCycleIds = new Set<number>();

  for (const task of stuckTasks) {
    const agentRunId = task.assignedTo as string;
    const run = await AgentRunModel.findById(agentRunId).lean();

    if (!run) continue;

    // If the run is still 'running' or 'starting', check if its handler is gone
    // (i.e. no active/pending jobs that would be processing it). This happens when
    // the container exited and was cleaned up while the server was down, so orphan
    // recovery can't find it.
    if (!TERMINAL_RUN_STATUSES.includes(run.status)) {
      const hasActiveSpawnJob = await JobModel.exists({
        type: 'spawn',
        status: { $in: ['pending', 'active'] },
        'payload.taskId': task._id,
      });
      if (hasActiveSpawnJob) continue;

      // No handler for this run — mark it failed so recovery can proceed
      console.log(
        `Marking abandoned agent run ${agentRunId} as failed (status was: ${run.status})`
      );
      await AgentRunModel.updateOne(
        { _id: agentRunId },
        {
          $set: {
            status: 'failed',
            error: 'server restart: agent run handler lost',
            completedAt: new Date(),
          },
        }
      );
      // Update our local copy for the recovery logic below
      (run as Record<string, unknown>).status = 'failed';
      (run as Record<string, unknown>).error = 'server restart: agent run handler lost';
    }

    // Check if there are already pending/active jobs for this task
    const existingJob = await JobModel.exists({
      status: { $in: ['pending', 'active'] },
      $or: [
        { 'payload.taskId': task._id },
        // Also check advance-cycle jobs for the cycle
        { type: 'advance-cycle', 'payload.cycleId': task.cycleId },
      ],
    });
    if (existingJob) continue;

    // This task is stuck — the agent run terminated but no follow-up was created
    console.log(
      `Recovering stale task ${task._id} (status: ${task.status}, ` +
        `run: ${agentRunId}, runStatus: ${run.status}, retryCount: ${task.retryCount})`
    );

    affectedCycleIds.add(task.cycleId);

    // If the run completed successfully with a PR, restore the wait-for-ci flow
    if (run.status === 'completed' && task.prNumber) {
      // Task should be in-review awaiting CI — create wait-for-ci job
      if (task.status !== 'in-review') {
        await TaskModel.updateOne(
          { _id: task._id },
          {
            $set: { status: 'in-review' },
            $push: {
              activityLog: {
                timestamp: new Date(),
                action: 'Recovered by stale task detection — restoring CI wait',
              },
            },
          }
        );
      }
      await createJob('wait-for-ci', 'infra', {
        taskId: task._id,
        prNumber: task.prNumber,
      });
      continue;
    }

    // The run failed (or completed without a PR). Check retry budget.
    const coderRuns = await AgentRunModel.countDocuments({
      taskId: task._id,
      role: 'coder',
    });

    if (coderRuns >= MAX_RETRY_CODER_RUNS) {
      // Max retries exhausted — mark task as failed
      await TaskModel.updateOne(
        { _id: task._id },
        {
          $set: { status: 'failed' },
          $push: {
            activityLog: {
              timestamp: new Date(),
              action: `Failed: recovered by stale task detection after ${coderRuns} coder attempts`,
            },
          },
        }
      );
      broadcast('task:status_changed', {
        taskId: task._id,
        status: 'failed',
        cycleId: task.cycleId,
      });
    } else {
      // Retries remaining — set back to ready and create a retry spawn job
      await TaskModel.updateOne(
        { _id: task._id },
        {
          $set: { status: 'ready' },
          $push: {
            activityLog: {
              timestamp: new Date(),
              action: `Recovered by stale task detection — retrying (attempt ${coderRuns + 1})`,
            },
          },
        }
      );
      broadcast('task:status_changed', {
        taskId: task._id,
        status: 'ready',
        cycleId: task.cycleId,
      });

      await createJob('spawn', 'agent', {
        role: 'coder',
        taskId: task._id,
        cycleId: task.cycleId,
        retryContext: {
          previousError: run.error ?? 'server restart: stale task recovered',
          previousSummary: (run.output as Record<string, unknown> | undefined)?.summary as
            | string
            | undefined,
        },
      });
    }
  }

  // Re-evaluate cycle advancement for all affected cycles
  if (affectedCycleIds.size > 0) {
    const { maybeAdvanceCycle } = await import('./spawner.js');
    for (const cycleId of affectedCycleIds) {
      await maybeAdvanceCycle(cycleId);
    }
  }
}
