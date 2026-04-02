'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useGlobalSSE } from '@/hooks/use-sse';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';

interface Cycle {
  _id: number;
  goal: string;
  phase: string;
  status: string;
  summary?: string;
  startedAt: string;
  completedAt?: string;
  metrics?: {
    totalCostUsd: number;
    tasksCompleted: number;
    tasksFailed: number;
    totalDurationMs: number;
  };
}

interface Task {
  _id: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  cycleId: number;
  acceptanceCriteria?: string[];
}

interface IntegratorOutput {
  summary?: string;
  branch?: string;
  prNumber?: number;
  conflictsResolved?: number;
}

interface AgentRun {
  _id: string;
  role: string;
  status: string;
  cycleId: number;
  taskId?: string;
  costUsd?: number;
  durationMs?: number;
  output?: IntegratorOutput;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function CycleDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [integratorRun, setIntegratorRun] = useState<AgentRun | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [retryingTasks, setRetryingTasks] = useState<Set<string>>(new Set());

  const loadTasks = useCallback(() => {
    api.listTasks({ cycleId: id }).then((t) => setTasks(t as Task[]));
  }, [id]);

  const loadAgentRuns = useCallback(() => {
    api.listAgentRuns({ cycleId: id }).then((r) => setAgentRuns(r as AgentRun[]));
  }, [id]);

  const loadIntegratorRun = useCallback(() => {
    api
      .listAgentRuns({ cycleId: id, role: 'integrator' })
      .then((r) => {
        const runs = r as AgentRun[];
        setIntegratorRun(runs.length > 0 ? runs[0] : null);
      })
      .catch(() => setIntegratorRun(null));
  }, [id]);

  useEffect(() => {
    api
      .getCycle(id)
      .then((c) => setCycle(c as Cycle))
      .catch(() => setNotFound(true));
    loadTasks();
    loadAgentRuns();
    loadIntegratorRun();
  }, [id, loadTasks, loadAgentRuns, loadIntegratorRun]);

  useGlobalSSE((eventType, data) => {
    if (eventType === 'task:status_changed') {
      const updated = data as { taskId: string; status: string };
      setTasks((prev) => {
        // Only update if this task belongs to the current cycle's task list
        if (!prev.some((t) => t._id === updated.taskId)) return prev;
        return prev.map((t) => (t._id === updated.taskId ? { ...t, status: updated.status } : t));
      });
    } else if (eventType === 'cycle:phase_changed') {
      const cycleEvent = data as { cycleId: number };
      if (cycleEvent.cycleId !== id) return;
      api.getCycle(id).then((c) => setCycle(c as Cycle));
      loadTasks();
      loadAgentRuns();
      loadIntegratorRun();
    } else if (eventType === 'cycle:completed') {
      const cycleEvent = data as { cycleId: number };
      if (cycleEvent.cycleId !== id) return;
      api.getCycle(id).then((c) => setCycle(c as Cycle));
    } else if (eventType === 'cycle:failed') {
      const cycleEvent = data as { cycleId: number };
      if (cycleEvent.cycleId !== id) return;
      api.getCycle(id).then((c) => setCycle(c as Cycle));
    } else if (eventType === 'agent:completed') {
      const runEvent = data as { agentRunId: string; cycleId: number };
      if (runEvent.cycleId !== id) return;
      loadAgentRuns();
      loadIntegratorRun();
    }
  });

  if (notFound) {
    return (
      <div className="pt-4">
        <h1 className="text-2xl font-semibold">Cycle not found</h1>
        <p className="text-muted-foreground mt-2">No cycle with ID {id} exists.</p>
        <Link href="/cycles" className="text-primary hover:underline mt-2 inline-block">
          Back to Cycles
        </Link>
      </div>
    );
  }

  if (!cycle) {
    return <div className="pt-4 text-muted-foreground">Loading...</div>;
  }

  const liveCostUsd = agentRuns.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const isLiveCost = cycle.status === 'active' && !cycle.metrics;
  const displayCostUsd = cycle.metrics?.totalCostUsd ?? liveCostUsd;

  // Per-task cost: sum agentRuns by taskId
  const taskCostMap = new Map<string, number>();
  for (const run of agentRuns) {
    if (run.taskId && run.costUsd != null) {
      taskCostMap.set(run.taskId, (taskCostMap.get(run.taskId) ?? 0) + run.costUsd);
    }
  }

  async function handleRetry(taskId: string) {
    setRetryingTasks((prev) => new Set(prev).add(taskId));
    try {
      await api.retryTask(taskId);
      setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status: 'backlog' } : t)));
    } finally {
      setRetryingTasks((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }

  function toggleTask(taskId: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  const integratorOutput = integratorRun?.output;
  const showRetrospect =
    integratorRun != null &&
    (cycle.phase === 'retrospect' || cycle.status === 'completed') &&
    integratorOutput?.summary;

  return (
    <div className="pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            <Link href="/cycles" className="hover:underline">
              Cycles
            </Link>{' '}
            / {cycle._id}
          </div>
          <h1 className="text-2xl font-semibold">Cycle {cycle._id}</h1>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={cycle.phase} />
          <StatusBadge status={cycle.status} />
        </div>
      </div>

      {/* Goal */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Goal</div>
          <div className="text-sm">{cycle.goal}</div>
        </CardContent>
      </Card>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
              Total Cost
            </div>
            <div className="text-2xl font-semibold">
              ${displayCostUsd.toFixed(2)}
              {isLiveCost && (
                <span className="text-sm text-muted-foreground font-normal ml-1">(live)</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Tasks</div>
            <div className="text-2xl font-semibold">
              {cycle.metrics?.tasksCompleted ?? 0}
              <span className="text-sm text-muted-foreground font-normal">
                {' '}
                done
                {(cycle.metrics?.tasksFailed ?? 0) > 0 && (
                  <span className="text-destructive"> / {cycle.metrics?.tasksFailed} failed</span>
                )}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
              Started
            </div>
            <div className="text-sm">{new Date(cycle.startedAt).toLocaleString()}</div>
            {cycle.completedAt && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Completed {new Date(cycle.completedAt).toLocaleString()}
              </div>
            )}
            {cycle.metrics?.totalDurationMs != null && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Duration: {formatDuration(cycle.metrics.totalDurationMs)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cycle summary */}
      {cycle.summary && (
        <Card className="mb-4">
          <CardHeader className="p-4 pb-0">
            <button
              onClick={() => setSummaryExpanded((v) => !v)}
              className="flex items-center gap-2 text-left w-full"
              aria-expanded={summaryExpanded}
            >
              <span
                className="inline-block transition-transform text-muted-foreground text-xs"
                style={{ transform: summaryExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                ▶
              </span>
              <CardTitle>Summary</CardTitle>
            </button>
          </CardHeader>
          {summaryExpanded && (
            <CardContent className="p-4 pt-3">
              <pre className="text-sm whitespace-pre-wrap font-sans">{cycle.summary}</pre>
            </CardContent>
          )}
        </Card>
      )}

      {/* Integrator retrospect section */}
      {showRetrospect && (
        <Card className="mb-4 border-accent/40">
          <CardHeader>
            <CardTitle>Integration Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div
              className="text-sm p-3 rounded-md mb-3"
              style={{ background: 'var(--card)', border: '1px solid var(--accent)' }}
            >
              {integratorOutput!.summary}
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {integratorOutput!.conflictsResolved != null &&
                integratorOutput!.conflictsResolved > 0 && (
                  <div>
                    <span className="text-muted-foreground">Conflicts resolved: </span>
                    <span className="font-semibold">{integratorOutput!.conflictsResolved}</span>
                  </div>
                )}
              {integratorRun!.output?.branch && (
                <div>
                  <span className="text-muted-foreground">Branch: </span>
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    {integratorRun!.output.branch}
                  </code>
                </div>
              )}
              {integratorRun!.output?.prNumber && (
                <div>
                  <span className="text-muted-foreground">PR: </span>
                  <span className="font-semibold">#{integratorRun!.output.prNumber}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks table */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Tasks ({tasks.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <div className="text-muted-foreground px-6 pb-6">No tasks yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((t) => {
                  const hasCriteria =
                    t.acceptanceCriteria != null && t.acceptanceCriteria.length > 0;
                  const isExpanded = expandedTasks.has(t._id);
                  return (
                    <React.Fragment key={t._id}>
                      <TableRow>
                        <TableCell className="w-8 pr-0">
                          {hasCriteria ? (
                            <button
                              onClick={() => toggleTask(t._id)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              aria-label={isExpanded ? 'Collapse criteria' : 'Expand criteria'}
                            >
                              <span
                                className="inline-block transition-transform"
                                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                              >
                                ▶
                              </span>
                            </button>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Link href={`/tasks/${t._id}`} className="text-primary hover:underline">
                            {t._id}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate">{t.title}</TableCell>
                        <TableCell>
                          <StatusBadge status={t.status} />
                        </TableCell>
                        <TableCell>{t.priority}</TableCell>
                        <TableCell>{t.type}</TableCell>
                        <TableCell>
                          {t.status === 'failed' && (
                            <button
                              onClick={() => void handleRetry(t._id)}
                              disabled={retryingTasks.has(t._id)}
                              className="text-xs px-2 py-1 rounded border border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label={`Retry ${t._id}`}
                            >
                              {retryingTasks.has(t._id) ? '...' : 'Retry'}
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell></TableCell>
                          <TableCell colSpan={6} className="pb-3 pt-0">
                            {hasCriteria ? (
                              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-0.5 pl-2">
                                {t.acceptanceCriteria!.map((criterion, i) => (
                                  <li key={i}>{criterion}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">
                                No acceptance criteria defined.
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Per-task cost breakdown */}
      {tasks.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Task Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((t) => {
                  const cost = taskCostMap.get(t._id);
                  return (
                    <TableRow key={t._id}>
                      <TableCell>
                        <Link href={`/tasks/${t._id}`} className="text-primary hover:underline">
                          {t._id}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate">{t.title}</TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell>{cost != null ? `$${cost.toFixed(3)}` : '---'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Agent Runs table */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Runs ({agentRuns.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {agentRuns.length === 0 ? (
            <div className="text-muted-foreground px-6 pb-6">No agent runs yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentRuns.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>
                      <Link href={`/agents/${r._id}`} className="text-primary hover:underline">
                        {r._id.slice(0, 16)}
                      </Link>
                    </TableCell>
                    <TableCell>{r.role}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>${r.costUsd?.toFixed(2) ?? '---'}</TableCell>
                    <TableCell>
                      {r.durationMs ? `${(r.durationMs / 1000).toFixed(0)}s` : '---'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
