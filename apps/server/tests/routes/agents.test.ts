import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Hoist mock factories for model methods.
// readyStateBox starts at 0 so mongoose buffers model operations during module
// init rather than eagerly calling connection.collection() (which fails without
// a real MongoDB URL).
const { readyStateBox, mockAgentRunFind, mockAgentRunFindById, mockAgentEventFind } = vi.hoisted(
  () => ({
    readyStateBox: { value: 0 as number },
    mockAgentRunFind: vi.fn(),
    mockAgentRunFindById: vi.fn(),
    mockAgentEventFind: vi.fn(),
  })
);

vi.mock('../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    find: mockAgentRunFind,
    findById: mockAgentRunFindById,
  },
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

// Helper to create a chainable query mock (find → sort → limit → lean)
function makeQuery(result: unknown) {
  const q = {
    sort: vi.fn(),
    lean: vi.fn(),
    limit: vi.fn(),
  };
  q.sort.mockReturnValue(q);
  q.limit.mockReturnValue(q);
  q.lean.mockResolvedValue(result);
  return q;
}

describe('GET /api/agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns 200 with a list of agent runs', async () => {
    const runs = [{ _id: 'run-1', role: 'coder', status: 'completed' }];
    mockAgentRunFind.mockReturnValue(makeQuery(runs));

    const res = await request(app).get('/api/agents');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(runs);
    expect(mockAgentRunFind).toHaveBeenCalledWith({});
  });

  it('filters by role query param', async () => {
    mockAgentRunFind.mockReturnValue(makeQuery([]));

    await request(app).get('/api/agents?role=coder');

    expect(mockAgentRunFind).toHaveBeenCalledWith({ role: 'coder' });
  });

  it('filters by status query param', async () => {
    mockAgentRunFind.mockReturnValue(makeQuery([]));

    await request(app).get('/api/agents?status=running');

    expect(mockAgentRunFind).toHaveBeenCalledWith({ status: 'running' });
  });

  it('filters by cycleId query param', async () => {
    mockAgentRunFind.mockReturnValue(makeQuery([]));

    await request(app).get('/api/agents?cycleId=3');

    expect(mockAgentRunFind).toHaveBeenCalledWith({ cycleId: 3 });
  });

  it('filters by multiple params simultaneously', async () => {
    mockAgentRunFind.mockReturnValue(makeQuery([]));

    await request(app).get('/api/agents?role=reviewer&status=completed&cycleId=2');

    expect(mockAgentRunFind).toHaveBeenCalledWith({
      role: 'reviewer',
      status: 'completed',
      cycleId: 2,
    });
  });
});

describe('GET /api/agents/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns 200 with the agent run when found', async () => {
    const run = { _id: 'run-1', role: 'coder', status: 'completed' };
    mockAgentRunFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(run) });

    const res = await request(app).get('/api/agents/run-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(run);
    expect(mockAgentRunFindById).toHaveBeenCalledWith('run-1');
  });

  it('returns 404 when agent run is not found', async () => {
    mockAgentRunFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await request(app).get('/api/agents/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('GET /api/agents/:id/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns events for a given agent run', async () => {
    const run = { _id: 'run-1' };
    const events = [
      { agentRunId: 'run-1', type: 'text', sequenceNum: 1 },
      { agentRunId: 'run-1', type: 'tool_use', sequenceNum: 2 },
    ];
    mockAgentRunFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(run) });
    mockAgentEventFind.mockReturnValue(makeQuery(events));

    const res = await request(app).get('/api/agents/run-1/events');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(events);
    expect(mockAgentEventFind).toHaveBeenCalledWith({ agentRunId: 'run-1' });
  });

  it('returns 404 when the parent agent run is not found', async () => {
    mockAgentRunFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await request(app).get('/api/agents/missing-run/events');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('filters events by type query param', async () => {
    const run = { _id: 'run-1' };
    mockAgentRunFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(run) });
    mockAgentEventFind.mockReturnValue(makeQuery([]));

    await request(app).get('/api/agents/run-1/events?type=text');

    expect(mockAgentEventFind).toHaveBeenCalledWith({ agentRunId: 'run-1', type: 'text' });
  });
});
