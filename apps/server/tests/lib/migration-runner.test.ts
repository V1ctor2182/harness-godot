/**
 * Unit tests for migration-runner.ts
 *
 * Tests cover all branching paths in runMigrations():
 *   - migrations directory does not exist (early return)
 *   - empty migrations directory (no-op)
 *   - all migrations already applied (skips all)
 *   - one pending migration (calls up() and records it)
 *   - multiple files run in sorted order
 *   - migration up() throws (error propagates)
 *
 * All fs calls, the dynamic import(), and MigrationModel are mocked via
 * vi.hoisted() / vi.mock() — no real filesystem or database access.
 *
 * The dynamic import() is intercepted by mocking the actual migration files
 * that the runner would load. Vitest intercepts import() calls (including
 * those using file:// URLs) using its module mock registry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (created before module imports) ────────────────────────────

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReaddirSync = vi.hoisted(() => vi.fn());

const mockLean = vi.hoisted(() => vi.fn());
const mockFind = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());

// Per-migration up() mocks — used by vi.mock() factories below.
// These two migration files are real files in the project, used here as
// test fixtures for the dynamic import() interception.
const mockUp001 = vi.hoisted(() => vi.fn());
const mockUp002 = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
  },
}));

vi.mock('../../src/models/migration.js', () => ({
  MigrationModel: {
    find: mockFind,
    create: mockCreate,
  },
}));

// Mock migration files used as test fixtures for dynamic import() interception.
// The migration runner calls import(pathToFileURL(fullPath).href) which Vitest
// normalises to the same absolute path resolved here from this test file.
vi.mock('../../src/migrations/001-update-agent-container-setup.js', () => ({
  up: mockUp001,
}));

vi.mock('../../src/migrations/002-archive-stale-container-knowledge.js', () => ({
  up: mockUp002,
}));

// ─── Import function under test (after mocks) ─────────────────────────────────

import { runMigrations } from '../../src/lib/migration-runner.js';

// ─── Default setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: dir exists with no files
  mockExistsSync.mockReturnValue(true);
  mockReaddirSync.mockReturnValue([]);
  // Default: no migrations applied yet
  mockFind.mockReturnValue({ lean: mockLean });
  mockLean.mockResolvedValue([]);
  mockCreate.mockResolvedValue({});
  // Default: up() resolves successfully
  mockUp001.mockResolvedValue(undefined);
  mockUp002.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runMigrations', () => {
  it('returns early without querying DB when migrations directory does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    await runMigrations();

    expect(mockFind).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does nothing when the migrations directory is empty', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);

    await runMigrations();

    expect(mockFind).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('skips all files when every migration has already been applied', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['001-update-agent-container-setup.ts']);
    mockLean.mockResolvedValue([{ _id: '001-update-agent-container-setup' }]);

    await runMigrations();

    expect(mockUp001).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('calls up() and records the migration for a single pending file', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['001-update-agent-container-setup.ts']);
    mockLean.mockResolvedValue([]);

    await runMigrations();

    expect(mockUp001).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({ _id: '001-update-agent-container-setup' });
  });

  it('runs multiple pending migrations in sorted order', async () => {
    mockExistsSync.mockReturnValue(true);
    // Return in reverse alphabetical order to verify .sort() reorders them
    mockReaddirSync.mockReturnValue([
      '002-archive-stale-container-knowledge.ts',
      '001-update-agent-container-setup.ts',
    ]);
    mockLean.mockResolvedValue([]);

    await runMigrations();

    expect(mockUp001).toHaveBeenCalledOnce();
    expect(mockUp002).toHaveBeenCalledOnce();
    // Verify create() was called in sorted order: 001 before 002
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[0][0]).toEqual({ _id: '001-update-agent-container-setup' });
    expect(mockCreate.mock.calls[1][0]).toEqual({ _id: '002-archive-stale-container-knowledge' });
  });

  it('skips already-applied migrations and only runs the pending one', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      '001-update-agent-container-setup.ts',
      '002-archive-stale-container-knowledge.ts',
    ]);
    // 001 already applied, 002 is pending
    mockLean.mockResolvedValue([{ _id: '001-update-agent-container-setup' }]);

    await runMigrations();

    expect(mockUp001).not.toHaveBeenCalled();
    expect(mockUp002).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({ _id: '002-archive-stale-container-knowledge' });
  });

  it('propagates errors thrown by a migration up() without recording it', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['001-update-agent-container-setup.ts']);
    mockLean.mockResolvedValue([]);
    mockUp001.mockRejectedValue(new Error('migration failed'));

    await expect(runMigrations()).rejects.toThrow('migration failed');
    // create() must not have been called — the failed migration is not recorded
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('filters out .d.ts declaration files and non-ts/js files', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      '001-update-agent-container-setup.d.ts', // declaration file — excluded
      '001-update-agent-container-setup.ts', // real migration — included
      'README.md', // unrelated file — excluded
    ]);
    mockLean.mockResolvedValue([]);

    await runMigrations();

    // Only the non-declaration .ts file should trigger up() and create()
    expect(mockUp001).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});
