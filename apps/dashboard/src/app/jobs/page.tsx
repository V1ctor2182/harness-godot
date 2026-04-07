'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { useGlobalSSE } from '@/hooks/use-sse';

interface Job {
  _id: string;
  type: string;
  status: string;
  pool: string;
  requiresApproval: boolean;
  approvalStatus?: string;
  retryCount: number;
  createdAt: string;
  error?: string;
  failedReason?: string;
  payload?: Record<string, unknown>;
}

interface PlanQuestion {
  id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  default?: string;
}

// ─── Plan Q&A Panel ─────────────────────────────────────────────────

function PlanQAPanel({ job, onComplete }: { job: Job; onComplete: () => void }) {
  const questions = (job.payload?.questions as PlanQuestion[]) ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const q of questions) {
      if (q.default) defaults[q.id] = q.default;
    }
    return defaults;
  });
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.answerJob(job._id, answers, feedback || undefined);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answers');
    } finally {
      setSubmitting(false);
    }
  };

  if (questions.length === 0) {
    return <span className="text-xs text-muted-foreground">No questions in payload</span>;
  }

  return (
    <div className="border border-blue-200 bg-blue-50/30 rounded p-3 mt-2 space-y-3">
      <p className="text-xs font-semibold text-blue-800">Orchestrator Questions</p>
      {questions.map((q) => (
        <div key={q.id} className="space-y-1">
          <p className="text-xs font-medium">{q.question}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((opt) => (
              <label key={opt.id} className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name={q.id}
                  value={opt.id}
                  checked={answers[q.id] === opt.id}
                  onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                  className="size-3"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      ))}
      <textarea
        placeholder="Additional feedback (optional)"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={2}
        className="w-full text-xs border border-border rounded p-2 bg-background resize-none"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        size="sm"
        className="text-xs"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? 'Replanning...' : 'Submit Answers'}
      </Button>
    </div>
  );
}

// ─── Plan Approval Panel ────────────────────────────────────────────

function PlanApprovalPanel({ job }: { job: Job }) {
  const planSummary = job.payload?.planSummary as string | undefined;
  const reviewerFeedback = job.payload?.reviewerFeedback as string | undefined;
  const forced = job.payload?.forcedByReviewerRejection as boolean | undefined;

  return (
    <div className="border border-border rounded p-3 mt-2 space-y-2">
      {forced && (
        <div className="bg-destructive/10 border border-destructive/30 rounded p-2">
          <p className="text-xs text-destructive font-semibold">
            Plan was rejected by reviewer twice. Review carefully before approving.
          </p>
        </div>
      )}
      {reviewerFeedback && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
          <p className="text-[10px] uppercase tracking-wider text-yellow-700 mb-1">Reviewer Feedback</p>
          <p className="text-xs text-yellow-900">{reviewerFeedback}</p>
        </div>
      )}
      {planSummary ? (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Plan Summary</p>
          <pre className="text-xs bg-muted rounded p-2 whitespace-pre-wrap font-mono overflow-auto max-h-60">
            {planSummary}
          </pre>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No plan summary available</p>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pendingReject, setPendingReject] = useState<Record<string, string>>({});

  const refreshJobs = useCallback(() => {
    api.listJobs().then((j) => setJobs(j as Job[]));
  }, []);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  const handleSSEEvent = useCallback((eventType: string) => {
    if (eventType === 'job:requires_approval' || eventType === 'job:failed') {
      refreshJobs();
    }
  }, [refreshJobs]);

  useGlobalSSE(handleSSEEvent);

  const handleApprove = async (id: string) => {
    await api.approveJob(id);
    refreshJobs();
  };

  const handleRejectClick = (id: string) => {
    setPendingReject((prev) => ({ ...prev, [id]: '' }));
  };

  const handleRejectCancel = (id: string) => {
    setPendingReject((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleRejectConfirm = async (id: string) => {
    const reason = pendingReject[id] ?? '';
    await api.rejectJob(id, reason);
    setPendingReject((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    refreshJobs();
  };

  return (
    <div className="pt-4">
      <h1 className="mb-4 text-2xl font-bold">Job Queue</h1>
      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pool</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Retries</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j._id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {j.type}
                      {(j.type === 'plan-qa' || j.type === 'plan-approval') && (
                        <Badge variant="outline" className="text-[9px] ml-1">
                          {j.type === 'plan-qa' ? 'Q&A' : 'Plan'}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={j.status} />
                    {j.status === 'failed' && j.failedReason && (
                      <div className="mt-1 text-xs text-muted-foreground">{j.failedReason}</div>
                    )}
                  </TableCell>
                  <TableCell>{j.pool}</TableCell>
                  <TableCell>
                    {j.requiresApproval ? (
                      <StatusBadge status={j.approvalStatus ?? 'pending'} />
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell>{j.retryCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(j.createdAt).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>
                    {/* Plan Q&A: show Q&A form instead of approve/reject */}
                    {j.type === 'plan-qa' && j.approvalStatus === 'pending' ? (
                      <PlanQAPanel job={j} onComplete={refreshJobs} />
                    ) : j.requiresApproval && j.approvalStatus === 'pending' ? (
                      <div>
                        {/* Plan Approval: show plan summary above approve/reject */}
                        {j.type === 'plan-approval' && <PlanApprovalPanel job={j} />}

                        {pendingReject[j._id] !== undefined ? (
                          <div className="flex items-start gap-1 mt-2">
                            <textarea
                              autoFocus
                              placeholder="Reason (optional)"
                              value={pendingReject[j._id]}
                              onChange={(e) =>
                                setPendingReject((prev) => ({ ...prev, [j._id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') handleRejectCancel(j._id);
                              }}
                              rows={2}
                              className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-48 resize-none"
                            />
                            <div className="flex flex-col gap-1">
                              <Button
                                size="xs"
                                variant="destructive"
                                onClick={() => handleRejectConfirm(j._id)}
                              >
                                Confirm Reject
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleRejectCancel(j._id)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-1 mt-2">
                            <Button
                              size="xs"
                              variant="outline"
                              className="border-success/50 text-success hover:bg-success/10"
                              onClick={() => handleApprove(j._id)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => handleRejectClick(j._id)}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
