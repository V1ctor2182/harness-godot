'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
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

export default function TaskDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const fetchTask = useCallback(() => {
    api
      .getTask(id)
      .then((t) => setTask(t as Task))
      .catch((e) => setError((e as Error).message));
  }, [id]);

  useEffect(() => {
    fetchTask();
    api.listAgentRuns({ taskId: id }).then((r) => setRuns(r as AgentRun[]));
  }, [id, fetchTask]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      await api.retryTask(id);
      setTask((prev) => (prev ? { ...prev, status: 'backlog' } : prev));
    } catch (e) {
      setRetryError((e as Error).message);
    } finally {
      setRetrying(false);
    }
  }, [id]);

  useGlobalSSE(
    useCallback(
      (eventType: string, data: unknown) => {
        if (eventType === 'task:status_changed') {
          const event = data as {
            taskId: string;
            status?: string;
            prNumber?: number;
            prUrl?: string;
          };
          if (event.taskId === id) {
            fetchTask();
          }
        }
      },
      [id, fetchTask]
    )
  );

  if (error) {
    return (
      <div className="pt-4">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!task) return <div className="pt-4 text-muted-foreground">Loading...</div>;

  const mostRecentRun = runs.length > 0 ? runs[runs.length - 1] : null;

  return (
    <div className="pt-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{task._id}</div>
          <h1 className="text-2xl font-bold">{task.title}</h1>
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

      {/* Meta fields */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Type</div>
            <div className="mt-1 font-medium">{task.type}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Priority</div>
            <div className="mt-1 font-medium">{task.priority}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Cycle</div>
            <div className="mt-1 font-medium">
              <Link href={`/cycles/${task.cycleId}`} className="hover:underline">
                {task.cycleId}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {task.description && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{task.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Acceptance Criteria */}
      {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Acceptance Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1 pl-6">
              {task.acceptanceCriteria.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Additional details */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {task.assignedTo && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Assigned To
                </span>
                <Link href={`/agents/${task.assignedTo}`} className="hover:underline">
                  {task.assignedTo}
                </Link>
              </div>
            )}
            {task.branch && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Branch
                </span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{task.branch}</code>
              </div>
            )}
            {task.prNumber && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">PR</span>
                {task.prUrl ? (
                  <a
                    href={task.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    #{task.prNumber}
                  </a>
                ) : (
                  <span>#{task.prNumber}</span>
                )}
              </div>
            )}
            {task.ciStatus && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  CI Status
                </span>
                <StatusBadge status={task.ciStatus} />
              </div>
            )}
            {task.blockedBy && task.blockedBy.length > 0 && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Blocked By
                </span>
                <span>
                  {task.blockedBy.map((dep, i) => (
                    <span key={dep}>
                      <Link href={`/tasks/${dep}`} className="hover:underline">
                        {dep}
                      </Link>
                      {i < (task.blockedBy?.length ?? 0) - 1 && ', '}
                    </span>
                  ))}
                </span>
              </div>
            )}
            {task.reviewVerdict && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Review Verdict
                </span>
                <span
                  className={`badge ${task.reviewVerdict === 'approved' ? 'badge-active' : 'badge-paused'}`}
                >
                  {task.reviewVerdict === 'approved' ? 'Approved' : 'Changes Requested'}
                </span>
              </div>
            )}
            {task.retryCount != null && task.retryCount > 0 && (
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Retries
                </span>
                <span>
                  Retried {task.retryCount} {task.retryCount === 1 ? 'time' : 'times'}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
      {task.activityLog && task.activityLog.length > 0 && (
        <Card className="mb-4">
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

      {/* Agent Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Runs ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-muted-foreground">No agent runs yet.</div>
          ) : (
            <>
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
                      <TableCell>
                        <Link href={`/agents/${run._id}`} className="hover:underline">
                          {run._id}
                        </Link>
                      </TableCell>
                      <TableCell>{run.role}</TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell>${run.costUsd?.toFixed(2) ?? '---'}</TableCell>
                      <TableCell>
                        {run.durationMs ? `${(run.durationMs / 1000).toFixed(0)}s` : '---'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {mostRecentRun && (
                <div className="mt-3">
                  <Link href={`/agents/${mostRecentRun._id}`} className="hover:underline">
                    View most recent run &rarr;
                  </Link>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
