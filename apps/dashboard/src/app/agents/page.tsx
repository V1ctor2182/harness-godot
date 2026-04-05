'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useGlobalSSE } from '@/hooks/use-sse';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { StatusBadge, LiveDot } from '@/components/status-badge';

const PAGE_SIZE = 50;

interface AgentRun {
  _id: string;
  role: string;
  status: string;
  taskId?: string;
  cycleId: number;
  costUsd?: number;
  durationMs?: number;
  startedAt: string;
}

interface AgentStartedPayload {
  agentRunId: string;
  role: string;
  taskId?: string;
  cycleId: number;
}

interface AgentCompletedPayload {
  agentRunId: string;
  status: string;
  costUsd: number;
}

const ROLES = ['all', 'orchestrator', 'coder', 'reviewer', 'integrator', 'curator'] as const;
const STATUSES = [
  'all',
  'running',
  'starting',
  'completed',
  'failed',
  'timeout',
  'killed',
] as const;

function isLive(status: string): boolean {
  return status === 'running' || status === 'starting';
}

const selectClassName =
  'bg-background text-foreground border border-border rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer';

function AgentsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [page, setPage] = useState(1);

  const roleParam = searchParams.get('role') ?? 'all';
  const cycleParam = searchParams.get('cycleId') ?? 'all';
  const statusParam = searchParams.get('status') ?? 'all';

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setPage(1);
  }, [roleParam, cycleParam, statusParam]);

  useEffect(() => {
    api.listAgentRuns().then((r) => setRuns(r as AgentRun[]));
  }, []);

  const handleEvent = useCallback(async (type: string, data: unknown) => {
    if (type === 'agent:started') {
      const event = data as AgentStartedPayload;
      try {
        const run = await api.getAgentRun(event.agentRunId);
        setRuns((prev) => {
          if (prev.some((r) => r._id === event.agentRunId)) return prev;
          return [run as AgentRun, ...prev];
        });
      } catch {
        setRuns((prev) => {
          if (prev.some((r) => r._id === event.agentRunId)) return prev;
          return [
            {
              _id: event.agentRunId,
              role: event.role,
              status: 'running',
              taskId: event.taskId,
              cycleId: event.cycleId,
              startedAt: new Date().toISOString(),
            },
            ...prev,
          ];
        });
      }
    } else if (type === 'agent:completed') {
      const event = data as AgentCompletedPayload;
      try {
        const updated = await api.getAgentRun(event.agentRunId);
        setRuns((prev) =>
          prev.map((r) => (r._id === event.agentRunId ? (updated as AgentRun) : r))
        );
      } catch {
        setRuns((prev) =>
          prev.map((r) =>
            r._id === event.agentRunId ? { ...r, status: event.status, costUsd: event.costUsd } : r
          )
        );
      }
    }
  }, []);

  const { connected } = useGlobalSSE(handleEvent);

  // Derive sorted unique cycleIds from runs (descending)
  const cycleIds = Array.from(new Set(runs.map((r) => r.cycleId))).sort((a, b) => b - a);

  // Apply filters
  const filteredRuns = runs.filter((r) => {
    if (roleParam !== 'all' && r.role !== roleParam) return false;
    if (cycleParam !== 'all' && r.cycleId !== Number(cycleParam)) return false;
    if (statusParam !== 'all' && r.status !== statusParam) return false;
    return true;
  });

  const totalFiltered = filteredRuns.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const pagedRuns = filteredRuns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateFilter(key: 'role' | 'cycleId' | 'status', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Agent Runs</h1>
        <Badge
          variant="outline"
          className={
            connected
              ? 'border-green-500/30 bg-green-500/10 text-green-500'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }
        >
          {connected ? '\u25CF Connected' : '\u25CB Disconnected'}
        </Badge>
      </div>

      {/* Filter controls */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label htmlFor="filter-role" className="text-sm text-muted-foreground font-mono">
            Role
          </label>
          <select
            id="filter-role"
            className={selectClassName}
            value={roleParam}
            onChange={(e) => updateFilter('role', e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="filter-cycle" className="text-sm text-muted-foreground font-mono">
            Cycle
          </label>
          <select
            id="filter-cycle"
            className={selectClassName}
            value={cycleParam}
            onChange={(e) => updateFilter('cycleId', e.target.value)}
          >
            <option value="all">all</option>
            {cycleIds.map((id) => (
              <option key={id} value={String(id)}>
                {id}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="filter-status" className="text-sm text-muted-foreground font-mono">
            Status
          </label>
          <select
            id="filter-status"
            className={selectClassName}
            value={statusParam}
            onChange={(e) => updateFilter('status', e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <span className="text-sm text-muted-foreground font-mono">
          ({totalFiltered} result{totalFiltered !== 1 ? 's' : ''})
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRuns.map((r) => (
                <TableRow key={r._id}>
                  <TableCell>
                    <Link href={`/agents/${r._id}`} className="text-primary hover:underline">
                      {r._id.slice(0, 20)}
                    </Link>
                  </TableCell>
                  <TableCell>{r.role}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      {isLive(r.status) && <LiveDot />}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.taskId ? (
                      <Link href={`/tasks/${r.taskId}`} className="text-primary hover:underline">
                        {r.taskId}
                      </Link>
                    ) : (
                      '\u2014'
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/cycles/${r.cycleId}`} className="text-primary hover:underline">
                      {r.cycleId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {r.costUsd !== undefined ? `$${r.costUsd.toFixed(2)}` : '\u2014'}
                  </TableCell>
                  <TableCell>
                    {r.durationMs ? `${(r.durationMs / 1000).toFixed(0)}s` : '\u2014'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.startedAt).toLocaleTimeString()}
                  </TableCell>
                </TableRow>
              ))}
              {pagedRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {runs.length === 0 ? 'No agent runs yet' : 'No runs match the current filters'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination controls */}
      {totalFiltered > 0 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm font-mono border border-border rounded bg-background text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground font-mono">
            Page {page} of {totalPages} ({totalFiltered} result{totalFiltered !== 1 ? 's' : ''})
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm font-mono border border-border rounded bg-background text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense
      fallback={<div className="pt-4 text-muted-foreground font-mono text-sm">Loading...</div>}
    >
      <AgentsContent />
    </Suspense>
  );
}
