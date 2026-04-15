'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import ControlPanel, { type ControlData } from '@/components/control-panel';
import { api } from '@/lib/api';

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const [data, setData] = useState<ControlData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = (await api.getControl()) as ControlData;
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load control settings');
    }
  }, []);

  useEffect(() => {
    if (open && !data) void load();
  }, [open, data, load]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] max-w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>System controls, budget, and auto-approval</SheetDescription>
        </SheetHeader>
        <div className="p-5">
          {error && (
            <div className="text-sm border rounded px-3 py-2 text-[var(--error,#f87171)] border-[var(--error,#f87171)]/30 bg-[var(--error,#f87171)]/10 mb-3">
              {error}
            </div>
          )}
          {!data && !error && <div className="text-sm text-muted-foreground">Loading…</div>}
          {data && <ControlPanel initialControl={data} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
