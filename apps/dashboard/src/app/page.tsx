'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useGlobalSSE } from '@/hooks/use-sse';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/status-badge';

// ─── Milestone definitions (from architecture) ─────────────────────
const MILESTONES = [
  { id: 'M0', name: '移动与农场场景', short: 'Movement', weeks: '1w' },
  { id: 'M1', name: '种植核心循环', short: 'Planting', weeks: '2w' },
  { id: 'M2', name: '僵尸生活与管理', short: 'Zombie Life', weeks: '2w' },
  { id: 'M3', name: '多种僵尸与种子系统', short: 'Types & Seeds', weeks: '2w' },
  { id: 'M4', name: '自动战斗系统', short: 'Combat', weeks: '3w' },
  { id: 'M5', name: '资源经济与建造', short: 'Economy', weeks: '2-3w' },
  { id: 'M6', name: '收获品质与肥料', short: 'Quality', weeks: '1-2w' },
  { id: 'M7', name: '玩家等级与技能树', short: 'Skill Tree', weeks: '2w' },
  { id: 'M8', name: '突变与僵尸进化', short: 'Mutations', weeks: '2-3w' },
  { id: 'M9', name: '养护与羁绊', short: 'Nurture', weeks: '2-2.5w' },
  { id: 'M10', name: '天气与日夜', short: 'Weather', weeks: '1w' },
  { id: 'M11', name: '世界地图与探索', short: 'World Map', weeks: '3-4w' },
  { id: 'M12', name: '战斗系统深化', short: 'Adv. Combat', weeks: '4-5w' },
  { id: 'M13', name: '基地防御', short: 'Defense', weeks: '2w' },
  { id: 'M14', name: '存档与完整循环', short: 'Save/Loop', weeks: '2w' },
  { id: 'M15', name: '美术替换与打磨', short: 'Polish', weeks: '4-6w' },
];

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
  title: string;
  type: string;
}

interface ControlData {
  mode: string;
  spentUsd: number;
  spendingCapUsd?: number;
}

interface SSEEvent {
  type: string;
  data: unknown;
  time: string;
}

function getEventContext(type: string, data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  switch (type) {
    case 'agent:started':
    case 'agent:completed': {
      const role = typeof d.role === 'string' ? d.role : null;
      const taskId = typeof d.taskId === 'string' ? d.taskId : null;
      return role ? (taskId ? `${role} · ${taskId}` : role) : null;
    }
    case 'task:status_changed': {
      const taskId = typeof d.taskId === 'string' ? d.taskId : null;
      const status = typeof d.status === 'string' ? d.status : null;
      return taskId && status ? `${taskId} → ${status}` : null;
    }
    case 'cycle:phase_changed': {
      const cycleId = typeof d.cycleId === 'number' ? d.cycleId : null;
      const phase = typeof d.phase === 'string' ? d.phase : null;
      return cycleId != null && phase ? `#${cycleId} → ${phase}` : null;
    }
    default:
      return null;
  }
}

export default function Dashboard() {
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [control, setControl] = useState<ControlData | null>(null);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [cycleTasks, setCycleTasks] = useState<TaskData[]>([]);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const activeCycleIdRef = useRef<number | null>(null);

  useEffect(() => {
    api.listCycles().then((c) => setCycles(c as CycleData[]));
    api.getControl().then((c) => setControl(c as ControlData));
    api.listJobs({ status: 'pending' }).then((jobs) => {
      const count = (jobs as Array<{ requiresApproval?: boolean }>).filter(
        (j) => j.requiresApproval
      ).length;
      setPendingApprovalCount(count);
    });
  }, []);

  const activeCycle = cycles.find((c) => c.status === 'active');
  useEffect(() => {
    activeCycleIdRef.current = activeCycle?._id ?? null;
  });
  useEffect(() => {
    if (activeCycle?._id != null) {
      api.listTasks({ cycleId: activeCycle._id }).then((t) => setCycleTasks(t as TaskData[]));
    } else {
      setCycleTasks([]);
    }
  }, [activeCycle?._id]);

  const { connected } = useGlobalSSE((type, data) => {
    setEvents((prev) => [{ type, data, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
    if (type === 'cycle:completed' || type === 'cycle:failed' || type === 'cycle:phase_changed') {
      api.listCycles().then((c) => setCycles(c as CycleData[]));
    }
    if (type === 'task:status_changed') {
      const cycleId = activeCycleIdRef.current;
      if (cycleId != null) api.listTasks({ cycleId }).then((t) => setCycleTasks(t as TaskData[]));
    }
    if (type === 'job:requires_approval') setPendingApprovalCount((p) => p + 1);
  });

  // ─── Derived data ─────────────────────────────────────────────────
  const completedCycles = cycles.filter((c) => c.status === 'completed');
  const totalSpent = control?.spentUsd ?? 0;
  const spendCap = control?.spendingCapUsd;
  const spendPct = spendCap ? Math.min((totalSpent / spendCap) * 100, 100) : null;

  const doneTasks = cycleTasks.filter((t) => t.status === 'done').length;
  const totalTasks = cycleTasks.length;

  // Determine current milestone from cycle goals (heuristic: look for M{N} pattern)
  const currentMilestoneIdx = (() => {
    const goals = cycles.map((c) => c.goal).join(' ');
    for (let i = MILESTONES.length - 1; i >= 0; i--) {
      if (goals.includes(MILESTONES[i].id)) return i;
    }
    return 0;
  })();

  // Count completed milestones (all cycles with that milestone's ID completed)
  const completedMilestones = MILESTONES.filter((m, idx) => idx < currentMilestoneIdx).length;
  const overallProgress = Math.round(((completedMilestones + (activeCycle ? 0.5 : 0)) / MILESTONES.length) * 100);

  return (
    <div className="pt-4 font-mono">
      {/* ─── Header ────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">🧟 Zombie Farm</h1>
          <p className="text-xs text-muted-foreground">AI Implementation Team — Game Development Pipeline</p>
        </div>
        <Badge
          variant="outline"
          className={connected ? 'border-success/30 bg-success/15 text-success' : 'border-destructive/30 bg-destructive/15 text-destructive'}
        >
          <span className={`mr-1 inline-block size-1.5 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-destructive'}`} />
          {connected ? 'Live' : 'Disconnected'}
        </Badge>
      </div>

      {/* ─── Milestone Progress Bar ────────────────────────── */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-semibold text-foreground">
                {MILESTONES[currentMilestoneIdx]?.id}: {MILESTONES[currentMilestoneIdx]?.name}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {activeCycle ? `Cycle ${activeCycle._id} · ${activeCycle.phase}` : 'Idle'}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{overallProgress}% overall</span>
          </div>
          {/* Milestone track */}
          <div className="flex gap-0.5">
            {MILESTONES.map((m, i) => (
              <div
                key={m.id}
                className={`h-2 flex-1 rounded-sm transition-colors ${
                  i < completedMilestones
                    ? 'bg-success'
                    : i === currentMilestoneIdx
                      ? 'bg-primary animate-pulse'
                      : 'bg-muted'
                }`}
                title={`${m.id}: ${m.name}`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">M0</span>
            <span className="text-[10px] text-muted-foreground">M15</span>
          </div>
        </CardContent>
      </Card>

      {/* ─── Stats Row ─────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">System</p>
            <StatusBadge status={control?.mode ?? 'loading'} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Spent</p>
            <span className="text-lg font-semibold">${totalSpent.toFixed(2)}</span>
            {spendCap && <span className="text-xs text-muted-foreground ml-1">/ ${spendCap}</span>}
            {spendPct !== null && (
              <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${spendPct >= 95 ? 'bg-destructive' : spendPct >= 75 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${spendPct}%` }} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Active Cycle</p>
            {activeCycle ? (
              <>
                <Link href={`/cycles/${activeCycle._id}`} className="font-semibold text-primary hover:underline">
                  #{activeCycle._id}
                </Link>
                <StatusBadge status={activeCycle.phase} className="ml-1" />
                {totalTasks > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">{doneTasks}/{totalTasks} tasks</p>}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Idle</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Cycles Done</p>
            <span className="text-lg font-semibold">{completedCycles.length}</span>
            <span className="text-xs text-muted-foreground ml-1">completed</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Approvals</p>
            {pendingApprovalCount > 0 ? (
              <>
                <span className="text-lg font-semibold text-warning">{pendingApprovalCount}</span>
                <Link href="/review" className="text-[10px] text-primary hover:underline ml-1">review →</Link>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">None pending</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Two columns: Current Tasks + Live Events ──────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Current Cycle Tasks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground">
              {activeCycle ? `Cycle ${activeCycle._id} Tasks` : 'Tasks'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cycleTasks.length > 0 ? (
              <div className="space-y-1.5">
                {cycleTasks.map((t) => (
                  <div key={t._id} className="flex items-center gap-2 text-xs">
                    <StatusBadge status={t.status} className="text-[9px] shrink-0" />
                    <Link href={`/tasks/${t._id}`} className="text-primary hover:underline shrink-0">{t._id}</Link>
                    <span className="text-foreground truncate">{t.title}</span>
                    <Badge variant="outline" className="ml-auto text-[9px] shrink-0">{t.type}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">
                {activeCycle ? 'No tasks yet — waiting for orchestrator' : 'No active cycle'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Live Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground">Live Events</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[240px]">
              {events.map((e, i) => {
                const context = getEventContext(e.type, e.data);
                return (
                  <div key={i} className="flex items-center gap-2 border-b border-border py-1 text-[10px]">
                    <span className="shrink-0 text-muted-foreground">{e.time}</span>
                    <span className="shrink-0 text-foreground">{e.type.replace(':', '/')}</span>
                    {context && <span className="truncate text-muted-foreground">{context}</span>}
                  </div>
                );
              })}
              {events.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">Waiting for events...</div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* ─── Milestone Grid ────────────────────────────────── */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-foreground">Milestones</CardTitle>
            <Link href="/milestones" className="text-[10px] text-primary hover:underline">View all →</Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2">
            {MILESTONES.map((m, i) => {
              const isDone = i < completedMilestones;
              const isCurrent = i === currentMilestoneIdx;
              return (
                <div
                  key={m.id}
                  className={`rounded border px-2.5 py-2 text-xs transition-colors ${
                    isDone
                      ? 'border-success/30 bg-success/5'
                      : isCurrent
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-background'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${isDone ? 'text-success' : isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                      {m.id}
                    </span>
                    <span className="text-[9px] text-muted-foreground">{m.weeks}</span>
                  </div>
                  <p className={`text-[10px] mt-0.5 ${isDone || isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {m.name}
                  </p>
                  {isDone && <span className="text-[9px] text-success">✓ Done</span>}
                  {isCurrent && <span className="text-[9px] text-primary">● In Progress</span>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
