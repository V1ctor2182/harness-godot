'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Check, X } from 'lucide-react';

import { api, type MilestoneItem, type MilestoneDetail } from '@/lib/api';
import { useGlobalSSE } from '@/hooks/use-sse';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

function statusColor(status: MilestoneItem['status']): string {
  if (status === 'completed') return 'bg-success';
  if (status === 'active') return 'bg-primary animate-pulse';
  if (status === 'blocked') return 'bg-destructive';
  if (status === 'proposed') return 'bg-yellow-400 animate-pulse';
  if (status === 'archived') return 'bg-muted opacity-50';
  return 'bg-muted';
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
    <div className="pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Milestones</h1>
          <p className="text-xs text-muted-foreground">
            {sorted.length} total · {doneCount} done · {activeCount} active
            {proposedCount > 0 && ` · ${proposedCount} proposed`} · $
            {totalCost.toFixed(2)} spent
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="size-3.5 mr-1.5" />
          New Milestone
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-3 pb-3 flex items-end gap-2">
            <div className="flex-shrink-0">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">ID</label>
              <input
                type="text"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="M0"
                className="block w-20 rounded border border-input bg-transparent px-2 py-1 text-xs font-mono"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Milestone name"
                className="block w-full rounded border border-input bg-transparent px-2 py-1 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="text-xs border rounded px-3 py-1.5 text-destructive bg-destructive/10">
          {error}
        </div>
      )}

      {/* Roadmap overview bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Roadmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-0.5 h-4">
            {sorted.map((m) => (
              <button
                key={m._id}
                type="button"
                title={`${m._id}: ${m.name} (${statusLabel(m.status)})`}
                onClick={() => setSelectedId(m._id)}
                className={`flex-1 rounded-sm transition-all hover:scale-y-125 ${statusColor(m.status)}`}
              />
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
            <span>
              <span className="inline-block w-2 h-2 rounded-sm bg-success mr-1" />
              completed
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-sm bg-primary mr-1" />
              active
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-sm bg-destructive mr-1" />
              blocked
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-sm bg-muted mr-1" />
              planned
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Detailed list */}
      <div className="space-y-2">
        {sorted.map((m) => (
          <div key={m._id} className="w-full text-left">
            <Card
              className={`transition-colors cursor-pointer ${
                m.status === 'completed'
                  ? 'border-success/30'
                  : m.status === 'active'
                    ? 'border-primary/30'
                    : m.status === 'blocked'
                      ? 'border-destructive/30'
                      : m.status === 'proposed'
                        ? 'border-dashed border-yellow-400/50 bg-yellow-400/5'
                        : ''
              }`}
              onClick={() => setSelectedId(m._id)}
            >
              <CardContent className="py-2.5 px-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`font-bold text-sm w-8 ${
                      m.status === 'completed'
                        ? 'text-success'
                        : m.status === 'active'
                          ? 'text-primary'
                          : m.status === 'blocked'
                            ? 'text-destructive'
                            : m.status === 'proposed'
                              ? 'text-yellow-400'
                              : 'text-muted-foreground'
                    }`}
                  >
                    {m._id}
                  </span>
                  <span className="text-sm font-medium flex-1 truncate">{m.name}</span>
                  {m.status === 'proposed' && m.source === 'orchestrator' && (
                    <Badge variant="outline" className="text-[9px] border-yellow-400/50 text-yellow-400">
                      Proposed by Orchestrator
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[9px]">
                    {statusLabel(m.status)}
                  </Badge>
                  {m.status === 'proposed' && (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleConfirm(m._id)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/30 hover:bg-success/20"
                        title="Confirm milestone"
                      >
                        <Check className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive(m._id)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
                        title="Reject milestone"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}
                  <span className="text-[10px] text-muted-foreground w-16 text-right">
                    {m.estimatedWeeks}w
                  </span>
                  <span className="text-[10px] text-muted-foreground w-16 text-right">
                    {m.cycles.length} cycles
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground w-16 text-right">
                    ${m.totalCostUsd.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
        {sorted.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No milestones yet. Click &quot;New Milestone&quot; to create one, or let the Orchestrator propose milestones from your PRD.
            </CardContent>
          </Card>
        )}
      </div>

      <MilestoneDetailModal id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
