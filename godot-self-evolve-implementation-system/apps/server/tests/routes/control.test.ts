import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Hoist mock factories.
// readyStateBox starts at 0 so mongoose buffers model operations during module
// init rather than eagerly calling connection.collection() (which fails without
// a real MongoDB URL).
const {
  readyStateBox,
  mockGetOrCreateControl,
  mockControlFindByIdAndUpdate,
  mockAgentRunFind,
  mockAgentRunUpdateOne,
  mockKillContainer,
} = vi.hoisted(() => ({
  readyStateBox: { value: 0 as number },
  mockGetOrCreateControl: vi.fn(),
  mockControlFindByIdAndUpdate: vi.fn(),
  mockAgentRunFind: vi.fn(),
  mockAgentRunUpdateOne: vi.fn(),
  mockKillContainer: vi.fn(),
}));

vi.mock('../../src/models/control.js', () => ({
  getOrCreateControl: mockGetOrCreateControl,
  ControlModel: {
    findByIdAndUpdate: mockControlFindByIdAndUpdate,
  },
}));

vi.mock('../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    find: mockAgentRunFind,
    updateOne: mockAgentRunUpdateOne,
  },
}));

vi.mock('../../src/services/launcher/container.js', () => ({
  killContainer: mockKillContainer,
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

const defaultControl = {
  _id: 'singleton',
  mode: 'active',
  spendingCapUsd: 5,
  spentUsd: 0,
  autoApprovalCategories: ['feature', 'bug', 'test'],
};

describe('GET /api/control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns 200 with the singleton control document', async () => {
    mockGetOrCreateControl.mockResolvedValue(defaultControl);

    const res = await request(app).get('/api/control');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(defaultControl);
    expect(mockGetOrCreateControl).toHaveBeenCalled();
  });
});

describe('PATCH /api/control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
    mockGetOrCreateControl.mockResolvedValue(defaultControl);
  });

  it('updates mode and returns 200', async () => {
    const updated = { ...defaultControl, mode: 'paused' };
    mockControlFindByIdAndUpdate.mockResolvedValue(updated);

    const res = await request(app).patch('/api/control').send({ mode: 'paused' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('paused');
    expect(mockControlFindByIdAndUpdate).toHaveBeenCalledWith(
      'singleton',
      expect.objectContaining({ $set: expect.objectContaining({ mode: 'paused' }) }),
      { new: true }
    );
  });

  it('updates spendingCapUsd', async () => {
    const updated = { ...defaultControl, spendingCapUsd: 10 };
    mockControlFindByIdAndUpdate.mockResolvedValue(updated);

    const res = await request(app).patch('/api/control').send({ spendingCapUsd: 10 });

    expect(res.status).toBe(200);
    expect(mockControlFindByIdAndUpdate).toHaveBeenCalledWith(
      'singleton',
      expect.objectContaining({ $set: expect.objectContaining({ spendingCapUsd: 10 }) }),
      { new: true }
    );
  });

  it('returns 400 when mode enum is invalid', async () => {
    const res = await request(app).patch('/api/control').send({ mode: 'zombie' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation failed/i);
  });

  it('kills running agent containers when mode is set to killed', async () => {
    const runningAgents = [
      { _id: 'run-1', containerId: 'container-abc' },
      { _id: 'run-2', containerId: 'container-def' },
    ];
    const updated = { ...defaultControl, mode: 'killed' };
    mockControlFindByIdAndUpdate.mockResolvedValue(updated);
    mockAgentRunFind.mockReturnValue({ lean: vi.fn().mockResolvedValue(runningAgents) });
    mockKillContainer.mockResolvedValue(undefined);
    mockAgentRunUpdateOne.mockResolvedValue({});

    const res = await request(app).patch('/api/control').send({ mode: 'killed' });

    expect(res.status).toBe(200);
    expect(mockKillContainer).toHaveBeenCalledTimes(2);
    expect(mockKillContainer).toHaveBeenCalledWith('container-abc');
    expect(mockKillContainer).toHaveBeenCalledWith('container-def');
    expect(mockAgentRunUpdateOne).toHaveBeenCalledTimes(2);
  });

  it('updates humanMessage field', async () => {
    const updated = { ...defaultControl, humanMessage: 'Please pause after this cycle' };
    mockControlFindByIdAndUpdate.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/control')
      .send({ humanMessage: 'Please pause after this cycle' });

    expect(res.status).toBe(200);
    expect(mockControlFindByIdAndUpdate).toHaveBeenCalledWith(
      'singleton',
      expect.objectContaining({
        $set: expect.objectContaining({ humanMessage: 'Please pause after this cycle' }),
      }),
      { new: true }
    );
  });
});
