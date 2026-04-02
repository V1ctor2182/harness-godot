import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';

// Hoist mock factories before module imports
const { readyStateBox, mockAddClient, mockAgentEventFind } = vi.hoisted(() => ({
  readyStateBox: { value: 0 as number },
  mockAddClient: vi.fn(),
  mockAgentEventFind: vi.fn(),
}));

vi.mock('../../src/services/sse-manager.js', () => ({
  addClient: mockAddClient,
}));

vi.mock('../../src/models/agent-event.js', () => ({
  AgentEventModel: {
    find: mockAgentEventFind,
  },
}));

vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  const connectionProxy = new Proxy(actual.default.connection, {
    get(target, prop) {
      if (prop === 'readyState') return readyStateBox.value;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (target as any)[prop];
    },
  });
  const mongooseProxy = new Proxy(actual.default, {
    get(target, prop) {
      if (prop === 'connection') return connectionProxy;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (target as any)[prop];
    },
  });
  return { ...actual, default: mongooseProxy };
});

vi.mock('../../src/lib/docker.js', () => ({
  isDockerAvailable: vi.fn().mockResolvedValue(true),
}));

import { app } from '../../src/app.js';

// Helper: make a chainable find query mock that resolves to the given result
function makeQuery(result: unknown[]) {
  const q = {
    sort: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn(),
  };
  q.sort.mockReturnValue(q);
  q.limit.mockReturnValue(q);
  q.lean.mockResolvedValue(result);
  return q;
}

// mockAddClient implementation: set SSE headers and end the response so
// supertest can complete the request without hanging.
function sseAddClientImpl(
  _clientId: string,
  res: import('express').Response,
  _lastEventId?: string,
  _filter?: { agentRunId?: string }
) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.end();
}

describe('GET /api/events/stream (global SSE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
    mockAddClient.mockImplementation(sseAddClientImpl);
    mockAgentEventFind.mockReturnValue(makeQuery([]));
  });

  it('returns 200 with text/event-stream content type', async () => {
    const res = await request(app).get('/api/events/stream');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });

  it('calls addClient without triggering a replay when last-event-id is absent', async () => {
    await request(app).get('/api/events/stream');

    expect(mockAddClient).toHaveBeenCalledOnce();
    // No replay: find should not be called
    expect(mockAgentEventFind).not.toHaveBeenCalled();
  });

  it('uses ObjectId filter when last-event-id is a valid ObjectId', async () => {
    const objectId = new Types.ObjectId();
    const afterId = objectId.toHexString();

    await request(app).get('/api/events/stream').set('last-event-id', afterId);

    // Give the async replay task a chance to run
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockAgentEventFind).toHaveBeenCalledOnce();
    const [filter] = mockAgentEventFind.mock.calls[0] as [Record<string, unknown>];
    expect(filter).toHaveProperty('_id');
    const idFilter = filter._id as { $gt: Types.ObjectId };
    expect(idFilter.$gt.toString()).toBe(afterId);
    // Global replay should NOT include agentRunId in the filter
    expect(filter).not.toHaveProperty('agentRunId');
  });

  it('uses timestamp fallback filter when last-event-id is not a valid ObjectId', async () => {
    const before = Date.now();
    await request(app).get('/api/events/stream').set('last-event-id', 'not-a-valid-object-id');

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockAgentEventFind).toHaveBeenCalledOnce();
    const [filter] = mockAgentEventFind.mock.calls[0] as [Record<string, unknown>];
    expect(filter).toHaveProperty('timestamp');
    const tsFilter = filter.timestamp as { $gt: Date };
    // The fallback date should be roughly 5 minutes before "now"
    const fiveMinMs = 5 * 60 * 1000;
    expect(tsFilter.$gt.getTime()).toBeGreaterThan(before - fiveMinMs - 1000);
    expect(tsFilter.$gt.getTime()).toBeLessThan(Date.now());
  });
});

describe('GET /api/events/agents/:agentRunId/stream (per-agent SSE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
    mockAddClient.mockImplementation(sseAddClientImpl);
    mockAgentEventFind.mockReturnValue(makeQuery([]));
  });

  it('returns 200 with text/event-stream content type', async () => {
    const res = await request(app).get('/api/events/agents/agent-abc/stream');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });

  it('passes agentRunId to addClient and skips replay when last-event-id is absent', async () => {
    await request(app).get('/api/events/agents/agent-abc/stream');

    expect(mockAddClient).toHaveBeenCalledOnce();
    const [, , , filter] = mockAddClient.mock.calls[0] as [
      string,
      unknown,
      string | undefined,
      { agentRunId: string } | undefined,
    ];
    expect(filter).toEqual({ agentRunId: 'agent-abc' });
    expect(mockAgentEventFind).not.toHaveBeenCalled();
  });

  it('includes agentRunId and ObjectId filter when last-event-id is a valid ObjectId', async () => {
    const objectId = new Types.ObjectId();
    const afterId = objectId.toHexString();

    await request(app).get('/api/events/agents/agent-xyz/stream').set('last-event-id', afterId);

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockAgentEventFind).toHaveBeenCalledOnce();
    const [filter] = mockAgentEventFind.mock.calls[0] as [Record<string, unknown>];
    expect(filter).toHaveProperty('agentRunId', 'agent-xyz');
    expect(filter).toHaveProperty('_id');
    const idFilter = filter._id as { $gt: Types.ObjectId };
    expect(idFilter.$gt.toString()).toBe(afterId);
  });

  it('includes agentRunId and timestamp filter when last-event-id is not a valid ObjectId', async () => {
    const before = Date.now();
    await request(app).get('/api/events/agents/agent-xyz/stream').set('last-event-id', 'bad-id');

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockAgentEventFind).toHaveBeenCalledOnce();
    const [filter] = mockAgentEventFind.mock.calls[0] as [Record<string, unknown>];
    expect(filter).toHaveProperty('agentRunId', 'agent-xyz');
    expect(filter).toHaveProperty('timestamp');
    const tsFilter = filter.timestamp as { $gt: Date };
    const fiveMinMs = 5 * 60 * 1000;
    expect(tsFilter.$gt.getTime()).toBeGreaterThan(before - fiveMinMs - 1000);
    expect(tsFilter.$gt.getTime()).toBeLessThan(Date.now());
  });
});
