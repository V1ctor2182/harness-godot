import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Hoist mock factories before vi.mock() calls
const {
  readyStateBox,
  mockFind,
  mockFindById,
  mockFindByIdAndUpdate,
  mockBroadcast,
  mockCreateJob,
} = vi.hoisted(() => ({
  readyStateBox: { value: 0 as number },
  mockFind: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByIdAndUpdate: vi.fn(),
  mockBroadcast: vi.fn(),
  mockCreateJob: vi.fn(),
}));

// Mock TaskModel
vi.mock('../../src/models/task.js', () => ({
  TaskModel: {
    find: mockFind,
    findById: mockFindById,
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}));

// Mock SSE manager
vi.mock('../../src/services/sse-manager.js', () => ({
  broadcast: mockBroadcast,
  initSSE: vi.fn(),
  stopSSE: vi.fn(),
  addClient: vi.fn(),
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

// Mock models needed by other routes loaded via app.ts
vi.mock('../../src/models/cycle.js', () => ({
  CycleModel: {
    find: vi
      .fn()
      .mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }),
    findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  },
}));

vi.mock('../../src/models/counter.js', () => ({
  getNextCycleId: vi.fn(),
}));

vi.mock('../../src/services/job-queue.js', () => ({
  createJob: mockCreateJob,
}));

vi.mock('../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

// Import app after mocks are set up
import { app } from '../../src/app.js';

const fakeTask = {
  _id: 'TASK-001',
  title: 'Implement login',
  description: 'Add user login flow',
  status: 'ready',
  priority: 'high',
  type: 'feature',
  cycleId: 1,
  createdBy: 'orchestrator',
  blockedBy: [],
  acceptanceCriteria: [],
};

describe('GET /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns list of all tasks with no filter', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([fakeTask]) }),
    });

    const res = await request(app).get('/api/tasks');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(mockFind).toHaveBeenCalledWith({});
  });

  it('filters by cycleId when provided', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([fakeTask]) }),
    });

    const res = await request(app).get('/api/tasks?cycleId=1');

    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({ cycleId: 1 });
  });

  it('filters by status when provided', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([fakeTask]) }),
    });

    const res = await request(app).get('/api/tasks?status=ready');

    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({ status: 'ready' });
  });

  it('applies both cycleId and status filters together', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([fakeTask]) }),
    });

    const res = await request(app).get('/api/tasks?cycleId=2&status=in-progress');

    expect(res.status).toBe(200);
    expect(mockFind).toHaveBeenCalledWith({ cycleId: 2, status: 'in-progress' });
  });
});

describe('GET /api/tasks/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns a single task by id', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(fakeTask) });

    const res = await request(app).get('/api/tasks/TASK-001');

    expect(res.status).toBe(200);
    expect(res.body._id).toBe('TASK-001');
    expect(mockFindById).toHaveBeenCalledWith('TASK-001');
  });

  it('returns 404 when task not found', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await request(app).get('/api/tasks/TASK-999');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/tasks/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('updates and returns the task', async () => {
    const updated = { ...fakeTask, status: 'in-progress' };
    mockFindByIdAndUpdate.mockResolvedValue(updated);

    const res = await request(app).patch('/api/tasks/TASK-001').send({ status: 'in-progress' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in-progress');
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'TASK-001',
      {
        $set: { status: 'in-progress' },
        $push: {
          activityLog: expect.objectContaining({ action: 'Status changed to in-progress' }),
        },
      },
      { new: true }
    );
  });

  it('broadcasts task:status_changed SSE event when status is updated', async () => {
    const updated = { ...fakeTask, status: 'done' };
    mockFindByIdAndUpdate.mockResolvedValue(updated);

    await request(app).patch('/api/tasks/TASK-001').send({ status: 'done' });

    expect(mockBroadcast).toHaveBeenCalledWith('task:status_changed', {
      taskId: 'TASK-001',
      status: 'done',
    });
  });

  it('does not broadcast SSE when status is not in the update body', async () => {
    const updated = { ...fakeTask, priority: 'critical' };
    mockFindByIdAndUpdate.mockResolvedValue(updated);

    await request(app).patch('/api/tasks/TASK-001').send({ priority: 'critical' });

    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('returns 404 when task not found', async () => {
    mockFindByIdAndUpdate.mockResolvedValue(null);

    const res = await request(app).patch('/api/tasks/TASK-999').send({ status: 'done' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/tasks/:id/retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('retries a failed task: resets to backlog, creates spawn job, broadcasts SSE', async () => {
    const failedTask = { ...fakeTask, status: 'failed', cycleId: 3, retryCount: 0 };
    const updatedTask = { ...failedTask, status: 'backlog', retryCount: 1 };

    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(failedTask) });
    mockFindByIdAndUpdate.mockResolvedValue(updatedTask);
    mockCreateJob.mockResolvedValue(undefined);

    const res = await request(app).post('/api/tasks/TASK-001/retry');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('backlog');
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'TASK-001',
      {
        $set: { status: 'backlog' },
        $inc: { retryCount: 1 },
        $push: { activityLog: expect.objectContaining({ action: 'Retried manually' }) },
      },
      { new: true }
    );
    expect(mockCreateJob).toHaveBeenCalledWith('spawn', 'agent', {
      role: 'coder',
      taskId: 'TASK-001',
      cycleId: 3,
    });
    expect(mockBroadcast).toHaveBeenCalledWith('task:status_changed', {
      taskId: 'TASK-001',
      status: 'backlog',
    });
  });

  it('returns 404 when task does not exist', async () => {
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await request(app).post('/api/tasks/TASK-999/retry');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(mockCreateJob).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('returns 400 when task status is not failed', async () => {
    const doneTask = { ...fakeTask, status: 'done', cycleId: 3 };
    mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(doneTask) });

    const res = await request(app).post('/api/tasks/TASK-001/retry');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockCreateJob).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
