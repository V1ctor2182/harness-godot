import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { addClient } from '../services/sse-manager.js';
import { AgentEventModel } from '../models/agent-event.js';

const router = Router();

// Global SSE stream — system events + all agent events
router.get('/stream', (req, res) => {
  const clientId = randomUUID();
  const lastEventId = req.headers['last-event-id'] as string | undefined;

  addClient(clientId, res, lastEventId);

  // Replay missed events if reconnecting
  if (lastEventId) {
    replayEvents(res, lastEventId).catch((err) => {
      console.error('Event replay failed:', err);
    });
  }
});

// Per-agent SSE stream
router.get('/agents/:agentRunId/stream', (req, res) => {
  const clientId = randomUUID();
  const { agentRunId } = req.params;
  const lastEventId = req.headers['last-event-id'] as string | undefined;

  addClient(clientId, res, lastEventId, { agentRunId });

  // Replay missed events for this agent
  if (lastEventId) {
    replayAgentEvents(res, agentRunId, lastEventId).catch((err) => {
      console.error('Agent event replay failed:', err);
    });
  }
});

async function replayEvents(res: import('express').Response, afterId: string): Promise<void> {
  // Use ObjectId for replay — SSE ids are now ObjectId strings from persisted events
  // or global counter strings for ephemeral broadcasts. For replay, only persisted events matter.
  let filter: Record<string, unknown>;
  if (Types.ObjectId.isValid(afterId)) {
    filter = { _id: { $gt: new Types.ObjectId(afterId) } };
  } else {
    // Fallback: treat as timestamp-based reconnect — replay last 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    filter = { timestamp: { $gt: fiveMinAgo } };
  }

  const events = await AgentEventModel.find(filter).sort({ _id: 1 }).limit(1000).lean();

  for (const event of events) {
    const eventType = `agent:${event.type}`;
    const id = event._id.toString();
    res.write(
      `event: ${eventType}\nid: ${id}\ndata: ${JSON.stringify({ agentRunId: event.agentRunId, ...(event.data as object) })}\n\n`
    );
  }
}

async function replayAgentEvents(
  res: import('express').Response,
  agentRunId: string,
  afterId: string
): Promise<void> {
  let filter: Record<string, unknown> = { agentRunId };
  if (Types.ObjectId.isValid(afterId)) {
    filter._id = { $gt: new Types.ObjectId(afterId) };
  } else {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    filter.timestamp = { $gt: fiveMinAgo };
  }

  const events = await AgentEventModel.find(filter).sort({ _id: 1 }).lean();

  for (const event of events) {
    const eventType = `agent:${event.type}`;
    const id = event._id.toString();
    res.write(
      `event: ${eventType}\nid: ${id}\ndata: ${JSON.stringify({ agentRunId: event.agentRunId, ...(event.data as object) })}\n\n`
    );
  }
}

export default router;
