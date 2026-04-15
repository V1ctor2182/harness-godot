'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useAgentSSE } from '@/hooks/use-sse';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge, LiveDot } from '@/components/status-badge';

interface AgentEvent {
  _id: string;
  type: string;
  sequenceNum: number;
  data: Record<string, unknown>;
  timestamp: string;
}

interface ReviewIssue {
  file: string;
  line?: number;
  severity: 'error' | 'warning' | 'info';
  description: string;
}

interface OrchestratorPlan {
  goal: string;
  tasks: unknown[];
}

interface ContextFeedback {
  useful: string[];
  missing: string[];
  unnecessary: string[];
}

interface AgentOutput {
  summary?: string;
  filesChanged?: string[];
  decisions?: string[];
  branch?: string;
  prNumber?: number;
  reviewVerdict?: 'approved' | 'changes-requested';
  issues?: ReviewIssue[];
  suggestions?: string[];
  plan?: OrchestratorPlan;
  contextFeedback?: ContextFeedback;
}

interface AgentRun {
  _id: string;
  role: string;
  status: string;
  taskId?: string;
  cycleId: number;
  model: string;
  budgetUsd: number;
  costUsd?: number;
  durationMs?: number;
  error?: string;
  output?: AgentOutput;
}

function eventBadgeVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (type === 'tool_use') return 'default';
  if (type === 'error') return 'destructive';
  if (type === 'completion') return 'secondary';
  return 'outline';
}

function EventContent({ type, data }: { type: string; data: Record<string, unknown> }) {
  if (type === 'text') {
    return <div className="whitespace-pre-wrap">{data.content as string}</div>;
  }
  if (type === 'tool_use') {
    return (
      <div>
        <span className="font-semibold">{data.toolName as string}</span>
        <pre className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap max-h-24 overflow-hidden">
          {JSON.stringify(data.toolInput, null, 2)}
        </pre>
      </div>
    );
  }
  if (type === 'tool_result') {
    return (
      <pre
        className={`text-xs mt-0.5 whitespace-pre-wrap max-h-24 overflow-hidden ${
          (data.isError as boolean) ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        {(data.output as string)?.slice(0, 200)}
      </pre>
    );
  }
  if (type === 'completion') {
    return (
      <div className="text-success">
        Completed — ${(data.costUsd as number)?.toFixed(2)} — {((data.durationMs as number) / 1000).toFixed(0)}s
      </div>
    );
  }
  if (type === 'error') {
    return <div className="text-destructive">{data.message as string}</div>;
  }
  return <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>;
}

function SeverityBadge({ severity }: { severity: 'error' | 'warning' | 'info' }) {
  const cls =
    severity === 'error'
      ? 'badge badge-failed'
      : severity === 'warning'
        ? 'badge badge-paused'
        : 'badge badge-pending';
  return <span className={cls}>{severity}</span>;
}

function StructuredOutputPanel({ role, output }: { role: string; output: AgentOutput }) {
  const contextFeedback = output.contextFeedback;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Structured Output</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 font-mono text-sm">
        {output.summary && role !== 'reviewer' && (
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Summary</div>
            <p className="font-sans">{output.summary}</p>
          </div>
        )}

        {role === 'reviewer' && (
          <>
            {output.reviewVerdict && (
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Verdict</div>
                <span
                  className={`badge ${output.reviewVerdict === 'approved' ? 'badge-completed' : 'badge-failed'}`}
                >
                  {output.reviewVerdict}
                </span>
              </div>
            )}
            {output.summary && (
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Summary</div>
                <p className="font-sans">{output.summary}</p>
              </div>
            )}
            {output.issues && output.issues.length > 0 && (
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                  Issues ({output.issues.length})
                </div>
                <ul className="space-y-1.5">
                  {output.issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <SeverityBadge severity={issue.severity} />
                      <span className="text-accent">{issue.file}</span>
                      {issue.line !== undefined && <span className="text-muted-foreground">:{issue.line}</span>}
                      <span className="font-sans text-muted-foreground">— {issue.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {output.suggestions && output.suggestions.length > 0 && (
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                  Suggestions ({output.suggestions.length})
                </div>
                <ul className="list-disc pl-5 space-y-0.5 font-sans">
                  {output.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {role === 'coder' && (
          <>
            {(output.branch ?? output.prNumber) && (
              <div className="flex gap-4">
                {output.branch && (
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Branch</div>
                    <span className="text-accent">{output.branch}</span>
                  </div>
                )}
                {output.prNumber && (
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">PR</div>
                    <span className="text-accent">#{output.prNumber}</span>
                  </div>
                )}
              </div>
            )}
            {output.filesChanged && output.filesChanged.length > 0 && (
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                  Files Changed ({output.filesChanged.length})
                </div>
                <ul className="space-y-0.5">
                  {output.filesChanged.map((f, i) => (
                    <li key={i} className="text-accent">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {role === 'orchestrator' && output.plan && (
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Plan</div>
            <div className="font-sans space-y-1">
              <div>
                <span className="text-muted-foreground">Goal:</span> {output.plan.goal}
              </div>
              <div>
                <span className="text-muted-foreground">Tasks:</span> {output.plan.tasks.length} task
                {output.plan.tasks.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        )}

        {output.decisions && output.decisions.length > 0 && (
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
              Decisions ({output.decisions.length})
            </div>
            <ul className="list-disc pl-5 space-y-0.5 font-sans">
              {output.decisions.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}

        {contextFeedback && (
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Context Feedback</div>
            <div className="flex gap-4 font-sans text-xs">
              <span className="text-success">{contextFeedback.useful.length} useful</span>
              <span className="text-destructive">{contextFeedback.missing.length} missing</span>
              <span className="text-muted-foreground">{contextFeedback.unnecessary.length} unnecessary</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface AgentDetailProps {
  agentRunId: string;
  eventScrollHeight?: string;
}

export function AgentDetail({ agentRunId, eventScrollHeight = '600px' }: AgentDetailProps) {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [liveText, setLiveText] = useState('');

  useEffect(() => {
    api.getAgentRun(agentRunId).then((r) => setRun(r as AgentRun));
    api.getAgentEvents(agentRunId).then((e) => setEvents(e as AgentEvent[]));
  }, [agentRunId]);

  const { connected } = useAgentSSE(agentRunId, (type, data) => {
    if (type === 'agent:text_delta') {
      setLiveText((prev) => prev + ((data as { text: string }).text ?? ''));
    } else if (type === 'agent:text') {
      setLiveText('');
      setEvents((prev) => [
        ...prev,
        {
          _id: String(Date.now()),
          type: 'text',
          sequenceNum: prev.length + 1,
          data: data as Record<string, unknown>,
          timestamp: new Date().toISOString(),
        },
      ]);
    } else if (
      type === 'agent:tool_use' ||
      type === 'agent:tool_result' ||
      type === 'agent:completion' ||
      type === 'agent:error'
    ) {
      setEvents((prev) => [
        ...prev,
        {
          _id: String(Date.now()),
          type: type.replace('agent:', ''),
          sequenceNum: prev.length + 1,
          data: data as Record<string, unknown>,
          timestamp: new Date().toISOString(),
        },
      ]);
    } else if (type === 'agent:completed') {
      const payload = data as { agentRunId: string };
      if (payload.agentRunId === agentRunId) {
        setLiveText('');
        api.getAgentRun(agentRunId).then((r) => setRun(r as AgentRun));
      }
    }
  });

  if (!run) return <div className="pt-4 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold truncate">{run._id}</h1>
        <div className="flex items-center gap-2">
          <StatusBadge status={run.status} />
          {connected && <LiveDot />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xs text-muted-foreground font-normal">Role</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-semibold">{run.role}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xs text-muted-foreground font-normal">Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-semibold">
              ${run.costUsd?.toFixed(2) ?? '\u2014'} / ${run.budgetUsd}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-xs text-muted-foreground font-normal">Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-semibold">
              {run.durationMs ? `${(run.durationMs / 1000).toFixed(0)}s` : 'Running...'}
            </div>
          </CardContent>
        </Card>
      </div>

      {run.output && <StructuredOutputPanel role={run.role} output={run.output} />}

      {run.error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm text-destructive">{run.error}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Event Stream ({events.length} events)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea style={{ height: eventScrollHeight }}>
            <div className="space-y-0">
              {events.map((e) => (
                <div key={e._id} className="py-1.5 border-b border-border">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] text-muted-foreground">#{e.sequenceNum}</span>
                    <Badge variant={eventBadgeVariant(e.type)}>{e.type}</Badge>
                  </div>
                  <EventContent type={e.type} data={e.data} />
                </div>
              ))}
              {liveText && (
                <div className="py-1.5 text-muted-foreground italic">
                  {liveText}
                  <span className="animate-pulse">|</span>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
