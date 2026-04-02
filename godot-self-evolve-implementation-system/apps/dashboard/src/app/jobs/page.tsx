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
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  // Map from jobId -> textarea content for rows currently in pending-reject mode
  const [pendingReject, setPendingReject] = useState<Record<string, string>>({});

  useEffect(() => {
    api.listJobs().then((j) => setJobs(j as Job[]));
  }, []);

  const handleSSEEvent = useCallback((eventType: string) => {
    if (eventType === 'job:requires_approval' || eventType === 'job:failed') {
      api.listJobs().then((j) => setJobs(j as Job[]));
    }
  }, []);

  useGlobalSSE(handleSSEEvent);

  const handleApprove = async (id: string) => {
    await api.approveJob(id);
    api.listJobs().then((j) => setJobs(j as Job[]));
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
    api.listJobs().then((j) => setJobs(j as Job[]));
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
                  <TableCell>{j.type}</TableCell>
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
                    {j.requiresApproval &&
                      j.approvalStatus === 'pending' &&
                      (pendingReject[j._id] !== undefined ? (
                        <div className="flex items-start gap-1">
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
                        <div className="flex gap-1">
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
                      ))}
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
