'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ControlPanel, { type ControlData } from '@/components/control-panel';
import { api } from '@/lib/api';
import { useProject } from '@/hooks/use-project';

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const [data, setData] = useState<ControlData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const { state: projectState, reload: reloadProject } = useProject();

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

  const handleReload = useCallback(async () => {
    setReloading(true);
    try {
      await reloadProject();
    } finally {
      setReloading(false);
    }
  }, [reloadProject]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] max-w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Project, system controls, budget, and auto-approval</SheetDescription>
        </SheetHeader>
        <div className="p-5 space-y-4">
          {/* Project status — top of drawer */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Project</span>
                <Button size="sm" variant="outline" onClick={handleReload} disabled={reloading}>
                  <RefreshCw className={`size-3 mr-1 ${reloading ? 'animate-spin' : ''}`} />
                  Reload
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {projectState.loaded && projectState.config ? (
                <>
                  <div>
                    <span className="text-muted-foreground uppercase tracking-wider text-[10px] block mb-0.5">
                      Loaded
                    </span>
                    <span className="font-semibold text-primary">
                      {projectState.config.name}
                    </span>
                    <span className="text-muted-foreground ml-2 font-mono">
                      ({projectState.config.id})
                    </span>
                  </div>
                  {projectState.config.description && (
                    <div className="text-muted-foreground">{projectState.config.description}</div>
                  )}
                  {projectState.config.stack && (
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      {projectState.config.stack.engine && (
                        <span className="px-1.5 py-0.5 rounded bg-muted">
                          {projectState.config.stack.engine}
                          {projectState.config.stack.engine_version && ` ${projectState.config.stack.engine_version}`}
                        </span>
                      )}
                      {projectState.config.stack.language && (
                        <span className="px-1.5 py-0.5 rounded bg-muted">
                          {projectState.config.stack.language}
                        </span>
                      )}
                      {projectState.config.stack.test_runner && (
                        <span className="px-1.5 py-0.5 rounded bg-muted">
                          {projectState.config.stack.test_runner}
                        </span>
                      )}
                    </div>
                  )}
                  {projectState.source && (
                    <div className="text-[10px] font-mono text-muted-foreground break-all">
                      {projectState.source}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-destructive font-semibold">No project loaded</div>
                  <div className="text-muted-foreground">
                    {projectState.error ??
                      'Set PROJECT_REPO_LOCAL_PATH in .env and create .harness/project.yaml in the project repo.'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Cycle creation is blocked until a project is loaded.
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Existing control panel */}
          {error && (
            <div className="text-sm border rounded px-3 py-2 text-[var(--error,#f87171)] border-[var(--error,#f87171)]/30 bg-[var(--error,#f87171)]/10">
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
