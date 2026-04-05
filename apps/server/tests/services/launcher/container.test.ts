/**
 * Unit tests for container.ts: createAgentContainer and injectContext
 *
 * Tests cover:
 *   1. Container name is `erika-{agentRunId}`
 *   2. All required env vars are injected
 *   3. Container labels include erika=agent and erika.agent-run-id
 *   4. HostConfig includes ExtraHosts: ['host.docker.internal:host-gateway']
 *   5. Memory and CPU limits match shared constants
 *   6. Returns a ContainerHandle with container and containerId
 *   7. Error propagation when docker.createContainer throws
 *   8. injectContext calls container.putArchive with tar containing correct files
 *
 * All Docker and tar-stream calls are mocked — no real connections made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (must be created before module imports) ────────────────────

const mockCreateContainer = vi.hoisted(() => vi.fn());
const mockModemDemuxStream = vi.hoisted(() => vi.fn());

const mockTarPack = vi.hoisted(() => vi.fn());
const mockTarPackEntry = vi.hoisted(() => vi.fn());
const mockTarPackFinalize = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../src/lib/docker.js', () => ({
  docker: {
    createContainer: mockCreateContainer,
    modem: { demuxStream: mockModemDemuxStream },
  },
  isDockerAvailable: vi.fn(),
}));

vi.mock('tar-stream', () => ({
  default: {
    pack: mockTarPack,
  },
}));

vi.mock('../../../src/config.js', () => ({
  config: {
    claudeCodeOauthToken: 'test-oauth-token',
    githubRepoUrl: 'https://github.com/test/repo',
    ghToken: 'test-gh-token',
    baseBranch: 'main',
    serverApiUrl: 'http://localhost:3001/api',
  },
}));

// ─── Import functions under test (after mocks) ───────────────────────────────

import { createAgentContainer, injectContext } from '../../../src/services/launcher/container.js';
import {
  AGENT_CONTAINER_LABEL,
  AGENT_CONTAINER_LABEL_VALUE,
  CONTAINER_MEMORY_MB,
  CONTAINER_CPU_COUNT,
} from '@zombie-farm/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContainerConfig(overrides: Partial<Parameters<typeof createAgentContainer>[0]> = {}) {
  return {
    agentRunId: 'coder-abc123',
    role: 'coder',
    model: 'claude-sonnet-4-6',
    budgetUsd: 5,
    systemPromptContent: 'You are a coder agent.',
    taskPromptContent: 'Implement feature X.',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createAgentContainer', () => {
  let fakeContainer: { id: string };

  beforeEach(() => {
    vi.clearAllMocks();

    fakeContainer = { id: 'container-deadbeef' };
    mockCreateContainer.mockResolvedValue(fakeContainer);
  });

  // ── Test 1: Container name ────────────────────────────────────────────────

  it('names the container erika-{agentRunId}', async () => {
    const cfg = makeContainerConfig({ agentRunId: 'coder-xyz789' });

    await createAgentContainer(cfg);

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'erika-coder-xyz789',
      })
    );
  });

  // ── Test 2: Env vars ──────────────────────────────────────────────────────

  it('injects all required env vars', async () => {
    const cfg = makeContainerConfig({
      agentRunId: 'coder-abc123',
      role: 'coder',
      model: 'claude-opus',
      budgetUsd: 3,
    });

    await createAgentContainer(cfg);

    const call = mockCreateContainer.mock.calls[0][0];
    const env: string[] = call.Env;

    expect(env).toContain('CLAUDE_CODE_OAUTH_TOKEN=test-oauth-token');
    expect(env).toContain('AGENT_ROLE=coder');
    expect(env).toContain('SYSTEM_PROMPT_FILE=/context/system-prompt.md');
    expect(env).toContain('TASK_PROMPT_FILE=/context/task-prompt.md');
    expect(env).toContain('GITHUB_REPO_URL=https://github.com/test/repo');
    expect(env).toContain('GH_TOKEN=test-gh-token');
    expect(env).toContain('BASE_BRANCH=main');
    expect(env).toContain('MAX_BUDGET_USD=3');
    expect(env).toContain('MODEL=claude-opus');
    expect(env).toContain('SERVER_API_URL=http://localhost:3001/api');
  });

  // ── Test 3: Container labels ──────────────────────────────────────────────

  it('sets erika=agent label and erika.agent-run-id label', async () => {
    const cfg = makeContainerConfig({ agentRunId: 'coder-abc123' });

    await createAgentContainer(cfg);

    const call = mockCreateContainer.mock.calls[0][0];
    const labels = call.Labels;

    expect(labels[AGENT_CONTAINER_LABEL]).toBe(AGENT_CONTAINER_LABEL_VALUE);
    expect(labels['erika.agent-run-id']).toBe('coder-abc123');
  });

  // ── Test 4: HostConfig ExtraHosts ─────────────────────────────────────────

  it('includes ExtraHosts: host.docker.internal:host-gateway in HostConfig', async () => {
    await createAgentContainer(makeContainerConfig());

    const call = mockCreateContainer.mock.calls[0][0];
    expect(call.HostConfig.ExtraHosts).toContain('host.docker.internal:host-gateway');
  });

  // ── Test 5: Memory and CPU limits ────────────────────────────────────────

  it('sets memory and CPU limits from shared constants', async () => {
    await createAgentContainer(makeContainerConfig());

    const call = mockCreateContainer.mock.calls[0][0];
    expect(call.HostConfig.Memory).toBe(CONTAINER_MEMORY_MB * 1024 * 1024);
    expect(call.HostConfig.NanoCpus).toBe(CONTAINER_CPU_COUNT * 1e9);
  });

  // ── Test 6: Returns ContainerHandle ──────────────────────────────────────

  it('returns a ContainerHandle with the container and containerId', async () => {
    const cfg = makeContainerConfig();

    const handle = await createAgentContainer(cfg);

    expect(handle.container).toBe(fakeContainer);
    expect(handle.containerId).toBe('container-deadbeef');
  });

  // ── Test 7: Error propagation ─────────────────────────────────────────────

  it('propagates errors thrown by docker.createContainer', async () => {
    mockCreateContainer.mockRejectedValue(new Error('Docker socket unavailable'));

    await expect(createAgentContainer(makeContainerConfig())).rejects.toThrow(
      'Docker socket unavailable'
    );
  });
});

// ─── injectContext tests ──────────────────────────────────────────────────────

describe('injectContext', () => {
  let mockPackInstance: {
    entry: ReturnType<typeof vi.fn>;
    finalize: ReturnType<typeof vi.fn>;
  };
  let mockPutArchive: ReturnType<typeof vi.fn>;
  let fakeContainer: { id: string; putArchive: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPackInstance = {
      entry: mockTarPackEntry,
      finalize: mockTarPackFinalize,
    };
    mockTarPack.mockReturnValue(mockPackInstance);
    mockTarPackEntry.mockImplementation((_header, _content, cb?: () => void) => {
      if (cb) cb();
    });
    mockTarPackFinalize.mockImplementation(() => undefined);

    mockPutArchive = vi.fn().mockResolvedValue(undefined);
    fakeContainer = { id: 'container-ctx', putArchive: mockPutArchive };
  });

  it('calls container.putArchive with a tar stream containing system-prompt.md and task-prompt.md', async () => {
    await injectContext(
      fakeContainer as unknown as Parameters<typeof injectContext>[0],
      'system prompt content',
      'task prompt content'
    );

    // tar pack entries for both files should be created
    expect(mockTarPackEntry).toHaveBeenCalledWith(
      { name: 'context/system-prompt.md' },
      'system prompt content'
    );
    expect(mockTarPackEntry).toHaveBeenCalledWith(
      { name: 'context/task-prompt.md' },
      'task prompt content'
    );

    // pack should be finalized
    expect(mockTarPackFinalize).toHaveBeenCalled();

    // putArchive should be called with the pack stream and path '/'
    expect(mockPutArchive).toHaveBeenCalledWith(mockPackInstance, { path: '/' });
  });
});
