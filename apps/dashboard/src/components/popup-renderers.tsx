'use client';

/**
 * Concrete popup renderers mapped by PopupType. Each renderer is passed the
 * popup.state.props and returns a { title, subtitle, route, body }. The body
 * is a lightweight preview — on [⛶ Maximize] we route to the full page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { api, type InboxItem } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';

type Renderer = (props: Record<string, unknown>) => {
  title: string;
  subtitle?: string;
  route: string;
  body: React.ReactNode;
};

interface CycleLite {
  _id: number;
  goal: string;
  phase: string;
  status: string;
  tasks: string[];
  metrics?: { totalCostUsd?: number; tasksCompleted?: number; tasksFailed?: number };
}

function CyclePreview({ cycleId }: { cycleId: number }) {
  const [cycle, setCycle] = useState<CycleLite | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCycle(cycleId)
      .then((c) => setCycle(c as CycleLite))
      .catch((e) => setError((e as Error).message));
  }, [cycleId]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!cycle) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <StatusBadge status={cycle.status} />
        <span className="text-muted-foreground">Phase:</span>
        <span className="font-mono">{cycle.phase}</span>
        <span className="ml-auto text-muted-foreground">
          ${cycle.metrics?.totalCostUsd?.toFixed(2) ?? '0.00'}
        </span>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Goal</div>
        <div className="mt-1">{cycle.goal}</div>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{cycle.tasks.length} tasks</span>
        <span>✔ {cycle.metrics?.tasksCompleted ?? 0}</span>
        <span>✗ {cycle.metrics?.tasksFailed ?? 0}</span>
      </div>
      <Link
        href={`/cycles/${cycleId}`}
        className="inline-block text-xs text-primary hover:underline"
      >
        View full team pipeline →
      </Link>
    </div>
  );
}

function InboxPreview() {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  useEffect(() => {
    api
      .listInbox()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  if (!items) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (items.length === 0)
    return <div className="text-sm text-muted-foreground">Inbox zero 🎉</div>;

  return (
    <div className="space-y-2">
      {items.slice(0, 8).map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-2 border-b border-border/50 pb-2 last:border-0"
        >
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted">
            {item.type.replace('_', ' ')}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{item.title}</div>
            <div className="text-xs text-muted-foreground truncate">{item.preview}</div>
          </div>
        </div>
      ))}
      <Link href="/inbox" className="inline-block text-xs text-primary hover:underline pt-1">
        Open full inbox →
      </Link>
    </div>
  );
}

function RoomsPreview() {
  const [count, setCount] = useState<{ active: number; draft: number; total: number } | null>(null);
  useEffect(() => {
    api
      .getRoomTree()
      .then((tree) => {
        let active = 0;
        let draft = 0;
        let total = 0;
        const walk = (nodes: typeof tree) => {
          for (const n of nodes) {
            total += n.specCount?.total ?? 0;
            draft += n.specCount?.draft ?? 0;
            active += (n.specCount?.total ?? 0) - (n.specCount?.draft ?? 0);
            if (n.children) walk(n.children);
          }
        };
        walk(tree);
        setCount({ active, draft, total });
      })
      .catch(() => setCount({ active: 0, draft: 0, total: 0 }));
  }, []);

  if (!count) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Active</div>
          <div className="text-lg font-semibold">{count.active}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Draft</div>
          <div className="text-lg font-semibold text-[var(--warning,#fbbf24)]">{count.draft}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total</div>
          <div className="text-lg font-semibold">{count.total}</div>
        </div>
      </div>
      <Link href="/rooms" className="inline-block text-xs text-primary hover:underline">
        Browse rooms →
      </Link>
    </div>
  );
}

export const popupRenderers: Partial<Record<string, Renderer>> = {
  cycle: (props) => {
    const id = Number(props.id);
    return {
      title: `Cycle ${id}`,
      subtitle: 'Team pipeline preview',
      route: `/cycles/${id}`,
      body: <CyclePreview cycleId={id} />,
    };
  },
  inbox: () => ({
    title: 'Inbox',
    subtitle: 'Pending decisions',
    route: '/inbox',
    body: <InboxPreview />,
  }),
  rooms: () => ({
    title: 'Rooms & Specs',
    subtitle: 'Knowledge tree summary',
    route: '/rooms',
    body: <RoomsPreview />,
  }),
};
