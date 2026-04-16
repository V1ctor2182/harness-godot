import { PassThrough } from 'node:stream';
import Dockerode from 'dockerode';
import tar from 'tar-stream';
import { docker } from '../../lib/docker.js';
import { config } from '../../config.js';
import {
  AGENT_CONTAINER_LABEL,
  AGENT_CONTAINER_LABEL_VALUE,
  LEGACY_AGENT_CONTAINER_LABEL,
  CONTAINER_MEMORY_MB,
  CONTAINER_CPU_COUNT,
} from '@harness/shared';

import { AGENT_DOCKER_IMAGE } from '@harness/shared';
const AGENT_IMAGE = AGENT_DOCKER_IMAGE;

export interface ContainerConfig {
  agentRunId: string;
  role: string;
  model: string;
  budgetUsd: number;
  systemPromptContent: string;
  taskPromptContent: string;
  taskBranch?: string; // #24: PR branch for Tester/Reviewer/Coder retry to checkout
}

export interface ContainerHandle {
  container: Dockerode.Container;
  containerId: string;
}

export async function createAgentContainer(cfg: ContainerConfig): Promise<ContainerHandle> {
  const container = await docker.createContainer({
    Image: AGENT_IMAGE,
    name: `harness-${cfg.agentRunId}`,
    Env: [
      `CLAUDE_CODE_OAUTH_TOKEN=${config.claudeCodeOauthToken}`,
      `AGENT_ROLE=${cfg.role}`,
      `SYSTEM_PROMPT_FILE=/context/system-prompt.md`,
      `TASK_PROMPT_FILE=/context/task-prompt.md`,
      `GITHUB_REPO_URL=${config.githubRepoUrl}`,
      `GH_TOKEN=${config.ghToken}`,
      `BASE_BRANCH=${config.baseBranch}`,
      `MAX_BUDGET_USD=${cfg.budgetUsd}`,
      `MODEL=${cfg.model}`,
      `SERVER_API_URL=${config.serverApiUrl}`,
      `TASK_BRANCH=${cfg.taskBranch ?? ''}`, // #24: Tester/Reviewer/Coder retry checkout this branch
    ],
    Labels: {
      [AGENT_CONTAINER_LABEL]: AGENT_CONTAINER_LABEL_VALUE,
      'harness.agent-run-id': cfg.agentRunId,
      'harness.role': cfg.role,
    },
    HostConfig: {
      Memory: CONTAINER_MEMORY_MB * 1024 * 1024,
      NanoCpus: CONTAINER_CPU_COUNT * 1e9,
      ExtraHosts: ['host.docker.internal:host-gateway'],
    },
  });

  return { container, containerId: container.id };
}

export async function injectContext(
  container: Dockerode.Container,
  systemPrompt: string,
  taskPrompt: string
): Promise<void> {
  const pack = tar.pack();
  pack.entry({ name: 'system-prompt.md' }, systemPrompt);
  pack.entry({ name: 'task-prompt.md' }, taskPrompt);
  pack.finalize();

  // Inject into /home/agent/context/ (matching entrypoint.sh CONTEXT path)
  await container.putArchive(pack, { path: '/home/agent/context' });
}

export async function attachStream(container: Dockerode.Container): Promise<NodeJS.ReadableStream> {
  const muxStream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true,
  });

  // Dockerode returns a multiplexed stream with 8-byte header framing when
  // both stdout and stderr are attached. Demux into separate streams so
  // readline receives clean lines without Docker framing bytes.
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(muxStream, stdout, stderr);

  // When the mux stream ends, end the PassThrough streams so readline terminates
  muxStream.on('end', () => {
    stdout.end();
    stderr.end();
  });

  // Pipe stderr to console for debugging but don't feed it to the JSON parser
  stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) console.error(`[container stderr] ${text}`);
  });

  return stdout;
}

export async function startContainer(container: Dockerode.Container): Promise<void> {
  await container.start();
}

export async function waitForContainer(
  container: Dockerode.Container,
  timeoutMs: number
): Promise<{ exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: { exitCode: number; timedOut: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(healthCheck);
      resolve(result);
    };

    const timeout = setTimeout(async () => {
      try {
        await container.kill();
      } catch {
        /* container may have already exited */
      }
      settle({ exitCode: -1, timedOut: true });
    }, timeoutMs);

    // Health check: detect containers that die without sending an exit event
    const healthCheck = setInterval(async () => {
      try {
        const info = await container.inspect();
        const status = info.State?.Status;
        if (status && status !== 'running' && status !== 'created') {
          const exitCode = info.State?.ExitCode ?? -1;
          settle({ exitCode, timedOut: false });
        }
      } catch {
        // Container may have been removed — treat as exited
        settle({ exitCode: -1, timedOut: false });
      }
    }, 30_000);

    container
      .wait()
      .then((result) => {
        settle({ exitCode: result.StatusCode, timedOut: false });
      })
      .catch(() => {
        settle({ exitCode: -1, timedOut: false });
      });
  });
}

export async function removeContainer(container: Dockerode.Container): Promise<void> {
  try {
    await container.remove({ force: true });
  } catch {
    /* container may not exist */
  }
}

export async function findOrphanedContainers(): Promise<Dockerode.ContainerInfo[]> {
  const [current, legacy] = await Promise.all([
    docker.listContainers({
      all: true,
      filters: {
        label: [`${AGENT_CONTAINER_LABEL}=${AGENT_CONTAINER_LABEL_VALUE}`],
        status: ['running'],
      },
    }),
    // Also pick up containers from the old `zombie-farm=agent` label so the
    // first boot after the Phase A rename can clean them up gracefully.
    docker.listContainers({
      all: true,
      filters: {
        label: [`${LEGACY_AGENT_CONTAINER_LABEL}=${AGENT_CONTAINER_LABEL_VALUE}`],
        status: ['running'],
      },
    }),
  ]);
  // Dedupe by container id in case a container somehow had both labels.
  const seen = new Set<string>();
  const merged: Dockerode.ContainerInfo[] = [];
  for (const info of [...current, ...legacy]) {
    if (seen.has(info.Id)) continue;
    seen.add(info.Id);
    merged.push(info);
  }
  return merged;
}

export async function killContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  try {
    await container.kill({ signal: 'SIGTERM' });
  } catch {
    /* may already be stopped */
  }
}
