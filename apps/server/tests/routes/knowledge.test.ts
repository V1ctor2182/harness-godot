import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Hoist mock factories for KnowledgeFileModel methods.
// readyStateBox starts at 0 so mongoose buffers model operations during module
// init rather than eagerly calling connection.collection() (which fails without
// a real MongoDB URL).
const {
  readyStateBox,
  mockKnowledgeFind,
  mockKnowledgeFindById,
  mockKnowledgeCreate,
  mockKnowledgeFindByIdAndUpdate,
  mockKnowledgeFindByIdAndDelete,
} = vi.hoisted(() => ({
  readyStateBox: { value: 0 as number },
  mockKnowledgeFind: vi.fn(),
  mockKnowledgeFindById: vi.fn(),
  mockKnowledgeCreate: vi.fn(),
  mockKnowledgeFindByIdAndUpdate: vi.fn(),
  mockKnowledgeFindByIdAndDelete: vi.fn(),
}));

vi.mock('../../src/models/knowledge-file.js', () => ({
  KnowledgeFileModel: {
    find: mockKnowledgeFind,
    findById: mockKnowledgeFindById,
    create: mockKnowledgeCreate,
    findByIdAndUpdate: mockKnowledgeFindByIdAndUpdate,
    findByIdAndDelete: mockKnowledgeFindByIdAndDelete,
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

// Helper to create a chainable query mock (find → sort → limit? → lean)
function makeQuery(result: unknown) {
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

describe('GET /api/knowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns 200 with a list of knowledge files', async () => {
    const files = [{ _id: 'specs/boot.md', title: 'Boot', category: 'specs' }];
    mockKnowledgeFind.mockReturnValue(makeQuery(files));

    const res = await request(app).get('/api/knowledge');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(files);
    expect(mockKnowledgeFind).toHaveBeenCalledWith({});
  });

  it('filters by category query param', async () => {
    mockKnowledgeFind.mockReturnValue(makeQuery([]));

    await request(app).get('/api/knowledge?category=inbox');

    expect(mockKnowledgeFind).toHaveBeenCalledWith({ category: 'inbox' });
  });

  it('filters by status query param', async () => {
    mockKnowledgeFind.mockReturnValue(makeQuery([]));

    await request(app).get('/api/knowledge?status=active');

    expect(mockKnowledgeFind).toHaveBeenCalledWith({ status: 'active' });
  });

  it('applies limit when limit query param is provided', async () => {
    const files = Array.from({ length: 3 }, (_, i) => ({
      _id: `specs/file-${i}.md`,
      title: `File ${i}`,
      category: 'specs',
    }));
    const q = makeQuery(files);
    mockKnowledgeFind.mockReturnValue(q);

    const res = await request(app).get('/api/knowledge?limit=5');

    expect(res.status).toBe(200);
    expect(q.limit).toHaveBeenCalledWith(5);
  });

  it('returns results sorted ascending when sortOrder=asc', async () => {
    const files = [
      { _id: 'specs/low.md', qualityScore: -1 },
      { _id: 'specs/high.md', qualityScore: 5 },
    ];
    const q = makeQuery(files);
    mockKnowledgeFind.mockReturnValue(q);

    const res = await request(app).get('/api/knowledge?sortOrder=asc');

    expect(res.status).toBe(200);
    expect(q.sort).toHaveBeenCalledWith({ qualityScore: 1 });
  });

  it('defaults to descending sort when sortOrder is not specified', async () => {
    const q = makeQuery([]);
    mockKnowledgeFind.mockReturnValue(q);

    await request(app).get('/api/knowledge');

    expect(q.sort).toHaveBeenCalledWith({ qualityScore: -1 });
  });
});

describe('POST /api/knowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('creates a new knowledge file and returns 201', async () => {
    const newFile = {
      _id: 'specs/my-topic',
      category: 'specs',
      title: 'My Topic',
      snippet: 'Some content here',
      content: 'Some content here',
      source: { type: 'agent' },
    };
    const created = { ...newFile, qualityScore: 0, status: 'active' };
    mockKnowledgeCreate.mockResolvedValue(created);

    const res = await request(app).post('/api/knowledge').send(newFile);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(mockKnowledgeCreate).toHaveBeenCalled();
  });

  it('auto-derives snippet from content when snippet is omitted', async () => {
    const body = {
      _id: 'specs/no-snippet',
      category: 'specs',
      title: 'No Snippet',
      content: '# Heading\nSome content here that is long enough to derive a snippet from.',
    };
    const created = {
      ...body,
      snippet: 'Some content here that is long enough to derive a snippet from.',
      status: 'active',
    };
    mockKnowledgeCreate.mockResolvedValue(created);

    const res = await request(app).post('/api/knowledge').send(body);

    expect(res.status).toBe(201);
    // Verify create was called with a non-empty snippet derived from content
    const callArg = mockKnowledgeCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof callArg.snippet).toBe('string');
    expect((callArg.snippet as string).length).toBeGreaterThan(0);
  });

  it('auto-derives _id when _id is omitted', async () => {
    const body = {
      category: 'skills',
      title: 'My New Skill',
      content: 'Content of the skill.',
    };
    const created = {
      ...body,
      _id: 'skills/my-new-skill-1234567890.md',
      snippet: 'Content of the skill.',
      status: 'active',
    };
    mockKnowledgeCreate.mockResolvedValue(created);

    const res = await request(app).post('/api/knowledge').send(body);

    expect(res.status).toBe(201);
    const callArg = mockKnowledgeCreate.mock.calls[0][0] as Record<string, unknown>;
    const derivedId = callArg._id as string;
    // ID should match {category}/{slug}-{timestamp}.md format
    expect(derivedId).toMatch(/^skills\/my-new-skill-\d+\.md$/);
  });

  it('uses provided _id when _id is present in the request', async () => {
    const body = {
      _id: 'skills/explicit-id.md',
      category: 'skills',
      title: 'Explicit ID Skill',
      content: 'Content here.',
    };
    const created = { ...body, snippet: 'Content here.', status: 'active' };
    mockKnowledgeCreate.mockResolvedValue(created);

    const res = await request(app).post('/api/knowledge').send(body);

    expect(res.status).toBe(201);
    const callArg = mockKnowledgeCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg._id).toBe('skills/explicit-id.md');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/knowledge').send({ title: 'No category or content' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation failed/i);
  });

  it('returns 400 when category is invalid', async () => {
    const res = await request(app).post('/api/knowledge').send({
      _id: 'specs/bad',
      title: 'Bad',
      content: 'x',
      category: 'invalid-category',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation failed/i);
  });

  it('accepts retrospectives as a valid category', async () => {
    const body = {
      _id: 'retrospectives/cycle-16',
      category: 'retrospectives',
      title: 'Cycle 16 Retrospective',
      content: 'This cycle we improved the knowledge API.',
      snippet: 'Cycle 16 retrospective',
    };
    const created = { ...body, status: 'active' };
    mockKnowledgeCreate.mockResolvedValue(created);

    const res = await request(app).post('/api/knowledge').send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });
});

describe('PATCH /api/knowledge/by-id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('updates status of a knowledge file', async () => {
    const updated = { _id: 'inbox/123', status: 'processed' };
    mockKnowledgeFindByIdAndUpdate.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/knowledge/by-id?id=inbox/123')
      .send({ status: 'processed' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(mockKnowledgeFindByIdAndUpdate).toHaveBeenCalledWith(
      'inbox/123',
      expect.objectContaining({ $set: expect.objectContaining({ status: 'processed' }) }),
      { new: true }
    );
  });

  it('returns 400 when id query param is missing', async () => {
    const res = await request(app).patch('/api/knowledge/by-id').send({ status: 'archived' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id query param required/i);
  });

  it('returns 400 when status is invalid', async () => {
    const res = await request(app)
      .patch('/api/knowledge/by-id?id=inbox/123')
      .send({ status: 'unknown-status' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation failed/i);
  });

  it('returns 404 when knowledge file is not found', async () => {
    mockKnowledgeFindByIdAndUpdate.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/knowledge/by-id?id=specs/missing')
      .send({ status: 'archived' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('updates content of a knowledge file', async () => {
    const updated = { _id: 'specs/my-topic', content: 'Updated content' };
    mockKnowledgeFindByIdAndUpdate.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/knowledge/by-id?id=specs/my-topic')
      .send({ content: 'Updated content' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(mockKnowledgeFindByIdAndUpdate).toHaveBeenCalledWith(
      'specs/my-topic',
      expect.objectContaining({ $set: expect.objectContaining({ content: 'Updated content' }) }),
      { new: true }
    );
  });

  it('updates title and snippet of a knowledge file', async () => {
    const updated = { _id: 'specs/my-topic', title: 'New Title', snippet: 'New snippet' };
    mockKnowledgeFindByIdAndUpdate.mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/knowledge/by-id?id=specs/my-topic')
      .send({ title: 'New Title', snippet: 'New snippet' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(mockKnowledgeFindByIdAndUpdate).toHaveBeenCalledWith(
      'specs/my-topic',
      expect.objectContaining({
        $set: expect.objectContaining({ title: 'New Title', snippet: 'New snippet' }),
      }),
      { new: true }
    );
  });
});

describe('DELETE /api/knowledge/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readyStateBox.value = 1;
  });

  it('returns 204 when the knowledge file is successfully deleted', async () => {
    const existing = { _id: 'specs/to-delete', title: 'To Delete', category: 'specs' };
    mockKnowledgeFindByIdAndDelete.mockResolvedValue(existing);

    const res = await request(app).delete('/api/knowledge/specs%2Fto-delete');

    expect(res.status).toBe(204);
    expect(mockKnowledgeFindByIdAndDelete).toHaveBeenCalledWith('specs/to-delete');
  });

  it('returns 404 when the knowledge file does not exist', async () => {
    mockKnowledgeFindByIdAndDelete.mockResolvedValue(null);

    const res = await request(app).delete('/api/knowledge/specs%2Fmissing');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // Regression test: IDs containing literal slashes (e.g. skills/foo.md) must be
  // handled correctly. The /:id route only captures a single path segment and would
  // return 404; the wildcard route fixes this.
  it('returns 204 when deleting a document whose ID contains a literal slash', async () => {
    const existing = { _id: 'skills/some-file.md', title: 'Some File', category: 'skills' };
    mockKnowledgeFindByIdAndDelete.mockResolvedValue(existing);

    const res = await request(app).delete('/api/knowledge/skills/some-file.md');

    expect(res.status).toBe(204);
    expect(mockKnowledgeFindByIdAndDelete).toHaveBeenCalledWith('skills/some-file.md');
  });

  it('returns 404 for a slash-containing ID when the document does not exist', async () => {
    mockKnowledgeFindByIdAndDelete.mockResolvedValue(null);

    const res = await request(app).delete('/api/knowledge/decisions/missing-decision.md');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
