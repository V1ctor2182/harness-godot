import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Hoist mock factories for JobModel methods.
// readyStateBox starts at 0 so mongoose buffers model operations during module
// init rather than eagerly calling connection.collection() (which fails without
// a real MongoDB URL).
const { readyStateBox, mockJobFind, mockJobFindById } = vi.hoisted(() => ({
  readyStateBox: { value: 0 as number },
  mockJobFind: vi.fn(),
  mockJobFindById: vi.fn(),
}));

vi.mock('../../src/models/job.js', () => ({
  JobModel: {
    find: mockJobFind,
    findById: mockJobFindById,
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

// Helper to create a mock Mongoose document (supports .save())
function makeJobDoc(fields: Record<string, unknown>) {
  return { ...fields, save: vi.fn().mockResolvedValue(undefined) };
}

describe('GET /api/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns 200 with a list of jobs', async () => {
    const jobs = [{ _id: 'job-1', type: 'spawn', status: 'pending' }];
    mockJobFind.mockReturnValue(makeQuery(jobs));

    const res = await request(app).get('/api/jobs');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(jobs);
    expect(mockJobFind).toHaveBeenCalledWith({});
  });

  it('filters by status query param', async () => {
    mockJobFind.mockReturnValue(makeQuery([]));

    await request(app).get('/api/jobs?status=pending');

    expect(mockJobFind).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('filters by type query param', async () => {
    mockJobFind.mockReturnValue(makeQuery([]));

    await request(app).get('/api/jobs?type=spawn');

    expect(mockJobFind).toHaveBeenCalledWith({ type: 'spawn' });
  });
});

describe('POST /api/jobs/:id/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('approves a pending-approval job and returns 200', async () => {
    const job = makeJobDoc({
      _id: 'job-1',
      requiresApproval: true,
      approvalStatus: 'pending',
    });
    mockJobFindById.mockResolvedValue(job);

    const res = await request(app).post('/api/jobs/job-1/approve').send({});

    expect(res.status).toBe(200);
    expect(job.save).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((job as any).approvalStatus).toBe('approved');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((job as any).approvedBy).toBe('human');
  });

  it('returns 404 when job is not found', async () => {
    mockJobFindById.mockResolvedValue(null);

    const res = await request(app).post('/api/jobs/nonexistent/approve').send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 when job does not require approval', async () => {
    const job = makeJobDoc({
      _id: 'job-1',
      requiresApproval: false,
      approvalStatus: 'pending',
    });
    mockJobFindById.mockResolvedValue(job);

    const res = await request(app).post('/api/jobs/job-1/approve').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not require approval/i);
  });

  it('returns 400 when job has already been approved', async () => {
    const job = makeJobDoc({
      _id: 'job-1',
      requiresApproval: true,
      approvalStatus: 'approved',
    });
    mockJobFindById.mockResolvedValue(job);

    const res = await request(app).post('/api/jobs/job-1/approve').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already/i);
  });
});

describe('POST /api/jobs/:id/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('rejects a pending-approval job and returns 200', async () => {
    const job = makeJobDoc({
      _id: 'job-1',
      requiresApproval: true,
      approvalStatus: 'pending',
    });
    mockJobFindById.mockResolvedValue(job);

    const res = await request(app).post('/api/jobs/job-1/reject').send({ reason: 'bad code' });

    expect(res.status).toBe(200);
    expect(job.save).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((job as any).approvalStatus).toBe('rejected');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((job as any).status).toBe('failed');
  });

  it('returns 404 when job is not found', async () => {
    mockJobFindById.mockResolvedValue(null);

    const res = await request(app).post('/api/jobs/nonexistent/reject').send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 when job approval status is not pending', async () => {
    const job = makeJobDoc({
      _id: 'job-1',
      requiresApproval: true,
      approvalStatus: 'rejected',
    });
    mockJobFindById.mockResolvedValue(job);

    const res = await request(app).post('/api/jobs/job-1/reject').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already/i);
  });
});
