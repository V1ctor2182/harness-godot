import { v4 as uuid } from 'uuid';
import { AgentRunModel } from '../../models/agent-run.js';
import { TaskModel } from '../../models/task.js';
import { ControlModel } from '../../models/control.js';
import { JobModel } from '../../models/job.js';
import { config } from '../../config.js';
import {
  ROLE_TIMEOUT_MS,
  SPENDING_WARNING_THRESHOLD,
  MAX_REVIEW_CYCLES,
  MAX_RETRY_CODER_RUNS,
} from '@zombie-farm/shared';
import { buildContext, processContextFeedback } from './context-builder.js';
import { TestResultModel } from '../../models/test-result.js';
import { ScreenshotModel } from '../../models/screenshot.js';
import {
  createAgentContainer,
  injectContext,
  attachStream,
  startContainer,
  waitForContainer,
  removeContainer,
} from './container.js';
import type { ContainerHandle } from './container.js';
import { captureStream, emitSystemEvent } from './stream-capture.js';
import { broadcast } from '../sse-manager.js';
import { createJob, persistRetryReviewIssues } from '../job-queue.js';
import type { AgentRunStatus, RetryContext } from '@zombie-farm/shared';

export interface SpawnParams {
  role: string;
  taskId?: string;
  cycleId: number;
  retryContext?: RetryContext;
}

export async function spawnAgent(params: SpawnParams): Promise<string> {
  const { role, taskId, cycleId, retryContext } = params;
  const agentRunId = `${role}-${uuid().slice(0, 8)}`;

  const timeoutMs = ROLE_TIMEOUT_MS[role] ?? config.coderTimeoutMs;
  const budgetUsd = config.defaultBudgetUsd;
  const model = config.defaultModel;

  // 1. PREPARE — build context
  const context = await buildContext({ role, taskId, cycleId, retryContext });

  // 2. Create AgentRun document
  const agentRun = await AgentRunModel.create({
    _id: agentRunId,
    role,
    status: 'starting' as AgentRunStatus,
    taskId,
    cycleId,
    systemPrompt: context.systemPromptContent,
    taskPrompt: context.taskPromptContent,
    model,
    budgetUsd,
    eventCount: 0,
    timeoutAt: new Date(Date.now() + timeoutMs),
    contextFiles: context.knowledgeFiles,
  });

  // Update task status
  if (taskId) {
    await TaskModel.updateOne(
      { _id: taskId },
      {
        $set: { status: 'in-progress', assignedTo: agentRunId },
        $push: {
          activityLog: { timestamp: new Date(), action: `Assigned to ${agentRunId}`, agentRunId },
        },
      }
    );
    broadcast('task:status_changed', { taskId, status: 'in-progress', cycleId });
  }

  broadcast('agent:started', { agentRunId, role, taskId, cycleId });

  // Declared outside try so the finally block can always clean up the container
  let containerHandle: ContainerHandle | undefined;

  try {
    // 3. CREATE container
    containerHandle = await createAgentContainer({
      agentRunId,
      role,
      model,
      budgetUsd,
      systemPromptContent: context.systemPromptContent,
      taskPromptContent: context.taskPromptContent,
    });
    const { container, containerId } = containerHandle;

    await AgentRunModel.updateOne(
      { _id: agentRunId },
      { $set: { containerId, status: 'running' } }
    );

    // 4. INJECT context files
    await injectContext(container, context.systemPromptContent, context.taskPromptContent);

    // 5. ATTACH to stdout before start
    const stream = await attachStream(container);

    // 6. START container
    await startContainer(container);
    await emitSystemEvent(agentRunId, 'Container started');

    // 7. STREAM — capture events (runs concurrently with WAIT)
    const capturePromise = captureStream(stream, agentRunId);

    // 8. WAIT for container exit
    const { exitCode, timedOut } = await waitForContainer(container, timeoutMs);

    // Wait for stream capture to finish
    const captureResult = await capturePromise;

    // 9. COLLECT — process results
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - agentRun.startedAt.getTime();

    let finalStatus: AgentRunStatus = 'completed';
    let error: string | undefined;

    if (timedOut) {
      finalStatus = 'timeout';
      error = `Agent timed out after ${timeoutMs}ms`;
    } else if (exitCode !== 0) {
      finalStatus = 'failed';
      error = `Container exited with code ${exitCode}`;
      if (exitCode === 137) error = 'Container killed (OOM or external signal)';
    }

    // Update AgentRun
    const updateFields: Record<string, unknown> = {
      status: finalStatus,
      completedAt,
      durationMs,
      exitCode,
      error,
      eventCount: captureResult.eventCount,
    };

    if (captureResult.completionEvent) {
      updateFields.costUsd = captureResult.completionEvent.costUsd;
      updateFields.tokenUsage = {
        inputTokens: captureResult.completionEvent.inputTokens,
        outputTokens: captureResult.completionEvent.outputTokens,
      };
    }

    // Process structured output
    if (captureResult.structuredOutput) {
      const outputDoc: Record<string, unknown> = {
        summary: captureResult.structuredOutput.summary,
        filesChanged: captureResult.structuredOutput.filesChanged,
        decisions: captureResult.structuredOutput.decisions,
        branch: captureResult.structuredOutput.branch,
        prNumber: captureResult.structuredOutput.prNumber,
      };
      // Store plan for orchestrator runs (schema is strict: false)
      if (captureResult.structuredOutput.plan) {
        outputDoc.plan = captureResult.structuredOutput.plan;
      }
      // Store review verdict and issues for reviewer runs
      if (captureResult.structuredOutput.reviewVerdict) {
        outputDoc.reviewVerdict = captureResult.structuredOutput.reviewVerdict;
      }
      if (captureResult.structuredOutput.issues) {
        outputDoc.issues = captureResult.structuredOutput.issues;
      }
      if (captureResult.structuredOutput.suggestions) {
        outputDoc.suggestions = captureResult.structuredOutput.suggestions;
      }
      updateFields.output = outputDoc;

      if (captureResult.structuredOutput.branch) {
        updateFields.branch = captureResult.structuredOutput.branch;
      }
      if (captureResult.structuredOutput.prNumber) {
        updateFields.prNumber = captureResult.structuredOutput.prNumber;
      }
    } else if (finalStatus === 'completed') {
      updateFields.outputParseError = true;
    }

    await AgentRunModel.updateOne({ _id: agentRunId }, { $set: updateFields });

    // Update spending
    if (captureResult.completionEvent?.costUsd) {
      const control = await ControlModel.findOneAndUpdate(
        { _id: 'singleton' },
        { $inc: { spentUsd: captureResult.completionEvent.costUsd } },
        { returnDocument: 'after' }
      );

      // Check spending thresholds
      if (control?.spendingCapUsd) {
        const pct = control.spentUsd / control.spendingCapUsd;
        if (pct >= SPENDING_WARNING_THRESHOLD) {
          broadcast('system:spending_warning', {
            spentUsd: control.spentUsd,
            spendingCapUsd: control.spendingCapUsd,
            percentUsed: Math.round(pct * 100),
            action: pct >= 1 ? 'hard_cap' : 'paused',
          });
          if (pct >= SPENDING_WARNING_THRESHOLD && pct < 1) {
            await ControlModel.updateOne({ _id: 'singleton' }, { $set: { mode: 'paused' } });
          }
        }
      }
    }

    // Process context feedback
    if (captureResult.structuredOutput?.contextFeedback) {
      await processContextFeedback(agentRunId, captureResult.structuredOutput.contextFeedback);
    }

    // Bug #2 fix: Persist Godot test results and screenshots from structured output
    // These come from the agent's JSON output, NOT from stream events
    const godotOutput = captureResult.structuredOutput as Record<string, unknown> | undefined;
    if (godotOutput?.testResults && Array.isArray(godotOutput.testResults)) {
      for (const result of godotOutput.testResults) {
        await TestResultModel.create({ ...result, taskId, cycleId, agentRunId });
      }
    }
    if (godotOutput?.screenshots && Array.isArray(godotOutput.screenshots)) {
      for (const screenshot of godotOutput.screenshots) {
        await ScreenshotModel.create({ ...screenshot, taskId });
      }
    }

    broadcast('agent:completed', {
      agentRunId,
      role,
      cycleId,
      exitCode,
      costUsd: captureResult.completionEvent?.costUsd ?? 0,
      status: finalStatus,
    });

    // Create follow-up jobs based on agent role and outcome
    if (finalStatus === 'completed') {
      await createFollowUpJobs(role, agentRunId, cycleId, taskId, captureResult.structuredOutput);
    }

    return agentRunId;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await AgentRunModel.updateOne(
      { _id: agentRunId },
      { $set: { status: 'failed', error, completedAt: new Date() } }
    );
    broadcast('agent:completed', {
      agentRunId,
      role,
      cycleId,
      exitCode: -1,
      costUsd: 0,
      status: 'failed',
    });
    throw err;
  } finally {
    // Always remove the container — even if stream capture or processing throws
    if (containerHandle) {
      await removeContainer(containerHandle.container).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Failed to remove container for ${agentRunId}:`, msg);
      });
    }
  }
}

export async function createFollowUpJobs(
  role: string,
  agentRunId: string,
  cycleId: number,
  taskId: string | undefined,
  structuredOutput: import('@zombie-farm/shared').AgentStructuredOutput | undefined
): Promise<void> {
  if (role === 'orchestrator') {
    // Orchestrator completed — apply its plan to create tasks
    // advance-cycle is created by handleApplyPlan after tasks are created
    await createJob('apply-plan', 'infra', { agentRunId, cycleId });
  } else if (role === 'coder' && taskId) {
    // Coder completed — transition task based on whether it created a PR
    if (structuredOutput?.prNumber) {
      const repoUrl = config.githubRepoUrl.replace(/\.git$/, '');
      const prNumber = structuredOutput.prNumber;
      const prUrl = prNumber ? `${repoUrl}/pull/${prNumber}` : undefined;
      await TaskModel.updateOne(
        { _id: taskId },
        {
          $set: {
            status: 'in-review',
            branch: structuredOutput.branch,
            prNumber,
            prUrl,
          },
          $push: {
            activityLog: {
              timestamp: new Date(),
              action: `PR #${structuredOutput.prNumber} created by ${agentRunId}`,
              agentRunId,
            },
          },
        }
      );
      broadcast('task:status_changed', {
        taskId,
        status: 'in-review',
        prNumber: structuredOutput.prNumber,
        cycleId,
      });

      // Start CI monitoring
      await createJob('wait-for-ci', 'infra', { taskId, prNumber: structuredOutput.prNumber });
    } else {
      // Coder didn't report a PR — check if one exists on GitHub for the branch
      const { findPRByBranch } = await import('../github.js');
      const branch = structuredOutput?.branch;
      const foundPR = branch ? await findPRByBranch(branch) : null;

      if (foundPR) {
        // PR exists but wasn't captured in structured output — recover
        const repoUrl = config.githubRepoUrl.replace(/\.git$/, '');
        const foundPrUrl = `${repoUrl}/pull/${foundPR}`;
        await TaskModel.updateOne(
          { _id: taskId },
          {
            $set: {
              status: 'in-review',
              branch,
              prNumber: foundPR,
              prUrl: foundPrUrl,
            },
            $push: {
              activityLog: {
                timestamp: new Date(),
                action: `PR #${foundPR} found on branch ${branch} (recovered by launcher)`,
                agentRunId,
              },
            },
          }
        );
        broadcast('task:status_changed', {
          taskId,
          status: 'in-review',
          prNumber: foundPR,
          cycleId,
        });
        await createJob('wait-for-ci', 'infra', { taskId, prNumber: foundPR });
      } else {
        // No PR at all — retry the coder
        const coderRuns = await AgentRunModel.countDocuments({ taskId, role: 'coder' });

        if (coderRuns >= MAX_RETRY_CODER_RUNS) {
          await TaskModel.updateOne(
            { _id: taskId },
            {
              $set: { status: 'failed' },
              $push: {
                activityLog: {
                  timestamp: new Date(),
                  action: `Failed: no PR opened after ${coderRuns} coder attempts`,
                  agentRunId,
                },
              },
            }
          );
          broadcast('task:status_changed', { taskId, status: 'failed', cycleId });
        } else {
          await TaskModel.updateOne(
            { _id: taskId },
            {
              $set: { status: 'ready', lastRetryCause: 'no_pr' },
              $inc: { retryCount: 1 },
              $push: {
                activityLog: {
                  timestamp: new Date(),
                  action: `No PR opened by ${agentRunId} — retrying`,
                  agentRunId,
                },
              },
            }
          );
          broadcast('task:status_changed', { taskId, status: 'ready', cycleId });

          await createJob('spawn', 'agent', {
            role: 'coder',
            taskId,
            cycleId,
            retryContext: {
              previousError:
                'You completed the task but did not open a pull request. You MUST push your branch and run gh pr create. The task cannot advance without a PR.',
              previousSummary: structuredOutput?.summary,
              filesChanged: structuredOutput?.filesChanged ?? [],
            },
          });
        }
      }
    }

    // Unblock dependent tasks and spawn coder agents for them
    await unblockDependents(taskId, cycleId);

    // Check if all tasks in this cycle's current phase are done/in-review
    await maybeAdvanceCycle(cycleId);
  } else if (role === 'reviewer' && taskId) {
    // Reviewer completed — check verdict from structured output field, fall back to scanning decisions
    const reviewVerdict = structuredOutput?.reviewVerdict;
    const verdictFromDecisions = structuredOutput?.decisions?.find(
      (d) => d.toLowerCase().includes('approved') || d.toLowerCase().includes('changes-requested')
    );
    const isApproved =
      reviewVerdict === 'approved' ||
      (!reviewVerdict && verdictFromDecisions?.toLowerCase().includes('approved'));
    if (isApproved) {
      await TaskModel.updateOne(
        { _id: taskId },
        {
          $set: { status: 'done', reviewVerdict: 'approved' },
          $push: {
            activityLog: {
              timestamp: new Date(),
              action: `Review approved by ${agentRunId}`,
              agentRunId,
            },
          },
        }
      );
      broadcast('task:status_changed', { taskId, status: 'done', cycleId });

      // Unblock dependent tasks
      await unblockDependents(taskId, cycleId);
    } else {
      // Changes requested — check if we've exceeded the review cycle cap
      const reviewSummary = structuredOutput?.summary ?? 'Changes requested (no details)';
      const reviewRuns = await AgentRunModel.countDocuments({ taskId, role: 'reviewer' });

      if (reviewRuns >= MAX_REVIEW_CYCLES) {
        // Too many review cycles — fail the task
        await TaskModel.updateOne(
          { _id: taskId },
          {
            $set: { status: 'failed', reviewVerdict: 'changes-requested' },
            $push: {
              activityLog: {
                timestamp: new Date(),
                action: `Failed after ${reviewRuns} review cycles: ${reviewSummary.slice(0, 200)}`,
                agentRunId,
              },
            },
          }
        );
        broadcast('task:status_changed', { taskId, status: 'failed', cycleId });
      } else {
        await TaskModel.updateOne(
          { _id: taskId },
          {
            $set: {
              status: 'ready',
              reviewVerdict: 'changes-requested',
              lastRetryCause: 'review_rejection',
            },
            $inc: { retryCount: 1 },
            $push: {
              activityLog: {
                timestamp: new Date(),
                action: `Changes requested by ${agentRunId}: ${reviewSummary.slice(0, 200)}`,
                agentRunId,
              },
            },
          }
        );
        broadcast('task:status_changed', { taskId, status: 'ready', cycleId });

        // Persist error-severity issues on the task so the orchestrator can see
        // historically why this task was retried (not just that it was retried).
        if (structuredOutput?.issues && structuredOutput.issues.length > 0) {
          await persistRetryReviewIssues(taskId, structuredOutput.issues);
        }

        // Spawn a new coder with the review feedback as retry context
        await createJob('spawn', 'agent', {
          role: 'coder',
          taskId,
          cycleId,
          retryContext: {
            previousError: `Review changes requested: ${reviewSummary}`,
            previousSummary: structuredOutput?.summary,
            reviewIssues: structuredOutput?.issues,
            reviewSuggestions: structuredOutput?.suggestions,
            reviewDecisions: structuredOutput?.decisions,
            filesChanged: structuredOutput?.filesChanged,
          },
        });
      }
    }

    await maybeAdvanceCycle(cycleId);
  } else if (role === 'integrator') {
    // Integrator completed — persist summary, advance cycle, cleanup stale PRs, then trigger reload
    if (structuredOutput?.summary && structuredOutput.summary.trim().length > 0) {
      const { CycleModel } = await import('../../models/cycle.js');
      await CycleModel.updateOne({ _id: cycleId }, { $set: { summary: structuredOutput.summary } });
    }
    await createJob('advance-cycle', 'infra', { cycleId });
    await createJob('cleanup-prs', 'infra', { cycleId });
  }
}

export async function unblockDependents(completedTaskId: string, cycleId: number): Promise<void> {
  // Find tasks in this cycle that are blocked and reference the completed task
  const blockedTasks = await TaskModel.find({
    cycleId,
    status: 'blocked',
    blockedBy: completedTaskId,
  }).lean();

  for (const task of blockedTasks) {
    // Check if ALL blockedBy dependencies are now resolved (done, in-review, or failed)
    const deps = await TaskModel.find({
      _id: { $in: task.blockedBy },
    }).lean();

    const allResolved = deps.every(
      (d) => d.status === 'done' || d.status === 'in-review' || d.status === 'failed'
    );

    if (allResolved) {
      await TaskModel.updateOne(
        { _id: task._id },
        {
          $set: { status: 'ready' },
          $push: {
            activityLog: {
              timestamp: new Date(),
              action: `Unblocked (dependency ${completedTaskId} resolved)`,
            },
          },
        }
      );
      broadcast('task:status_changed', { taskId: task._id, status: 'ready', cycleId });

      // Spawn a coder agent for the newly-ready task
      await createJob('spawn', 'agent', { role: 'coder', taskId: task._id, cycleId });
    }
  }
}

export async function maybeAdvanceCycle(cycleId: number): Promise<void> {
  const { CycleModel } = await import('../../models/cycle.js');
  const cycle = await CycleModel.findById(cycleId).lean();
  if (!cycle || cycle.status !== 'active') return;

  const tasks = await TaskModel.find({ cycleId }).lean();
  if (tasks.length === 0) return;

  const allDone = tasks.every((t) => t.status === 'done' || t.status === 'failed');
  const allReviewedOrDone = tasks.every(
    (t) => t.status === 'done' || t.status === 'failed' || t.status === 'in-review'
  );

  if (cycle.phase === 'implement' && allReviewedOrDone) {
    const existing = await JobModel.findOne({
      type: 'advance-cycle',
      status: { $in: ['pending', 'active'] },
      'payload.cycleId': cycleId,
    }).lean();
    if (existing) return;
    await createJob('advance-cycle', 'infra', { cycleId });
  } else if (cycle.phase === 'review' && allDone) {
    const existing = await JobModel.findOne({
      type: 'advance-cycle',
      status: { $in: ['pending', 'active'] },
      'payload.cycleId': cycleId,
    }).lean();
    if (existing) return;
    await createJob('advance-cycle', 'infra', { cycleId });
  }
}
