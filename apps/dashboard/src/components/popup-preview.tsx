'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Maximize2 } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { usePopup } from '@/hooks/use-popup';

type PopupContentRenderer = (props: Record<string, unknown>) => {
  title: string;
  subtitle?: string;
  route: string;
  body: React.ReactNode;
};

interface PopupPreviewProps {
  renderers: Partial<Record<NonNullable<ReturnType<typeof usePopup>['state']['type']>, PopupContentRenderer>>;
}

export function PopupPreview({ renderers }: PopupPreviewProps) {
  const { state, close } = usePopup();
  const router = useRouter();
  const open = state.type !== null;

  const rendered = useMemo(() => {
    if (!state.type) return null;
    const renderer = renderers[state.type];
    if (!renderer) return null;
    return renderer(state.props ?? {});
  }, [state, renderers]);

  const handleMaximize = useCallback(() => {
    if (!rendered) return;
    router.push(rendered.route);
    close();
  }, [rendered, router, close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      // F or ⌘↑ → maximize
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleMaximize();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
        e.preventDefault();
        handleMaximize();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleMaximize]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      {rendered && (
        <DialogContent className="p-0" showClose={false}>
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">{rendered.title}</DialogTitle>
              {rendered.subtitle && (
                <DialogDescription className="text-xs">{rendered.subtitle}</DialogDescription>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleMaximize}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                title="Maximize (F)"
              >
                <Maximize2 className="size-3.5" />
                Maximize
              </button>
              <button
                type="button"
                onClick={close}
                className="text-xs text-muted-foreground hover:text-foreground px-2"
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="overflow-auto p-5 max-h-[calc(min(85vh,800px)-60px)]">{rendered.body}</div>
        </DialogContent>
      )}
    </Dialog>
  );
}
