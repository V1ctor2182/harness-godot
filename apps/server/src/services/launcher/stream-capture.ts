import { createInterface } from 'node:readline';
import { AgentEventModel } from '../../models/agent-event.js';
import { AgentRunModel } from '../../models/agent-run.js';
import { broadcast } from '../sse-manager.js';
import { TOOL_RESULT_MAX_BYTES } from '@harness/shared';
import type {
  AgentEventType,
  TextEvent,
  ToolUseEvent,
  ToolResultEvent,
  ErrorEvent,
  CompletionEvent,
  SystemEvent,
  AgentStructuredOutput,
} from '@harness/shared';

interface CaptureResult {
  eventCount: number;
  completionEvent?: CompletionEvent;
  structuredOutput?: AgentStructuredOutput;
  rateLimited?: boolean; // #25: detected "hit your limit" in output
}

async function persistEvent(
  agentRunId: string,
  sequenceNum: number,
  type: AgentEventType,
  data: TextEvent | ToolUseEvent | ToolResultEvent | ErrorEvent | CompletionEvent | SystemEvent
): Promise<void> {
  await AgentEventModel.create({
    agentRunId,
    sequenceNum,
    timestamp: new Date(),
    type,
    data,
  }).catch((err) => {
    console.error(`Failed to persist event #${sequenceNum} for ${agentRunId}:`, err.message);
  });
}

export async function captureStream(
  stream: NodeJS.ReadableStream,
  agentRunId: string
): Promise<CaptureResult> {
  let sequenceNum = 0;
  let completionEvent: CompletionEvent | undefined;
  let structuredOutput: AgentStructuredOutput | undefined;
  let rateLimited = false; // #25: track rate limit detection

  const rl = createInterface({ input: stream });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // Skip non-JSON lines (e.g., stderr noise)
    }

    const msgType = parsed['type'] as string;

    if (msgType === 'stream_event') {
      // Ephemeral — broadcast via SSE only, do not persist
      handleStreamEvent(parsed, agentRunId);
      continue;
    }

    if (msgType === 'system') {
      sequenceNum++;
      const data: SystemEvent = { message: 'Session initialized' };
      await persistEvent(agentRunId, sequenceNum, 'system', data);
      broadcast('agent:system', { agentRunId, ...data });
      continue;
    }

    if (msgType === 'assistant') {
      const message = parsed['message'] as Record<string, unknown> | undefined;
      if (!message) continue;

      const content = message['content'] as Array<Record<string, unknown>> | undefined;
      if (!content) continue;

      for (const block of content) {
        sequenceNum++;
        const blockType = block['type'] as string;

        if (blockType === 'text') {
          const data: TextEvent = { content: block['text'] as string };
          await persistEvent(agentRunId, sequenceNum, 'text', data);
          broadcast('agent:text', { agentRunId, ...data }, { agentRunId });
        } else if (blockType === 'tool_use') {
          const data: ToolUseEvent = {
            toolName: block['name'] as string,
            toolInput: block['input'] as Record<string, unknown>,
            toolUseId: block['id'] as string,
          };
          await persistEvent(agentRunId, sequenceNum, 'tool_use', data);
          broadcast('agent:tool_use', { agentRunId, ...data }, { agentRunId });
        }
      }
      continue;
    }

    if (msgType === 'user') {
      const message = parsed['message'] as Record<string, unknown> | undefined;
      if (!message) continue;

      const content = message['content'] as Array<Record<string, unknown>> | undefined;
      if (!content) continue;

      for (const block of content) {
        if (block['type'] !== 'tool_result') continue;
        sequenceNum++;

        let output = String(block['content'] ?? '');
        if (Buffer.byteLength(output) > TOOL_RESULT_MAX_BYTES) {
          output = output.substring(0, TOOL_RESULT_MAX_BYTES) + '\n...(truncated)';
        }

        const data: ToolResultEvent = {
          toolUseId: block['tool_use_id'] as string,
          output,
          isError: (block['is_error'] as boolean) ?? false,
        };
        await persistEvent(agentRunId, sequenceNum, 'tool_result', data);
        broadcast('agent:tool_result', { agentRunId, ...data }, { agentRunId });
      }
      continue;
    }

    if (msgType === 'result') {
      sequenceNum++;
      const isError = parsed['is_error'] as boolean;

      if (isError) {
        const errorMessage = (parsed['result'] as string) ?? 'Unknown error';
        // #25: Detect rate limit errors
        if (errorMessage.includes('hit your limit') || errorMessage.includes('rate limit') ||
            parsed['error'] === 'authentication_failed') {
          rateLimited = true;
        }
        const data: ErrorEvent = {
          message: errorMessage,
          code: parsed['subtype'] as string | undefined,
        };
        await persistEvent(agentRunId, sequenceNum, 'error', data);
        broadcast('agent:error', { agentRunId, ...data }, { agentRunId });
      } else {
        // Claude Code CLI uses total_cost_usd and usage.{input,output}_tokens
        const usage = parsed['usage'] as Record<string, unknown> | undefined;
        completionEvent = {
          result: (parsed['result'] as string) ?? '',
          costUsd: (parsed['total_cost_usd'] as number) ?? (parsed['cost_usd'] as number) ?? 0,
          inputTokens:
            (usage?.['input_tokens'] as number) ??
            (parsed['input_tokens_used'] as number) ?? 0,
          outputTokens:
            (usage?.['output_tokens'] as number) ??
            (parsed['output_tokens_used'] as number) ?? 0,
          durationMs: (parsed['duration_ms'] as number) ?? 0,
        };
        await persistEvent(agentRunId, sequenceNum, 'completion', completionEvent);
        broadcast('agent:completion', { agentRunId, ...completionEvent }, { agentRunId });

        // Extract structured output
        structuredOutput = extractStructuredOutput(completionEvent.result);
      }
      continue;
    }
  }

  // Update final event count
  await AgentRunModel.updateOne({ _id: agentRunId }, { $set: { eventCount: sequenceNum } });

  return { eventCount: sequenceNum, completionEvent, structuredOutput, rateLimited };
}

function handleStreamEvent(parsed: Record<string, unknown>, agentRunId: string): void {
  const event = parsed['event'] as Record<string, unknown> | undefined;
  if (!event) return;

  const eventType = event['type'] as string;
  if (eventType === 'content_block_delta') {
    const delta = event['delta'] as Record<string, unknown> | undefined;
    if (delta?.['type'] === 'text_delta') {
      broadcast(
        'agent:text_delta',
        {
          agentRunId,
          text: delta['text'] as string,
        },
        { agentRunId }
      );
    }
  }
}

function extractStructuredOutput(resultStr: string): AgentStructuredOutput | undefined {
  // Try direct JSON parse
  try {
    const parsed = JSON.parse(resultStr);
    if (parsed && typeof parsed === 'object' && 'summary' in parsed) {
      return parsed as AgentStructuredOutput;
    }
  } catch {
    /* not direct JSON */
  }

  // Try to find fenced JSON block
  const jsonBlockMatch = resultStr.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (parsed && typeof parsed === 'object' && 'summary' in parsed) {
        return parsed as AgentStructuredOutput;
      }
    } catch {
      /* malformed JSON block */
    }
  }

  return undefined;
}

export async function emitSystemEvent(agentRunId: string, message: string): Promise<void> {
  const lastEvent = await AgentEventModel.findOne({ agentRunId }).sort({ sequenceNum: -1 }).lean();

  const sequenceNum = (lastEvent?.sequenceNum ?? 0) + 1;

  await AgentEventModel.create({
    agentRunId,
    sequenceNum,
    timestamp: new Date(),
    type: 'system',
    data: { message } satisfies SystemEvent,
  });

  broadcast('agent:system', { agentRunId, message }, { agentRunId });
}
