'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { useGlobalSSE } from '@/hooks/use-sse';

interface Cycle {
  _id: number;
  goal: string;
  phase: string;
  status: string;
  tasks: string[];
  startedAt: string;
  completedAt?: string;
  metrics?: {
    totalCostUsd: number;
    tasksCompleted: number;
    tasksFailed: number;
    totalDurationMs: number;
  };
}

export default function CyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [newGoal, setNewGoal] = useState('');

  useEffect(() => {
    api.listCycles().then((c) => setCycles(c as Cycle[]));
  }, []);

  const handleEvent = useCallback((eventType: string) => {
    if (
      eventType === 'cycle:phase_changed' ||
      eventType === 'cycle:completed' ||
      eventType === 'cycle:failed'
    ) {
      api.listCycles().then((c) => setCycles(c as Cycle[]));
    }
  }, []);

  useGlobalSSE(handleEvent);

  const handleCreate = async () => {
    if (!newGoal.trim()) return;
    await api.createCycle(newGoal);
    setNewGoal('');
    api.listCycles().then((c) => setCycles(c as Cycle[]));
  };

  return (
    <div className="pt-4">
      <h1 className="mb-4 text-2xl font-semibold">Cycles</h1>

      <Card className="mb-4">
        <CardContent className="flex gap-2 p-4">
          <Input
            type="text"
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Enter cycle goal..."
            className="flex-1 font-mono text-xs"
          />
          <Button onClick={handleCreate}>Create Cycle</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Goal</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((c) => (
                <TableRow key={c._id}>
                  <TableCell>
                    <Link href={`/cycles/${c._id}`} className="text-primary hover:underline">
                      {c._id}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">{c.goal}</TableCell>
                  <TableCell>
                    <StatusBadge status={c.phase} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>{c.tasks.length}</TableCell>
                  <TableCell>${c.metrics?.totalCostUsd?.toFixed(2) ?? '---'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(c.startedAt).toLocaleDateString()}
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
