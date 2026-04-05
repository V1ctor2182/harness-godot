'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
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

interface Task {
  _id: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  cycleId: number;
  assignedTo?: string;
  branch?: string;
  prNumber?: number;
  retryCount?: number;
}

const STATUSES = [
  'all',
  'in-progress',
  'in-review',
  'ready',
  'blocked',
  'backlog',
  'done',
  'failed',
] as const;

const selectClassName =
  'bg-background text-foreground border border-border rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer';

const statusOrder: Record<string, number> = {
  'in-progress': 0,
  'in-review': 1,
  ready: 2,
  blocked: 3,
  backlog: 4,
  done: 5,
  failed: 6,
};

function TasksContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);

  const cycleParam = searchParams.get('cycleId') ?? 'all';
  const statusParam = searchParams.get('status') ?? 'all';

  const loadTasks = useCallback(() => {
    api.listTasks().then((t) => setTasks(t as Task[]));
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useGlobalSSE(
    useCallback(
      (eventType: string) => {
        if (eventType === 'task:status_changed' || eventType === 'task:created') {
          loadTasks();
        }
      },
      [loadTasks]
    )
  );

  // Derive sorted unique cycleIds from tasks (descending)
  const cycleIds = Array.from(new Set(tasks.map((t) => t.cycleId))).sort((a, b) => b - a);

  // Apply filters
  const filtered = tasks.filter((t) => {
    if (cycleParam !== 'all' && t.cycleId !== Number(cycleParam)) return false;
    if (statusParam !== 'all' && t.status !== statusParam) return false;
    return true;
  });

  const sorted = [...filtered].sort(
    (a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
  );

  const activeFilterCount = (cycleParam !== 'all' ? 1 : 0) + (statusParam !== 'all' ? 1 : 0);

  function updateFilter(key: 'cycleId' | 'status', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`?${params.toString()}`);
  }

  function clearFilters() {
    router.replace('?');
  }

  return (
    <div className="pt-4">
      <h1 className="mb-4 text-2xl font-bold">Tasks</h1>

      {/* Filter controls */}
      <div className="flex items-center gap-4 mb-4">
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
          ({sorted.length} result{sorted.length !== 1 ? 's' : ''})
        </span>

        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-sm font-mono text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Retries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((t) => (
                <TableRow key={t._id}>
                  <TableCell>
                    <Link href={`/tasks/${t._id}`} className="hover:underline">
                      {t._id}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">{t.title}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className={t.priority === 'critical' ? 'font-bold' : ''}>
                    {t.priority}
                  </TableCell>
                  <TableCell>{t.type}</TableCell>
                  <TableCell>
                    <Link href={`/cycles/${t.cycleId}`} className="hover:underline">
                      {t.cycleId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {t.assignedTo ? (
                      <Link href={`/agents/${t.assignedTo}`} className="hover:underline">
                        {t.assignedTo.slice(0, 16)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(t.retryCount ?? 0) > 0 ? (
                      <span
                        className={`badge ${(t.retryCount ?? 0) >= 2 ? 'badge-failed' : 'badge-paused'}`}
                      >
                        {t.retryCount}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {tasks.length === 0 ? 'No tasks yet' : 'No tasks match the current filters'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense
      fallback={<div className="pt-4 text-muted-foreground font-mono text-sm">Loading...</div>}
    >
      <TasksContent />
    </Suspense>
  );
}
