import { Response } from 'express';
import { config } from '../config.js';

interface SSEClient {
  id: string;
  res: Response;
  lastEventId?: string;
  filter?: { agentRunId?: string };
}

interface ReplayEntry {
  id: string;
  eventType: string;
  payload: string;
}

const MAX_REPLAY = 100;

let eventCounter = 0;
const clients: Map<string, SSEClient> = new Map();
const replayBuffer: ReplayEntry[] = [];
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function initSSE(): void {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    for (const client of clients.values()) {
      client.res.write(': heartbeat\n\n');
    }
  }, config.sseHeartbeatIntervalMs);
}

export function stopSSE(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  for (const client of clients.values()) {
    client.res.end();
  }
  clients.clear();
}

export function addClient(
  id: string,
  res: Response,
  lastEventId?: string,
  filter?: { agentRunId?: string }
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  clients.set(id, { id, res, lastEventId, filter });

  // Replay buffered events for reconnecting or new clients
  if (lastEventId) {
    // Find the index after lastEventId and replay from there
    const idx = replayBuffer.findIndex((entry) => entry.id === lastEventId);
    const startIdx = idx === -1 ? 0 : idx + 1;
    for (let i = startIdx; i < replayBuffer.length; i++) {
      res.write(replayBuffer[i].payload);
    }
  } else if (replayBuffer.length > 0) {
    // New client with no lastEventId — replay the full buffer
    for (const entry of replayBuffer) {
      res.write(entry.payload);
    }
  }

  res.on('close', () => {
    clients.delete(id);
  });
}

export function broadcast(
  eventType: string,
  data: Record<string, unknown>,
  filter?: { agentRunId?: string }
): void {
  eventCounter++;
  const id = `sse-${eventCounter}`;
  const payload = `event: ${eventType}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`;

  // Add to replay buffer (evict oldest when full)
  replayBuffer.push({ id, eventType, payload });
  if (replayBuffer.length > MAX_REPLAY) {
    replayBuffer.shift();
  }

  for (const client of clients.values()) {
    // If the event has a filter (agent-specific), only send to matching clients
    if (
      filter?.agentRunId &&
      client.filter?.agentRunId &&
      client.filter.agentRunId !== filter.agentRunId
    ) {
      continue;
    }
    // If the client has no filter, it's a global listener — send everything
    client.res.write(payload);
  }
}
