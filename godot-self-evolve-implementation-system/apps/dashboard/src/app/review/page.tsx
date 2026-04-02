'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useGlobalSSE } from '@/hooks/use-sse';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/status-badge';

interface Task {
  _id: string;
  title: string;
  status: string;
  type: string;
  cycleId: number;
  branch?: string;
  prNumber?: number;
  prUrl?: string;
  ciStatus?: string;
  reviewVerdict?: string;
  assignedTo?: string;
  acceptanceCriteria?: string[];
}

interface ApplyPlanPayload {
  agentRunId: string;
  cycleId: number;
}

interface SpawnPayload {
  role: string;
  taskId?: string;
  cycleId?: number;
}

interface NextCyclePayload {
  previousCycleId: number;
}

interface Job {
  _id: string;
  type: 'apply-plan' | 'spawn' | 'next-cycle' | string;
  status: string;
  approvalStatus?: string;
  payload: ApplyPlanPayload | SpawnPayload | NextCyclePayload | Record<string, unknown>;
}

function ciStatusBadgeClass(status: string): string {
  switch (status) {
    case 'passed':
      return 'badge-active';
    case 'failed':
      return 'badge-failed';
    case 'running':
      return 'badge-running';
    default:
      return 'badge-pending';
  }
}

function JobDescription({ job, taskCache }: { job: Job; taskCache: Record<string, Task> }) {
  if (job.type === 'apply-plan') {
    const p = job.payload as ApplyPlanPayload;
    return (
      <span>
        Approve plan for Cycle {p.cycleId}{' '}
        {p.agentRunId && (
          <Link href={`/agents/${p.agentRunId}`} className="text-primary hover:underline text-xs">
            (view orchestrator run)
          </Link>
        )}
      </span>
    );
  }

  if (job.type === 'spawn') {
    const p = job.payload as SpawnPayload;
    if (p.role === 'coder' && p.taskId) {
      const task = taskCache[p.taskId];
      return (
        <span>
          Spawn coder for{' '}
          <Link href={`/tasks/${p.taskId}`} className="text-primary hover:underline">
            {p.taskId}
          </Link>
          {task ? `: ${task.title} (Cycle ${task.cycleId})` : ''}
        </span>
      );
    }
  }

  if (job.type === 'next-cycle') {
    const p = job.payload as NextCyclePayload;
    return <span>Start next cycle (after Cycle {p.previousCycleId})</span>;
  }

  return <span className="text-muted-foreground text-xs uppercase tracking-wider">{job._id}</span>;
}

export default function ReviewPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]);
  const [taskCache, setTaskCache] = useState<Record<string, Task>>({});
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [rejectingJobId, setRejectingJobId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchPendingJobs = useCallback(() => {
    api.listJobs({ status: 'pending' }).then((j) => {
      const awaiting = (j as Job[]).filter((job) => job.approvalStatus === 'pending');
      setPendingJobs(awaiting);

      // Fetch task data for spawn-coder jobs
      const taskIds = awaiting
        .filter((job) => {
          if (job.type !== 'spawn') return false;
          const p = job.payload as SpawnPayload;
          return p.role === 'coder' && typeof p.taskId === 'string';
        })
        .map((job) => (job.payload as SpawnPayload).taskId as string);

      const uniqueIds = [...new Set(taskIds)];
      uniqueIds.forEach((id) => {
        api.getTask(id).then((t) => {
          setTaskCache((prev) => ({ ...prev, [id]: t as Task }));
        });
      });
    });
  }, []);

  useEffect(() => {
    api.listTasks({ status: 'in-review' }).then((t) => setTasks(t as Task[]));
    fetchPendingJobs();
  }, [fetchPendingJobs]);

  const handleSSEEvent = useCallback(
    (eventType: string, data: unknown) => {
      if (eventType === 'job:requires_approval' || eventType === 'job:failed') {
        fetchPendingJobs();
      } else if (eventType === 'review:ready') {
        const d = data as { taskId?: string };
        if (!d.taskId) return;
        api.getTask(d.taskId).then((t) => {
          const task = t as Task;
          setTasks((prev) =>
            prev.some((existing) => existing._id === task._id) ? prev : [...prev, task]
          );
        });
      } else if (eventType === 'task:status_changed') {
        const d = data as { taskId?: string; status?: string };
        if (!d.taskId) return;
        if (d.status !== 'in-review') {
          // Task moved away from in-review — remove it from the list
          setTasks((prev) => prev.filter((existing) => existing._id !== d.taskId));
          return;
        }
        api.getTask(d.taskId).then((t) => {
          const task = t as Task;
          setTasks((prev) =>
            prev.some((existing) => existing._id === task._id) ? prev : [...prev, task]
          );
        });
      }
    },
    [fetchPendingJobs]
  );

  const { connected } = useGlobalSSE(handleSSEEvent);

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleApproveJob = async (id: string) => {
    await api.approveJob(id);
    setPendingJobs((prev) => prev.filter((j) => j._id !== id));
  };

  const handleRejectJob = async (id: string, reason?: string) => {
    await api.rejectJob(id, reason);
    setPendingJobs((prev) => prev.filter((j) => j._id !== id));
    setRejectingJobId(null);
    setRejectReason('');
  };

  const handleRejectClick = (id: string) => {
    setRejectingJobId(id);
    setRejectReason('');
  };

  const handleRejectCancel = () => {
    setRejectingJobId(null);
    setRejectReason('');
  };

  const handleRejectConfirm = async (id: string) => {
    const trimmed = rejectReason.trim();
    await handleRejectJob(id, trimmed !== '' ? trimmed : undefined);
  };

  return (
    <div className="pt-4">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold">Human Review</h1>
        {connected ? (
          <Badge className="bg-success/15 text-success border-success/20">● Live</Badge>
        ) : (
          <Badge variant="destructive" title="SSE disconnected — updates paused">
            ○ Disconnected
          </Badge>
        )}
      </div>

      {pendingJobs.length > 0 && (
        <Card className="mb-4 border-warning/30">
          <CardHeader>
            <CardTitle>Pending Approvals ({pendingJobs.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {pendingJobs.map((j, index) => (
              <div key={j._id}>
                {index > 0 && <Separator />}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={j.type} />
                    <JobDescription job={j} taskCache={taskCache} />
                  </div>
                  <div className="flex items-center gap-1">
                    {rejectingJobId === j._id ? (
                      <>
                        <input
                          type="text"
                          autoFocus
                          placeholder="Reason (optional)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRejectConfirm(j._id);
                            if (e.key === 'Escape') handleRejectCancel();
                          }}
                          className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-48"
                        />
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={() => handleRejectConfirm(j._id)}
                        >
                          Confirm Reject
                        </Button>
                        <Button size="xs" variant="outline" onClick={handleRejectCancel}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="xs"
                          variant="outline"
                          className="border-success/50 text-success hover:bg-success/10"
                          onClick={() => handleApproveJob(j._id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={() => handleRejectClick(j._id)}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tasks In Review ({tasks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-muted-foreground">No tasks awaiting review</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6"></TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>PR</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Verdict</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((t) => {
                  const isExpanded = expandedTasks.has(t._id);
                  const hasCriteria = t.acceptanceCriteria && t.acceptanceCriteria.length > 0;
                  return (
                    <React.Fragment key={t._id}>
                      <TableRow
                        className={hasCriteria ? 'cursor-pointer hover:bg-muted/50' : undefined}
                        onClick={hasCriteria ? () => toggleTaskExpanded(t._id) : undefined}
                      >
                        <TableCell className="pr-0">
                          {hasCriteria && (
                            <button
                              aria-label={isExpanded ? 'Collapse criteria' : 'Expand criteria'}
                              className="text-muted-foreground hover:text-foreground transition-transform"
                              style={{
                                display: 'inline-block',
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTaskExpanded(t._id);
                              }}
                            >
                              ›
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/tasks/${t._id}`}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t._id}
                          </Link>
                        </TableCell>
                        <TableCell>{t.title}</TableCell>
                        <TableCell>{t.type}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {t.prNumber && t.prUrl ? (
                              <a
                                href={t.prUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                #{t.prNumber}
                              </a>
                            ) : t.prNumber ? (
                              `#${t.prNumber}`
                            ) : (
                              <span className="text-muted-foreground">&mdash;</span>
                            )}
                            {t.ciStatus && (
                              <span className={`badge badge-${ciStatusBadgeClass(t.ciStatus)}`}>
                                {t.ciStatus}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {t.assignedTo ? (
                            <Link
                              href={`/agents/${t.assignedTo}`}
                              className="text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t.assignedTo.slice(0, 16)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={t.reviewVerdict ?? 'pending'} />
                        </TableCell>
                      </TableRow>
                      {isExpanded && hasCriteria && (
                        <TableRow key={`${t._id}-criteria`}>
                          <TableCell></TableCell>
                          <TableCell colSpan={6} className="pt-1 pb-3">
                            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground pl-2">
                              {t.acceptanceCriteria!.map((criterion, i) => (
                                <li key={i}>{criterion}</li>
                              ))}
                            </ol>
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
    </div>
  );
}
