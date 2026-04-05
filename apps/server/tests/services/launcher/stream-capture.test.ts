import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

// --- Hoisted mocks ---
const mockBroadcast = vi.hoisted(() =>
  vi.fn<(event: string, data: Record<string, unknown>, filter?: Record<string, unknown>) => void>()
);
const mockAgentEventCreate = vi.hoisted(() => vi.fn<(doc: unknown) => Promise<unknown>>());
const mockAgentRunUpdateOne = vi.hoisted(() =>
  vi.fn<(filter: unknown, update: unknown) => Promise<unknown>>()
);

vi.mock('../../../src/services/sse-manager.js', () => ({
  broadcast: mockBroadcast,
}));

vi.mock('../../../src/services/../../src/models/agent-event.js', () => ({
  AgentEventModel: {
    create: mockAgentEventCreate,
    findOne: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    }),
  },
}));

vi.mock('../../../src/services/../../src/models/agent-run.js', () => ({
  AgentRunModel: {
    updateOne: mockAgentRunUpdateOne,
  },
}));

import { captureStream } from '../../../src/services/launcher/stream-capture.js';

// Helper: build a Readable stream from an array of NDJSON lines
function makeStream(lines: string[]): Readable {
  return Readable.from(lines.join('\n'));
}

const AGENT_RUN_ID = 'test-run-123';

describe('stream-capture: captureStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentEventCreate.mockResolvedValue({});
    mockAgentRunUpdateOne.mockResolvedValue({});
  });

  // ------------------------------------------------------------------
  // NDJSON parsing
  // ------------------------------------------------------------------

  it('skips empty lines without error', async () => {
    const stream = makeStream(['', '   ', '']);
    const result = await captureStream(stream, AGENT_RUN_ID);
    expect(result.eventCount).toBe(0);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('skips malformed (non-JSON) lines without throwing', async () => {
    const stream = makeStream(['not json at all', '{ broken json', 'another bad line']);
    const result = await captureStream(stream, AGENT_RUN_ID);
    expect(result.eventCount).toBe(0);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('processes valid JSON lines mixed with malformed lines', async () => {
    const systemLine = JSON.stringify({ type: 'system', subtype: 'init' });
    const badLine = 'not-json';
    const stream = makeStream([systemLine, badLine]);
    const result = await captureStream(stream, AGENT_RUN_ID);
    expect(result.eventCount).toBe(1); // only the system event counted
  });

  // ------------------------------------------------------------------
  // system events
  // ------------------------------------------------------------------

  it('broadcasts agent:system for system events', async () => {
    const line = JSON.stringify({ type: 'system', subtype: 'init' });
    const stream = makeStream([line]);
    await captureStream(stream, AGENT_RUN_ID);

    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:system',
      expect.objectContaining({ agentRunId: AGENT_RUN_ID })
    );
    expect(mockAgentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'system', agentRunId: AGENT_RUN_ID })
    );
  });

  // ------------------------------------------------------------------
  // assistant messages — text
  // ------------------------------------------------------------------

  it('broadcasts agent:text for assistant text content blocks', async () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello, world!' }],
      },
    });
    const stream = makeStream([line]);
    const result = await captureStream(stream, AGENT_RUN_ID);

    expect(result.eventCount).toBe(1);
    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:text',
      expect.objectContaining({ agentRunId: AGENT_RUN_ID, content: 'Hello, world!' }),
      expect.objectContaining({ agentRunId: AGENT_RUN_ID })
    );
    expect(mockAgentEventCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'text' }));
  });

  // ------------------------------------------------------------------
  // assistant messages — tool_use
  // ------------------------------------------------------------------

  it('broadcasts agent:tool_use for assistant tool_use content blocks', async () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_abc',
            name: 'Bash',
            input: { command: 'ls -la' },
          },
        ],
      },
    });
    const stream = makeStream([line]);
    const result = await captureStream(stream, AGENT_RUN_ID);

    expect(result.eventCount).toBe(1);
    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:tool_use',
      expect.objectContaining({
        agentRunId: AGENT_RUN_ID,
        toolName: 'Bash',
        toolUseId: 'toolu_abc',
        toolInput: { command: 'ls -la' },
      }),
      expect.objectContaining({ agentRunId: AGENT_RUN_ID })
    );
    expect(mockAgentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool_use' })
    );
  });

  // ------------------------------------------------------------------
  // user messages — tool_result
  // ------------------------------------------------------------------

  it('broadcasts agent:tool_result for user tool_result content blocks', async () => {
    const line = JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_abc',
            content: 'file listing output',
            is_error: false,
          },
        ],
      },
    });
    const stream = makeStream([line]);
    const result = await captureStream(stream, AGENT_RUN_ID);

    expect(result.eventCount).toBe(1);
    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:tool_result',
      expect.objectContaining({
        agentRunId: AGENT_RUN_ID,
        toolUseId: 'toolu_abc',
        output: 'file listing output',
        isError: false,
      }),
      expect.objectContaining({ agentRunId: AGENT_RUN_ID })
    );
    expect(mockAgentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool_result' })
    );
  });

  it('truncates tool_result content that exceeds TOOL_RESULT_MAX_BYTES', async () => {
    const bigOutput = 'x'.repeat(20_000);
    const line = JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_big',
            content: bigOutput,
            is_error: false,
          },
        ],
      },
    });
    const stream = makeStream([line]);
    await captureStream(stream, AGENT_RUN_ID);

    const [, broadcastData] = mockBroadcast.mock.calls[0];
    expect(typeof broadcastData['output']).toBe('string');
    expect((broadcastData['output'] as string).endsWith('...(truncated)')).toBe(true);
    expect(Buffer.byteLength(broadcastData['output'] as string)).toBeLessThan(20_000);
  });

  // ------------------------------------------------------------------
  // stream_event — text_delta
  // ------------------------------------------------------------------

  it('broadcasts agent:text_delta for content_block_delta stream events', async () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'partial ' },
      },
    });
    const stream = makeStream([line]);
    const result = await captureStream(stream, AGENT_RUN_ID);

    // stream_event deltas are NOT persisted
    expect(result.eventCount).toBe(0);
    expect(mockAgentEventCreate).not.toHaveBeenCalled();

    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:text_delta',
      expect.objectContaining({ agentRunId: AGENT_RUN_ID, text: 'partial ' }),
      expect.objectContaining({ agentRunId: AGENT_RUN_ID })
    );
  });

  it('ignores stream_events that are not content_block_delta', async () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: { type: 'message_start', message: {} },
    });
    const stream = makeStream([line]);
    await captureStream(stream, AGENT_RUN_ID);

    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // result (completion) events
  // ------------------------------------------------------------------

  it('broadcasts agent:completion for successful result events and extracts costUsd', async () => {
    const line = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'done',
      cost_usd: 0.042,
      input_tokens_used: 1000,
      output_tokens_used: 500,
      duration_ms: 3000,
    });
    const stream = makeStream([line]);
    const result = await captureStream(stream, AGENT_RUN_ID);

    expect(result.completionEvent).toBeDefined();
    expect(result.completionEvent?.costUsd).toBe(0.042);
    expect(result.completionEvent?.inputTokens).toBe(1000);
    expect(result.completionEvent?.outputTokens).toBe(500);
    expect(result.completionEvent?.durationMs).toBe(3000);

    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:completion',
      expect.objectContaining({
        agentRunId: AGENT_RUN_ID,
        costUsd: 0.042,
        result: 'done',
      }),
      expect.objectContaining({ agentRunId: AGENT_RUN_ID })
    );
    expect(mockAgentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'completion' })
    );
  });

  it('broadcasts agent:error for error result events', async () => {
    const line = JSON.stringify({
      type: 'result',
      is_error: true,
      result: 'something went wrong',
      subtype: 'timeout',
    });
    const stream = makeStream([line]);
    await captureStream(stream, AGENT_RUN_ID);

    expect(mockBroadcast).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({
        agentRunId: AGENT_RUN_ID,
        message: 'something went wrong',
        code: 'timeout',
      }),
      expect.objectContaining({ agentRunId: AGENT_RUN_ID })
    );
    expect(mockAgentEventCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  // ------------------------------------------------------------------
  // Structured output extraction
  // ------------------------------------------------------------------

  it('extracts structured JSON output from the completion result string', async () => {
    const output = JSON.stringify({
      summary: 'Implemented feature X',
      filesChanged: ['src/foo.ts'],
      decisions: ['Used pattern Y'],
    });
    const line = JSON.stringify({
      type: 'result',
      is_error: false,
      result: output,
      cost_usd: 0.01,
      input_tokens_used: 100,
      output_tokens_used: 50,
      duration_ms: 500,
    });
    const stream = makeStream([line]);
    const result = await captureStream(stream, AGENT_RUN_ID);

    expect(result.structuredOutput).toBeDefined();
    expect(result.structuredOutput?.summary).toBe('Implemented feature X');
    expect(result.structuredOutput?.filesChanged).toEqual(['src/foo.ts']);
  });

  it('extracts structured output from fenced JSON code blocks in the result', async () => {
    const jsonPayload = JSON.stringify({
      summary: 'Fenced block output',
      filesChanged: [],
      decisions: [],
    });
    const resultText = `Some prose before.\n\`\`\`json\n${jsonPayload}\n\`\`\`\nSome prose after.`;
    const line = JSON.stringify({
      type: 'result',
      is_error: false,
      result: resultText,
      cost_usd: 0,
      input_tokens_used: 0,
      output_tokens_used: 0,
      duration_ms: 0,
    });
    const stream = makeStream([line]);
    const result = await captureStream(stream, AGENT_RUN_ID);

    expect(result.structuredOutput).toBeDefined();
    expect(result.structuredOutput?.summary).toBe('Fenced block output');
  });

  it('returns undefined structuredOutput when result is plain text', async () => {
    const line = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'Task complete, no JSON here.',
      cost_usd: 0,
      input_tokens_used: 0,
      output_tokens_used: 0,
      duration_ms: 0,
    });
    const stream = makeStream([line]);
    const result = await captureStream(stream, AGENT_RUN_ID);

    expect(result.structuredOutput).toBeUndefined();
  });

  // ------------------------------------------------------------------
  // Sequence counting and AgentRun update
  // ------------------------------------------------------------------

  it('updates AgentRun eventCount after processing all lines', async () => {
    const lines = [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hi' }] },
      }),
      JSON.stringify({
        type: 'result',
        is_error: false,
        result: '',
        cost_usd: 0,
        input_tokens_used: 0,
        output_tokens_used: 0,
        duration_ms: 0,
      }),
    ];
    const stream = makeStream(lines);
    const result = await captureStream(stream, AGENT_RUN_ID);

    expect(result.eventCount).toBe(3);
    expect(mockAgentRunUpdateOne).toHaveBeenCalledWith(
      { _id: AGENT_RUN_ID },
      { $set: { eventCount: 3 } }
    );
  });
});
