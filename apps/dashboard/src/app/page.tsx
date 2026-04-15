'use client';

import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Maximize2 } from 'lucide-react';

import { api, type InboxItem, type TestResultItem, type MilestoneItem, type AssetSpec } from '@/lib/api';
import { useGlobalSSE } from '@/hooks/use-sse';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { usePopup } from '@/hooks/use-popup';

// ─── Types ──────────────────────────────────────────────────────────

interface CycleLite {
  _id: number;
  goal: string;
  phase: string;
  status: string;
  tasks: string[];
  metrics?: { totalCostUsd?: number; tasksCompleted?: number; tasksFailed?: number };
}

interface AgentRunLite {
  _id: string;
  role: string;
  status: string;
  cycleId: number;
  costUsd?: number;
  error?: string;
}

interface ControlLite {
  mode: string;
  spentUsd: number;
  spendingCapUsd?: number;
}

interface RoomTreeLite {
  specCount?: { total: number; draft: number };
  children?: RoomTreeLite[];
}

interface LiveEvent {
  type: string;
  at: Date;
  summary: string;
}

function summarize(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  if (d.cycleId != null) parts.push(`cycle:${d.cycleId}`);
  if (d.taskId) parts.push(`task:${d.taskId}`);
  if (d.agentRunId) parts.push(`agent:${String(d.agentRunId).slice(0, 10)}`);
  if (d.role) parts.push(String(d.role));
  if (d.status) parts.push(String(d.status));
  return parts.join(' · ');
}

// ─── BentoTile wrapper ──────────────────────────────────────────────

interface BentoTileProps {
  title: string;
  spanClass: string;
  onOpen?: () => void;
  onMaximize?: () => void;
  children: ReactNode;
}

function BentoTile({ title, spanClass, onOpen, onMaximize, children }: BentoTileProps) {
  return (
    <Card className={`${spanClass} flex flex-col min-h-0`}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          {title}
        </div>
        <div className="flex items-center gap-1">
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              title="Open preview"
            >
              <ExternalLink className="size-3" /> Open
            </button>
          )}
          {onMaximize && (
            <button
              type="button"
              onClick={onMaximize}
              className="text-muted-foreground hover:text-foreground ml-1"
              title="Maximize to full page"
            >
              <Maximize2 className="size-3" />
            </button>
          )}
        </div>
      </div>
      <CardContent className="p-3 flex-1 min-h-0 overflow-auto">{children}</CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const { open: openPopup } = usePopup();

  const [cycles, setCycles] = useState<CycleLite[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRunLite[]>([]);
  const [control, setControl] = useState<ControlLite | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [roomTree, setRoomTree] = useState<RoomTreeLite[]>([]);
  const [tests, setTests] = useState<TestResultItem[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [assets, setAssets] = useState<AssetSpec[]>([]);

  const refreshAll = useCallback(async () => {
    try {
      const [cyclesData, controlData, inboxData, rooms, milestonesData, assetsData] =
        await Promise.all([
          api.listCycles() as Promise<CycleLite[]>,
          api.getControl() as Promise<ControlLite>,
          api.listInbox().catch(() => [] as InboxItem[]),
          api.getRoomTree().catch(() => [] as RoomTreeLite[]),
          api.listMilestones().catch(() => [] as MilestoneItem[]),
          api.listAssets().catch(() => [] as AssetSpec[]),
        ]);
      setCycles(cyclesData);
      setControl(controlData);
      setInbox(inboxData);
      setRoomTree(rooms);
      setMilestones(milestonesData);
      setAssets(assetsData);
    } catch {
      // ignore — individual widgets handle their own empty state
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const activeCycle = useMemo(
    () => cycles.find((c) => c.status === 'active' || c.status === 'running') ?? cycles[0] ?? null,
    [cycles]
  );

  useEffect(() => {
    if (!activeCycle) return;
    void api
      .listAgentRuns({ cycleId: activeCycle._id })
      .then((r) => setAgentRuns(r as AgentRunLite[]));
    void api.listTests({ cycleId: activeCycle._id }).then(setTests);
  }, [activeCycle]);

  useGlobalSSE(
    useCallback(
      (type: string, data: unknown) => {
        setEvents((prev) =>
          [...prev, { type, at: new Date(), summary: summarize(data) }].slice(-200)
        );
        if (
          type === 'cycle:completed' ||
          type === 'cycle:failed' ||
          type === 'cycle:phase_changed' ||
          type === 'system:control_updated' ||
          type === 'inbox:new' ||
          type === 'inbox:resolved'
        ) {
          void refreshAll();
        }
        if ((type === 'agent:started' || type === 'agent:completed') && activeCycle) {
          void api
            .listAgentRuns({ cycleId: activeCycle._id })
            .then((r) => setAgentRuns(r as AgentRunLite[]));
        }
      },
      [refreshAll, activeCycle]
    )
  );

  // Aggregates
  const roomCounts = useMemo(() => {
    let active = 0;
    let draft = 0;
    let total = 0;
    const walk = (nodes: RoomTreeLite[]) => {
      for (const n of nodes) {
        total += n.specCount?.total ?? 0;
        draft += n.specCount?.draft ?? 0;
        active += (n.specCount?.total ?? 0) - (n.specCount?.draft ?? 0);
        if (n.children) walk(n.children);
      }
    };
    walk(roomTree);
    return { active, draft, total };
  }, [roomTree]);

  const testSummary = useMemo(() => {
    let passed = 0;
    let failed = 0;
    const layers = new Map<string, { passed: number; failed: number }>();
    for (const t of tests) {
      passed += t.passed ?? 0;
      failed += t.failed ?? 0;
      const s = layers.get(t.layer) ?? { passed: 0, failed: 0 };
      s.passed += t.passed ?? 0;
      s.failed += t.failed ?? 0;
      layers.set(t.layer, s);
    }
    return { passed, failed, layers: Array.from(layers.entries()) };
  }, [tests]);

  const pipelineRoles = useMemo(() => {
    const roles = ['orchestrator', 'coder', 'tester', 'reviewer', 'integrator', 'curator'];
    return roles.map((role) => {
      const runs = agentRuns.filter((r) => r.role === role);
      const running = runs.filter((r) => r.status === 'running' || r.status === 'active').length;
      const done = runs.filter((r) => r.status === 'completed').length;
      return { role, count: runs.length, running, done };
    });
  }, [agentRuns]);

  const failReasons = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of agentRuns) {
      if (r.status !== 'failed' || !r.error) continue;
      const key = r.error.split('\n')[0]?.slice(0, 40) || 'unknown';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [agentRuns]);

  const spendPct = control?.spendingCapUsd
    ? Math.min(100, Math.round((control.spentUsd / control.spendingCapUsd) * 100))
    : 0;

  const recent = cycles.slice(0, 4);

  return (
    <div className="pt-4 space-y-3">
      {/* Meta line */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {control && (
          <>
            <span>
              Mode: <span className="text-foreground font-medium">{control.mode}</span>
            </span>
            <span>
              Spend:{' '}
              <span className="text-foreground font-mono">
                ${control.spentUsd.toFixed(2)}
                {control.spendingCapUsd ? ` / $${control.spendingCapUsd.toFixed(2)}` : ''}
              </span>
            </span>
          </>
        )}
        <span className="ml-auto">Inbox: {inbox.length}</span>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-12 gap-3 auto-rows-[120px]">
        {/* Active Cycle — 6×2 */}
        <BentoTile
          title="Active Cycle"
          spanClass="col-span-12 md:col-span-6 row-span-2"
          onOpen={activeCycle ? () => openPopup('cycle', { id: activeCycle._id }) : undefined}
          onMaximize={activeCycle ? () => router.push(`/cycles/${activeCycle._id}`) : undefined}
        >
          {!activeCycle ? (
            <div className="text-sm text-muted-foreground">No active cycle</div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">M{activeCycle._id}</span>
                <StatusBadge status={activeCycle.phase} />
                <StatusBadge status={activeCycle.status} />
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  ${activeCycle.metrics?.totalCostUsd?.toFixed(2) ?? '0.00'}
                </span>
              </div>
              <div className="text-muted-foreground truncate">{activeCycle.goal}</div>
              <div className="flex items-center gap-1 flex-wrap">
                {pipelineRoles.map((r, i) => (
                  <div key={r.role} className="flex items-center">
                    <div
                      className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide border ${
                        r.running > 0
                          ? 'border-primary text-primary bg-primary/10 animate-pulse'
                          : r.done > 0
                            ? 'border-success/50 text-success'
                            : 'border-border text-muted-foreground'
                      }`}
                    >
                      {r.role.slice(0, 4)}
                      {r.count > 1 && <span className="ml-0.5">×{r.count}</span>}
                    </div>
                    {i < pipelineRoles.length - 1 && (
                      <span className="text-[10px] text-muted-foreground mx-0.5">▶</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{activeCycle.tasks.length} tasks</span>
                <span>✔ {activeCycle.metrics?.tasksCompleted ?? 0}</span>
                <span>✗ {activeCycle.metrics?.tasksFailed ?? 0}</span>
              </div>
            </div>
          )}
        </BentoTile>

        {/* Inbox — 3×2 */}
        <BentoTile
          title={`Inbox ${inbox.length > 0 ? `(${inbox.length})` : ''}`}
          spanClass="col-span-12 md:col-span-3 row-span-2"
          onOpen={() => openPopup('inbox')}
          onMaximize={() => router.push('/inbox')}
        >
          {inbox.length === 0 ? (
            <div className="text-sm text-muted-foreground">Inbox zero 🎉</div>
          ) : (
            <div className="space-y-1.5">
              {inbox.slice(0, 4).map((item) => (
                <div key={item.id} className="text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-primary">●</span>
                    <Badge variant="outline" className="text-[9px]">
                      {item.type.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="truncate text-foreground">{item.title}</div>
                </div>
              ))}
            </div>
          )}
        </BentoTile>

        {/* Spending — 3×2 */}
        <BentoTile title="Spending" spanClass="col-span-12 md:col-span-3 row-span-2">
          {control ? (
            <div className="space-y-2">
              <div className="text-xl font-bold font-mono">${control.spentUsd.toFixed(2)}</div>
              {control.spendingCapUsd && (
                <>
                  <div className="text-[10px] text-muted-foreground">
                    of ${control.spendingCapUsd.toFixed(2)} cap
                  </div>
                  <div className="h-1.5 rounded bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        spendPct >= 80 ? 'bg-destructive' : spendPct >= 50 ? 'bg-warning' : 'bg-primary'
                      }`}
                      style={{ width: `${spendPct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">{spendPct}% used</div>
                </>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </BentoTile>

        {/* Milestones — 3×1 */}
        <BentoTile
          title="Milestones"
          spanClass="col-span-12 md:col-span-3 row-span-1"
          onMaximize={() => router.push('/milestones')}
        >
          {milestones.length === 0 ? (
            <div className="text-xs text-muted-foreground">No milestones synced yet.</div>
          ) : (
            <div className="space-y-1">
              {(() => {
                const done = milestones.filter((m) => m.status === 'completed').length;
                const active = milestones.filter((m) => m.status === 'active');
                const nextPlanned = milestones.find((m) => m.status === 'planned');
                return (
                  <>
                    <div className="text-xs">
                      <span className="text-success">✔ {done}</span>
                      <span className="mx-2 text-muted-foreground">/</span>
                      <span className="text-muted-foreground">{milestones.length}</span>
                    </div>
                    {active.length > 0 && (
                      <div className="text-[10px] text-primary truncate">
                        ● {active[0]._id} {active[0].name}
                      </div>
                    )}
                    {nextPlanned && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        next: {nextPlanned._id}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </BentoTile>

        {/* Rooms — 3×1 */}
        <BentoTile
          title="Rooms & Specs"
          spanClass="col-span-12 md:col-span-3 row-span-1"
          onOpen={() => openPopup('rooms')}
          onMaximize={() => router.push('/rooms')}
        >
          <div className="flex items-center gap-3 text-xs">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Active</div>
              <div className="font-semibold">{roomCounts.active}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Draft</div>
              <div className="font-semibold text-warning">{roomCounts.draft}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Total</div>
              <div className="font-semibold">{roomCounts.total}</div>
            </div>
          </div>
        </BentoTile>

        {/* Recent Cycles — 6×1 */}
        <BentoTile
          title="Recent Cycles"
          spanClass="col-span-12 md:col-span-6 row-span-1"
          onMaximize={() => router.push('/cycles')}
        >
          <div className="space-y-1">
            {recent.map((c) => (
              <button
                key={c._id}
                type="button"
                onClick={() => openPopup('cycle', { id: c._id })}
                className="w-full flex items-center gap-2 text-xs hover:bg-muted/30 rounded px-1 py-0.5"
              >
                <span className="font-mono w-10 text-muted-foreground">{c._id}</span>
                <StatusBadge status={c.status} />
                <span className="flex-1 truncate text-left">{c.goal}</span>
                <span className="font-mono text-muted-foreground">
                  ${c.metrics?.totalCostUsd?.toFixed(2) ?? '0.00'}
                </span>
              </button>
            ))}
          </div>
        </BentoTile>

        {/* Assets — 4×1 */}
        <BentoTile
          title="Assets"
          spanClass="col-span-12 md:col-span-4 row-span-1"
          onMaximize={() => router.push('/assets')}
        >
          {assets.length === 0 ? (
            <div className="text-xs text-muted-foreground">No assets loaded.</div>
          ) : (
            <div className="space-y-1">
              {(() => {
                const total = assets.length;
                const placeholder = assets.filter((a) => a.status === 'placeholder').length;
                const replaced = assets.filter((a) => a.status === 'replaced').length;
                const final = assets.filter((a) => a.status === 'final').length;
                const planned = assets.filter((a) => a.status === 'planned').length;
                return (
                  <>
                    <div className="text-xs flex items-center gap-3">
                      <span className="text-success">● {final}</span>
                      <span className="text-blue-400">◑ {replaced}</span>
                      <span className="text-yellow-400">◐ {placeholder}</span>
                      <span className="text-muted-foreground">○ {planned}</span>
                      <span className="ml-auto text-muted-foreground text-[10px]">/ {total}</span>
                    </div>
                    <div className="flex h-1 rounded overflow-hidden">
                      {final > 0 && <div className="bg-success" style={{ flex: final }} />}
                      {replaced > 0 && <div className="bg-blue-400" style={{ flex: replaced }} />}
                      {placeholder > 0 && <div className="bg-yellow-400" style={{ flex: placeholder }} />}
                      {planned > 0 && <div className="bg-muted" style={{ flex: planned }} />}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </BentoTile>

        {/* Tests — 4×1 */}
        <BentoTile title="Tests (active cycle)" spanClass="col-span-12 md:col-span-4 row-span-1">
          {testSummary.passed + testSummary.failed === 0 ? (
            <div className="text-xs text-muted-foreground">No test results yet.</div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs">
                <span className="text-success">✔ {testSummary.passed}</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="text-destructive">✗ {testSummary.failed}</span>
              </div>
              <div className="space-y-0.5">
                {testSummary.layers.map(([layer, s]) => {
                  const tot = s.passed + s.failed;
                  const pct = tot > 0 ? Math.round((s.passed / tot) * 100) : 0;
                  return (
                    <div key={layer} className="flex items-center gap-1 text-[10px]">
                      <span className="w-14 font-mono text-muted-foreground">{layer}</span>
                      <div className="flex-1 h-1 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-success" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-mono w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </BentoTile>

        {/* Analytics — 4×1 (fail reasons) */}
        <BentoTile title="Fail reasons" spanClass="col-span-12 md:col-span-4 row-span-1">
          {failReasons.length === 0 ? (
            <div className="text-xs text-muted-foreground">No failures in active cycle.</div>
          ) : (
            <div className="space-y-0.5">
              {failReasons.map(([reason, count]) => (
                <div key={reason} className="flex items-center gap-2 text-[10px]">
                  <span className="flex-1 truncate text-muted-foreground">{reason}</span>
                  <span className="font-mono text-destructive">{count}</span>
                </div>
              ))}
            </div>
          )}
        </BentoTile>

        {/* Events stream — full width footer */}
        <BentoTile title="Live events" spanClass="col-span-12 row-span-2">
          {events.length === 0 ? (
            <div className="text-xs text-muted-foreground">Waiting for events…</div>
          ) : (
            <div className="font-mono text-[10px] space-y-0.5">
              {events
                .slice(-30)
                .reverse()
                .map((e, i) => (
                  <div key={i} className="flex gap-2 items-baseline">
                    <span className="text-muted-foreground w-16 shrink-0">
                      {e.at.toLocaleTimeString()}
                    </span>
                    <span className="text-accent w-48 shrink-0 truncate">{e.type}</span>
                    <span className="text-muted-foreground truncate">{e.summary}</span>
                  </div>
                ))}
            </div>
          )}
        </BentoTile>
      </div>
    </div>
  );
}
