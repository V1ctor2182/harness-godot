'use client';

import Link from 'next/link';
import { Package, Wand2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useProject } from '@/hooks/use-project';

interface NoProjectEmptyStateProps {
  title?: string;
  compact?: boolean;
}

export function NoProjectEmptyState({
  title = 'No project loaded',
  compact = false,
}: NoProjectEmptyStateProps) {
  const { state } = useProject();

  if (state.loaded) return null;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className={`${compact ? 'py-3' : 'pt-5 pb-5'} space-y-3`}>
        <div className="flex items-center gap-2">
          <Package className="size-4 text-destructive" />
          <h2 className="text-sm font-semibold text-destructive">{title}</h2>
        </div>

        {!compact && (
          <p className="text-xs text-muted-foreground">
            Ludus is project-agnostic. Create or connect a game project to get started.
          </p>
        )}

        {state.error && (
          <div className="text-xs border rounded px-2.5 py-1.5 text-destructive border-destructive/40 bg-destructive/10 font-mono">
            {state.error}
          </div>
        )}

        <Link
          href="/setup"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Wand2 className="size-3.5" />
          Setup Project
        </Link>
      </CardContent>
    </Card>
  );
}
