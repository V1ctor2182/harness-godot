import { JobModel } from '../models/job.js';
import { TaskModel } from '../models/task.js';
import { CycleModel } from '../models/cycle.js';
import { AgentRunModel } from '../models/agent-run.js';
import { getOrCreateControl } from '../models/control.js';
import { getNextCycleId, getNextTaskId } from '../models/counter.js';
import { config } from '../config.js';
import { spawnAgent } from './launcher/spawner.js';
import { getCIStatus, closeStalePRs, validatePRBodyJSON } from './github.js';
import { broadcast } from './sse-manager.js';
import { logger } from '../lib/logger.js';
import { DEFAULT_MAX_RETRIES, MAX_RETRY_CODER_RUNS, RELOAD_TRIGGER_PATH } from '@zombie-farm/shared';
import type { JobType, JobPool, TaskType, TaskPriority } from '@zombie-farm/shared';
import {
  validatePlan,
  VALID_TASK_TYPES,
  VALID_TASK_PRIORITIES,
} from './launcher/plan-validator.js';

let pollInterval: ReturnType<typeof setInterval> | null = null;
let processing = false;

export function startJobQueue(): void {
  if (pollInterval) return;
  pollInterval = setInterval(pollJobs, config.jobPollIntervalMs);
  console.log(`Job queue started (poll every ${config.jobPollIntervalMs}ms)`);
}

export function stopJobQueue(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

const INFRA_STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function detectAndFailStaleJobs(): Promise<void> {
  const now = new Date();

  const activeJobs = await JobModel.find({ status: 'active' }).lean();

  for (const job of activeJobs) {
    if (!job.startedAt) continue;

    let timeoutMs: number;
    if (job.type === 'spawn' || job.type === 'curate-inbox') {
      const role = (job.payload as Record<string, unknown>)?.['role'] as string | undefined;
      if (role === 'coder') timeoutMs = config.coderTimeoutMs;
      else if (role === 'orchestrator') timeoutMs = config.orchestratorTimeoutMs;
      else if (role === 'reviewer') timeoutMs = config.reviewerTimeoutMs;
      else timeoutMs = config.coderTimeoutMs; // default for other agent roles (curator, integrator)
    } else {
      timeoutMs = INFRA_STALE_TIMEOUT_MS;
    }

    const ageMs = now.getTime() - job.startedAt.getTime();
    if (ageMs <= timeoutMs) continue;

    // Mark the job as failed due to timeout
    await JobModel.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'failed',
          failedReason: 'timeout — stale job detected',
          completedAt: now,
        },
      }
    );

    broadcast('job:failed', {
      jobId: job._id.toString(),
      type: job.type,
      reason: 'timeout — stale job detected',
    });

    logger.warn(
      {
        jobId: job._id.toString(),
        type: job.type,
        role: (job.payload as Record<string, unknown>)?.['role'],
        ageMs,
        timeoutMs,
      },
      'Stale job detected and failed'
    );
  }
}

async function pollJobs(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    const control = await getOrCreateControl();
    if (control.mode === 'killed') {
      processing = false;
      return;
    }
    if (control.mode === 'paused') {
      processing = false;
      return;
    }

    // Detect and fail stale active jobs before claiming new ones
    await detectAndFailStaleJobs();

    // Count active jobs per pool
    const activeCounts = await JobModel.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$pool', count: { $sum: 1 } } },
    ]);
    const activeByPool: Record<string, number> = {};
    for (const { _id, count } of activeCounts) {
      activeByPool[_id as string] = count;
    }

    const agentSlots = config.concurrentAgentSlots - (activeByPool['agent'] ?? 0);
    const infraSlots = config.concurrentInfraSlots - (activeByPool['infra'] ?? 0);

    // Claim jobs with available slots
    const pools: Array<{ pool: JobPool; slots: number }> = [];
    if (agentSlots > 0) pools.push({ pool: 'agent', slots: agentSlots });
    if (infraSlots > 0) pools.push({ pool: 'infra', slots: infraSlots });

    for (const { pool, slots } of pools) {
      for (let i = 0; i < slots; i++) {
        // Find and claim a pending job
        const job = await JobModel.findOneAndUpdate(
          {
            status: 'pending',
            pool,
            $or: [
              { requiresApproval: false },
              { requiresApproval: true, approvalStatus: 'approved' },
            ],
          },
          { $set: { status: 'active', startedAt: new Date() } },
          { sort: { createdAt: 1 }, returnDocument: 'after' }
        );

        if (!job) break;

        // Process job asynchronously
        processJob(
          job._id.toString(),
          job.type as JobType,
          job.payload as Record<string, unknown>
        ).catch((err) => {
          console.error(`Job ${job._id} (${job.type}) failed:`, err);
        });
      }
    }
  } catch (err) {
    console.error('Job queue poll error:', err);
  } finally {
    processing = false;
  }
}

async function processJob(
  jobId: string,
  type: JobType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    switch (type) {
      case 'spawn':
        await handleSpawn(payload);
        break;
      case 'wait-for-ci':
        await handleWaitForCI(jobId, payload);
        break;
      case 'apply-plan':
        await handleApplyPlan(payload);
        break;
      case 'advance-cycle':
        await handleAdvanceCycle(payload);
        break;
      case 'curate-inbox':
        await handleCurateInbox(payload);
        break;
      case 'next-cycle':
        await handleNextCycle(payload);
        break;
      case 'reload':
        await handleReload(payload);
        break;
      case 'cleanup-prs':
        await handleCleanupPRs(payload);
        break;
    }

    // Only mark completed if the handler didn't requeue the job (e.g. wait-for-ci polling)
    await JobModel.updateOne(
      { _id: jobId, status: 'active' },
      { $set: { status: 'completed', completedAt: new Date() } }
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const job = await JobModel.findById(jobId);
    if (job && job.retryCount < job.maxRetries) {
      await JobModel.updateOne(
        { _id: jobId },
        { $set: { status: 'pending', error }, $inc: { retryCount: 1 } }
      );
    } else {
      await JobModel.updateOne(
        { _id: jobId },
        { $set: { status: 'failed', error, completedAt: new Date() } }
      );
    }
  }
}

// ─── Job Handlers ────────────────────────────────────────────────────

export async function handleSpawn(payload: Record<string, unknown>): Promise<void> {
  // Check spending cap
  const control = await getOrCreateControl();
  if (control.spendingCapUsd && control.spentUsd >= control.spendingCapUsd) {
    throw new Error('Spending cap reached — cannot spawn new agents');
  }

  await spawnAgent({
    role: payload['role'] as string,
    taskId: payload['taskId'] as string | undefined,
    cycleId: payload['cycleId'] as number,
    retryContext: payload['retryContext'] as import('@zombie-farm/shared').RetryContext | undefined,
  });
}

export async function handleWaitForCI(
  jobId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const taskId = payload['taskId'] as string;
  const prNumber = payload['prNumber'] as number;

  const ciStatus = await getCIStatus(prNumber);
  await TaskModel.updateOne({ _id: taskId }, { $set: { ciStatus } });

  if (ciStatus === 'passed' || ciStatus === 'failed') {
    const task = await TaskModel.findById(taskId).lean();
    if (task) {
      const cycle = await CycleModel.findById(task.cycleId).lean();

      if (ciStatus === 'passed') {
        // If the cycle is already in review phase, spawn a reviewer for this task
        // (handles retried coders whose new PRs arrive after the phase transition)
        if (cycle?.phase === 'review' && task.status === 'in-review') {
          // Guard against a double-reviewer race: when handleAdvanceCycle transitions
          // to 'review', it immediately creates spawn jobs for all in-review tasks.
          // Concurrently, an active wait-for-ci job may also try to create a reviewer
          // spawn if CI finishes at the same moment. Both paths can fire for the same
          // task, resulting in two reviewer agents running for one task. Check for an
          // existing pending or active reviewer spawn job before creating a new one.
          const existingReviewerJob = await JobModel.exists({
            type: 'spawn',
            'payload.role': 'reviewer',
            'payload.taskId': taskId,
            status: { $in: ['pending', 'active'] },
          });
          if (!existingReviewerJob) {
            // Pre-flight: validate PR body contains a parseable JSON block.
            // Reviewer Rule 0 auto-rejects PRs without one — catch it here to
            // avoid wasting a full reviewer token run on a format issue.
            const prBodyResult = await validatePRBodyJSON(prNumber);
            if (!prBodyResult.valid) {
              const reason = prBodyResult.reason;
              let issueDescription: string;
              if (reason === 'no_json_block') {
                issueDescription =
                  'PR body has no ```json``` fenced block. Use the heredoc template in the Git Workflow section of your coder prompt to format the output JSON correctly.';
              } else if (reason === 'invalid_json') {
                issueDescription =
                  'PR body JSON block contains invalid JSON. Use the heredoc template in the Git Workflow section of your coder prompt to format the output JSON correctly.';
              } else {
                // missing_acv_array or any future reason
                issueDescription =
                  'PR body JSON block is missing the acceptanceCriteriaVerification array (or it is empty). Use the heredoc template in the Git Workflow section of your coder prompt to format the output JSON correctly.';
              }
              await TaskModel.updateOne(
                { _id: taskId },
                {
                  $set: { status: 'ready', lastRetryCause: 'pr_body_invalid' },
                  $inc: { retryCount: 1 },
                  $push: {
                    activityLog: {
                      timestamp: new Date(),
                      action: `PR body missing or invalid JSON output block — retrying coder`,
                    },
                  },
                }
              );
              broadcast('task:status_changed', { taskId, status: 'ready', cycleId: task.cycleId });
              await createJob('spawn', 'agent', {
                role: 'coder',
                taskId,
                cycleId: task.cycleId,
                retryContext: {
                  filesChanged: [],
                  reviewIssues: [
                    {
                      file: 'PR body',
                      severity: 'error',
                      description: issueDescription,
                    },
                  ],
                },
              });
            } else {
              await createJob('spawn', 'agent', {
                role: 'reviewer',
                taskId,
                cycleId: task.cycleId,
              });
            }
          }
        }
      } else if (ciStatus === 'failed') {
        // CI failed — retry with a new coder if under the retry cap
        const coderRuns = await AgentRunModel.countDocuments({ taskId, role: 'coder' });

        if (coderRuns >= MAX_RETRY_CODER_RUNS) {
          await TaskModel.updateOne(
            { _id: taskId },
            {
              $set: { status: 'failed' },
              $push: {
                activityLog: {
                  timestamp: new Date(),
                  action: `Failed: CI failed after ${coderRuns} coder attempts`,
                },
              },
            }
          );
          broadcast('task:status_changed', { taskId, status: 'failed', cycleId: task.cycleId });
        } else {
          await TaskModel.updateOne(
            { _id: taskId },
            {
              $set: { status: 'ready', lastRetryCause: 'ci_failure' },
              $inc: { retryCount: 1 },
              $push: {
                activityLog: {
                  timestamp: new Date(),
                  action: `CI failed on PR #${prNumber} — retrying with new coder`,
                },
              },
            }
          );
          broadcast('task:status_changed', { taskId, status: 'ready', cycleId: task.cycleId });

          await createJob('spawn', 'agent', {
            role: 'coder',
            taskId,
            cycleId: task.cycleId,
            retryContext: {
              previousError: `CI failed on PR #${prNumber}. Fix the issues and push to the same branch.`,
              filesChanged: task.branch ? [task.branch] : [],
            },
          });
        }

        // Check if cycle can advance (task may now be failed)
        if (task.cycleId) {
          const { maybeAdvanceCycle } = await import('./launcher/spawner.js');
          await maybeAdvanceCycle(task.cycleId);
        }
      }
    }
    return; // Job completes — processJob will mark it completed
  }

  // CI still running — requeue the same job for the next poll cycle
  await JobModel.updateOne({ _id: jobId }, { $set: { status: 'pending' } });
}

export async function handleApplyPlan(payload: Record<string, unknown>): Promise<void> {
  const agentRunId = payload['agentRunId'] as string;
  const cycleId = payload['cycleId'] as number;

  // Use non-lean query to get full document including strict:false fields
  const run = await AgentRunModel.findById(agentRunId);
  if (!run) throw new Error(`Agent run ${agentRunId} not found`);

  // Read plan from the structured output stored on AgentRun (schema is strict:false)
  const rawOutput = run.toObject().output as Record<string, unknown> | undefined;
  const planField = rawOutput?.plan;

  let plan: { goal: string; tasks: Array<Record<string, unknown>> } | undefined;

  if (planField && typeof planField === 'object') {
    plan = planField as { goal: string; tasks: Array<Record<string, unknown>> };
  }

  if (!plan)
    throw new Error(
      'Could not extract plan from orchestrator output — ensure agent returned structured output with plan field'
    );

  // Validate plan
  const errors = validatePlan(plan);
  if (errors.length > 0) {
    throw new Error(`Plan validation failed:\n${errors.join('\n')}`);
  }

  // Create tasks
  const taskIds: string[] = [];
  const taskIdMap: Map<number, string> = new Map();

  for (let i = 0; i < plan.tasks.length; i++) {
    const taskId = await getNextTaskId();
    taskIds.push(taskId);
    taskIdMap.set(i, taskId);
  }

  for (let i = 0; i < plan.tasks.length; i++) {
    const t = plan.tasks[i];
    const blockedByIndexes = (t['blockedBy'] as number[]) ?? [];
    const blockedByIds = blockedByIndexes.map((idx) => taskIdMap.get(idx)!);

    const title = t['title'] as string;
    await TaskModel.create({
      _id: taskIds[i],
      title,
      description: t['description'] as string,
      type: VALID_TASK_TYPES.includes(t['type'] as (typeof VALID_TASK_TYPES)[number])
        ? (t['type'] as TaskType)
        : 'chore',
      priority: VALID_TASK_PRIORITIES.includes(
        t['priority'] as (typeof VALID_TASK_PRIORITIES)[number]
      )
        ? (t['priority'] as TaskPriority)
        : 'medium',
      cycleId,
      blockedBy: blockedByIds,
      createdBy: 'orchestrator',
      acceptanceCriteria: (t['acceptanceCriteria'] as string[]) ?? [],
      status: blockedByIds.length > 0 ? 'blocked' : 'ready',
      activityLog: [{ timestamp: new Date(), action: 'Created by orchestrator plan' }],
    });
    broadcast('task:created', { taskId: taskIds[i], cycleId, title });
  }

  // Update cycle with the orchestrator's stated goal and the created task IDs
  await CycleModel.updateOne({ _id: cycleId }, { $set: { goal: plan.goal, tasks: taskIds } });

  // Now that tasks exist, advance from plan → implement
  await createJob('advance-cycle', 'infra', { cycleId });
}

export async function handleAdvanceCycle(payload: Record<string, unknown>): Promise<void> {
  const cycleId = payload['cycleId'] as number;
  const cycle = await CycleModel.findById(cycleId);
  if (!cycle) throw new Error(`Cycle ${cycleId} not found`);
  if (cycle.status !== 'active') return; // Already completed or failed

  const phaseOrder = ['plan', 'implement', 'review', 'integrate', 'retrospect'] as const;
  const currentIdx = phaseOrder.indexOf(cycle.phase as (typeof phaseOrder)[number]);
  if (currentIdx === -1 || currentIdx === phaseOrder.length - 1) {
    // Cycle is complete — compute metrics before persisting final status
    const metrics = await computeCycleMetrics(cycleId, cycle.goal as string);
    const completedAt = new Date();
    await CycleModel.updateOne(
      { _id: cycleId },
      { $set: { status: 'completed', completedAt, metrics } }
    );
    broadcast('cycle:completed', { cycleId, metrics });

    // Auto-generate retrospective knowledge file (idempotent via upsert).
    // Errors here are non-fatal — a failed upsert must not prevent the
    // next-cycle job from being created (which would stall the system).
    try {
      await generateCycleRetrospective(cycleId, cycle.goal as string, completedAt, metrics);
    } catch (err) {
      logger.error({ err, cycleId }, 'generateCycleRetrospective failed — non-fatal, continuing');
    }

    // Create next-cycle job (requires human approval during bootstrap)
    await createJob(
      'next-cycle',
      'infra',
      { previousCycleId: cycleId },
      { requiresApproval: true }
    );
    return;
  }

  const nextPhase = phaseOrder[currentIdx + 1];
  const previousPhase = cycle.phase;

  // Failure path: if about to enter integrate but zero tasks completed, mark cycle failed
  if (nextPhase === 'integrate') {
    const doneTasks = await TaskModel.countDocuments({ cycleId, status: 'done' });
    if (doneTasks === 0) {
      const metrics = await computeCycleMetrics(cycleId, cycle.goal as string);
      await CycleModel.updateOne(
        { _id: cycleId },
        { $set: { status: 'failed', completedAt: new Date(), metrics } }
      );
      broadcast('cycle:failed', { cycleId, previousPhase });
      await createJob(
        'next-cycle',
        'infra',
        { previousCycleId: cycleId },
        { requiresApproval: true }
      );
      return;
    }
  }

  await CycleModel.updateOne({ _id: cycleId }, { $set: { phase: nextPhase } });

  broadcast('cycle:phase_changed', { cycleId, phase: nextPhase, previousPhase });

  // Phase-specific actions
  if (nextPhase === 'implement') {
    // Spawn coder agents for ready tasks
    const tasks = await TaskModel.find({ cycleId, status: 'ready' });
    for (const task of tasks) {
      await createJob('spawn', 'agent', { role: 'coder', taskId: task._id, cycleId });
    }
  } else if (nextPhase === 'review') {
    // Spawn reviewer for tasks in-review
    const tasks = await TaskModel.find({ cycleId, status: 'in-review' });
    for (const task of tasks) {
      await createJob('spawn', 'agent', { role: 'reviewer', taskId: task._id, cycleId });
    }
  } else if (nextPhase === 'integrate') {
    // Merge all task branches into base branch
    await createJob('spawn', 'agent', { role: 'integrator', cycleId });
  } else if (nextPhase === 'retrospect') {
    // Curate knowledge inbox
    await createJob('curate-inbox', 'agent', { cycleId });
  }
}

export async function handleCurateInbox(payload: Record<string, unknown>): Promise<void> {
  const cycleId = payload['cycleId'] as number;

  const { KnowledgeFileModel } = await import('../models/knowledge-file.js');
  const inboxCount = await KnowledgeFileModel.countDocuments({
    category: 'inbox',
    status: 'active',
  });
  if (inboxCount > 0) {
    await spawnAgent({ role: 'curator', cycleId, taskId: undefined });
  }

  // Trigger reload before completing so containers pick up integrated code.
  // This runs after the curator (not during integrator) to avoid orphaning
  // the curator container when the server restarts.
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    await fs.access(path.dirname(RELOAD_TRIGGER_PATH));
    await createJob('reload', 'infra', { cycleId });
  } catch {
    // Not in Docker — no reload needed
  }

  // Retrospect phase is done — advance cycle to completed
  await createJob('advance-cycle', 'infra', { cycleId });
}

export async function handleNextCycle(_payload: Record<string, unknown>): Promise<void> {
  const control = await getOrCreateControl();
  if (control.mode === 'paused') {
    throw new Error('System is paused — cannot start next cycle');
  }

  const cycleId = await getNextCycleId();
  await CycleModel.create({
    _id: cycleId,
    goal: 'Awaiting orchestrator plan',
    phase: 'plan',
    status: 'active',
  });

  // Spawn orchestrator to plan the cycle
  await createJob('spawn', 'agent', { role: 'orchestrator', cycleId });
}

export async function handleReload(payload: Record<string, unknown>): Promise<void> {
  const fs = await import('node:fs/promises');
  const triggerData = JSON.stringify({
    cycleId: payload['cycleId'],
    triggeredAt: new Date().toISOString(),
  });

  await fs.writeFile(RELOAD_TRIGGER_PATH, triggerData, 'utf-8');
  broadcast('system:reload_triggered', { cycleId: payload['cycleId'] });
  console.log(`[reload] Trigger written to ${RELOAD_TRIGGER_PATH}`);
}

export async function handleCleanupPRs(payload: Record<string, unknown>): Promise<void> {
  const cycleId = payload['cycleId'] as number;
  const tasks = await TaskModel.find({ cycleId }).lean();

  // Collect all PR numbers from agent runs for this cycle's tasks
  const mergedPRs = new Set(
    tasks.filter((t) => t.status === 'done' && t.prNumber).map((t) => t.prNumber as number)
  );

  // Find all PRs created during this cycle (from agent runs)
  const runs = await AgentRunModel.find({
    cycleId,
    role: 'coder',
    prNumber: { $exists: true },
  }).lean();

  const stalePRs = runs.map((r) => r.prNumber as number).filter((pr) => !mergedPRs.has(pr));

  if (stalePRs.length > 0) {
    console.log(`[cleanup-prs] Closing ${stalePRs.length} stale PRs: ${stalePRs.join(', ')}`);
    await closeStalePRs(stalePRs);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Persist error-severity issues from a reviewer run onto the Task document.
 * Called when a reviewer returns changes-requested so the orchestrator can
 * see historically why tasks were retried (not just that they were retried).
 * Issues with severity other than 'error' are ignored.
 */
export async function persistRetryReviewIssues(
  taskId: string,
  issues: Array<{ file: string; line?: number; severity: string; description: string }>
): Promise<void> {
  const errorIssues = issues.filter((i) => i.severity === 'error');
  if (errorIssues.length === 0) return;
  await TaskModel.updateOne({ _id: taskId }, { $set: { lastRetryReviewIssues: errorIssues } });
}

// Common stop words used when extracting goal keywords for goalCoverage computation.
const GOAL_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'with',
  'have',
  'from',
  'they',
  'will',
  'been',
  'when',
  'that',
  'this',
  'what',
  'each',
  'into',
  'then',
  'than',
  'some',
  'more',
  'also',
  'task',
  'add',
  'adds',
  'update',
  'updates',
  'improve',
  'improves',
  'change',
  'changes',
  'make',
  'like',
  'just',
  'does',
  'only',
  'come',
  'over',
  'such',
  'even',
  'most',
  'well',
  'many',
  'much',
  'there',
  'about',
  'which',
  'their',
  'would',
  'other',
  'these',
  'should',
  'could',
  'time',
  'know',
  'take',
  'long',
  'after',
  'first',
  'through',
  'where',
  'being',
  'those',
  'while',
  'before',
  'same',
  'both',
]);

/**
 * Extract significant keywords from a cycle goal string.
 * Expands camelCase boundaries before lowercasing so that e.g.
 * 'extractGoalKeywords' yields ['extract', 'goal', 'keywords'].
 * Then splits on whitespace/punctuation and filters out stop words
 * and tokens shorter than 4 characters.
 */
function extractGoalKeywords(text: string): string[] {
  // Expand camelCase boundaries:
  //   1. lowercase→uppercase: 'contextBuilder' → 'context Builder'
  //   2. consecutive-caps→single-cap: 'parseSSEEvent' → 'parse SSE Event'
  const expanded = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  return [
    ...new Set(
      expanded
        .toLowerCase()
        .split(/[\s\W]+/)
        .filter((w) => w.length >= 4 && !GOAL_STOP_WORDS.has(w))
    ),
  ];
}

/**
 * Auto-generate a retrospective knowledge file for a completed cycle.
 * Uses an upsert by deterministic _id so it is idempotent on re-runs.
 */
async function generateCycleRetrospective(
  cycleId: number,
  goal: string,
  completedAt: Date,
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    totalCostUsd: number;
    totalDurationMs: number;
    goalCoverage?: number;
  }
): Promise<void> {
  const { KnowledgeFileModel } = await import('../models/knowledge-file.js');
  const tasks = await TaskModel.find({ cycleId });

  const taskLines = tasks
    .map((t) => {
      const pr = t.prNumber ? ` (PR #${t.prNumber})` : '';
      const rawDesc = t.description as string | undefined;
      const truncatedDesc = rawDesc
        ? rawDesc.length > 300
          ? rawDesc.slice(0, 300) + '…'
          : rawDesc
        : '';
      const criteria = t.acceptanceCriteria as string[] | undefined;
      const criteriaNote =
        criteria && criteria.length > 0 ? ` | ${criteria.length} acceptance criteria` : '';
      const descLine = truncatedDesc ? `\n  ${truncatedDesc}${criteriaNote}` : '';
      return `- **${t._id}** — ${t.title} | type: ${t.type} | status: ${t.status}${pr}${descLine}`;
    })
    .join('\n');

  // Collect files changed from integrator run output
  const integratorRuns = await AgentRunModel.find({ cycleId, role: 'integrator' });
  const filesChanged: string[] = [];
  for (const run of integratorRuns) {
    const runOutput = run.output as { filesChanged?: string[] } | undefined;
    if (runOutput?.filesChanged && runOutput.filesChanged.length > 0) {
      filesChanged.push(...runOutput.filesChanged);
    }
  }
  const filesChangedSection =
    filesChanged.length > 0
      ? `\n## Files Changed\n\n${filesChanged.map((f) => `- ${f}`).join('\n')}\n`
      : '';

  const dateStr = completedAt.toISOString().slice(0, 10);
  const tasksTotal = tasks.length;
  const tasksCompleted = metrics.tasksCompleted;
  const completionRate = tasksTotal > 0 ? tasksCompleted / tasksTotal : 0;
  const verdict =
    tasksCompleted === tasksTotal
      ? 'Fully achieved'
      : completionRate >= 0.5
        ? 'Partially achieved'
        : 'Not achieved';

  const content = `# Cycle ${cycleId} Retrospective

**Date completed:** ${dateStr}
**Goal:** ${goal}

## Goal Assessment

**Goal:** ${goal}
${tasksCompleted} of ${tasksTotal} tasks completed
**Verdict:** ${verdict}

## Tasks

${taskLines || '_No tasks_'}

## Metrics

- Tasks completed: ${metrics.tasksCompleted}
- Tasks failed: ${metrics.tasksFailed}
- Total cost: $${metrics.totalCostUsd.toFixed(4)}
- Total duration: ${Math.round(metrics.totalDurationMs / 1000)}s
${filesChangedSection}`;

  const snippet = `Cycle ${cycleId} completed on ${dateStr}. ${tasksCompleted} tasks done, ${metrics.tasksFailed} failed. Cost: $${metrics.totalCostUsd.toFixed(4)}. Outcome: ${verdict}.`;
  const id = `retrospectives/cycle-${cycleId}.md`;

  await KnowledgeFileModel.updateOne(
    { _id: id },
    {
      $set: {
        category: 'retrospectives',
        title: `Cycle ${cycleId} Retrospective`,
        snippet,
        content,
        status: 'active',
        updatedAt: new Date(),
      },
      $setOnInsert: {
        _id: id,
        source: { type: 'agent' as const, cycleId },
        qualityScore: 0,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

/**
 * Aggregate task counts and agent-run cost/duration totals for a cycle.
 * Also computes goalCoverage: the fraction of goal keywords that appear in
 * the titles of completed tasks (1.0 if no keywords extracted from the goal).
 */
export async function computeCycleMetrics(
  cycleId: number,
  goalString: string = ''
): Promise<{
  tasksCompleted: number;
  tasksFailed: number;
  totalCostUsd: number;
  totalDurationMs: number;
  goalCoverage: number;
  tasksRetried?: number;
  tasksPassedFirstReview?: number;
  tasksRetriedByReviewer?: number;
  tasksRetriedByCi?: number;
  tasksRetriedByPrBody?: number;
}> {
  const [
    tasksCompleted,
    tasksFailed,
    costAgg,
    durationAgg,
    completedTasks,
    coderRunCounts,
    tasksWithReviewRejection,
    tasksWithCiFailure,
    tasksWithPrBodyInvalid,
    tasksWithAnyCause,
  ] = await Promise.all([
    TaskModel.countDocuments({ cycleId, status: 'done' }),
    TaskModel.countDocuments({ cycleId, status: 'failed' }),
    AgentRunModel.aggregate<{ total: number }>([
      { $match: { cycleId } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$costUsd', 0] } } } },
    ]),
    AgentRunModel.aggregate<{ total: number }>([
      { $match: { cycleId } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$durationMs', 0] } } } },
    ]),
    TaskModel.find({ cycleId, status: 'done' }),
    AgentRunModel.aggregate<{ _id: string; count: number }>([
      { $match: { cycleId, role: 'coder', taskId: { $exists: true, $ne: null } } },
      { $group: { _id: '$taskId', count: { $sum: 1 } } },
    ]),
    TaskModel.countDocuments({ cycleId, lastRetryCause: 'review_rejection' }),
    TaskModel.countDocuments({ cycleId, lastRetryCause: 'ci_failure' }),
    TaskModel.countDocuments({ cycleId, lastRetryCause: 'pr_body_invalid' }),
    TaskModel.countDocuments({ cycleId, lastRetryCause: { $exists: true } }),
  ]);

  // Compute goalCoverage: fraction of goal keywords found in completed task titles
  const goalKeywords = extractGoalKeywords(goalString);
  let goalCoverage: number;
  if (goalKeywords.length === 0) {
    goalCoverage = 1.0;
  } else {
    const titlesLower = completedTasks.map((t) => (t.title as string).toLowerCase()).join(' ');
    const matchCount = goalKeywords.filter((kw) => titlesLower.includes(kw)).length;
    goalCoverage = matchCount / goalKeywords.length;
  }

  // Compute retry metrics from coder run counts per task.
  // Only set when coder AgentRun data exists for this cycle.
  let tasksRetried: number | undefined;
  let tasksPassedFirstReview: number | undefined;
  if (coderRunCounts.length > 0) {
    const doneTaskIds = new Set(completedTasks.map((t) => String(t._id)));
    tasksRetried = coderRunCounts.filter((r) => r.count > 1).length;
    tasksPassedFirstReview = coderRunCounts.filter(
      (r) => r.count === 1 && doneTaskIds.has(r._id)
    ).length;
  }

  // Compute lastRetryCause-based breakdown. Only set when at least one task
  // in the cycle has lastRetryCause set (i.e., was explicitly categorised).
  let tasksRetriedByReviewer: number | undefined;
  let tasksRetriedByCi: number | undefined;
  let tasksRetriedByPrBody: number | undefined;
  if (tasksWithAnyCause > 0) {
    tasksRetriedByReviewer = tasksWithReviewRejection;
    tasksRetriedByCi = tasksWithCiFailure;
    tasksRetriedByPrBody = tasksWithPrBodyInvalid;
  }

  return {
    tasksCompleted,
    tasksFailed,
    totalCostUsd: costAgg[0]?.total ?? 0,
    totalDurationMs: durationAgg[0]?.total ?? 0,
    goalCoverage,
    tasksRetried,
    tasksPassedFirstReview,
    tasksRetriedByReviewer,
    tasksRetriedByCi,
    tasksRetriedByPrBody,
  };
}

export async function createJob(
  type: JobType,
  pool: JobPool,
  payload: Record<string, unknown>,
  options?: { requiresApproval?: boolean }
): Promise<string> {
  // Check if this needs approval based on auto-approval settings
  let requiresApproval = options?.requiresApproval ?? false;

  if (type === 'spawn' && payload['role'] === 'coder' && payload['taskId']) {
    const task = await TaskModel.findById(payload['taskId']).lean();
    const control = await getOrCreateControl();

    if (task && !control.autoApprovalCategories.includes(task.type)) {
      requiresApproval = true;
    }
  }

  // Jobs that modify protected paths always require human approval
  if (type === 'apply-plan') {
    // Plans always require human review before task creation
    requiresApproval = true;
  }

  const job = await JobModel.create({
    type,
    pool,
    payload,
    requiresApproval,
    approvalStatus: requiresApproval ? 'pending' : undefined,
    maxRetries: DEFAULT_MAX_RETRIES,
  });

  if (requiresApproval) {
    broadcast('job:requires_approval', {
      jobId: job._id.toString(),
      type,
      payload,
    });
  }

  return job._id.toString();
}
