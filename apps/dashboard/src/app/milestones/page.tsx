'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Check, X } from 'lucide-react';

import { api, type MilestoneItem, type MilestoneDetail } from '@/lib/api';
import { useGlobalSSE } from '@/hooks/use-sse';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

function statusColorVar(status: MilestoneItem['status']): string {
  if (status === 'completed') return 'var(--forest)';
  if (status === 'active') return 'var(--burgundy)';
  if (status === 'blocked') return 'var(--oxblood)';
  if (status === 'proposed') return 'var(--mustard)';
  if (status === 'archived') return 'var(--rule-strong)';
  return 'var(--rule-strong)';
}

function statusLabel(status: MilestoneItem['status']): string {
  if (status === 'completed') return '✔ completed';
  if (status === 'active') return '● active';
  if (status === 'blocked') return '✗ blocked';
  if (status === 'proposed') return '⏳ proposed';
  if (status === 'archived') return '✕ archived';
  return '○ planned';
}

// ─── Detail modal ───────────────────────────────────────────────────

function MilestoneDetailModal({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<MilestoneDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    api
      .getMilestone(id)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [id]);

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      {id && (
        <DialogContent className="max-w-[900px]">
          {!detail && !error && <div className="text-sm text-muted-foreground">Loading…</div>}
          {error && <div className="text-sm text-destructive">{error}</div>}
          {detail && (
            <div className="space-y-4">
              <div>
                <DialogTitle>
                  {detail._id} · {detail.name}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {statusLabel(detail.status)} · {detail.estimatedWeeks}w est.
                  {detail.dependsOn.length > 0 && ` · depends on ${detail.dependsOn.join(', ')}`}
                </DialogDescription>
              </div>
              {detail.description && (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {detail.description}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Goals ({detail.goals.length})
                  </div>
                  <ul className="space-y-0.5 text-sm">
                    {detail.goals.map((g, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-muted-foreground">
                          {detail.status === 'completed' ? '✔' : '○'}
                        </span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Key Features
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {detail.features.map((f) => (
                      <Badge key={f} variant="outline" className="text-[10px]">
                        {f}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {detail.cyclesDetail.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Contributing Cycles ({detail.cyclesDetail.length}) · total $
                    {detail.totalCostUsd.toFixed(2)}
                  </div>
                  <div className="space-y-1">
                    {detail.cyclesDetail.map((c) => (
                      <Link
                        key={c._id}
                        href={`/cycles/${c._id}`}
                        className="flex items-center gap-2 text-sm hover:bg-muted/30 rounded px-2 py-1"
                      >
                        <span className="font-mono w-12 text-muted-foreground">{c._id}</span>
                        <span className="flex-1 truncate">{c.goal}</span>
                        <span className="text-xs text-muted-foreground">{c.phase}</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          ${c.metrics?.totalCostUsd?.toFixed(2) ?? '0.00'}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {detail.specs.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Linked Specs
                  </div>
                  <div className="space-y-0.5 text-xs">
                    {detail.specs.map((s) => (
                      <div key={s._id} className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px]">
                          {s.type}
                        </Badge>
                        <span className="truncate">{s.title}</span>
                        <span className="ml-auto text-muted-foreground">{s.state}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.createdAt && (
                <div className="text-[10px] text-muted-foreground">
                  Created: {new Date(detail.createdAt).toLocaleString()}
                  {detail.source === 'orchestrator' && ' · proposed by Orchestrator'}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listMilestones();
      setMilestones(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useGlobalSSE(
    useCallback(
      (type: string) => {
        if (type === 'milestone:updated' || type === 'cycle:completed') void refresh();
      },
      [refresh]
    )
  );

  const handleCreate = useCallback(async () => {
    if (!newId.trim() || !newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.createMilestone({ id: newId.trim(), name: newName.trim() });
      setNewId('');
      setNewName('');
      setShowCreate(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }, [newId, newName, refresh]);

  const handleConfirm = useCallback(
    async (id: string) => {
      try {
        await api.confirmMilestone(id);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Confirm failed');
      }
    },
    [refresh]
  );

  const handleArchive = useCallback(
    async (id: string) => {
      try {
        await api.archiveMilestone(id);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Archive failed');
      }
    },
    [refresh]
  );

  const sorted = useMemo(
    () => [...milestones].filter((m) => m.status !== 'archived').sort((a, b) => a.order - b.order),
    [milestones]
  );

  const proposedCount = sorted.filter((m) => m.status === 'proposed').length;
  const totalCost = sorted.reduce((sum, m) => sum + (m.totalCostUsd ?? 0), 0);
  const doneCount = sorted.filter((m) => m.status === 'completed').length;
  const activeCount = sorted.filter((m) => m.status === 'active').length;

  return (
    <div className="pt-4 space-y-6">
      {/* Editorial header */}
      <header className="pb-5 border-b-2 border-[var(--ink)]">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-kicker text-[var(--burgundy)] mb-2">
              <span>The Roadmap</span>
              <span className="mx-2 text-[var(--rule-strong)]">·</span>
              <span className="text-[var(--muted-foreground)]">
                {sorted.length} total · {doneCount} done · {activeCount} active
                {proposedCount > 0 && ` · ${proposedCount} proposed`} · $
                {totalCost.toFixed(2)} spent
              </span>
            </div>
            <h1 className="text-display-3 text-[var(--ink)]">
              Milestones
              <span className="italic text-[var(--burgundy)]">.</span>
            </h1>
          </div>
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="size-3.5 mr-1.5" />
            New Milestone
          </Button>
        </div>
      </header>

      {showCreate && (
        <section className="flex items-end gap-2">
          <div className="flex-shrink-0">
            <label className="text-kicker text-[var(--muted-foreground)]">ID</label>
            <input
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="M0"
              className="block w-20 rounded-xs border border-[var(--rule-strong)] bg-[var(--surface)] px-2 py-1 text-xs font-mono mt-1 focus:outline-none focus:border-[var(--burgundy)]"
            />
          </div>
          <div className="flex-1">
            <label className="text-kicker text-[var(--muted-foreground)]">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Milestone name"
              className="block w-full rounded-xs border border-[var(--rule-strong)] bg-[var(--surface)] px-2 py-1 text-xs mt-1 focus:outline-none focus:border-[var(--burgundy)]"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </section>
      )}

      {error && (
        <div
          className="text-xs rounded-sm px-3 py-1.5"
          style={{
            color: 'var(--oxblood)',
            border: '1px solid color-mix(in oklch, var(--oxblood) 30%, transparent)',
            background: 'color-mix(in oklch, var(--oxblood) 8%, transparent)',
          }}
        >
          {error}
        </div>
      )}

      {/* Roadmap overview bar */}
      <section>
        <div className="text-kicker text-[var(--muted-foreground)] mb-2">Roadmap at a glance</div>
        <div className="flex gap-0.5 h-4">
          {sorted.map((m) => (
            <button
              key={m._id}
              type="button"
              title={`${m._id}: ${m.name} (${statusLabel(m.status)})`}
              onClick={() => setSelectedId(m._id)}
              className={`flex-1 rounded-xs transition-all hover:scale-y-125 ${
                m.status === 'active' || m.status === 'proposed' ? 'live-pulse' : ''
              }`}
              style={{ background: statusColorVar(m.status) }}
            />
          ))}
        </div>
        <div className="flex gap-4 mt-2 text-[10px] text-[var(--muted-foreground)] font-mono uppercase tracking-[0.08em]">
          <span style={{ color: 'var(--forest)' }}>● completed</span>
          <span style={{ color: 'var(--burgundy)' }}>● active</span>
          <span style={{ color: 'var(--oxblood)' }}>● blocked</span>
          <span style={{ color: 'var(--mustard)' }}>● proposed</span>
          <span>○ planned</span>
        </div>
      </section>

      {/* Detailed list */}
      <section className="border-t border-[var(--rule)]">
        {sorted.map((m) => {
          const accent = statusColorVar(m.status);
          const isProposed = m.status === 'proposed';
          return (
            <button
              key={m._id}
              type="button"
              onClick={() => setSelectedId(m._id)}
              className="w-full text-left px-3 py-2.5 border-b border-[var(--rule)] hover:bg-[var(--surface)] transition-colors"
              style={{
                borderLeft: `3px solid ${accent}`,
                background: isProposed ? 'color-mix(in oklch, var(--mustard) 5%, transparent)' : undefined,
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="font-bold text-sm w-10 font-mono text-tabular"
                  style={{ color: accent }}
                >
                  {m._id}
                </span>
                <span className="text-sm font-medium flex-1 truncate text-[var(--ink)]">
                  {m.name}
                </span>
                {isProposed && m.source === 'orchestrator' && (
                  <span
                    className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                    style={{
                      color: 'var(--mustard)',
                      borderColor: 'color-mix(in oklch, var(--mustard) 40%, transparent)',
                    }}
                  >
                    Proposed by Orchestrator
                  </span>
                )}
                <span
                  className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-2)]"
                  style={{ borderColor: 'var(--rule-strong)' }}
                >
                  {statusLabel(m.status)}
                </span>
                {isProposed && (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleConfirm(m._id)}
                      title="Confirm milestone"
                      className="text-[10px] px-1.5 py-0.5 rounded-full border"
                      style={{
                        color: 'var(--forest)',
                        borderColor: 'color-mix(in oklch, var(--forest) 30%, transparent)',
                        background: 'color-mix(in oklch, var(--forest) 10%, transparent)',
                      }}
                    >
                      <Check className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(m._id)}
                      title="Reject milestone"
                      className="text-[10px] px-1.5 py-0.5 rounded-full border"
                      style={{
                        color: 'var(--oxblood)',
                        borderColor: 'color-mix(in oklch, var(--oxblood) 30%, transparent)',
                        background: 'color-mix(in oklch, var(--oxblood) 10%, transparent)',
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}
                <span className="text-[10px] text-[var(--muted-foreground)] w-16 text-right font-mono text-tabular">
                  {m.estimatedWeeks}w
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] w-16 text-right font-mono text-tabular">
                  {m.cycles.length} cycles
                </span>
                <span className="text-[10px] font-mono text-tabular text-[var(--muted-foreground)] w-16 text-right">
                  ${m.totalCostUsd.toFixed(2)}
                </span>
              </div>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <div className="py-6 text-center text-sm text-[var(--muted-foreground)] italic">
            No milestones yet. Click &quot;New Milestone&quot; to create one, or let the Orchestrator propose milestones from your PRD.
          </div>
        )}
      </section>

      <MilestoneDetailModal id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
