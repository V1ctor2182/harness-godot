// Shared constants
export const ROLE_TIMEOUT_MS: Record<string, number> = {
  orchestrator: 600000,
  coder: 1800000,
  reviewer: 600000,
  tester: 600000,
  integrator: 600000,
};

export const SPENDING_WARNING_THRESHOLD = 0.8;
export const MAX_REVIEW_CYCLES = 3;
export const MAX_RETRY_CODER_RUNS = 3;
export const MAX_TEST_RETRIES = 3;
export const DEFAULT_MAX_RETRIES = 3;
export const RELOAD_TRIGGER_PATH = '/tmp/reload-trigger';

// Shared types
export type AgentRunStatus =
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout';

export type JobType =
  | 'spawn'
  | 'apply-plan'
  | 'wait-for-ci'
  | 'advance-cycle'
  | 'cleanup-prs';

export type JobPool = 'agent' | 'infra';

export type TaskType = string;
export type TaskPriority = 'low' | 'normal' | 'high';

export interface RetryContext {
  previousError?: string;
  previousSummary?: string;
  filesChanged?: string[];
  reviewIssues?: ReviewIssue[];
  reviewSuggestions?: string[];
  reviewDecisions?: string[];
}

export interface ReviewIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
}

export interface AgentStructuredOutput {
  summary: string;
  filesChanged: string[];
  decisions: string[];
  branch?: string;
  prNumber?: number;
  plan?: unknown;
  reviewVerdict?: 'approved' | 'changes-requested';
  issues?: ReviewIssue[];
  suggestions?: string[];
  contextFeedback?: unknown;
  testResults?: unknown[];
  screenshots?: unknown[];
}
