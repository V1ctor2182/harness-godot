'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
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

// TestResult is stored via the TestResult MongoDB model
// We fetch it via agent runs that have testResults in their output
interface AgentRun {
  _id: string;
  role: string;
  status: string;
  taskId?: string;
  cycleId: number;
  costUsd?: number;
  output?: {
    testResults?: TestResult[];
    summary?: string;
  };
  completedAt?: string;
}

interface TestResult {
  layer: string;
  status: string;
  totalTests?: number;
  passed?: number;
  failed?: number;
  durationMs?: number;
  failures?: Array<{
    testName: string;
    assertion: string;
    expected?: string;
    actual?: string;
    file?: string;
    line?: number;
  }>;
}

export default function TestsPage() {
  const [testerRuns, setTesterRuns] = useState<AgentRun[]>([]);
  const [coderRuns, setCoderRuns] = useState<AgentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  useEffect(() => {
    api.listAgentRuns({ role: 'tester' }).then((r) => setTesterRuns(r as AgentRun[]));
    api.listAgentRuns({ role: 'coder' }).then((r) => setCoderRuns(r as AgentRun[]));
  }, []);

  // Combine test results from both tester and coder runs
  const allTestResults: Array<{
    runId: string;
    role: string;
    taskId?: string;
    cycleId: number;
    results: TestResult[];
    completedAt?: string;
  }> = [];

  for (const run of [...testerRuns, ...coderRuns]) {
    if (run.output?.testResults?.length) {
      allTestResults.push({
        runId: run._id,
        role: run.role,
        taskId: run.taskId,
        cycleId: run.cycleId,
        results: run.output.testResults,
        completedAt: run.completedAt,
      });
    }
  }

  // Sort by most recent first
  allTestResults.sort((a, b) => {
    const da = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const db = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return db - da;
  });

  // Stats
  const totalRuns = allTestResults.length;
  const passedRuns = allTestResults.filter((r) => r.results.every((t) => t.status === 'passed')).length;
  const failedRuns = totalRuns - passedRuns;

  // By layer breakdown
  const layerStats: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const run of allTestResults) {
    for (const result of run.results) {
      const layer = result.layer || 'L1';
      if (!layerStats[layer]) layerStats[layer] = { total: 0, passed: 0, failed: 0 };
      layerStats[layer].total++;
      if (result.status === 'passed') layerStats[layer].passed++;
      else layerStats[layer].failed++;
    }
  }

  const selectedRunData = allTestResults.find((r) => r.runId === selectedRun);

  return (
    <div className="pt-4 font-mono">
      <h1 className="text-xl font-bold text-foreground mb-1">Tests</h1>
      <p className="text-xs text-muted-foreground mb-4">
        L1 GUT Unit · L2 Headless Integration · L3 Visual · L4 PRD Compliance
      </p>

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

      {/* Test runs table + detail */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Test Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Agent</TableHead>
                  <TableHead className="text-[10px]">Task</TableHead>
                  <TableHead className="text-[10px]">Layer</TableHead>
                  <TableHead className="text-[10px]">Result</TableHead>
                  <TableHead className="text-[10px]">Tests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allTestResults.slice(0, 20).map((run) =>
                  run.results.map((result, ri) => (
                    <TableRow
                      key={`${run.runId}-${ri}`}
                      className={`cursor-pointer ${selectedRun === run.runId ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedRun(run.runId)}
                    >
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[9px]">{run.role}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {run.taskId ? (
                          <Link href={`/tasks/${run.taskId}`} className="text-primary hover:underline">
                            {run.taskId}
                          </Link>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px]">{result.layer || 'L1'}</Badge>
                      </TableCell>
                      <TableCell>
                        {result.status === 'passed' ? (
                          <span className="text-success text-xs">✓ Passed</span>
                        ) : (
                          <span className="text-destructive text-xs">✗ Failed</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {result.passed ?? 0}/{result.totalTests ?? 0}
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {allTestResults.length === 0 && (
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
              {selectedRunData ? `${selectedRunData.role} · ${selectedRunData.taskId ?? 'N/A'}` : 'Select a test run'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedRunData ? (
              <div className="space-y-3">
                {selectedRunData.results.map((result, i) => (
                  <div key={i} className="border border-border rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-[9px]">{result.layer || 'L1'}</Badge>
                      {result.status === 'passed' ? (
                        <span className="text-success text-xs font-semibold">PASSED</span>
                      ) : (
                        <span className="text-destructive text-xs font-semibold">FAILED</span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {result.passed ?? 0}/{result.totalTests ?? 0} tests · {result.durationMs ?? 0}ms
                      </span>
                    </div>
                    {result.failures && result.failures.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-destructive">Failures:</p>
                        {result.failures.map((f, fi) => (
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
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">
                Click a test run to see details
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
