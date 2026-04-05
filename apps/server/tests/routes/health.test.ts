import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mutable box so we can change readyState between tests from inside the mock
const { readyStateBox, mockIsDockerAvailable } = vi.hoisted(() => ({
  // Start disconnected so mongoose buffers model operations during module
  // init rather than eagerly calling connection.collection() (which would
  // fail because connection.db is undefined without a real MongoDB URL).
  readyStateBox: { value: 0 as number },
  mockIsDockerAvailable: vi.fn<() => Promise<boolean>>(),
}));

// Partially mock mongoose: keep all real exports/behaviour, but proxy the
// default export so that `mongoose.connection.readyState` returns our
// controlled value. Everything else (Schema, model, connection.collection…)
// delegates to the real mongoose instance so model registration still works.
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();

  // Proxy the Connection object — override readyState, delegate everything else
  const connectionProxy = new Proxy(actual.default.connection, {
    get(target, prop) {
      if (prop === 'readyState') return readyStateBox.value;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (target as any)[prop];
    },
  });

  // Proxy the Mongoose default export — override connection, delegate the rest
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
  isDockerAvailable: mockIsDockerAvailable,
}));

// Import app after mocks are set up
import { app } from '../../src/app.js';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
    mockIsDockerAvailable.mockResolvedValue(true);
  });

  it('returns 200 when MongoDB and Docker are connected', async () => {
    readyStateBox.value = 1;
    mockIsDockerAvailable.mockResolvedValue(true);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('connected');
    expect(res.body.checks.docker).toBe('connected');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('returns 503 when MongoDB is disconnected and Docker is connected', async () => {
    readyStateBox.value = 0;
    mockIsDockerAvailable.mockResolvedValue(true);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database).toBe('disconnected');
  });

  it('returns 503 when MongoDB is connected and Docker is disconnected', async () => {
    readyStateBox.value = 1;
    mockIsDockerAvailable.mockResolvedValue(false);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.docker).toBe('disconnected');
  });

  it('returns 503 when both MongoDB and Docker are disconnected', async () => {
    readyStateBox.value = 0;
    mockIsDockerAvailable.mockResolvedValue(false);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
  });
});
