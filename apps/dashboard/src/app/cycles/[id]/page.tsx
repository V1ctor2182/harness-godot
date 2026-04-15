'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { api, type TestResultItem } from '@/lib/api';
import { useGlobalSSE } from '@/hooks/use-sse';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AgentDetail } from '@/components/agent-detail';
import { TaskDetail } from '@/components/task-detail';

// ─── Types ──────────────────────────────────────────────────────────

interface Cycle {
  _id: number;
  goal: string;
  phase: string;
  status: string;
  summary?: string;
  startedAt: string;
  completedAt?: string;
  metrics?: {
    totalCostUsd?: number;
    tasksCompleted?: number;
    tasksFailed?: number;
    totalDurationMs?: number;
  };
}

interface Task {
  _id: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  cycleId: number;
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

// ─── Constants ──────────────────────────────────────────────────────

const ROLE_ORDER = ['orchestrator', 'coder', 'tester', 'reviewer', 'integrator', 'curator'] as const;
type Role = (typeof ROLE_ORDER)[number];

const ROLE_LABEL: Record<Role, string> = {
  orchestrator: 'Orchestrator',
  coder: 'Coder',
  tester: 'Tester',
  reviewer: 'Reviewer',
  integrator: 'Integrator',
  curator: 'Curator',
};

const MULTI_INSTANCE: Record<Role, boolean> = {
  orchestrator: false,
  coder: true,
  tester: true,
  reviewer: true,
  integrator: true,
  curator: false,
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ─── Team Pipeline ──────────────────────────────────────────────────

interface RoleGroup {
  role: Role;
  runs: AgentRun[];
  running: number;
  done: number;
  failed: number;
  totalCost: number;
  totalDuration: number;
  hasAnyRun: boolean;
}

function groupRunsByRole(runs: AgentRun[]): RoleGroup[] {
  return ROLE_ORDER.map((role) => {
    const matching = runs.filter((r) => r.role === role);
    const running = matching.filter((r) => r.status === 'running' || r.status === 'active').length;
    const done = matching.filter((r) => r.status === 'completed').length;
    const failed = matching.filter((r) => r.status === 'failed').length;
    const totalCost = matching.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
    const totalDuration = matching.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
    return {
      role,
      runs: matching,
      running,
      done,
      failed,
      totalCost,
      totalDuration,
      hasAnyRun: matching.length > 0,
    };
  });
}

function AgentCard({ group, onOpen }: { group: RoleGroup; onOpen: (role: Role) => void }) {
  const isMulti = MULTI_INSTANCE[group.role];
  const isRunning = group.running > 0;
  const isFailed = group.failed > 0 && group.running === 0;
  const count = group.runs.length;
  const latestRunning = group.runs.find((r) => r.status === 'running' || r.status === 'active');
  const latestTask = latestRunning?.taskId ?? group.runs[group.runs.length - 1]?.taskId;

  let statusDot = '○';
  let statusLabel = 'idle';
  let statusClass = 'text-muted-foreground';
  if (isRunning) {
    statusDot = '●';
    statusLabel = `${group.running} running`;
    statusClass = 'text-primary';
  } else if (group.done > 0 && group.failed === 0) {
    statusDot = '✔';
    statusLabel = `${group.done} done`;
    statusClass = 'text-success';
  } else if (isFailed) {
    statusDot = '✗';
    statusLabel = `${group.failed} failed`;
    statusClass = 'text-destructive';
  }

  return (
    <button
      type="button"
      onClick={() => group.hasAnyRun && onOpen(group.role)}
      disabled={!group.hasAnyRun}
      className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left min-w-[150px] transition-colors ${
        isFailed
          ? 'border-destructive/50 bg-destructive/5'
          : isRunning
            ? 'border-primary/50 bg-primary/5 animate-pulse'
            : 'border-border bg-background hover:border-foreground/50'
      } ${group.hasAnyRun ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-xs font-semibold uppercase tracking-wide">{ROLE_LABEL[group.role]}</span>
        {isMulti && count > 0 && (
          <span className="text-[10px] text-muted-foreground">×{count}</span>
        )}
      </div>
      <div className={`text-xs ${statusClass}`}>
        <span className="mr-1">{statusDot}</span>
        {statusLabel}
      </div>
      {latestTask && (
        <div className="text-[10px] text-muted-foreground font-mono truncate max-w-full">
          {latestTask}
        </div>
      )}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground w-full mt-0.5">
        <span>{group.totalDuration > 0 ? formatDuration(group.totalDuration) : '—'}</span>
        <span className="ml-auto font-mono">
          ${group.totalCost > 0 ? group.totalCost.toFixed(2) : '—'}
        </span>
      </div>
    </button>
  );
}

function PipelineArrow({ active }: { active: boolean }) {
  return (
    <div className="flex items-center" aria-hidden>
      <div className={`h-px w-4 ${active ? 'bg-primary' : 'bg-border'}`} />
      <span className={`text-sm ${active ? 'text-primary' : 'text-muted-foreground'}`}>▶</span>
    </div>
  );
}

function TeamPipeline({
  groups,
  onOpenAgent,
}: {
  groups: RoleGroup[];
  onOpenAgent: (role: Role) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Team Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-stretch gap-1 flex-wrap">
          {groups.map((g, i) => (
            <div key={g.role} className="flex items-center">
              <AgentCard group={g} onOpen={onOpenAgent} />
              {i < groups.length - 1 && <PipelineArrow active={groups[i].hasAnyRun} />}
            </div>
          ))}
        </div>
        <div className="mt-3 text-[10px] text-muted-foreground flex items-center gap-4">
          <span>● running</span>
          <span className="text-success">✔ done</span>
          <span className="text-destructive">✗ failed</span>
          <span>○ idle</span>
          <span className="ml-auto">click a card to inspect agent runs</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tasks Panel ────────────────────────────────────────────────────

function TasksPanel({
  tasks,
  taskCostMap,
  taskTestSummaryMap,
  onOpenTask,
}: {
  tasks: Task[];
  taskCostMap: Map<string, number>;
  taskTestSummaryMap: Map<string, { layers: number; passed: number; total: number }>;
  onOpenTask: (taskId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Tasks ({tasks.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {tasks.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">No tasks in this cycle.</div>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((t) => {
              const cost = taskCostMap.get(t._id);
              const tests = taskTestSummaryMap.get(t._id);
              return (
                <button
                  type="button"
                  key={t._id}
                  onClick={() => onOpenTask(t._id)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="font-mono text-[11px] text-muted-foreground w-24 shrink-0">
                    {t._id}
                  </span>
                  <span className="flex-1 truncate text-sm">{t.title}</span>
                  <StatusBadge status={t.status} />
                  {tests && (
                    <span className="text-[10px] text-muted-foreground">
                      {tests.passed}/{tests.total} ({tests.layers}L)
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground w-14 text-right">
                    {cost != null ? `$${cost.toFixed(2)}` : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tests Panel (dynamic layer grouping) ───────────────────────────

interface LayerSummary {
  layer: string;
  passed: number;
  failed: number;
  total: number;
}

function groupTestsByLayer(tests: TestResultItem[]): LayerSummary[] {
  const byLayer = new Map<string, LayerSummary>();
  for (const t of tests) {
    const s = byLayer.get(t.layer) ?? { layer: t.layer, passed: 0, failed: 0, total: 0 };
    s.passed += t.passed ?? 0;
    s.failed += t.failed ?? 0;
    s.total += t.totalTests ?? 0;
    byLayer.set(t.layer, s);
  }
  return Array.from(byLayer.values()).sort((a, b) => a.layer.localeCompare(b.layer));
}

function TestsPanel({ tests }: { tests: TestResultItem[] }) {
  const [expanded, setExpanded] = useState(true);
  const summaries = useMemo(() => groupTestsByLayer(tests), [tests]);
  const totalPassed = summaries.reduce((s, l) => s + l.passed, 0);
  const totalFailed = summaries.reduce((s, l) => s + l.failed, 0);
  const totalTests = totalPassed + totalFailed;
  const passRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : null;

  const recentFailures = tests
    .flatMap((t) =>
      (t.failures ?? []).map((f) => ({
        taskId: t.taskId,
        layer: t.layer,
        testName: f.testName,
        expected: f.expected,
        actual: f.actual,
        file: f.file,
        line: f.line,
      }))
    )
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 text-left"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <CardTitle className="text-sm">Tests</CardTitle>
          {passRate !== null && (
            <span className="text-xs text-muted-foreground">
              pass rate {passRate}% ({totalPassed}/{totalTests})
            </span>
          )}
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          {summaries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No test results yet.</div>
          ) : (
            <div className="space-y-1">
              {summaries.map((s) => {
                const ratio = s.total > 0 ? s.passed / s.total : 0;
                return (
                  <div key={s.layer} className="flex items-center gap-3 text-xs">
                    <span className="w-20 font-mono text-muted-foreground">{s.layer}</span>
                    <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                      <div
                        className={`h-full ${s.failed > 0 ? 'bg-destructive' : 'bg-success'}`}
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                    <span className="font-mono w-16 text-right">
                      {s.passed}/{s.total}
                    </span>
                    {s.failed > 0 && <span className="text-destructive">⚠ {s.failed}</span>}
                  </div>
                );
              })}
            </div>
          )}
          {recentFailures.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Recent failures
              </div>
              <ul className="space-y-1 text-xs">
                {recentFailures.map((f, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="font-mono text-foreground">{f.taskId}</span>
                    <span className="mx-1">·</span>
                    <span className="text-foreground">{f.layer}</span>
                    <span className="mx-1">·</span>
                    <span>{f.testName}</span>
                    {f.file && (
                      <span className="ml-1">
                        <span className="text-accent">{f.file}</span>
                        {f.line != null && <span>:{f.line}</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Events Log (collapsed footer) ──────────────────────────────────

interface EventEntry {
  type: string;
  at: Date;
  summary: string;
}

function EventsLog({ entries }: { entries: EventEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 text-left"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <CardTitle className="text-sm">Events ({entries.length})</CardTitle>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-sm text-muted-foreground">Waiting for events…</div>
          ) : (
            <div className="max-h-60 overflow-auto space-y-0.5 text-xs font-mono">
              {entries.slice(-200).reverse().map((e, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground w-16 shrink-0">
                    {e.at.toLocaleTimeString()}
                  </span>
                  <span className="text-accent w-40 shrink-0 truncate">{e.type}</span>
                  <span className="text-muted-foreground truncate">{e.summary}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function CycleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = Number(params.id);

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [tests, setTests] = useState<TestResultItem[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([]);

  // Drawer state via query params (so deep-linking works)
  const openAgentRole = searchParams.get('agent') as Role | null;
  const openTaskId = searchParams.get('task');

  const refresh = useCallback(() => {
    void api.getCycle(id).then((c) => setCycle(c as Cycle));
    void api.listTasks({ cycleId: id }).then((t) => setTasks(t as Task[]));
    void api.listAgentRuns({ cycleId: id }).then((r) => setAgentRuns(r as AgentRun[]));
    void api.listTests({ cycleId: id }).then(setTests);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useGlobalSSE(
    useCallback(
      (type: string, data: unknown) => {
        const e = data as { cycleId?: number; taskId?: string; role?: string; status?: string };
        const relevant = e.cycleId === id || type.startsWith('cycle:');
        if (relevant) {
          refresh();
        }
        setEvents((prev) => [
          ...prev,
          {
            type,
            at: new Date(),
            summary: [e.taskId, e.role, e.status].filter(Boolean).join(' · ') || JSON.stringify(data).slice(0, 80),
          },
        ].slice(-400));
      },
      [id, refresh]
    )
  );

  // Group runs by role
  const roleGroups = useMemo(() => groupRunsByRole(agentRuns), [agentRuns]);

  // Aggregate per-task cost from agent runs
  const taskCostMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of agentRuns) {
      if (!r.taskId) continue;
      m.set(r.taskId, (m.get(r.taskId) ?? 0) + (r.costUsd ?? 0));
    }
    return m;
  }, [agentRuns]);

  // Aggregate per-task test summary
  const taskTestSummaryMap = useMemo(() => {
    const m = new Map<string, { layers: number; passed: number; total: number }>();
    for (const t of tests) {
      const s = m.get(t.taskId) ?? { layers: 0, passed: 0, total: 0 };
      s.layers += 1;
      s.passed += t.passed ?? 0;
      s.total += t.totalTests ?? 0;
      m.set(t.taskId, s);
    }
    return m;
  }, [tests]);

  // Open a specific run inside a role drawer (default: latest run of that role)
  const openAgentRun = useMemo(() => {
    if (!openAgentRole) return null;
    const runs = agentRuns.filter((r) => r.role === openAgentRole);
    return runs[runs.length - 1] ?? null;
  }, [openAgentRole, agentRuns]);

  const updateQuery = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v == null) params.delete(k);
        else params.set(k, v);
      }
      router.replace(`/cycles/${id}?${params.toString()}`);
    },
    [router, searchParams, id]
  );

  const openAgent = useCallback((role: Role) => updateQuery({ agent: role, task: null }), [updateQuery]);
  const openTask = useCallback((taskId: string) => updateQuery({ task: taskId, agent: null }), [updateQuery]);
  const closeDrawers = useCallback(() => updateQuery({ agent: null, task: null }), [updateQuery]);

  if (!cycle) {
    return (
      <div className="pt-4 text-sm text-muted-foreground">
        Loading cycle {id}… <Link href="/cycles" className="text-primary hover:underline ml-2">Back to cycles</Link>
      </div>
    );
  }

  const progressDone = cycle.metrics?.tasksCompleted ?? 0;
  const progressFailed = cycle.metrics?.tasksFailed ?? 0;
  const progressTotal = tasks.length || 1;
  const progressPct = Math.round(((progressDone + progressFailed) / progressTotal) * 100);

  return (
    <div className="pt-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/cycles" className="text-xs text-muted-foreground hover:text-foreground">
            ← Cycles
          </Link>
          <h1 className="text-xl font-bold">Cycle {cycle._id}</h1>
          <StatusBadge status={cycle.phase} />
          <StatusBadge status={cycle.status} />
          <span className="ml-auto text-xs text-muted-foreground font-mono">
            ${cycle.metrics?.totalCostUsd?.toFixed(2) ?? '0.00'}
            {cycle.metrics?.totalDurationMs
              ? ` · ${formatDuration(cycle.metrics.totalDurationMs)}`
              : ''}
          </span>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">{cycle.goal}</div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground font-mono w-20 text-right">
            {progressDone + progressFailed}/{progressTotal} tasks
          </span>
        </div>
      </div>

      {/* Team pipeline */}
      <TeamPipeline groups={roleGroups} onOpenAgent={openAgent} />

      {/* Tasks + Tests in a 2-col grid on wide screens */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TasksPanel
            tasks={tasks}
            taskCostMap={taskCostMap}
            taskTestSummaryMap={taskTestSummaryMap}
            onOpenTask={openTask}
          />
        </div>
        <div className="lg:col-span-1">
          <TestsPanel tests={tests} />
        </div>
      </div>

      {/* Events footer */}
      <EventsLog entries={events} />

      {/* Agent drawer */}
      <Sheet open={!!openAgentRole} onOpenChange={(v) => !v && closeDrawers()}>
        <SheetContent side="right" className="w-[640px] max-w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {openAgentRole ? ROLE_LABEL[openAgentRole] : 'Agent'} ·{' '}
              {openAgentRun ? openAgentRun._id.slice(0, 12) : ''}
            </SheetTitle>
          </SheetHeader>
          <div className="p-5">
            {openAgentRun ? (
              <AgentDetail agentRunId={openAgentRun._id} eventScrollHeight="500px" />
            ) : (
              <div className="text-sm text-muted-foreground">No runs for this role yet.</div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Task drawer */}
      <Sheet open={!!openTaskId} onOpenChange={(v) => !v && closeDrawers()}>
        <SheetContent side="right" className="w-[640px] max-w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Task · {openTaskId}</SheetTitle>
          </SheetHeader>
          <div className="p-5">
            {openTaskId && (
              <TaskDetail
                taskId={openTaskId}
                onSelectAgentRun={(runId) => {
                  // When user clicks an agent run link inside the drawer, flip to agent drawer
                  // by setting agent query param (this uses the run's role — best-effort).
                  const run = agentRuns.find((r) => r._id === runId);
                  if (run) updateQuery({ agent: run.role, task: null });
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
