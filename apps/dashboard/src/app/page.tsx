'use client';

import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Maximize2 } from 'lucide-react';

import {
  api,
  type InboxItem,
  type TestResultItem,
  type MilestoneItem,
  type AssetSpec,
} from '@/lib/api';
import { useGlobalSSE } from '@/hooks/use-sse';
import { usePopup } from '@/hooks/use-popup';
import { StatusBadge } from '@/components/status-badge';

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

// ─── Editorial BentoTile ────────────────────────────────────────────

interface BentoTileProps {
  kicker: string;
  meta?: string;
  spanClass: string;
  onOpen?: () => void;
  onMaximize?: () => void;
  children: ReactNode;
}

function BentoTile({ kicker, meta, spanClass, onOpen, onMaximize, children }: BentoTileProps) {
  return (
    <div
      className={`${spanClass} flex flex-col min-h-0 bg-[var(--surface)] border border-[var(--rule-strong)] rounded-sm`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--rule)]">
        <div className="text-kicker text-[var(--muted-foreground)] flex items-center gap-2">
          <span>{kicker}</span>
          {meta && (
            <>
              <span>·</span>
              <span className="text-[var(--ink-2)]">{meta}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="text-kicker text-[var(--muted-foreground)] hover:text-[var(--burgundy)] inline-flex items-center gap-1"
              title="Preview"
            >
              <ExternalLink className="size-3" />
              <span>OPEN</span>
            </button>
          )}
          {onMaximize && (
            <button
              type="button"
              onClick={onMaximize}
              className="text-[var(--muted-foreground)] hover:text-[var(--burgundy)]"
              title="Maximize"
            >
              <Maximize2 className="size-3" />
            </button>
          )}
        </div>
      </div>
      <div className="p-3 flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
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
      /* empty states handled per-tile */
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const activeCycle = useMemo(
    () =>
      cycles.find((c) => c.status === 'active' || c.status === 'running') ?? cycles[0] ?? null,
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
      const running = runs.filter(
        (r) => r.status === 'running' || r.status === 'active'
      ).length;
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
  const milestoneDone = milestones.filter((m) => m.status === 'completed').length;
  const milestoneActive = milestones.filter((m) => m.status === 'active');
  const milestoneNext = milestones.find((m) => m.status === 'planned');

  return (
    <div className="space-y-8">
      {/* ── Cover hero: lead story ────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-6 border-b border-[var(--rule)]">
        <div className="lg:col-span-2">
          <div className="text-kicker mb-2">
            The Lead {activeCycle ? ` · M${activeCycle._id}` : ''}
          </div>
          {activeCycle ? (
            <>
              <h1 className="text-display-1 text-[var(--ink)]">
                {activeCycle.goal}
                <span className="italic text-[var(--burgundy)]">.</span>
              </h1>
              <p className="mt-3 text-[var(--ink-2)] max-w-[60ch]">
                The team is working through{' '}
                <span className="italic text-[var(--ink)]">
                  {activeCycle.phase.toLowerCase()}
                </span>{' '}
                phase. {activeCycle.metrics?.tasksCompleted ?? 0} of{' '}
                {activeCycle.tasks.length} tasks are done; the current budget has{' '}
                {control?.spendingCapUsd
                  ? `${spendPct}% consumed.`
                  : 'no cap set.'}
              </p>
              <div className="mt-4 flex gap-6 flex-wrap">
                <div>
                  <div className="text-kicker">Tasks</div>
                  <div className="font-display text-[22px] leading-none text-tabular">
                    {activeCycle.metrics?.tasksCompleted ?? 0}/{activeCycle.tasks.length}
                  </div>
                </div>
                <div>
                  <div className="text-kicker">Cost</div>
                  <div className="font-display text-[22px] leading-none text-tabular">
                    ${activeCycle.metrics?.totalCostUsd?.toFixed(2) ?? '0.00'}
                  </div>
                </div>
                <div>
                  <div className="text-kicker">Phase</div>
                  <div className="font-display text-[22px] leading-none">
                    {activeCycle.phase}
                  </div>
                </div>
                <div>
                  <div className="text-kicker">Failed</div>
                  <div className="font-display text-[22px] leading-none text-tabular">
                    {activeCycle.metrics?.tasksFailed ?? 0}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="text-kicker mr-1">Pipeline:</span>
                {pipelineRoles.map((r, i) => (
                  <span key={r.role} className="flex items-center gap-1">
                    <span
                      className={`inline-flex items-baseline gap-1 px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider border ${
                        r.running > 0
                          ? 'border-[var(--burgundy)] text-[var(--burgundy)] bg-[color-mix(in_oklch,var(--burgundy)_6%,var(--surface))] live-pulse'
                          : r.done > 0
                            ? 'border-[var(--forest)] text-[var(--forest)]'
                            : 'border-[var(--rule-strong)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      {r.role.slice(0, 4)}
                      {r.count > 1 && (
                        <span className="font-mono text-[9px]">×{r.count}</span>
                      )}
                    </span>
                    {i < pipelineRoles.length - 1 && (
                      <span className="text-[var(--muted-foreground)] text-[10px]">
                        →
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => openPopup('cycle', { id: activeCycle._id })}
                  className="text-meta inline-flex items-center gap-1 text-[var(--burgundy)] hover:underline"
                >
                  <ExternalLink className="size-3" />
                  Preview
                </button>
                <button
                  onClick={() => router.push(`/cycles/${activeCycle._id}`)}
                  className="text-meta inline-flex items-center gap-1 text-[var(--burgundy)] hover:underline"
                >
                  <Maximize2 className="size-3" />
                  Open cycle
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-display-1 text-[var(--ink)]">
                No cycle in <span className="italic text-[var(--burgundy)]">flight</span>.
              </h1>
              <p className="mt-3 text-[var(--ink-2)] max-w-[60ch]">
                Create a cycle from the Cycles page to get the team started.
              </p>
            </>
          )}
        </div>

        {/* Meta sidebar — editorial-style */}
        <aside className="lg:col-span-1 flex flex-col gap-5">
          <div>
            <div className="text-kicker mb-2">Budget</div>
            {control ? (
              <>
                <div className="font-display text-[40px] leading-none text-tabular text-[var(--ink)]">
                  ${control.spentUsd.toFixed(2)}
                </div>
                <div className="text-kicker mt-1 text-[var(--muted-foreground)]">
                  of ${control.spendingCapUsd?.toFixed(2) ?? '—'} cap ·{' '}
                  {spendPct}% used
                </div>
                {control.spendingCapUsd && (
                  <div className="h-[3px] bg-[var(--surface-alt)] mt-3 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${spendPct}%`,
                        background:
                          spendPct >= 80
                            ? 'var(--oxblood)'
                            : spendPct >= 50
                              ? 'var(--mustard)'
                              : 'var(--burgundy)',
                      }}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="text-[var(--muted-foreground)]">—</div>
            )}
          </div>

          <div className="border-t border-[var(--rule)] pt-4">
            <div className="text-kicker mb-2">Inbox · {inbox.length} unread</div>
            {inbox.length === 0 ? (
              <div className="text-sm text-[var(--muted-foreground)] italic">
                Inbox zero.
              </div>
            ) : (
              <div className="space-y-2">
                {inbox.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => router.push('/inbox')}
                    className="block w-full text-left border-b border-dotted border-[var(--rule)] pb-2 last:border-0 group"
                  >
                    <div className="text-meta text-[var(--burgundy)] mb-0.5">
                      {item.type.replace('_', ' ')}
                    </div>
                    <div className="text-sm text-[var(--ink)] group-hover:text-[var(--burgundy)] truncate">
                      {item.title}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>

      {/* ── Bento grid ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-kicker mb-3">§ Workbench</h2>
        <div className="grid grid-cols-12 gap-4 auto-rows-[120px]">
          {/* Recent cycles */}
          <BentoTile
            kicker="Recent cycles"
            spanClass="col-span-12 md:col-span-8 row-span-2"
            onMaximize={() => router.push('/cycles')}
          >
            {recent.length === 0 ? (
              <div className="text-sm text-[var(--muted-foreground)] italic">
                No cycles yet.
              </div>
            ) : (
              <div className="divide-y divide-[var(--rule)]">
                {recent.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => openPopup('cycle', { id: c._id })}
                    className="w-full flex items-baseline gap-3 py-2 text-left hover:bg-[var(--surface-alt)] px-1 -mx-1 rounded-sm"
                  >
                    <span className="font-mono text-xs text-[var(--muted-foreground)] w-12 text-tabular">
                      M{c._id}
                    </span>
                    <StatusBadge status={c.status} />
                    <span className="flex-1 truncate text-sm">{c.goal}</span>
                    <span className="font-mono text-xs text-[var(--muted-foreground)] text-tabular">
                      ${c.metrics?.totalCostUsd?.toFixed(2) ?? '0.00'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </BentoTile>

          {/* Milestones */}
          <BentoTile
            kicker="Milestones"
            meta={`${milestoneDone}/${milestones.length}`}
            spanClass="col-span-12 md:col-span-4 row-span-1"
            onMaximize={() => router.push('/milestones')}
          >
            {milestones.length === 0 ? (
              <div className="text-xs text-[var(--muted-foreground)] italic">
                No milestones yet.
              </div>
            ) : (
              <div className="space-y-1">
                <div className="font-display text-[20px] leading-none text-tabular">
                  {milestoneDone}
                  <span className="text-[var(--muted-foreground)] text-xs ml-1">
                    / {milestones.length}
                  </span>
                </div>
                {milestoneActive[0] && (
                  <div className="text-xs text-[var(--burgundy)] truncate">
                    ● {milestoneActive[0]._id} {milestoneActive[0].name}
                  </div>
                )}
                {milestoneNext && (
                  <div className="text-xs text-[var(--muted-foreground)] truncate italic">
                    next — {milestoneNext._id}
                  </div>
                )}
              </div>
            )}
          </BentoTile>

          {/* Rooms */}
          <BentoTile
            kicker="Rooms & specs"
            spanClass="col-span-12 md:col-span-4 row-span-1"
            onOpen={() => openPopup('rooms')}
            onMaximize={() => router.push('/rooms')}
          >
            <div className="flex items-baseline gap-4 text-sm">
              <div>
                <div className="font-display text-[20px] leading-none text-tabular">
                  {roomCounts.active}
                </div>
                <div className="text-kicker mt-1">Active</div>
              </div>
              <div>
                <div className="font-display text-[20px] leading-none text-tabular text-[var(--mustard)]">
                  {roomCounts.draft}
                </div>
                <div className="text-kicker mt-1">Draft</div>
              </div>
              <div>
                <div className="font-display text-[20px] leading-none text-tabular text-[var(--muted-foreground)]">
                  {roomCounts.total}
                </div>
                <div className="text-kicker mt-1">Total</div>
              </div>
            </div>
          </BentoTile>

          {/* Assets */}
          <BentoTile
            kicker="Assets"
            spanClass="col-span-12 md:col-span-4 row-span-1"
            onMaximize={() => router.push('/assets')}
          >
            {assets.length === 0 ? (
              <div className="text-xs text-[var(--muted-foreground)] italic">
                No assets loaded.
              </div>
            ) : (
              (() => {
                const total = assets.length;
                const placeholder = assets.filter(
                  (a) => a.status === 'placeholder'
                ).length;
                const replaced = assets.filter((a) => a.status === 'replaced').length;
                const final = assets.filter((a) => a.status === 'final').length;
                const planned = assets.filter((a) => a.status === 'planned').length;
                return (
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-3 text-xs">
                      <span className="text-[var(--forest)]">● {final}</span>
                      <span className="text-[var(--burgundy)]">◑ {replaced}</span>
                      <span className="text-[var(--mustard)]">◐ {placeholder}</span>
                      <span className="text-[var(--muted-foreground)]">○ {planned}</span>
                      <span className="ml-auto text-[var(--muted-foreground)] text-[10px] text-tabular">
                        / {total}
                      </span>
                    </div>
                    <div className="flex h-[3px] overflow-hidden">
                      {final > 0 && (
                        <div style={{ flex: final, background: 'var(--forest)' }} />
                      )}
                      {replaced > 0 && (
                        <div style={{ flex: replaced, background: 'var(--burgundy)' }} />
                      )}
                      {placeholder > 0 && (
                        <div
                          style={{ flex: placeholder, background: 'var(--mustard)' }}
                        />
                      )}
                      {planned > 0 && (
                        <div
                          style={{ flex: planned, background: 'var(--surface-alt)' }}
                        />
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </BentoTile>

          {/* Tests */}
          <BentoTile
            kicker="Tests"
            meta="active cycle"
            spanClass="col-span-12 md:col-span-6 row-span-1"
          >
            {testSummary.passed + testSummary.failed === 0 ? (
              <div className="text-xs text-[var(--muted-foreground)] italic">
                No test results yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-xs flex gap-3">
                  <span className="text-[var(--forest)]">✔ {testSummary.passed}</span>
                  {testSummary.failed > 0 && (
                    <span className="text-[var(--oxblood)]">
                      ✗ {testSummary.failed}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {testSummary.layers.map(([layer, s]) => {
                    const tot = s.passed + s.failed;
                    const pct = tot > 0 ? Math.round((s.passed / tot) * 100) : 0;
                    return (
                      <div key={layer} className="flex items-center gap-2 text-[10px]">
                        <span className="w-16 font-mono text-[var(--muted-foreground)]">
                          {layer}
                        </span>
                        <div className="flex-1 h-[3px] bg-[var(--surface-alt)] overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${pct}%`,
                              background:
                                s.failed > 0 ? 'var(--oxblood)' : 'var(--forest)',
                            }}
                          />
                        </div>
                        <span className="font-mono w-8 text-right text-tabular">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </BentoTile>

          {/* Fail reasons */}
          <BentoTile
            kicker="Fail reasons"
            spanClass="col-span-12 md:col-span-6 row-span-1"
          >
            {failReasons.length === 0 ? (
              <div className="text-xs text-[var(--muted-foreground)] italic">
                No failures in active cycle.
              </div>
            ) : (
              <div className="space-y-1 text-xs">
                {failReasons.map(([reason, count]) => (
                  <div key={reason} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-[var(--ink-2)]">
                      {reason}
                    </span>
                    <span className="font-mono text-tabular text-[var(--oxblood)]">
                      ×{count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </BentoTile>

          {/* Live events */}
          <BentoTile
            kicker="Live events"
            meta="streaming"
            spanClass="col-span-12 row-span-2"
          >
            {events.length === 0 ? (
              <div className="text-xs text-[var(--muted-foreground)] italic">
                Waiting for events…
              </div>
            ) : (
              <div className="font-mono text-[10px] space-y-0.5 text-[var(--muted-foreground)]">
                {events
                  .slice(-30)
                  .reverse()
                  .map((e, i) => (
                    <div key={i} className="flex gap-3 items-baseline">
                      <span className="w-16 shrink-0 text-tabular">
                        {e.at.toLocaleTimeString()}
                      </span>
                      <span className="w-48 shrink-0 truncate text-[var(--burgundy)]">
                        {e.type}
                      </span>
                      <span className="truncate">{e.summary}</span>
                    </div>
                  ))}
              </div>
            )}
          </BentoTile>
        </div>
      </section>
    </div>
  );
}
