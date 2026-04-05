/**
 * Unit tests for apps/server/src/services/github.ts
 *
 * All execFile calls are mocked via vi.hoisted() + vi.mock() so no real
 * gh CLI or git commands are executed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (must be set up before module imports) ─────────────────────

const mockExecFile = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

// Mock node:child_process so execFile is our mock fn
vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

// Mock node:util so promisify(fn) === fn (our mock is already async)
vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}));

// Mock config to avoid requiring real env vars
vi.mock('../../src/config.js', () => ({
  config: {
    ghToken: 'test-token',
    githubRepoUrl: 'https://github.com/test/repo',
    baseBranch: 'master',
  },
}));

// ─── Import module under test (after mocks) ───────────────────────────────────

import {
  getCIStatus,
  findPRByBranch,
  closeStalePRs,
  validatePRBodyJSON,
} from '../../src/services/github.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCIStatus', () => {
  it('returns "passed" when checks array is empty', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify([]), stderr: '' });

    const result = await getCIStatus(42);

    expect(result).toBe('passed');
  });

  it('returns "passed" when all checks have state SUCCESS', async () => {
    const checks = [{ state: 'SUCCESS' }, { state: 'SUCCESS' }];
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(checks), stderr: '' });

    const result = await getCIStatus(42);

    expect(result).toBe('passed');
  });

  it('returns "failed" when any check has state FAILURE', async () => {
    const checks = [{ state: 'SUCCESS' }, { state: 'FAILURE' }];
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(checks), stderr: '' });

    const result = await getCIStatus(42);

    expect(result).toBe('failed');
  });

  it('returns "running" when any check has state PENDING', async () => {
    const checks = [{ state: 'SUCCESS' }, { state: 'PENDING' }];
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(checks), stderr: '' });

    const result = await getCIStatus(42);

    expect(result).toBe('running');
  });

  it('returns "running" when any check has state QUEUED', async () => {
    const checks = [{ state: 'SUCCESS' }, { state: 'QUEUED' }];
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(checks), stderr: '' });

    const result = await getCIStatus(42);

    expect(result).toBe('running');
  });

  it('returns "pending" when execFile throws', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('gh CLI not found'));

    const result = await getCIStatus(42);

    expect(result).toBe('pending');
  });
});

describe('findPRByBranch', () => {
  it('returns the PR number when a PR is found', async () => {
    const prs = [{ number: 99 }];
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(prs), stderr: '' });

    const result = await findPRByBranch('task-001-my-branch');

    expect(result).toBe(99);
  });

  it('returns null when the PR list is empty', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify([]), stderr: '' });

    const result = await findPRByBranch('task-001-my-branch');

    expect(result).toBeNull();
  });

  it('returns null when execFile throws', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('network error'));

    const result = await findPRByBranch('task-001-my-branch');

    expect(result).toBeNull();
  });
});

describe('validatePRBodyJSON', () => {
  it('returns { valid: true } when the PR body contains valid JSON with a non-empty acceptanceCriteriaVerification array', async () => {
    const body =
      'Some text\n\n```json\n{"summary": "all good", "decisions": [], "acceptanceCriteriaVerification": [{"criterion": "does X", "status": "met", "evidence": "line 42"}]}\n```\n\nTrailing text';
    mockExecFile.mockResolvedValueOnce({
      stdout: JSON.stringify({ body }),
      stderr: '',
    });

    const result = await validatePRBodyJSON(42);

    expect(result).toEqual({ valid: true });
  });

  it('returns { valid: false, reason: "no_json_block" } when the PR body contains no triple-backtick json fenced block', async () => {
    const body = 'No JSON block here, just plain text.';
    mockExecFile.mockResolvedValueOnce({
      stdout: JSON.stringify({ body }),
      stderr: '',
    });

    const result = await validatePRBodyJSON(42);

    expect(result).toEqual({ valid: false, reason: 'no_json_block' });
  });

  it('returns { valid: false, reason: "invalid_json" } when the PR body contains a json fenced block with syntactically invalid JSON', async () => {
    const body = '```json\n{"unclosed": "brace"\n```';
    mockExecFile.mockResolvedValueOnce({
      stdout: JSON.stringify({ body }),
      stderr: '',
    });

    const result = await validatePRBodyJSON(42);

    expect(result).toEqual({ valid: false, reason: 'invalid_json' });
  });

  it('returns { valid: true } when the gh CLI call throws — outer catch passes through to reviewer', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('gh: command not found'));

    const result = await validatePRBodyJSON(42);

    expect(result).toEqual({ valid: true });
  });

  // ── Test cases covering enhanced acceptanceCriteriaVerification validation ──

  it('returns { valid: false, reason: "missing_acv_array" } when JSON has no acceptanceCriteriaVerification field', async () => {
    const body = '```json\n{"summary": "ok", "decisions": []}\n```';
    mockExecFile.mockResolvedValueOnce({
      stdout: JSON.stringify({ body }),
      stderr: '',
    });

    const result = await validatePRBodyJSON(42);

    expect(result).toEqual({ valid: false, reason: 'missing_acv_array' });
  });

  it('returns { valid: false, reason: "missing_acv_array" } when acceptanceCriteriaVerification is an empty array', async () => {
    const body =
      '```json\n{"summary": "ok", "decisions": [], "acceptanceCriteriaVerification": []}\n```';
    mockExecFile.mockResolvedValueOnce({
      stdout: JSON.stringify({ body }),
      stderr: '',
    });

    const result = await validatePRBodyJSON(42);

    expect(result).toEqual({ valid: false, reason: 'missing_acv_array' });
  });

  it('returns { valid: true } when acceptanceCriteriaVerification is a non-empty array', async () => {
    const body =
      '```json\n{"summary": "ok", "decisions": [], "acceptanceCriteriaVerification": [{"criterion": "foo", "status": "met", "evidence": "bar"}]}\n```';
    mockExecFile.mockResolvedValueOnce({
      stdout: JSON.stringify({ body }),
      stderr: '',
    });

    const result = await validatePRBodyJSON(42);

    expect(result).toEqual({ valid: true });
  });

  it('returns { valid: true } when the gh CLI call throws — never block review on tool unavailability', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('network timeout'));

    const result = await validatePRBodyJSON(42);

    expect(result).toEqual({ valid: true });
  });
});

describe('closeStalePRs', () => {
  it('closes OPEN PRs', async () => {
    // First call: view PR → OPEN
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify({ state: 'OPEN' }), stderr: '' });
    // Second call: close PR
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await closeStalePRs([7]);

    // execFile should have been called twice: once for view, once for close
    expect(mockExecFile).toHaveBeenCalledTimes(2);

    // Second call should be 'pr close'
    const secondCallArgs = mockExecFile.mock.calls[1] as [string, string[]];
    expect(secondCallArgs[0]).toBe('gh');
    expect(secondCallArgs[1]).toContain('close');
  });

  it('does not close PRs that are not OPEN', async () => {
    // First call: view PR → CLOSED
    mockExecFile.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'CLOSED' }),
      stderr: '',
    });

    await closeStalePRs([7]);

    // Only one call: the view. No close call.
    expect(mockExecFile).toHaveBeenCalledTimes(1);

    const firstCallArgs = mockExecFile.mock.calls[0] as [string, string[]];
    expect(firstCallArgs[1]).toContain('view');
    expect(firstCallArgs[1]).not.toContain('close');
  });

  it('skips a PR silently when execFile throws on view', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('PR not found'));

    // Should not throw — errors are swallowed per source code
    await expect(closeStalePRs([7])).resolves.toBeUndefined();
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('handles multiple PRs, closing only OPEN ones', async () => {
    // PR 1: OPEN → will be closed
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify({ state: 'OPEN' }), stderr: '' });
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // PR 2: MERGED → skip
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify({ state: 'MERGED' }), stderr: '' });

    await closeStalePRs([1, 2]);

    // 2 view calls + 1 close call
    expect(mockExecFile).toHaveBeenCalledTimes(3);
  });
});
