'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, TestResultItem } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';

export default function TestsPage() {
  const [tests, setTests] = useState<TestResultItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.listTests()
      .then(setTests)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load tests'));
  }, []);

  // Stats
  const totalRuns = tests.length;
  const passedRuns = tests.filter((t) => t.status === 'passed').length;
  const failedRuns = totalRuns - passedRuns;

  // By layer breakdown
  const layerStats: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const result of tests) {
    const layer = result.layer || 'L1';
    if (!layerStats[layer]) layerStats[layer] = { total: 0, passed: 0, failed: 0 };
    layerStats[layer].total++;
    if (result.status === 'passed') layerStats[layer].passed++;
    else layerStats[layer].failed++;
  }

  const selectedTest = tests.find((t) => t._id === selectedId);

  return (
    <div className="pt-4 font-mono">
      <h1 className="text-xl font-bold text-foreground mb-1">Tests</h1>
      <p className="text-xs text-muted-foreground mb-4">
        L1 GUT Unit · L2 Headless Integration · L3 Visual · L4 PRD Compliance
      </p>

      {loadError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded p-2 mb-4">
          <span className="text-xs text-destructive">{loadError}</span>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Runs</p>
            <span className="text-2xl font-bold">{totalRuns}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pass Rate</p>
            <span className="text-2xl font-bold text-success">
              {totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0}%
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Passed</p>
            <span className="text-2xl font-bold text-success">{passedRuns}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Failed</p>
            <span className="text-2xl font-bold text-destructive">{failedRuns}</span>
          </CardContent>
        </Card>
      </div>

      {/* Layer breakdown */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {['L1', 'L2', 'L3', 'L4'].map((layer) => {
          const s = layerStats[layer] || { total: 0, passed: 0, failed: 0 };
          const rate = s.total > 0 ? Math.round((s.passed / s.total) * 100) : null;
          return (
            <Card key={layer}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[9px]">{layer}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {layer === 'L1' ? 'GUT Unit' : layer === 'L2' ? 'Integration' : layer === 'L3' ? 'Visual' : 'PRD Compliance'}
                  </span>
                </div>
                {s.total > 0 ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold">{rate}%</span>
                    <span className="text-[10px] text-muted-foreground">
                      {s.passed}✓ {s.failed > 0 ? `${s.failed}✗` : ''} / {s.total}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">No runs</span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Test results table + detail */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Test Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Task</TableHead>
                  <TableHead className="text-[10px]">Layer</TableHead>
                  <TableHead className="text-[10px]">Result</TableHead>
                  <TableHead className="text-[10px]">Tests</TableHead>
                  <TableHead className="text-[10px]">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.slice(0, 30).map((result) => (
                  <TableRow
                    key={result._id}
                    className={`cursor-pointer ${selectedId === result._id ? 'bg-muted' : ''}`}
                    onClick={() => setSelectedId(result._id)}
                  >
                    <TableCell className="text-xs">
                      {result.taskId ? (
                        <Link href={`/tasks/${result.taskId}`} className="text-primary hover:underline">
                          {result.taskId}
                        </Link>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px]">{result.layer}</Badge>
                    </TableCell>
                    <TableCell>
                      {result.status === 'passed' ? (
                        <span className="text-success text-xs">✓ Passed</span>
                      ) : (
                        <span className="text-destructive text-xs">✗ Failed</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {result.passed}/{result.totalTests}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {result.durationMs}ms
                    </TableCell>
                  </TableRow>
                ))}
                {tests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                      No test results yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detail panel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedTest ? `${selectedTest.taskId ?? 'N/A'} · ${selectedTest.layer}` : 'Select a test result'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTest ? (
              <div className="space-y-3">
                <div className="border border-border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[9px]">{selectedTest.layer}</Badge>
                    {selectedTest.status === 'passed' ? (
                      <span className="text-success text-xs font-semibold">PASSED</span>
                    ) : (
                      <span className="text-destructive text-xs font-semibold">FAILED</span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {selectedTest.passed}/{selectedTest.totalTests} tests · {selectedTest.durationMs}ms
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Cycle {selectedTest.cycleId} · Agent {selectedTest.agentRunId}
                  </p>
                  {selectedTest.failures && selectedTest.failures.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-destructive">Failures:</p>
                      {selectedTest.failures.map((f, fi) => (
                        <div key={fi} className="bg-destructive/5 border border-destructive/20 rounded p-2 text-xs">
                          <p className="font-semibold text-foreground">{f.testName}</p>
                          <p className="text-muted-foreground">{f.assertion}</p>
                          {f.expected && (
                            <p className="text-[10px]">
                              <span className="text-muted-foreground">expected:</span>{' '}
                              <span className="text-success">{f.expected}</span>{' '}
                              <span className="text-muted-foreground">got:</span>{' '}
                              <span className="text-destructive">{f.actual}</span>
                            </p>
                          )}
                          {f.file && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{f.file}:{f.line}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">
                Click a test result to see details
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
