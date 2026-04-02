import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Hoist mock factories so they can be referenced inside vi.mock calls.
// readyStateBox starts at 0 (disconnected) so mongoose buffers model
// operations during module init rather than eagerly calling
// connection.collection() (which fails without a real MongoDB URL).
const { readyStateBox, mockCountDocuments } = vi.hoisted(() => ({
  readyStateBox: { value: 0 as number },
  mockCountDocuments: vi.fn<() => Promise<number>>(),
}));

// Mock AgentRunModel — prevents real MongoDB connection from being required
vi.mock('../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    countDocuments: mockCountDocuments,
  },
}));

// Mock mongoose — required because health.ts (imported transitively via app.ts)
// references mongoose.connection.readyState at request time. We proxy the
// connection to always report "connected" so health checks don't interfere.
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

// Mock Docker check — used by health route imported via app.ts
vi.mock('../../src/lib/docker.js', () => ({
  isDockerAvailable: vi.fn().mockResolvedValue(true),
}));

// Import app after all mocks are set up
import { app } from '../../src/app.js';

describe('GET /api/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns 200 with the correct response shape', async () => {
    mockCountDocuments.mockResolvedValue(0);

    const res = await request(app).get('/api/status');

    expect(res.status).toBe(200);
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThan(0);
    expect(typeof res.body.memory).toBe('object');
    expect(typeof res.body.memory.rss).toBe('number');
    expect(typeof res.body.memory.heapUsed).toBe('number');
    expect(typeof res.body.memory.heapTotal).toBe('number');
    expect(typeof res.body.activeAgentCount).toBe('number');
  });

  it('activeAgentCount reflects the mocked countDocuments return value', async () => {
    mockCountDocuments.mockResolvedValue(3);

    const res = await request(app).get('/api/status');

    expect(res.status).toBe(200);
    expect(res.body.activeAgentCount).toBe(3);
    expect(mockCountDocuments).toHaveBeenCalledWith({
      status: { $in: ['starting', 'running'] },
    });
  });

  it('activeAgentCount is 0 when no active agents', async () => {
    mockCountDocuments.mockResolvedValue(0);

    const res = await request(app).get('/api/status');

    expect(res.status).toBe(200);
    expect(res.body.activeAgentCount).toBe(0);
    expect(mockCountDocuments).toHaveBeenCalledWith({
      status: { $in: ['starting', 'running'] },
    });
  });
});
