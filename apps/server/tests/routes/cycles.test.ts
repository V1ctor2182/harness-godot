import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Hoist mock factories before vi.mock() calls
const {
  readyStateBox,
  mockFind,
  mockFindOne,
  mockFindById,
  mockFindByIdAndUpdate,
  mockCreate,
  mockGetNextCycleId,
  mockCreateJob,
} = vi.hoisted(() => ({
  readyStateBox: { value: 0 as number },
  mockFind: vi.fn(),
  mockFindOne: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByIdAndUpdate: vi.fn(),
  mockCreate: vi.fn(),
  mockGetNextCycleId: vi.fn(),
  mockCreateJob: vi.fn(),
}));

// Mock CycleModel
vi.mock('../../src/models/cycle.js', () => ({
  CycleModel: {
    find: mockFind,
    findOne: mockFindOne,
    findById: mockFindById,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    create: mockCreate,
  },
}));

// Mock counter
vi.mock('../../src/models/counter.js', () => ({
  getNextCycleId: mockGetNextCycleId,
}));

// Mock job queue
vi.mock('../../src/services/job-queue.js', () => ({
  createJob: mockCreateJob,
}));

// Mock mongoose — proxy readyState so health check doesn't fail
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

// Mock docker — needed by health route loaded via app.ts
vi.mock('../../src/lib/docker.js', () => ({
  isDockerAvailable: vi.fn().mockResolvedValue(true),
}));

// Mock SSE manager — needed by tasks route loaded via app.ts
vi.mock('../../src/services/sse-manager.js', () => ({
  broadcast: vi.fn(),
  initSSE: vi.fn(),
  stopSSE: vi.fn(),
  addClient: vi.fn(),
}));

// Mock AgentRunModel — needed by status route loaded via app.ts
vi.mock('../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

// Import app after mocks are set up
import { app } from '../../src/app.js';

const fakeCycle = {
  _id: 1,
  goal: 'Test goal',
  phase: 'plan',
  status: 'active',
  startedAt: new Date().toISOString(),
};

describe('GET /api/cycles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns list of cycles', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([fakeCycle]) }),
    });

    const res = await request(app).get('/api/cycles');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]._id).toBe(1);
    expect(mockFind).toHaveBeenCalledWith();
  });

  it('returns empty list when no cycles exist', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    });

    const res = await request(app).get('/api/cycles');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 when DB throws', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB failure')) }),
    });

    const res = await request(app).get('/api/cycles');

    expect(res.status).toBe(500);
  });
});

describe('GET /api/cycles/active', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns the active cycle when one exists', async () => {
    mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(fakeCycle) });

    const res = await request(app).get('/api/cycles/active');

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(1);
    expect(res.body.status).toBe('active');
    expect(mockFindOne).toHaveBeenCalledWith({ status: 'active' });
  });

  it('returns 404 when no active cycle exists', async () => {
    mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await request(app).get('/api/cycles/active');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/cycles/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns a single cycle by id', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(fakeCycle) });

    const res = await request(app).get('/api/cycles/1');

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(1);
    expect(mockFindById).toHaveBeenCalledWith(1);
  });

  it('returns 404 when cycle not found', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await request(app).get('/api/cycles/999');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/cycles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
    mockGetNextCycleId.mockResolvedValue(42);
    mockCreateJob.mockResolvedValue(undefined);
    mockCreate.mockResolvedValue(fakeCycle);
  });

  it('creates a cycle and returns 201', async () => {
    const res = await request(app).post('/api/cycles').send({ goal: 'Build something great' });

    expect(res.status).toBe(201);
    expect(mockGetNextCycleId).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      _id: 42,
      goal: 'Build something great',
      phase: 'plan',
      status: 'active',
    });
  });

  it('spawns an orchestrator job after creation', async () => {
    await request(app).post('/api/cycles').send({ goal: 'Build something great' });

    expect(mockCreateJob).toHaveBeenCalledWith('spawn', 'agent', {
      role: 'orchestrator',
      cycleId: 42,
    });
  });

  it('returns 400 when goal is missing', async () => {
    const res = await request(app).post('/api/cycles').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('goal is required');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 500 when DB create fails', async () => {
    mockCreate.mockRejectedValue(new Error('DB failure'));

    const res = await request(app).post('/api/cycles').send({ goal: 'Test' });

    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/cycles/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('updates and returns the cycle', async () => {
    const updated = { ...fakeCycle, phase: 'implement' };
    mockFindByIdAndUpdate.mockResolvedValue(updated);

    const res = await request(app).patch('/api/cycles/1').send({ phase: 'implement' });

    expect(res.status).toBe(200);
    expect(res.body.phase).toBe('implement');
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      1,
      { $set: { phase: 'implement' } },
      { new: true }
    );
  });

  it('returns 404 when cycle not found', async () => {
    mockFindByIdAndUpdate.mockResolvedValue(null);

    const res = await request(app).patch('/api/cycles/999').send({ phase: 'implement' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
