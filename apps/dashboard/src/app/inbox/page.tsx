'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useGlobalSSE } from '@/hooks/use-sse';

import { api, type InboxItem, type InboxItemType, type InboxResolveBody } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ─── Type filters ───────────────────────────────────────────────────

const TYPE_TABS: Array<{ id: InboxItemType | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'approval', label: 'Approvals' },
  { id: 'plan_qa', label: 'Plan Q&A' },
  { id: 'plan_review', label: 'Plan Review' },
  { id: 'pr_gate', label: 'PR Gate' },
  { id: 'draft_spec', label: 'Drafts' },
  { id: 'next_cycle', label: 'Next-cycle' },
];

function typeLabel(type: InboxItemType): string {
  return TYPE_TABS.find((t) => t.id === type)?.label ?? type;
}

function urgencyClass(u: string): string {
  if (u === 'urgent') return 'border-destructive/60 bg-destructive/10';
  if (u === 'normal') return 'border-warning/40 bg-warning/5';
  return '';
}

// ─── Detail form components (per-type) ──────────────────────────────

function ApprovalForm({ item, onResolve }: { item: InboxItem; onResolve: (body: InboxResolveBody) => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-3">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Reason (optional)"
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onResolve({ action: 'approve', reason: reason || undefined })}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve({ action: 'reject', reason: reason || undefined })}
        >
          Reject
        </Button>
      </div>
      <Metadata item={item} />
    </div>
  );
}

function PlanQAForm({ item, onResolve }: { item: InboxItem; onResolve: (body: InboxResolveBody) => void }) {
  const questions = (item.payload.questions as Array<{ id: string; question: string; options?: Array<{ id: string; label: string }>; default?: string }> | undefined) ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) initial[q.id] = q.default ?? q.options?.[0]?.id ?? '';
    return initial;
  });
  const [feedback, setFeedback] = useState('');

  return (
    <div className="space-y-4">
      {questions.length === 0 && (
        <div className="text-sm text-muted-foreground">No structured questions; free-form feedback only.</div>
      )}
      {questions.map((q, i) => (
        <div key={q.id} className="space-y-1.5">
          <div className="text-sm font-medium">
            Q{i + 1}. {q.question}
          </div>
          {q.options && q.options.length > 0 ? (
            <div className="space-y-1">
              {q.options.map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name={q.id}
                    value={opt.id}
                    checked={answers[q.id] === opt.id}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                  />
                  {opt.label}
                  {q.default === opt.id && (
                    <span className="text-[10px] text-muted-foreground">(recommended)</span>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
            />
          )}
        </div>
      ))}
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={3}
        placeholder="Additional feedback (optional)"
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
      />
      <Button size="sm" onClick={() => onResolve({ action: 'answer', answers, feedback: feedback || undefined })}>
        Submit Answers
      </Button>
      <Metadata item={item} />
    </div>
  );
}

function PlanReviewForm({ item, onResolve }: { item: InboxItem; onResolve: (body: InboxResolveBody) => void }) {
  const [feedback, setFeedback] = useState('');
  const tasks = (item.payload.tasks as Array<{ title?: string }> | undefined) ?? [];
  return (
    <div className="space-y-3">
      {tasks.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Plan ({tasks.length} tasks)
          </div>
          <ol className="list-decimal pl-5 text-sm space-y-0.5">
            {tasks.map((t, i) => (
              <li key={i}>{t.title ?? `Task ${i + 1}`}</li>
            ))}
          </ol>
        </div>
      )}
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={3}
        placeholder="Feedback (required if requesting changes)"
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onResolve({ action: 'approve' })}>
          Approve Plan
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve({ action: 'reject', reason: feedback || 'Changes requested' })}
        >
          Request Changes
        </Button>
      </div>
      <Metadata item={item} />
    </div>
  );
}

function PRGateForm({ item, onResolve }: { item: InboxItem; onResolve: (body: InboxResolveBody) => void }) {
  const prUrl = item.payload.prUrl as string | undefined;
  const prNumber = item.payload.prNumber as number | undefined;
  return (
    <div className="space-y-3">
      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-primary hover:underline"
        >
          View PR #{prNumber} on GitHub →
        </a>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onResolve({ action: 'approve' })}>
          Approve Merge
        </Button>
        <Button size="sm" variant="outline" onClick={() => onResolve({ action: 'reject' })}>
          Reject
        </Button>
      </div>
      <Metadata item={item} />
    </div>
  );
}

function DraftSpecForm({ item, onResolve }: { item: InboxItem; onResolve: (body: InboxResolveBody) => void }) {
  const specType = item.payload.specType as string | undefined;
  const roomId = item.payload.roomId as string | undefined;
  const confidence = item.payload.confidence as number | undefined;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {specType && <span>Type: {specType}</span>}
        {roomId && <span>Room: {roomId}</span>}
        {confidence != null && <span>Confidence: {confidence.toFixed(2)}</span>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onResolve({ action: 'activate_spec' })}>
          Activate
        </Button>
        <Button size="sm" variant="outline" onClick={() => onResolve({ action: 'archive_spec' })}>
          Archive
        </Button>
      </div>
      <Metadata item={item} />
    </div>
  );
}

function Metadata({ item }: { item: InboxItem }) {
  return (
    <div className="pt-3 border-t border-border text-xs text-muted-foreground space-y-1">
      <div>Created: {new Date(item.createdAt).toLocaleString()}</div>
      {item.source.cycleId != null && (
        <div>
          Cycle:{' '}
          <Link href={`/cycles/${item.source.cycleId}`} className="text-primary hover:underline">
            {item.source.cycleId}
          </Link>
        </div>
      )}
      {item.source.taskId && <div>Task: {item.source.taskId}</div>}
      {item.source.agentRunId && <div>Agent run: {item.source.agentRunId}</div>}
    </div>
  );
}

// ─── Detail dispatcher ──────────────────────────────────────────────

function DetailPanel({ item, onResolve }: { item: InboxItem; onResolve: (body: InboxResolveBody) => void }) {
  switch (item.type) {
    case 'approval':
      return <ApprovalForm item={item} onResolve={onResolve} />;
    case 'plan_qa':
      return <PlanQAForm item={item} onResolve={onResolve} />;
    case 'plan_review':
      return <PlanReviewForm item={item} onResolve={onResolve} />;
    case 'pr_gate':
      return <PRGateForm item={item} onResolve={onResolve} />;
    case 'draft_spec':
      return <DraftSpecForm item={item} onResolve={onResolve} />;
    case 'next_cycle':
      return <ApprovalForm item={item} onResolve={onResolve} />;
    default:
      return <div className="text-sm text-muted-foreground">No handler for type {item.type}</div>;
  }
}

// ─── Page ───────────────────────────────────────────────────────────

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<InboxItemType | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listInbox();
      setItems(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inbox');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useGlobalSSE(
    useCallback(
      (type: string) => {
        if (
          type === 'inbox:new' ||
          type === 'inbox:resolved' ||
          type === 'job:requires_approval' ||
          type === 'task:status_changed'
        ) {
          void refresh();
        }
      },
      [refresh]
    )
  );

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.type === filter)),
    [items, filter]
  );

  const selected = useMemo(
    () => filtered.find((i) => i.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const i of items) c[i.type] = (c[i.type] ?? 0) + 1;
    return c;
  }, [items]);

  const handleResolve = useCallback(
    async (body: InboxResolveBody) => {
      if (!selected) return;
      setResolving(true);
      setError(null);
      try {
        await api.resolveInbox(selected.id, body);
        await refresh();
        setSelectedId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to resolve');
      } finally {
        setResolving(false);
      }
    },
    [selected, refresh]
  );

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'j' || e.key === 'k') {
        const idx = filtered.findIndex((i) => i.id === selected?.id);
        const next = e.key === 'j' ? idx + 1 : idx - 1;
        if (next >= 0 && next < filtered.length) {
          setSelectedId(filtered[next].id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, selected]);

  return (
    <div className="pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Inbox</h1>
        <span className="text-xs text-muted-foreground">
          {items.length} pending · j/k to navigate
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              filter === tab.id
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label} {counts[tab.id] ? `(${counts[tab.id]})` : ''}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-sm border rounded px-3 py-2 text-[var(--error,#f87171)] border-[var(--error,#f87171)]/30 bg-[var(--error,#f87171)]/10">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* List pane */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{filtered.length} items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                  Inbox zero 🎉
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map((item) => {
                    const isSelected = (selected?.id ?? null) === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={`w-full text-left px-3 py-2 border-l-2 transition-colors ${
                          isSelected
                            ? 'bg-muted border-primary'
                            : `border-transparent hover:bg-muted/50 ${urgencyClass(item.urgency)}`
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-primary text-xs">●</span>
                          <Badge variant="outline" className="text-[9px]">
                            {typeLabel(item.type)}
                          </Badge>
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {new Date(item.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-sm font-medium truncate">{item.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{item.preview}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail pane */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {selected ? selected.title : 'Select an item'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selected ? (
                <div className="text-sm text-muted-foreground">
                  Pick an item from the list to review.
                </div>
              ) : resolving ? (
                <div className="text-sm text-muted-foreground">Resolving…</div>
              ) : (
                <DetailPanel item={selected} onResolve={handleResolve} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
