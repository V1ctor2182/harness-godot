'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useGlobalSSE } from '@/hooks/use-sse';

import { api, type InboxItem, type InboxItemType, type InboxResolveBody } from '@/lib/api';
import { Button } from '@/components/ui/button';

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

function urgencyAccent(u: string): string {
  if (u === 'urgent') return 'var(--oxblood)';
  if (u === 'normal') return 'var(--mustard)';
  return 'transparent';
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
    <div className="pt-4 mt-4 border-t border-[var(--rule)] text-xs text-[var(--muted-foreground)] space-y-1 font-mono">
      <div>
        <span className="text-kicker mr-2">Created</span>
        {new Date(item.createdAt).toLocaleString()}
      </div>
      {item.source.cycleId != null && (
        <div>
          <span className="text-kicker mr-2">Cycle</span>
          <Link
            href={`/cycles/${item.source.cycleId}`}
            className="hover:underline"
            style={{ color: 'var(--burgundy)' }}
          >
            M{item.source.cycleId}
          </Link>
        </div>
      )}
      {item.source.taskId && (
        <div>
          <span className="text-kicker mr-2">Task</span>
          {item.source.taskId}
        </div>
      )}
      {item.source.agentRunId && (
        <div>
          <span className="text-kicker mr-2">Agent Run</span>
          {item.source.agentRunId}
        </div>
      )}
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
    <div className="pt-4 space-y-6">
      {/* Editorial header */}
      <header className="pb-5 border-b-2 border-[var(--ink)]">
        <div className="text-kicker text-[var(--burgundy)] mb-2">
          <span>The Desk</span>
          <span className="mx-2 text-[var(--rule-strong)]">·</span>
          <span className="text-[var(--muted-foreground)]">
            {items.length} pending
          </span>
          <span className="mx-2 text-[var(--rule-strong)]">·</span>
          <span className="text-[var(--muted-foreground)] italic normal-case tracking-normal">
            press j/k to navigate
          </span>
        </div>
        <h1 className="text-display-3 text-[var(--ink)]">
          Inbox
          <span className="italic text-[var(--burgundy)]">.</span>
        </h1>
      </header>

      {/* Filter tabs — editorial chips */}
      <div className="flex items-center gap-4 flex-wrap">
        {TYPE_TABS.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className="text-meta pb-1 transition-colors"
              style={{
                color: active ? 'var(--burgundy)' : 'var(--muted-foreground)',
                borderBottom: `2px solid ${active ? 'var(--burgundy)' : 'transparent'}`,
              }}
            >
              {tab.label}
              {counts[tab.id] ? (
                <span className="ml-1.5 font-mono text-tabular opacity-70">
                  {counts[tab.id]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          className="text-sm rounded-sm px-3 py-2"
          style={{
            color: 'var(--oxblood)',
            border: '1px solid color-mix(in oklch, var(--oxblood) 30%, transparent)',
            background: 'color-mix(in oklch, var(--oxblood) 8%, transparent)',
          }}
        >
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* List pane — editorial feed */}
        <section className="lg:col-span-1">
          <div className="text-kicker text-[var(--muted-foreground)] mb-3">
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
          </div>
          {filtered.length === 0 ? (
            <div className="py-6 text-sm text-[var(--muted-foreground)] text-center italic">
              Inbox zero.
            </div>
          ) : (
            <div className="border-t border-[var(--rule)]">
              {filtered.map((item) => {
                const isSelected = (selected?.id ?? null) === item.id;
                const accent = urgencyAccent(item.urgency);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="w-full text-left px-3 py-2.5 border-b border-[var(--rule)] transition-colors"
                    style={{
                      borderLeft: `2px solid ${isSelected ? 'var(--burgundy)' : accent}`,
                      background: isSelected ? 'var(--surface)' : 'transparent',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-kicker"
                        style={{ color: isSelected ? 'var(--burgundy)' : 'var(--ink-2)' }}
                      >
                        {typeLabel(item.type)}
                      </span>
                      <span className="ml-auto text-[10px] text-[var(--muted-foreground)] font-mono text-tabular">
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-sm font-medium truncate text-[var(--ink)]">
                      {item.title}
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
                      {item.preview}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Detail pane — article */}
        <section className="lg:col-span-2 lg:border-l lg:border-[var(--rule)] lg:pl-8">
          {!selected ? (
            <div className="text-sm text-[var(--muted-foreground)] italic">
              Pick an item from the list to review.
            </div>
          ) : (
            <>
              <div className="text-kicker text-[var(--burgundy)] mb-2">
                {typeLabel(selected.type)}
              </div>
              <h2 className="text-display-3 text-[var(--ink)] mb-4">
                {selected.title}
                <span className="italic text-[var(--burgundy)]">.</span>
              </h2>
              {selected.preview && (
                <p className="text-[var(--ink-2)] italic mb-5 leading-relaxed">
                  {selected.preview}
                </p>
              )}
              <div className="border-t border-[var(--rule)] pt-5">
                {resolving ? (
                  <div className="text-sm text-[var(--muted-foreground)] italic">Resolving…</div>
                ) : (
                  <DetailPanel item={selected} onResolve={handleResolve} />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
