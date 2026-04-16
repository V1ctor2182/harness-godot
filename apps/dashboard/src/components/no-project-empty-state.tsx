'use client';

import { Package, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useProject } from '@/hooks/use-project';

interface NoProjectEmptyStateProps {
  /** Short title shown at top of the empty state. */
  title?: string;
  /** Called when the user clicks the settings button (caller opens drawer). */
  onOpenSettings?: () => void;
}

/**
 * Dashboard empty state shown when no project is loaded. Blocks cycle
 * creation UX and tells the operator exactly what to do.
 */
export function NoProjectEmptyState({ title = 'No project loaded', onOpenSettings }: NoProjectEmptyStateProps) {
  const { state } = useProject();

  if (state.loaded) return null;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center gap-2">
          <Package className="size-4 text-destructive" />
          <h2 className="text-sm font-semibold text-destructive">{title}</h2>
        </div>

        <p className="text-xs text-muted-foreground">
          Harness is project-agnostic. Point it at a target repo before creating cycles:
        </p>

        <ol className="text-xs text-muted-foreground list-decimal pl-5 space-y-1">
          <li>
            Set <code className="px-1 py-0.5 rounded bg-muted font-mono">PROJECT_REPO_LOCAL_PATH</code> in <code className="px-1 py-0.5 rounded bg-muted font-mono">.env</code> to the absolute path of the project repo
          </li>
          <li>
            Create <code className="px-1 py-0.5 rounded bg-muted font-mono">.harness/project.yaml</code> in that repo (see{' '}
            <code className="px-1 py-0.5 rounded bg-muted font-mono">basic-doc/project-config-schema.md</code>)
          </li>
          <li>Click the Reload button in Settings, or restart the server</li>
        </ol>

        {state.error && (
          <div className="text-xs border rounded px-2.5 py-1.5 text-destructive border-destructive/40 bg-destructive/10 font-mono">
            {state.error}
          </div>
        )}

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <Settings className="size-3.5" />
            Open Settings
          </button>
        )}
      </CardContent>
    </Card>
  );
}
