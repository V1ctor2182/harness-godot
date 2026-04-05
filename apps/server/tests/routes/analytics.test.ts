import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Hoist mock factories for AgentRunModel, TaskModel, and CycleModel methods.
// readyStateBox starts at 0 so mongoose buffers model operations during module
// init rather than eagerly calling connection.collection() (which fails without
// a real MongoDB URL).
const { readyStateBox, mockAgentRunAggregate, mockTaskAggregate, mockCycleFind } = vi.hoisted(
  () => ({
    readyStateBox: { value: 0 as number },
    mockAgentRunAggregate: vi.fn(),
    mockTaskAggregate: vi.fn(),
    mockCycleFind: vi.fn(),
  })
);

vi.mock('../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    aggregate: mockAgentRunAggregate,
  },
}));

vi.mock('../../src/models/cycle.js', () => ({
  CycleModel: {
    find: mockCycleFind,
  },
}));

vi.mock('../../src/models/task.js', () => ({
  TaskModel: {
    aggregate: mockTaskAggregate,
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

describe('GET /api/analytics/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns 200 with byType and byCycle arrays', async () => {
    const byTypeData = [
      { type: 'feature', total: 10, done: 7, failed: 1, avgRetryCount: 0.3 },
      { type: 'bug', total: 5, done: 4, failed: 1, avgRetryCount: 0.2 },
    ];
    const byCycleData = [
      { cycleId: 5, total: 8, done: 6, failed: 1, avgRetryCount: 0.25 },
      { cycleId: 4, total: 7, done: 5, failed: 2, avgRetryCount: 0.43 },
    ];

    mockTaskAggregate.mockResolvedValueOnce(byTypeData).mockResolvedValueOnce(byCycleData);

    const res = await request(app).get('/api/analytics/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ byType: byTypeData, byCycle: byCycleData });
    expect(mockTaskAggregate).toHaveBeenCalledTimes(2);
  });

  it('returns empty arrays when no Task documents exist', async () => {
    mockTaskAggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/analytics/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ byType: [], byCycle: [] });
  });

  it('byType entries have required fields', async () => {
    const byTypeData = [{ type: 'chore', total: 3, done: 2, failed: 0, avgRetryCount: 0 }];
    mockTaskAggregate.mockResolvedValueOnce(byTypeData).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/analytics/tasks');

    expect(res.status).toBe(200);
    const entry = res.body.byType[0] as {
      type: string;
      total: number;
      done: number;
      failed: number;
      avgRetryCount: number;
    };
    expect(typeof entry.type).toBe('string');
    expect(typeof entry.total).toBe('number');
    expect(typeof entry.done).toBe('number');
    expect(typeof entry.failed).toBe('number');
    expect(typeof entry.avgRetryCount).toBe('number');
  });

  it('byCycle entries have required fields', async () => {
    const byCycleData = [{ cycleId: 3, total: 5, done: 4, failed: 1, avgRetryCount: 0.4 }];
    mockTaskAggregate.mockResolvedValueOnce([]).mockResolvedValueOnce(byCycleData);

    const res = await request(app).get('/api/analytics/tasks');

    expect(res.status).toBe(200);
    const entry = res.body.byCycle[0] as {
      cycleId: number;
      total: number;
      done: number;
      failed: number;
      avgRetryCount: number;
    };
    expect(typeof entry.cycleId).toBe('number');
    expect(typeof entry.total).toBe('number');
    expect(typeof entry.done).toBe('number');
    expect(typeof entry.failed).toBe('number');
    expect(typeof entry.avgRetryCount).toBe('number');
  });

  it('avgRetryCount is a finite number rounded to 2 decimal places', async () => {
    // The route uses $round: [{$ifNull: ['$avgRetryCount', 0]}, 2] in the MongoDB aggregation.
    // The mock returns values the aggregation pipeline would produce after rounding.
    const byTypeData = [{ type: 'test', total: 3, done: 1, failed: 1, avgRetryCount: 0.67 }];
    const byCycleData = [{ cycleId: 2, total: 3, done: 1, failed: 1, avgRetryCount: 0.33 }];
    mockTaskAggregate.mockResolvedValueOnce(byTypeData).mockResolvedValueOnce(byCycleData);

    const res = await request(app).get('/api/analytics/tasks');

    expect(res.status).toBe(200);
    const typeEntry = res.body.byType[0] as { avgRetryCount: number };
    const cycleEntry = res.body.byCycle[0] as { avgRetryCount: number };

    expect(Number.isFinite(typeEntry.avgRetryCount)).toBe(true);
    expect(typeEntry.avgRetryCount).toBe(0.67);

    expect(Number.isFinite(cycleEntry.avgRetryCount)).toBe(true);
    expect(cycleEntry.avgRetryCount).toBe(0.33);
  });

  it('avgRetryCount defaults to 0 when tasks have no retries', async () => {
    // When all tasks succeed on first attempt, avgRetryCount should be 0 (not null/undefined).
    const byTypeData = [{ type: 'feature', total: 5, done: 5, failed: 0, avgRetryCount: 0 }];
    mockTaskAggregate.mockResolvedValueOnce(byTypeData).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/analytics/tasks');

    expect(res.status).toBe(200);
    const entry = res.body.byType[0] as { avgRetryCount: number };
    expect(entry.avgRetryCount).toBe(0);
  });
});

describe('GET /api/analytics/spending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns 200 with byCycle and byRole arrays on success', async () => {
    const byCycleData = [
      { cycleId: 5, totalCostUsd: 1.23, runCount: 4 },
      { cycleId: 4, totalCostUsd: 0.87, runCount: 3 },
    ];
    const byRoleData = [
      { role: 'coder', totalCostUsd: 1.5, runCount: 5 },
      { role: 'reviewer', totalCostUsd: 0.6, runCount: 2 },
    ];

    // aggregate is called twice (byCycle and byRole) via Promise.all
    mockAgentRunAggregate.mockResolvedValueOnce(byCycleData).mockResolvedValueOnce(byRoleData);

    const res = await request(app).get('/api/analytics/spending');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ byCycle: byCycleData, byRole: byRoleData });

    // Verify both aggregations were called
    expect(mockAgentRunAggregate).toHaveBeenCalledTimes(2);
  });

  it('returns 200 with empty arrays when no AgentRun documents exist', async () => {
    mockAgentRunAggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/analytics/spending');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ byCycle: [], byRole: [] });
  });

  it('byCycle entries have cycleId, totalCostUsd, and runCount fields', async () => {
    const byCycleData = [{ cycleId: 3, totalCostUsd: 2.5, runCount: 7 }];
    mockAgentRunAggregate.mockResolvedValueOnce(byCycleData).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/analytics/spending');

    expect(res.status).toBe(200);
    const entry = res.body.byCycle[0] as {
      cycleId: number;
      totalCostUsd: number;
      runCount: number;
    };
    expect(typeof entry.cycleId).toBe('number');
    expect(typeof entry.totalCostUsd).toBe('number');
    expect(typeof entry.runCount).toBe('number');
  });

  it('byRole entries have role, totalCostUsd, and runCount fields', async () => {
    const byRoleData = [{ role: 'orchestrator', totalCostUsd: 0.45, runCount: 1 }];
    mockAgentRunAggregate.mockResolvedValueOnce([]).mockResolvedValueOnce(byRoleData);

    const res = await request(app).get('/api/analytics/spending');

    expect(res.status).toBe(200);
    const entry = res.body.byRole[0] as { role: string; totalCostUsd: number; runCount: number };
    expect(typeof entry.role).toBe('string');
    expect(typeof entry.totalCostUsd).toBe('number');
    expect(typeof entry.runCount).toBe('number');
  });
});

describe('GET /api/analytics/review-quality', () => {
  // Build a chainable mock: find().sort().limit().lean()
  function buildFindChain(resolvedValue: unknown[]) {
    const lean = vi.fn().mockResolvedValue(resolvedValue);
    const limit = vi.fn(() => ({ lean }));
    const sort = vi.fn(() => ({ limit }));
    mockCycleFind.mockReturnValue({ sort });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns 200 with an array containing cycleId, tasksRetried, tasksPassedFirstReview, and retryRate', async () => {
    buildFindChain([
      { _id: 5, metrics: { tasksRetried: 2, tasksPassedFirstReview: 3 } },
      { _id: 4, metrics: { tasksRetried: 1, tasksPassedFirstReview: 4 } },
    ]);

    const res = await request(app).get('/api/analytics/review-quality');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const first = res.body[0] as {
      cycleId: number;
      tasksRetried: number;
      tasksPassedFirstReview: number;
      retryRate: number;
    };
    expect(first.cycleId).toBe(5);
    expect(first.tasksRetried).toBe(2);
    expect(first.tasksPassedFirstReview).toBe(3);
    // retryRate = 2 / (2+3) = 0.4
    expect(first.retryRate).toBe(0.4);
  });

  it('returns null for numeric fields when cycle has no tasksRetried metric', async () => {
    buildFindChain([
      { _id: 10, metrics: { tasksCompleted: 5, tasksFailed: 0 } },
      { _id: 9, metrics: undefined },
    ]);

    const res = await request(app).get('/api/analytics/review-quality');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const first = res.body[0] as {
      cycleId: number;
      tasksRetried: null;
      tasksPassedFirstReview: null;
      retryRate: null;
    };
    expect(first.cycleId).toBe(10);
    expect(first.tasksRetried).toBeNull();
    expect(first.tasksPassedFirstReview).toBeNull();
    expect(first.retryRate).toBeNull();

    const second = res.body[1] as { tasksRetried: null };
    expect(second.tasksRetried).toBeNull();
  });

  it('retryRate defaults to 0 when tasksRetried and tasksPassedFirstReview are both 0', async () => {
    buildFindChain([{ _id: 3, metrics: { tasksRetried: 0, tasksPassedFirstReview: 0 } }]);

    const res = await request(app).get('/api/analytics/review-quality');

    expect(res.status).toBe(200);
    const entry = res.body[0] as { retryRate: number };
    expect(entry.retryRate).toBe(0);
  });

  it('returns an empty array when no completed cycles exist', async () => {
    buildFindChain([]);

    const res = await request(app).get('/api/analytics/review-quality');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('retryRate is rounded to 2 decimal places', async () => {
    // 1 / (1+3) = 0.25
    buildFindChain([{ _id: 7, metrics: { tasksRetried: 1, tasksPassedFirstReview: 3 } }]);

    const res = await request(app).get('/api/analytics/review-quality');

    expect(res.status).toBe(200);
    const entry = res.body[0] as { retryRate: number };
    expect(entry.retryRate).toBe(0.25);
  });
});
