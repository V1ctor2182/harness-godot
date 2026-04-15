'use client';

import { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGlobalSSE } from '@/hooks/use-sse';
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

type ControlMode = 'active' | 'paused' | 'killed';

const TASK_TYPES = ['feature', 'bug', 'chore', 'refactor', 'test'] as const;

const MODE_BADGE: Record<ControlMode, string> = {
  active: 'badge-active',
  paused: 'badge-paused',
  killed: 'badge-failed',
};

type OperationMode = 'auto' | 'supervised' | 'manual';

export interface ControlData {
  mode: ControlMode;
  spentUsd: number;
  spendingCapUsd?: number;
  humanMessage?: string;
  autoApprovalCategories: string[];
  operationMode?: OperationMode;
}

async function patchControl(data: Partial<ControlData>): Promise<void> {
  const res = await fetch(`${API_URL}/control`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

export default function ControlPanel({ initialControl }: { initialControl: ControlData }) {
  const [mode, setMode] = useState<ControlMode>(initialControl.mode);
  const [spentUsd, setSpentUsd] = useState<number>(initialControl.spentUsd);
  const [liveSpendingCapUsd, setLiveSpendingCapUsd] = useState<number | undefined>(
    initialControl.spendingCapUsd
  );
  const [spendingCapUsd, setSpendingCapUsd] = useState<string>(
    initialControl.spendingCapUsd !== undefined ? String(initialControl.spendingCapUsd) : ''
  );
  const [humanMessage, setHumanMessage] = useState<string>(initialControl.humanMessage ?? '');
  const [autoApprovalCategories, setAutoApprovalCategories] = useState<string[]>(
    initialControl.autoApprovalCategories
  );
  const [operationMode, setOperationMode] = useState<OperationMode>(
    initialControl.operationMode ?? 'supervised'
  );
  const [recentEvents, setRecentEvents] = useState<Array<{ type: string; data: unknown; timestamp: Date }>>([]);

  const refreshControl = useCallback(async () => {
    try {
      const data = (await api.getControl()) as ControlData;
      setMode(data.mode);
      setSpentUsd(data.spentUsd);
      setLiveSpendingCapUsd(data.spendingCapUsd);
      setOperationMode(data.operationMode ?? 'supervised');
    } catch {
      // silently ignore refresh errors — the panel still shows last known values
    }
  }, []);

  useGlobalSSE(
    useCallback(
      (eventType: string, data: unknown) => {
        if (eventType === 'system:spending_warning' || eventType === 'system:control_updated') {
          void refreshControl();
        }
        // Capture all events for the Recent Events Log
        setRecentEvents((prev) => {
          const next = [{ type: eventType, data, timestamp: new Date() }, ...prev];
          return next.slice(0, 20);
        });
      },
      [refreshControl]
    )
  );

  const [savingMode, setSavingMode] = useState(false);
  const [savingCap, setSavingCap] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);
  const [savingOperationMode, setSavingOperationMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  const handleModeChange = async (newMode: ControlMode) => {
    setSavingMode(true);
    setError(null);
    try {
      await patchControl({ mode: newMode });
      setMode(newMode);
      showSuccess('Mode updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update mode');
    } finally {
      setSavingMode(false);
    }
  };

  const handleSaveCap = async () => {
    setSavingCap(true);
    setError(null);
    try {
      const parsed = spendingCapUsd === '' ? undefined : Number(spendingCapUsd);
      if (parsed !== undefined && isNaN(parsed)) {
        throw new Error('Spending cap must be a valid number');
      }
      await patchControl({ spendingCapUsd: parsed });
      setLiveSpendingCapUsd(parsed);
      showSuccess('Spending cap saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update spending cap');
    } finally {
      setSavingCap(false);
    }
  };

  const handleSaveMessage = async () => {
    setSavingMessage(true);
    setError(null);
    try {
      await patchControl({ humanMessage });
      showSuccess('Message saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update message');
    } finally {
      setSavingMessage(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setAutoApprovalCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleOperationModeChange = async (newMode: OperationMode) => {
    setSavingOperationMode(true);
    setError(null);
    try {
      await patchControl({ operationMode: newMode } as Partial<ControlData>);
      setOperationMode(newMode);
      showSuccess('Operation mode updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update operation mode');
    } finally {
      setSavingOperationMode(false);
    }
  };

  const handleSaveCategories = async () => {
    setSavingCategories(true);
    setError(null);
    try {
      await patchControl({ autoApprovalCategories });
      showSuccess('Auto-approval categories saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update categories');
    } finally {
      setSavingCategories(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {error && (
        <div className="text-sm border rounded px-3 py-2 text-[var(--error,#f87171)] border-[var(--error,#f87171)]/30 bg-[var(--error,#f87171)]/10">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="text-sm border rounded px-3 py-2 text-success border-success/30 bg-success/10">
          {successMsg}
        </div>
      )}

      {/* Status overview */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Mode</dt>
            <dd>
              <span className={`badge ${MODE_BADGE[mode]}`}>{mode}</span>
            </dd>
            <dt className="text-muted-foreground">Spent</dt>
            <dd className="font-mono">${spentUsd.toFixed(4)}</dd>
            <dt className="text-muted-foreground">Spending Cap</dt>
            <dd className="font-mono">
              {liveSpendingCapUsd !== undefined ? (
                `$${liveSpendingCapUsd.toFixed(2)}`
              ) : (
                <span className="text-muted-foreground">none</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Auto-Approval</dt>
            <dd>
              {autoApprovalCategories.length === 0 ? (
                <span className="text-muted-foreground">none</span>
              ) : (
                autoApprovalCategories.join(', ')
              )}
            </dd>
            {humanMessage && (
              <>
                <dt className="text-muted-foreground">Human Message</dt>
                <dd className="truncate">{humanMessage}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Mode selector */}
      <Card>
        <CardHeader>
          <CardTitle>Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={savingMode} className="space-y-2">
            <legend className="text-xs text-muted-foreground mb-2">
              Select system operating mode
            </legend>
            {(['active', 'paused', 'killed'] as ControlMode[]).map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => handleModeChange(m)}
                  className="accent-primary"
                />
                <span className={`badge ${MODE_BADGE[m]}`}>{m}</span>
                <span className="text-xs text-muted-foreground">
                  {m === 'active' && '— agents run normally'}
                  {m === 'paused' && '— no new agents spawned'}
                  {m === 'killed' && '— all activity halted'}
                </span>
              </label>
            ))}
          </fieldset>
          {savingMode && <p className="text-xs text-muted-foreground mt-2">Saving…</p>}
        </CardContent>
      </Card>

      {/* Operation Mode */}
      <Card>
        <CardHeader>
          <CardTitle>Operation Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={savingOperationMode} className="space-y-2">
            <legend className="text-xs text-muted-foreground mb-2">
              Controls human participation level (independent of system mode above)
            </legend>
            {([
              { value: 'auto' as OperationMode, desc: '— all operations auto-execute, only plan-qa needs human answers' },
              { value: 'supervised' as OperationMode, desc: '— critical operations need human approval (default)' },
              { value: 'manual' as OperationMode, desc: '— all spawn/plan jobs need human approval' },
            ]).map(({ value, desc }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="operationMode"
                  value={value}
                  checked={operationMode === value}
                  onChange={() => handleOperationModeChange(value)}
                  className="accent-primary"
                />
                <span className="text-sm font-medium">{value}</span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </label>
            ))}
          </fieldset>
          {savingOperationMode && <p className="text-xs text-muted-foreground mt-2">Saving…</p>}
        </CardContent>
      </Card>

      {/* Spending cap */}
      <Card>
        <CardHeader>
          <CardTitle>Spending Cap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              type="number"
              min="0"
              step="0.5"
              value={spendingCapUsd}
              onChange={(e) => setSpendingCapUsd(e.target.value)}
              placeholder="e.g. 5.00"
              className="w-40 font-mono"
            />
            <Button size="sm" onClick={handleSaveCap} disabled={savingCap}>
              {savingCap ? 'Saving…' : 'Save'}
            </Button>
            {spendingCapUsd && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSpendingCapUsd('')}
                className="text-muted-foreground"
              >
                Clear
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Current spend: <span className="font-mono">${spentUsd.toFixed(4)}</span>. Leave blank
            for no cap.
          </p>
        </CardContent>
      </Card>

      {/* Human message */}
      <Card>
        <CardHeader>
          <CardTitle>Human Message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            value={humanMessage}
            onChange={(e) => setHumanMessage(e.target.value)}
            rows={4}
            placeholder="Optional message injected into agent task prompts…"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 resize-y"
          />
          <Button size="sm" onClick={handleSaveMessage} disabled={savingMessage}>
            {savingMessage ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      {/* Auto-approval categories */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Approval Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Tasks of these types will skip the human review gate.
          </p>
          <div className="space-y-1">
            {TASK_TYPES.map((cat) => (
              <label key={cat} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoApprovalCategories.includes(cat)}
                  onChange={() => toggleCategory(cat)}
                  className="accent-primary"
                />
                <span className="text-sm">{cat}</span>
              </label>
            ))}
          </div>
          <Button size="sm" onClick={handleSaveCategories} disabled={savingCategories}>
            {savingCategories ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      {/* Recent Events Log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-60 overflow-auto space-y-1">
            {recentEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Waiting for events…
              </p>
            ) : (
              recentEvents.map((event, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-0.5 border-b border-border/50 last:border-0">
                  <span className="text-[10px] text-muted-foreground font-mono w-16 flex-shrink-0">
                    {event.timestamp.toLocaleTimeString()}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted font-medium flex-shrink-0">
                    {event.type}
                  </span>
                  <span className="text-muted-foreground truncate">
                    {summarizeEvent(event.data)}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function summarizeEvent(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  if (d.cycleId != null) parts.push(`cycle:${d.cycleId}`);
  if (d.taskId) parts.push(`task:${d.taskId}`);
  if (d.agentRunId) parts.push(`agent:${String(d.agentRunId).slice(0, 12)}`);
  if (d.role) parts.push(String(d.role));
  if (d.status) parts.push(String(d.status));
  if (d.type) parts.push(String(d.type));
  if (d.reason) parts.push(String(d.reason));
  return parts.join(' · ') || JSON.stringify(data).slice(0, 60);
}
