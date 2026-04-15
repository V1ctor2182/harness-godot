'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';

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
  return 'bg-muted';
}

function statusLabel(status: MilestoneItem['status']): string {
  if (status === 'completed') return '✔ completed';
  if (status === 'active') return '● active';
  if (status === 'blocked') return '✗ blocked';
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

              {detail.lastSyncedAt && (
                <div className="text-[10px] text-muted-foreground">
                  Last synced: {new Date(detail.lastSyncedAt).toLocaleString()}
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
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listMilestones();
      setMilestones(data);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Failed to load');
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

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const result = await api.syncMilestones();
      setSyncMsg(`Synced ${result.upserted} milestones`);
      await refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 3000);
    }
  }, [refresh]);

  const sorted = useMemo(
    () => [...milestones].sort((a, b) => a.order - b.order),
    [milestones]
  );

  const totalCost = sorted.reduce((sum, m) => sum + (m.totalCostUsd ?? 0), 0);
  const doneCount = sorted.filter((m) => m.status === 'completed').length;
  const activeCount = sorted.filter((m) => m.status === 'active').length;

  return (
    <div className="pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Milestones</h1>
          <p className="text-xs text-muted-foreground">
            {sorted.length} total · {doneCount} done · {activeCount} active · $
            {totalCost.toFixed(2)} spent
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`size-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync'}
        </Button>
      </div>

      {syncMsg && (
        <div className="text-xs border rounded px-3 py-1.5 text-muted-foreground bg-muted/30">
          {syncMsg}
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
          <button
            key={m._id}
            type="button"
            onClick={() => setSelectedId(m._id)}
            className="w-full text-left"
          >
            <Card
              className={`transition-colors ${
                m.status === 'completed'
                  ? 'border-success/30'
                  : m.status === 'active'
                    ? 'border-primary/30'
                    : m.status === 'blocked'
                      ? 'border-destructive/30'
                      : ''
              }`}
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
                            : 'text-muted-foreground'
                    }`}
                  >
                    {m._id}
                  </span>
                  <span className="text-sm font-medium flex-1 truncate">{m.name}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {statusLabel(m.status)}
                  </Badge>
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
          </button>
        ))}
        {sorted.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No milestones found. Run <code className="bg-muted px-1 py-0.5 rounded">Sync</code>{' '}
              to load from seed-data or game repo.
            </CardContent>
          </Card>
        )}
      </div>

      <MilestoneDetailModal id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
