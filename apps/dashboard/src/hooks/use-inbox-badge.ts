'use client';

import { useState, useEffect, useCallback } from 'react';
import { useGlobalSSE } from './use-sse';
import { api } from '@/lib/api';

/**
 * Returns the count of pending Inbox items for the top-nav badge. Refetches
 * on inbox:new / inbox:resolved / job:requires_approval SSE events.
 */
export function useInboxBadge(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getInboxCount();
      setCount(data.count);
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
