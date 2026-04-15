'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;

interface SSEOptions {
  url: string;
  onEvent: (eventType: string, data: unknown) => void;
  onError?: (error: Event) => void;
}

export function useSSE({ url, onEvent, onError }: SSEOptions) {
  const sourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  const [connected, setConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const source = new EventSource(`${API_URL}${url}`);
      sourceRef.current = source;

      source.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        retryCountRef.current = 0;
        setRetryCount(0);
      };

      source.onerror = (e) => {
        if (!mountedRef.current) return;
        setConnected(false);
        onError?.(e);

        // Close the broken source before scheduling a retry
        source.close();
        sourceRef.current = null;

        const attempt = retryCountRef.current + 1;
        retryCountRef.current = attempt;
        setRetryCount(attempt);

        const delayMs = Math.min(BACKOFF_INITIAL_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);

        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          connect();
        }, delayMs);
      };

      // Listen for all event types we care about
      const eventTypes = [
        'agent:text_delta',
        'agent:text',
        'agent:tool_use',
        'agent:tool_result',
        'agent:completion',
        'agent:error',
        'agent:system',
        'agent:started',
        'agent:completed',
        'cycle:phase_changed',
        'cycle:completed',
        'cycle:failed',
        'task:status_changed',
        'job:requires_approval',
        'job:failed',
        'review:ready',
        'system:spending_warning',
        'system:reload_triggered',
        'system:control_updated',
        'task:created',
        'task:conflict_requeued',
        'inbox:new',
        'inbox:resolved',
        'milestone:updated',
      ];

      for (const type of eventTypes) {
        source.addEventListener(type, (e) => {
          try {
            const data = JSON.parse((e as MessageEvent).data);
            onEvent(type, data);
          } catch {
            /* ignore parse errors */
          }
        });
      }
    }

    connect();

    return () => {
      mountedRef.current = false;

      // Cancel any pending retry timer
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [url]); // intentional: handlers capture current values via refs

  const close = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    sourceRef.current?.close();
    sourceRef.current = null;
    setConnected(false);
  }, []);

  return { connected, close, retryCount };
}

export function useGlobalSSE(onEvent: (eventType: string, data: unknown) => void) {
  return useSSE({ url: '/events/stream', onEvent });
}

export function useAgentSSE(
  agentRunId: string,
  onEvent: (eventType: string, data: unknown) => void
) {
  return useSSE({ url: `/events/agents/${agentRunId}/stream`, onEvent });
}
