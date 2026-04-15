'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { useGlobalSSE } from '@/hooks/use-sse';

interface ActivityLogEntry {
  timestamp: string;
  action: string;
}

interface Task {
  _id: string;
  title: string;
  description?: string;
  type: string;
  priority: string;
  status: string;
  cycleId: number;
  assignedTo?: string;
  branch?: string;
  prNumber?: number;
  prUrl?: string;
  ciStatus?: string;
  blockedBy?: string[];
  acceptanceCriteria?: string[];
  reviewVerdict?: 'approved' | 'changes-requested' | null;
  retryCount?: number;
  activityLog?: ActivityLogEntry[];
}

interface AgentRun {
  _id: string;
  role: string;
  status: string;
  taskId?: string;
  cycleId: number;
  costUsd?: number;
  durationMs?: number;
  createdAt?: string;
}

export interface TaskDetailProps {
  taskId: string;
  /** Called when user clicks an agent run link (e.g. to swap drawer content). Falls back to navigation if unset. */
  onSelectAgentRun?: (agentRunId: string) => void;
}

export function TaskDetail({ taskId, onSelectAgentRun }: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const fetchTask = useCallback(() => {
    api
      .getTask(taskId)
      .then((t) => setTask(t as Task))
      .catch((e) => setError((e as Error).message));
  }, [taskId]);

  useEffect(() => {
    fetchTask();
    api.listAgentRuns({ taskId }).then((r) => setRuns(r as AgentRun[]));
  }, [taskId, fetchTask]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      await api.retryTask(taskId);
      setTask((prev) => (prev ? { ...prev, status: 'backlog' } : prev));
    } catch (e) {
      setRetryError((e as Error).message);
    } finally {
      setRetrying(false);
    }
  }, [taskId]);

  useGlobalSSE(
    useCallback(
      (eventType: string, data: unknown) => {
        if (eventType === 'task:status_changed') {
          const event = data as { taskId: string };
          if (event.taskId === taskId) {
            fetchTask();
          }
        }
      },
      [taskId, fetchTask]
    )
  );

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!task) return <div className="text-muted-foreground">Loading...</div>;

  const agentLink = (runId: string) =>
    onSelectAgentRun ? (
      <button onClick={() => onSelectAgentRun(runId)} className="hover:underline text-left">
        {runId}
      </button>
    ) : (
      <Link href={`/cycles/${task.cycleId}?agent=${runId}`} className="hover:underline">
        {runId}
      </Link>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{task._id}</div>
          <h1 className="text-lg font-bold">{task.title}</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={task.status} />
          {task.status === 'failed' && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          )}
          {retryError && <p className="text-xs text-destructive">{retryError}</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Type</div>
            <div className="mt-1 font-medium">{task.type}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Priority</div>
            <div className="mt-1 font-medium">{task.priority}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Cycle</div>
            <div className="mt-1 font-medium">
              <Link href={`/cycles/${task.cycleId}`} className="hover:underline">
                {task.cycleId}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {task.description && (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{task.description}</p>
          </CardContent>
        </Card>
      )}

      {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Acceptance Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1 pl-6 text-sm">
              {task.acceptanceCriteria.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {task.branch && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Branch</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{task.branch}</code>
              </div>
            )}
            {task.prNumber && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">PR</span>
                {task.prUrl ? (
                  <a href={task.prUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    #{task.prNumber}
                  </a>
                ) : (
                  <span>#{task.prNumber}</span>
                )}
              </div>
            )}
            {task.ciStatus && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">CI Status</span>
                <StatusBadge status={task.ciStatus} />
              </div>
            )}
            {task.reviewVerdict && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Review Verdict</span>
                <span className={`badge ${task.reviewVerdict === 'approved' ? 'badge-active' : 'badge-paused'}`}>
                  {task.reviewVerdict === 'approved' ? 'Approved' : 'Changes Requested'}
                </span>
              </div>
            )}
            {task.retryCount != null && task.retryCount > 0 && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Retries</span>
                <span>
                  Retried {task.retryCount} {task.retryCount === 1 ? 'time' : 'times'}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {task.activityLog && task.activityLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activity Log</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...task.activityLog].reverse().map((entry, i) => (
                  <TableRow key={i}>
                    <TableCell className="shrink-0 whitespace-nowrap text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>{entry.action}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Agent Runs ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-muted-foreground text-sm">No agent runs yet.</div>
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
                {runs.map((run) => (
                  <TableRow key={run._id}>
                    <TableCell>{agentLink(run._id)}</TableCell>
                    <TableCell>{run.role}</TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell>${run.costUsd?.toFixed(2) ?? '---'}</TableCell>
                    <TableCell>{run.durationMs ? `${(run.durationMs / 1000).toFixed(0)}s` : '---'}</TableCell>
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
