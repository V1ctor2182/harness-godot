'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/status-badge';
import { useGlobalSSE } from '@/hooks/use-sse';
import { useProject } from '@/hooks/use-project';
import { NoProjectEmptyState } from '@/components/no-project-empty-state';

interface Cycle {
  _id: number;
  goal: string;
  phase: string;
  status: string;
  tasks: string[];
  startedAt: string;
  completedAt?: string;
  metrics?: {
    totalCostUsd: number;
    tasksCompleted: number;
    tasksFailed: number;
    totalDurationMs: number;
  };
}

export default function CyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [newGoal, setNewGoal] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const { state: projectState } = useProject();
  const projectLoaded = projectState.loaded;

  useEffect(() => {
    api.listCycles().then((c) => setCycles(c as Cycle[]));
  }, []);

  const handleEvent = useCallback((eventType: string) => {
    if (
      eventType === 'cycle:phase_changed' ||
      eventType === 'cycle:completed' ||
      eventType === 'cycle:failed'
    ) {
      api.listCycles().then((c) => setCycles(c as Cycle[]));
    }
  }, []);

  useGlobalSSE(handleEvent);

  const handleCreate = async () => {
    if (!newGoal.trim()) return;
    setCreateError(null);
    try {
      await api.createCycle(newGoal);
      setNewGoal('');
      api.listCycles().then((c) => setCycles(c as Cycle[]));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create cycle';
      setCreateError(
        msg.includes('no_project_loaded')
          ? 'Cannot create cycle — no project loaded. Set PROJECT_REPO_LOCAL_PATH and create .harness/project.yaml.'
          : msg
      );
    }
  };

  return (
    <div className="pt-4 space-y-6">
      <header className="pb-5 border-b-2 border-[var(--ink)]">
        <div className="text-kicker text-[var(--burgundy)] mb-2">
          <span>The Archive</span>
          <span className="mx-2 text-[var(--rule-strong)]">·</span>
          <span className="text-[var(--muted-foreground)]">
            {cycles.length} {cycles.length === 1 ? 'story' : 'stories'}
          </span>
        </div>
        <h1 className="text-display-3 text-[var(--ink)]">
          Cycles
          <span className="italic text-[var(--burgundy)]">.</span>
        </h1>
      </header>

      {!projectLoaded && <NoProjectEmptyState title="No project loaded — cycle creation disabled" />}

      <section>
        <div className="text-kicker text-[var(--muted-foreground)] mb-2">Start a new cycle</div>
        <div className="flex gap-2">
          <Input
            type="text"
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => projectLoaded && e.key === 'Enter' && handleCreate()}
            placeholder={projectLoaded ? 'Enter cycle goal…' : 'Load a project to enable cycle creation'}
            className="flex-1 font-mono text-xs"
            disabled={!projectLoaded}
          />
          <Button onClick={handleCreate} disabled={!projectLoaded}>
            Create Cycle
          </Button>
        </div>
        {createError && (
          <div
            className="mt-3 text-xs rounded-sm px-3 py-2"
            style={{
              color: 'var(--oxblood)',
              border: '1px solid color-mix(in oklch, var(--oxblood) 30%, transparent)',
              background: 'color-mix(in oklch, var(--oxblood) 8%, transparent)',
            }}
          >
            {createError}
          </div>
        )}
      </section>

      <section className="border-t border-[var(--rule)] pt-4">
        <div className="text-kicker text-[var(--muted-foreground)] mb-3">Past issues</div>
        {cycles.length === 0 ? (
          <div className="py-6 text-sm text-[var(--muted-foreground)] italic">
            No cycles yet.
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[60px_1fr_100px_100px_60px_80px_100px] gap-3 pb-2 border-b border-[var(--rule-strong)] text-kicker text-[var(--muted-foreground)]">
              <span>M#</span>
              <span>Goal</span>
              <span>Phase</span>
              <span>Status</span>
              <span className="text-right">Tasks</span>
              <span className="text-right">Cost</span>
              <span className="text-right">Started</span>
            </div>
            {cycles.map((c) => (
              <Link
                key={c._id}
                href={`/cycles/${c._id}`}
                className="grid grid-cols-[60px_1fr_100px_100px_60px_80px_100px] gap-3 py-2.5 border-b border-[var(--rule)] items-center hover:bg-[var(--surface)] transition-colors"
              >
                <span
                  className="font-mono text-sm text-tabular"
                  style={{ color: 'var(--burgundy)' }}
                >
                  M{c._id}
                </span>
                <span className="truncate text-sm text-[var(--ink)]">{c.goal}</span>
                <StatusBadge status={c.phase} />
                <StatusBadge status={c.status} />
                <span className="text-right font-mono text-tabular text-xs text-[var(--ink-2)]">
                  {c.tasks.length}
                </span>
                <span className="text-right font-mono text-tabular text-xs text-[var(--ink-2)]">
                  ${c.metrics?.totalCostUsd?.toFixed(2) ?? '—'}
                </span>
                <span className="text-right font-mono text-tabular text-xs text-[var(--muted-foreground)]">
                  {new Date(c.startedAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
