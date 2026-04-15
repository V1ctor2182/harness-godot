'use client';

import { useState, useEffect, useCallback } from 'react';
import { useGlobalSSE } from './use-sse';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/**
 * Returns the count of unread / pending Inbox items for the top-nav badge.
 *
 * Phase 1 stub: polls `/api/inbox/count`; if that endpoint doesn't exist yet
 * (Phase 2 adds it), we silently fall back to 0. SSE event `inbox:new`
 * triggers a refetch once the backend is wired.
 */
export function useInboxBadge(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/inbox/count`);
      if (!res.ok) {
        setCount(0);
        return;
      }
      const data = (await res.json()) as { count?: number };
      setCount(typeof data.count === 'number' ? data.count : 0);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useGlobalSSE(
    useCallback(
      (type: string) => {
        if (type === 'inbox:new' || type === 'inbox:resolved' || type === 'job:requires_approval') {
          void refresh();
        }
      },
      [refresh]
    )
  );

  return { count, refresh };
}
