/**
 * Unit tests for apps/server/src/services/sse-manager.ts
 *
 * The sse-manager uses module-level state (a Map of clients and a heartbeat
 * interval). Each test calls stopSSE() in afterEach to reset state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config to avoid requiring real env vars
vi.mock('../../src/config.js', () => ({
  config: {
    sseHeartbeatIntervalMs: 30_000,
  },
}));

import { addClient, broadcast, initSSE, stopSSE } from '../../src/services/sse-manager.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

type MockRes = {
  writeHead: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  flushHeaders: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function makeMockRes(): MockRes {
  return {
    writeHead: vi.fn(),
    write: vi.fn(),
    flushHeaders: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

afterEach(() => {
  stopSSE();
  vi.clearAllMocks();
});

// ─── addClient ───────────────────────────────────────────────────────────────

describe('addClient', () => {
  it('sets Content-Type: text/event-stream header', () => {
    const res = makeMockRes();
    addClient('client-1', res as never);

    expect(res.writeHead).toHaveBeenCalledOnce();
    const [statusCode, headers] = res.writeHead.mock.calls[0] as [number, Record<string, string>];
    expect(statusCode).toBe(200);
    expect(headers['Content-Type']).toBe('text/event-stream');
  });

  it('sets Cache-Control: no-cache header', () => {
    const res = makeMockRes();
    addClient('client-2', res as never);

    const [, headers] = res.writeHead.mock.calls[0] as [number, Record<string, string>];
    expect(headers['Cache-Control']).toBe('no-cache');
  });

  it('calls flushHeaders after writeHead', () => {
    const res = makeMockRes();
    addClient('client-3', res as never);

    expect(res.flushHeaders).toHaveBeenCalledOnce();
  });

  it('registers a close handler that removes the client', () => {
    const res = makeMockRes();
    addClient('client-4', res as never);

    // Capture the close handler registered via res.on('close', handler)
    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));

    // Simulate the client disconnecting
    const [, closeHandler] = res.on.mock.calls[0] as [string, () => void];

    // After close, broadcast should not write to this client
    closeHandler();
    const other = makeMockRes();
    addClient('other-client', other as never);

    broadcast('test:event', { foo: 'bar' });

    expect(res.write).not.toHaveBeenCalled();
    expect(other.write).toHaveBeenCalledOnce();
  });
});

// ─── broadcast ───────────────────────────────────────────────────────────────

describe('broadcast', () => {
  it('sends to all clients when no filter is provided', () => {
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    addClient('a', res1 as never);
    addClient('b', res2 as never);

    broadcast('test:event', { value: 1 });

    expect(res1.write).toHaveBeenCalledOnce();
    expect(res2.write).toHaveBeenCalledOnce();
  });

  it('sends correct SSE format with event:, id:, and data: lines', () => {
    const res = makeMockRes();
    addClient('c', res as never);

    broadcast('agent:text', { content: 'hello' });

    expect(res.write).toHaveBeenCalledOnce();
    const [payload] = res.write.mock.calls[0] as [string];

    expect(payload).toMatch(/^event: agent:text\n/);
    expect(payload).toMatch(/\nid: sse-\d+\n/);
    expect(payload).toMatch(/\ndata: \{"content":"hello"\}\n\n$/);
  });

  it('sends only to clients whose filter.agentRunId matches when filter is provided', () => {
    const resGlobal = makeMockRes();
    const resMatch = makeMockRes();
    const resMismatch = makeMockRes();

    addClient('global', resGlobal as never); // no filter
    addClient('match', resMatch as never, undefined, { agentRunId: 'run-abc' });
    addClient('mismatch', resMismatch as never, undefined, { agentRunId: 'run-xyz' });

    broadcast('agent:text', { content: 'hi' }, { agentRunId: 'run-abc' });

    expect(resGlobal.write).toHaveBeenCalledOnce(); // global sees everything
    expect(resMatch.write).toHaveBeenCalledOnce(); // matching run sees it
    expect(resMismatch.write).not.toHaveBeenCalled(); // different run excluded
  });

  it('does NOT send to clients subscribed to a different agentRunId', () => {
    const resDifferent = makeMockRes();
    addClient('different', resDifferent as never, undefined, { agentRunId: 'run-other' });

    broadcast('agent:tool_use', { toolName: 'Read' }, { agentRunId: 'run-target' });

    expect(resDifferent.write).not.toHaveBeenCalled();
  });

  it('global clients (no filter) receive all events including agent-filtered ones', () => {
    const resGlobal = makeMockRes();
    addClient('global', resGlobal as never); // no filter

    broadcast('agent:completion', { costUsd: 0.1 }, { agentRunId: 'run-123' });

    expect(resGlobal.write).toHaveBeenCalledOnce();
  });
});

// ─── stopSSE ─────────────────────────────────────────────────────────────────

describe('stopSSE', () => {
  it('calls res.end() on all connected clients', () => {
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    addClient('x', res1 as never);
    addClient('y', res2 as never);

    stopSSE();

    expect(res1.end).toHaveBeenCalledOnce();
    expect(res2.end).toHaveBeenCalledOnce();
  });

  it('clears the heartbeat interval so no further heartbeats are sent', () => {
    vi.useFakeTimers();

    initSSE();

    const res = makeMockRes();
    addClient('z', res as never);

    stopSSE();

    // Advance time — heartbeat should NOT fire because interval was cleared
    vi.advanceTimersByTime(60_000);

    // write() was never called by a heartbeat (only flushHeaders during addClient)
    expect(res.write).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

// ─── initSSE ────────────────────────────────────────────────────────────────

describe('initSSE', () => {
  it('does not create a second heartbeat interval if already initialized (idempotent)', () => {
    vi.useFakeTimers();

    const res = makeMockRes();
    addClient('heartbeat-client', res as never);

    initSSE();
    initSSE(); // second call — should be a no-op

    // Advance past one heartbeat interval
    vi.advanceTimersByTime(30_000);

    // Heartbeat fires exactly once per interval, not twice
    expect(res.write).toHaveBeenCalledTimes(1);
    const [payload] = res.write.mock.calls[0] as [string];
    expect(payload).toBe(': heartbeat\n\n');

    vi.useRealTimers();
  });
});
