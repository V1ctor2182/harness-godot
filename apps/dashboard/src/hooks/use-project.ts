'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type ProjectState } from '@/lib/api';
import { useGlobalSSE } from './use-sse';

const EMPTY: ProjectState = {
  loaded: false,
  config: null,
  source: null,
  error: null,
  loadedAt: null,
};

/**
 * Returns the current project-loading state. Refetches on
 * `project:reloaded` SSE events so the badge + empty-states update live
 * after an operator triggers POST /api/project/reload.
 */
export function useProject(): { state: ProjectState; refresh: () => void; reload: () => Promise<void> } {
  const [state, setState] = useState<ProjectState>(EMPTY);

  const refresh = useCallback(async () => {
    try {
      setState(await api.getProject());
    } catch {
      setState(EMPTY);
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      setState(await api.reloadProject());
    } catch {
      setState(EMPTY);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useGlobalSSE(
    useCallback(
      (type: string) => {
        if (type === 'project:reloaded') void refresh();
      },
      [refresh]
    )
  );

  return { state, refresh, reload };
}
