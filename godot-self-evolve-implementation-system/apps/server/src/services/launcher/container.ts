import { PassThrough } from 'node:stream';
import Dockerode from 'dockerode';
import tar from 'tar-stream';
import { docker } from '../../lib/docker.js';
import { config } from '../../config.js';
import {
  AGENT_CONTAINER_LABEL,
  AGENT_CONTAINER_LABEL_VALUE,
  CONTAINER_MEMORY_MB,
  CONTAINER_CPU_COUNT,
} from '@zombie-farm/shared';

import { AGENT_DOCKER_IMAGE } from '@zombie-farm/shared';
const AGENT_IMAGE = AGENT_DOCKER_IMAGE;

export interface ContainerConfig {
  agentRunId: string;
  role: string;
  model: string;
  budgetUsd: number;
  systemPromptContent: string;
  taskPromptContent: string;
}

export interface ContainerHandle {
  container: Dockerode.Container;
  containerId: string;
}

export async function createAgentContainer(cfg: ContainerConfig): Promise<ContainerHandle> {
  const container = await docker.createContainer({
    Image: AGENT_IMAGE,
    name: `zombie-farm-${cfg.agentRunId}`,
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
    ],
    Labels: {
      [AGENT_CONTAINER_LABEL]: AGENT_CONTAINER_LABEL_VALUE,
      'erika.agent-run-id': cfg.agentRunId,
      'erika.role': cfg.role,
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
  pack.entry({ name: 'context/system-prompt.md' }, systemPrompt);
  pack.entry({ name: 'context/task-prompt.md' }, taskPrompt);
  pack.finalize();

  await container.putArchive(pack, { path: '/' });
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
    const timeout = setTimeout(async () => {
      try {
        await container.kill();
      } catch {
        /* container may have already exited */
      }
      resolve({ exitCode: -1, timedOut: true });
    }, timeoutMs);

    container
      .wait()
      .then((result) => {
        clearTimeout(timeout);
        resolve({ exitCode: result.StatusCode, timedOut: false });
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve({ exitCode: -1, timedOut: false });
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
  return docker.listContainers({
    all: true,
    filters: {
      label: [`${AGENT_CONTAINER_LABEL}=${AGENT_CONTAINER_LABEL_VALUE}`],
      status: ['running'],
    },
  });
}

export async function killContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  try {
    await container.kill({ signal: 'SIGTERM' });
  } catch {
    /* may already be stopped */
  }
}
