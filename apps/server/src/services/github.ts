import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

function ghEnv(): Record<string, string> {
  return { ...(process.env as Record<string, string>), GH_TOKEN: config.ghToken };
}

export async function dryRunMerge(
  branch: string
): Promise<{ conflicts: boolean; message: string }> {
  const repoDir = `/tmp/erika-merge-check-${Date.now()}`;
  const url = config.githubRepoUrl.replace(
    'https://github.com/',
    `https://${config.ghToken}@github.com/`
  );

  try {
    await execFileAsync('git', [
      'clone',
      '--branch',
      config.baseBranch,
      '--depth',
      '1',
      url,
      repoDir,
    ]);
    await execFileAsync('git', ['-C', repoDir, 'fetch', 'origin', `${branch}:${branch}`]);

    try {
      await execFileAsync('git', ['-C', repoDir, 'merge', '--no-commit', '--no-ff', branch]);
      return { conflicts: false, message: 'Clean merge' };
    } catch {
      return {
        conflicts: true,
        message: `Merge conflicts detected between ${config.baseBranch} and ${branch}`,
      };
    }
  } catch (err) {
    return { conflicts: false, message: `Merge check failed: ${err}` };
  } finally {
    await execFileAsync('rm', ['-rf', repoDir]).catch(() => {});
  }
}

export async function getPRStatus(
  prNumber: number
): Promise<{ state: string; mergeable: boolean | null }> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', String(prNumber), '--repo', config.githubRepoUrl, '--json', 'state,mergeable'],
      { env: ghEnv() }
    );
    return JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Failed to get PR status for #${prNumber}: ${err}`);
  }
}

export async function getCIStatus(
  prNumber: number
): Promise<'pending' | 'running' | 'passed' | 'failed'> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'checks', String(prNumber), '--repo', config.githubRepoUrl, '--json', 'state'],
      { env: ghEnv() }
    );
    const checks = JSON.parse(stdout) as Array<{ state: string }>;

    // No checks configured — treat as passed (no CI to block on)
    if (checks.length === 0) return 'passed';
    if (checks.some((c) => c.state === 'FAILURE')) return 'failed';
    if (checks.some((c) => c.state === 'PENDING' || c.state === 'QUEUED')) return 'running';
    if (checks.every((c) => c.state === 'SUCCESS')) return 'passed';
    return 'running';
  } catch (err) {
    console.error(`[github] getCIStatus(#${prNumber}) failed: ${err}`);
    return 'pending';
  }
}

export async function mergePR(prNumber: number): Promise<void> {
  await execFileAsync(
    'gh',
    ['pr', 'merge', String(prNumber), '--repo', config.githubRepoUrl, '--merge', '--delete-branch'],
    { env: ghEnv() }
  );
}

export async function findPRByBranch(branch: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'pr',
        'list',
        '--head',
        branch,
        '--repo',
        config.githubRepoUrl,
        '--json',
        'number',
        '--limit',
        '1',
      ],
      { env: ghEnv() }
    );
    const prs = JSON.parse(stdout) as Array<{ number: number }>;
    return prs.length > 0 ? prs[0].number : null;
  } catch {
    return null;
  }
}

export type ValidatePRBodyJSONResult =
  | { valid: true }
  | {
      valid: false;
      reason: 'no_json_block' | 'invalid_json' | 'missing_acv_array' | 'tool_unavailable';
    };

export async function validatePRBodyJSON(prNumber: number): Promise<ValidatePRBodyJSONResult> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', String(prNumber), '--repo', config.githubRepoUrl, '--json', 'body'],
      { env: ghEnv() }
    );
    const { body } = JSON.parse(stdout) as { body: string };

    // Look for a triple-backtick json fenced block
    const match = /```json\s*([\s\S]*?)```/.exec(body);
    if (!match) return { valid: false, reason: 'no_json_block' };

    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      // Require a non-empty acceptanceCriteriaVerification array
      const acv = parsed['acceptanceCriteriaVerification'];
      if (!Array.isArray(acv) || acv.length === 0)
        return { valid: false, reason: 'missing_acv_array' };
      return { valid: true };
    } catch {
      return { valid: false, reason: 'invalid_json' };
    }
  } catch {
    // Fail-safe: if gh CLI throws, never block review on tool unavailability —
    // pass through to the reviewer so they can assess directly
    return { valid: true };
  }
}

export async function closeStalePRs(prNumbers: number[]): Promise<void> {
  for (const prNumber of prNumbers) {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['pr', 'view', String(prNumber), '--repo', config.githubRepoUrl, '--json', 'state'],
        { env: ghEnv() }
      );
      const { state } = JSON.parse(stdout);
      if (state === 'OPEN') {
        await execFileAsync(
          'gh',
          ['pr', 'close', String(prNumber), '--repo', config.githubRepoUrl, '--delete-branch'],
          { env: ghEnv() }
        );
        console.log(`[github] Closed stale PR #${prNumber}`);
      }
    } catch {
      // Non-fatal — PR may already be closed or branch deleted
    }
  }
}
