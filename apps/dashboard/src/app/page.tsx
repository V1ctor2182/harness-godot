'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useGlobalSSE } from '@/hooks/use-sse';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/status-badge';

interface CycleData {
  _id: number;
  goal: string;
  phase: string;
  status: string;
  tasks: string[];
  metrics?: { totalCostUsd: number; tasksCompleted: number; tasksFailed: number };
}

interface TaskData {
  _id: string;
  status: string;
}

interface ControlData {
  mode: string;
  spentUsd: number;
  spendingCapUsd?: number;
}

interface JobData {
  _id: string;
  status: string;
  requiresApproval?: boolean;
}

function getEventContext(type: string, data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  switch (type) {
    case 'agent:started':
    case 'agent:completed': {
      const role = typeof d.role === 'string' ? d.role : null;
      const taskId = typeof d.taskId === 'string' ? d.taskId : null;
      if (!role) return null;
      return taskId ? `${role} · ${taskId}` : role;
    }
    case 'task:status_changed': {
      const taskId = typeof d.taskId === 'string' ? d.taskId : null;
      const status = typeof d.status === 'string' ? d.status : null;
      if (!taskId || !status) return null;
      return `${taskId} → ${status}`;
    }
    case 'cycle:phase_changed': {
      const cycleId = typeof d.cycleId === 'number' ? d.cycleId : null;
      const phase = typeof d.phase === 'string' ? d.phase : null;
      if (cycleId == null || !phase) return null;
      return `#${cycleId} → ${phase}`;
    }
    case 'cycle:completed':
    case 'cycle:failed': {
      const cycleId = typeof d.cycleId === 'number' ? d.cycleId : null;
      if (cycleId == null) return null;
      return `#${cycleId}`;
    }
    case 'job:requires_approval':
    case 'job:failed': {
      const jobType = typeof d.type === 'string' ? d.type : null;
      return jobType;
    }
    case 'system:spending_warning': {
      const spent = typeof d.spentUsd === 'number' ? d.spentUsd : null;
      const cap = typeof d.spendingCapUsd === 'number' ? d.spendingCapUsd : null;
      if (spent == null || cap == null) return null;
      return `$${spent.toFixed(2)} / $${cap.toFixed(2)}`;
    }
    default:
      return null;
  }
}

export default function Dashboard() {
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [control, setControl] = useState<ControlData | null>(null);
  const [events, setEvents] = useState<Array<{ type: string; data: unknown; time: string }>>([]);
  const [cycleTasks, setCycleTasks] = useState<TaskData[]>([]);
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number>(0);
  const [spendingWarning, setSpendingWarning] = useState<{
    spentUsd: number;
    spendingCapUsd: number;
    percentUsed: number;
    action: 'paused' | 'hard_cap';
  } | null>(null);

  // Ref so the SSE handler (stale closure) can always read the current active cycle ID
  const activeCycleIdRef = useRef<number | null>(null);
  // Track previous connected state to detect reconnects
  const wasConnectedRef = useRef<boolean>(false);

  function fetchPendingApprovals() {
    api
      .listJobs({ status: 'pending' })
      .then((jobs) => {
        const count = (jobs as JobData[]).filter((j) => j.requiresApproval === true).length;
        setPendingApprovalCount(count);
      })
      .catch(() => {
        // leave count unchanged on error
      });
  }

  useEffect(() => {
    api.listCycles().then((c) => setCycles(c as CycleData[]));
    api.getControl().then((c) => setControl(c as ControlData));
    fetchPendingApprovals();
  }, []);

  const activeCycle = cycles.find((c) => c.status === 'active');

  // Keep ref in sync after every render
  useEffect(() => {
    activeCycleIdRef.current = activeCycle?._id ?? null;
  });

  // Fetch tasks whenever the active cycle changes
  useEffect(() => {
    if (activeCycle?._id != null) {
      api.listTasks({ cycleId: activeCycle._id }).then((t) => setCycleTasks(t as TaskData[]));
    } else {
      setCycleTasks([]);
    }
  }, [activeCycle?._id]);

  const { connected, retryCount } = useGlobalSSE((type, data) => {
    setEvents((prev) =>
      [{ type, data, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50)
    );

    if (type === 'cycle:completed' || type === 'cycle:failed' || type === 'cycle:phase_changed') {
      api.listCycles().then((c) => setCycles(c as CycleData[]));
    }

    if (type === 'cycle:completed' || type === 'cycle:failed') {
      setCycleTasks([]);
    }

    if (type === 'system:spending_warning') {
      const d = data as {
        spentUsd: number;
        spendingCapUsd: number;
        percentUsed: number;
        action: 'paused' | 'hard_cap';
      };
      setSpendingWarning(d);
      api.getControl().then((c) => setControl(c as ControlData));
    }

    if (type === 'task:status_changed') {
      const cycleId = activeCycleIdRef.current;
      if (cycleId != null) {
        api.listTasks({ cycleId }).then((t) => setCycleTasks(t as TaskData[]));
      }
    }

    if (type === 'job:requires_approval') {
      setPendingApprovalCount((prev) => prev + 1);
    }

    if (type === 'job:failed') {
      fetchPendingApprovals();
    }
  });

  // Auto-dismiss spending warning when SSE connection is re-established
  useEffect(() => {
    if (connected && !wasConnectedRef.current) {
      setSpendingWarning(null);
    }
    wasConnectedRef.current = connected;
  }, [connected]);

  const completedCycles = cycles
    .filter((c) => c.status === 'completed')
    .sort((a, b) => b._id - a._id)
    .slice(0, 5);

  const doneTasks = cycleTasks.filter((t) => t.status === 'done').length;
  const totalTasks = cycleTasks.length;

  // Spending progress bar
  const spendPercent =
    control?.spendingCapUsd != null && control.spendingCapUsd > 0
      ? Math.min((control.spentUsd / control.spendingCapUsd) * 100, 100)
      : null;

  const spendBarColor =
    spendPercent === null
      ? ''
      : spendPercent >= 95
        ? 'bg-destructive'
        : spendPercent >= 75
          ? 'bg-warning'
          : 'bg-success';

  return (
    <div className="pt-4 font-mono">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <Badge
          variant="outline"
          className={
            connected
              ? 'border-success/30 bg-success/15 text-success'
              : 'border-destructive/30 bg-destructive/15 text-destructive'
          }
        >
          <span
            className={`mr-1 inline-block size-1.5 rounded-full ${
              connected ? 'bg-success animate-pulse' : 'bg-destructive'
            }`}
          />
          {connected
            ? 'SSE Connected'
            : retryCount > 0
              ? `Reconnecting (attempt ${retryCount})...`
              : 'Disconnected'}
        </Badge>
      </div>

      {/* Spending warning banner */}
      {spendingWarning && (
        <div
          className={`mb-4 flex items-center justify-between rounded border px-4 py-3 text-sm font-mono ${
            spendingWarning.action === 'hard_cap'
              ? 'border-destructive/40 bg-destructive/15 text-destructive'
              : 'border-warning/40 bg-warning/15 text-warning'
          }`}
        >
          <span>
            <span className="font-semibold uppercase tracking-wide">
              {spendingWarning.action === 'hard_cap' ? '[HARD CAP]' : '[PAUSED]'}
            </span>{' '}
            Spending limit reached: ${spendingWarning.spentUsd.toFixed(2)} / $
            {spendingWarning.spendingCapUsd.toFixed(2)} ({spendingWarning.percentUsed}% used) —
            action: {spendingWarning.action}
          </span>
          <button
            onClick={() => setSpendingWarning(null)}
            aria-label="Dismiss spending warning"
            className="ml-4 shrink-0 opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top stats row */}
      <div className="mb-4 grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              System Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge status={control?.mode ?? 'loading'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Spending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-lg font-semibold text-foreground">
              ${control?.spentUsd?.toFixed(2) ?? '0.00'}
            </span>
            {control?.spendingCapUsd ? (
              <span className="ml-1 text-sm text-muted-foreground">
                / ${control.spendingCapUsd}
              </span>
            ) : null}
            {spendPercent !== null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${spendBarColor}`}
                  style={{ width: `${spendPercent}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Active Cycle
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeCycle ? (
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/cycles/${activeCycle._id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    Cycle {activeCycle._id}
                  </Link>
                  <StatusBadge status={activeCycle.phase} />
                </div>
                {totalTasks > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {doneTasks}/{totalTasks} tasks done
                  </p>
                )}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">None</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingApprovalCount > 0 ? (
              <div>
                <span className="text-lg font-semibold text-foreground">
                  {pendingApprovalCount}
                </span>
                <span className="ml-1 text-sm text-muted-foreground">awaiting review</span>
                <div className="mt-1">
                  <Link href="/inbox" className="text-xs text-primary hover:underline">
                    Open Inbox →
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <span className="text-sm text-muted-foreground">None pending</span>
                <div className="mt-1">
                  <Link href="/inbox" className="text-xs text-primary hover:underline">
                    Open Inbox →
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom two-column layout */}
      <div className="grid grid-cols-2 gap-4">
        {/* Completed Cycles table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Recent Cycles</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    ID
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Goal
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Cost
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Tasks
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedCycles.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell>
                      <Link
                        href={`/cycles/${c._id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        #{c._id}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-foreground" title={c.goal}>
                      {c.goal.length > 60 ? `${c.goal.slice(0, 60)}…` : c.goal}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.metrics?.totalCostUsd != null
                        ? `$${c.metrics.totalCostUsd.toFixed(2)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.metrics != null ? (
                        <>
                          <span className="text-success">{c.metrics.tasksCompleted}✓</span>
                          {c.metrics.tasksFailed > 0 && (
                            <span className="ml-1 text-destructive">{c.metrics.tasksFailed}✗</span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {completedCycles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No completed cycles yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Live Events feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Live Events</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {events.map((e, i) => {
                const context = getEventContext(e.type, e.data);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 border-b border-border py-1.5 text-[11px]"
                  >
                    <span className="shrink-0 text-muted-foreground">{e.time}</span>
                    <StatusBadge status={e.type.split(':')[0]} className="text-[9px]" />
                    <span className="shrink-0 text-foreground">{e.type}</span>
                    {context && <span className="truncate text-muted-foreground">{context}</span>}
                  </div>
                );
              })}
              {events.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Waiting for events...
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
