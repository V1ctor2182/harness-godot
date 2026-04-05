'use client';

import { useEffect, useState } from 'react';
import {
  getSpendingAnalytics,
  getTaskAnalytics,
  SpendingAnalytics,
  TaskAnalytics,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';

export default function AnalyticsPage() {
  const [spending, setSpending] = useState<SpendingAnalytics | null>(null);
  const [tasks, setTasks] = useState<TaskAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSpendingAnalytics(), getTaskAnalytics()])
      .then(([spendingData, taskData]) => {
        setSpending(spendingData);
        setTasks(taskData);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      });
  }, []);

  const totalSpend: number = spending?.byCycle.reduce((sum, row) => sum + row.totalCostUsd, 0) ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Spending Analytics</h1>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Spend</p>
          <p className="text-2xl font-bold">${totalSpend.toFixed(2)}</p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-2">By Cycle</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Runs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spending?.byCycle.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-xs">
                      No data
                    </TableCell>
                  </TableRow>
                )}
                {spending?.byCycle.map((row) => (
                  <TableRow key={row.cycleId}>
                    <TableCell>{row.cycleId}</TableCell>
                    <TableCell>${row.totalCostUsd.toFixed(2)}</TableCell>
                    <TableCell>{row.runCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">By Role</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Runs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spending?.byRole.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-xs">
                      No data
                    </TableCell>
                  </TableRow>
                )}
                {spending?.byRole.map((row) => (
                  <TableRow key={row.role}>
                    <TableCell>{row.role}</TableCell>
                    <TableCell>${row.totalCostUsd.toFixed(2)}</TableCell>
                    <TableCell>{row.runCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">By Task Type</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Done</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Avg Retries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks?.byType.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-xs">
                      No data
                    </TableCell>
                  </TableRow>
                )}
                {tasks?.byType.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>{row.total}</TableCell>
                    <TableCell>{row.done}</TableCell>
                    <TableCell>{row.failed}</TableCell>
                    <TableCell>{row.avgRetryCount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">By Cycle (task outcomes)</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Done</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Avg Retries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks?.byCycle.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-xs">
                      No data
                    </TableCell>
                  </TableRow>
                )}
                {tasks?.byCycle.map((row) => (
                  <TableRow key={row.cycleId}>
                    <TableCell>{row.cycleId}</TableCell>
                    <TableCell>{row.total}</TableCell>
                    <TableCell>{row.done}</TableCell>
                    <TableCell>{row.failed}</TableCell>
                    <TableCell>{row.avgRetryCount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
