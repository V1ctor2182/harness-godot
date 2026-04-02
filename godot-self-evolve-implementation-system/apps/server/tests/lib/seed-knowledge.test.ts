/**
 * Unit tests for seed-knowledge.ts
 *
 * Tests cover:
 *   - extractTitle: normal heading, no heading, blank lines before heading
 *   - extractSnippet: normal content, short content, long content (truncation), headings-only
 *   - seedKnowledge: CATEGORY_MAP lookup, default category fallback, id construction,
 *                    insert of new files, unchanged files (skipped), updated files (content changed),
 *                    preservation of qualityScore/lastReferencedAt on update
 *
 * fs/promises and KnowledgeFileModel are fully mocked — no disk I/O or DB connections made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockReaddir = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockUpdateOne = vi.hoisted(() => vi.fn());
const mockFindOne = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: mockReaddir,
    readFile: mockReadFile,
  },
}));

vi.mock('../../src/models/knowledge-file.js', () => ({
  KnowledgeFileModel: {
    updateOne: mockUpdateOne,
    findOne: mockFindOne,
  },
}));

// ─── Import functions under test (after mocks) ────────────────────────────────

import { extractTitle, extractSnippet, seedKnowledge } from '../../src/lib/seed-knowledge.js';

// ─── extractTitle tests ───────────────────────────────────────────────────────

describe('extractTitle', () => {
  it('returns the text of the first # heading', () => {
    const content = '# My Title\n\nSome paragraph text here.';
    expect(extractTitle(content)).toBe('My Title');
  });

  it('returns empty string when there is no # heading', () => {
    const content = 'No heading here\nJust plain text\n## Not a top-level heading';
    expect(extractTitle(content)).toBe('');
  });

  it('finds the heading even with leading blank lines before it', () => {
    const content = '\n\n\n# Title After Blanks\n\nBody text.';
    expect(extractTitle(content)).toBe('Title After Blanks');
  });

  it('strips extra whitespace around the heading text', () => {
    const content = '#   Padded Title   \n\nParagraph.';
    expect(extractTitle(content)).toBe('Padded Title');
  });

  it('ignores ## sub-headings and returns the first # heading', () => {
    const content = '## Sub Heading\n# Real Title\n\nParagraph.';
    // '## Sub Heading' does not start with '# ' (single hash + space),
    // so it is skipped; '# Real Title' is the first top-level heading
    expect(extractTitle(content)).toBe('Real Title');
  });
});

// ─── extractSnippet tests ─────────────────────────────────────────────────────

describe('extractSnippet', () => {
  it('returns the first paragraph line after the title heading', () => {
    const content = '# My Title\n\nThis is the first paragraph.';
    expect(extractSnippet(content)).toBe('This is the first paragraph.');
  });

  it('returns the full line when content is shorter than 150 chars', () => {
    const shortLine = 'Short content.';
    const content = `# Title\n\n${shortLine}`;
    expect(extractSnippet(content)).toBe(shortLine);
  });

  it('truncates to 150 characters when content exceeds that length', () => {
    const longLine = 'A'.repeat(200);
    const content = `# Title\n\n${longLine}`;
    const result = extractSnippet(content);
    expect(result).toHaveLength(150);
    expect(result).toBe('A'.repeat(150));
  });

  it('returns empty string when there are only headings and no paragraphs', () => {
    const content = '# Title\n\n## Sub Heading\n\n### Another Heading';
    expect(extractSnippet(content)).toBe('');
  });

  it('skips sub-headings and empty lines to find first real paragraph', () => {
    const content = '# Title\n\n## Section\n\nActual paragraph text here.';
    expect(extractSnippet(content)).toBe('Actual paragraph text here.');
  });

  it('returns empty string when there is no # heading at all', () => {
    const content = 'Just plain text with no heading.';
    expect(extractSnippet(content)).toBe('');
  });
});

// ─── seedKnowledge tests ──────────────────────────────────────────────────────

describe('seedKnowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Retrospective pattern matching ──────────────────────────────────────────

  it('maps cycle-*-retrospective.md filenames to the "retrospectives" category', async () => {
    mockReaddir.mockResolvedValue(['cycle-17-retrospective.md']);
    mockReadFile.mockResolvedValue('# Cycle 17 Retrospective\n\nSome content.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'retrospectives/cycle-17-retrospective.md' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          _id: 'retrospectives/cycle-17-retrospective.md',
          category: 'retrospectives',
        }),
      }),
      { upsert: true }
    );
  });

  it('maps cycle-*-retrospective.md with different cycle numbers to "retrospectives"', async () => {
    mockReaddir.mockResolvedValue(['cycle-9-retrospective.md', 'cycle-100-retrospective.md']);
    mockReadFile.mockResolvedValue('# Retrospective\n\nContent.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    const ids = mockUpdateOne.mock.calls.map((c: unknown[]) => (c[0] as { _id: string })._id);
    expect(ids).toContain('retrospectives/cycle-9-retrospective.md');
    expect(ids).toContain('retrospectives/cycle-100-retrospective.md');
  });

  // ── known-issues.md → journal ────────────────────────────────────────────────

  it('maps known-issues.md to category "journal"', async () => {
    mockReaddir.mockResolvedValue(['known-issues.md']);
    mockReadFile.mockResolvedValue('# Known Issues\n\nOpen bugs and future work.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'journal/known-issues.md' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          _id: 'journal/known-issues.md',
          category: 'journal',
        }),
      }),
      { upsert: true }
    );
  });

  // ── Regression: original CATEGORY_MAP entries ────────────────────────────────

  it('maps boot.md to category "specs" (regression)', async () => {
    mockReaddir.mockResolvedValue(['boot.md']);
    mockReadFile.mockResolvedValue('# Boot\n\nSystem overview.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'specs/boot.md' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ category: 'specs' }),
      }),
      { upsert: true }
    );
  });

  it('maps glossary.md to category "specs" (regression)', async () => {
    mockReaddir.mockResolvedValue(['glossary.md']);
    mockReadFile.mockResolvedValue('# Glossary\n\nTerminology.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'specs/glossary.md' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ category: 'specs' }),
      }),
      { upsert: true }
    );
  });

  it('maps badge-classes.md to category "specs" (regression)', async () => {
    mockReaddir.mockResolvedValue(['badge-classes.md']);
    mockReadFile.mockResolvedValue('# Badge CSS Classes\n\nBadge components.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'specs/badge-classes.md' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ category: 'specs' }),
      }),
      { upsert: true }
    );
  });

  it('maps sse-events.md to category "specs" (regression)', async () => {
    mockReaddir.mockResolvedValue(['sse-events.md']);
    mockReadFile.mockResolvedValue('# SSE Events\n\nEvent reference.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'specs/sse-events.md' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ category: 'specs' }),
      }),
      { upsert: true }
    );
  });

  it('maps conventions.md to category "skills" (regression)', async () => {
    mockReaddir.mockResolvedValue(['conventions.md']);
    mockReadFile.mockResolvedValue('# Conventions\n\nSome text.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'skills/conventions.md' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          _id: 'skills/conventions.md',
          category: 'skills',
        }),
      }),
      { upsert: true }
    );
  });

  // ── Original test preserved for CATEGORY_MAP lookup ──────────────────────────

  it('uses CATEGORY_MAP to assign the correct category for a known filename', async () => {
    mockReaddir.mockResolvedValue(['conventions.md']);
    mockReadFile.mockResolvedValue('# Conventions\n\nSome text.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'skills/conventions.md' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          _id: 'skills/conventions.md',
          category: 'skills',
        }),
      }),
      { upsert: true }
    );
  });

  it('falls back to "specs" category for unknown filenames', async () => {
    mockReaddir.mockResolvedValue(['unknown-file.md']);
    mockReadFile.mockResolvedValue('# Unknown\n\nContent.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'specs/unknown-file.md' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          _id: 'specs/unknown-file.md',
          category: 'specs',
        }),
      }),
      { upsert: true }
    );
  });

  it('constructs id as category/filename', async () => {
    mockReaddir.mockResolvedValue(['boot.md']);
    mockReadFile.mockResolvedValue('# Boot\n\nSystem overview.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    const callArgs = mockUpdateOne.mock.calls[0];
    expect(callArgs[0]).toEqual({ _id: 'specs/boot.md' });
    expect(callArgs[1].$setOnInsert._id).toBe('specs/boot.md');
  });

  it('inserts new documents when they do not exist in the DB', async () => {
    // Two files, both new
    mockReaddir.mockResolvedValue(['boot.md', 'glossary.md']);
    mockReadFile.mockResolvedValue('# Title\n\nContent.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledTimes(2);
  });

  it('skips (unchanged) documents whose on-disk content matches the DB copy', async () => {
    const content = '# Conventions\n\nSome text.';
    mockReaddir.mockResolvedValue(['conventions.md']);
    mockReadFile.mockResolvedValue(content);
    // Existing DB doc has the same content
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve({ content }) });

    await seedKnowledge();

    // No updateOne call — content is identical
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('updates title, snippet, and content when on-disk content differs from the DB copy', async () => {
    const oldContent = '# Old Title\n\nOld paragraph.';
    const newContent = '# New Title\n\nNew paragraph.';
    mockReaddir.mockResolvedValue(['boot.md']);
    mockReadFile.mockResolvedValue(newContent);
    mockFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'specs/boot.md',
          content: oldContent,
          qualityScore: 3,
          status: 'active',
        }),
    });
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });

    await seedKnowledge();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'specs/boot.md' },
      {
        $set: expect.objectContaining({
          title: 'New Title',
          snippet: 'New paragraph.',
          content: newContent,
        }),
      }
    );
    // $setOnInsert must NOT be present — this is an update, not an insert
    const callArgs = mockUpdateOne.mock.calls[0];
    expect(callArgs[1]).not.toHaveProperty('$setOnInsert');
  });

  it('preserves qualityScore, lastReferencedAt, source, and status on content update', async () => {
    const oldContent = '# Old\n\nOld text.';
    const newContent = '# New\n\nNew text.';
    mockReaddir.mockResolvedValue(['boot.md']);
    mockReadFile.mockResolvedValue(newContent);
    mockFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'specs/boot.md',
          content: oldContent,
          qualityScore: 5,
          lastReferencedAt: new Date('2026-01-01'),
          status: 'active',
          source: { type: 'human' },
        }),
    });
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });

    await seedKnowledge();

    // $set must only touch content-derived fields — never agent metadata
    const callArgs = mockUpdateOne.mock.calls[0];
    expect(callArgs[1].$set).not.toHaveProperty('qualityScore');
    expect(callArgs[1].$set).not.toHaveProperty('lastReferencedAt');
    expect(callArgs[1].$set).not.toHaveProperty('status');
    expect(callArgs[1].$set).not.toHaveProperty('source');
  });

  it('returns early without calling updateOne when the knowledge directory is unreadable', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    await seedKnowledge();

    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('skips non-.md files returned by readdir', async () => {
    mockReaddir.mockResolvedValue(['boot.md', 'README.txt', 'image.png']);
    mockReadFile.mockResolvedValue('# Title\n\nContent.');
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await seedKnowledge();

    // Only boot.md should be processed
    expect(mockUpdateOne).toHaveBeenCalledTimes(1);
    expect(mockUpdateOne.mock.calls[0][0]).toEqual({ _id: 'specs/boot.md' });
  });

  it('returns early without error when there are no .md files in the directory', async () => {
    mockReaddir.mockResolvedValue(['README.txt']);

    await seedKnowledge();

    expect(mockUpdateOne).not.toHaveBeenCalled();
  });
});
