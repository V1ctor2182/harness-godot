// ─── Enums ───────────────────────────────────────────────────────────

export type CyclePhase = 'plan' | 'implement' | 'review' | 'integrate' | 'retrospect';
export type CycleStatus = 'active' | 'completed' | 'failed';

export type TaskStatus =
  | 'backlog'
  | 'ready'
  | 'in-progress'
  | 'in-review'
  | 'done'
  | 'blocked'
  | 'failed';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskType = 'feature' | 'bug' | 'chore' | 'refactor' | 'test';

export type AgentRole = 'orchestrator' | 'coder' | 'tester' | 'reviewer' | 'integrator' | 'curator' | (string & {});
export type AgentRunStatus = 'starting' | 'running' | 'completed' | 'failed' | 'timeout' | 'killed';

export type AgentEventType =
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'completion'
  | 'system';

export type JobType =
  | 'spawn'
  | 'wait-for-ci'
  | 'apply-plan'
  | 'advance-cycle'
  | 'curate-inbox'
  | 'next-cycle'
  | 'reload'
  | 'cleanup-prs'
  // Godot-specific job types
  | 'spawn-tester'
  | 'run-gut-tests'
  | 'run-integration-tests'
  | 'run-visual-tests'
  | 'run-prd-compliance'
  | 'create-fix-task'
  | 'validate-assets'
  | 'spawn-curator'
  | 'spawn-reflect';
export type JobStatus = 'pending' | 'active' | 'completed' | 'failed';
export type JobPool = 'agent' | 'infra';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type KnowledgeCategory =
  | 'skills'
  | 'decisions'
  | 'specs'
  | 'journal'
  | 'inbox'
  | 'pruned'
  | 'retrospectives';
export type KnowledgeStatus = 'active' | 'processed' | 'archived';

export type ControlMode = 'active' | 'paused' | 'killed';

export type CIStatus = 'pending' | 'running' | 'passed' | 'failed';
export type ReviewVerdict = 'approved' | 'changes-requested';

// ─── Core Documents ──────────────────────────────────────────────────

export interface Counter {
  _id: string;
  seq: number;
}

export interface Migration {
  _id: string;
  appliedAt: Date;
}

export interface CycleMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  totalCostUsd: number;
  totalDurationMs: number;
  goalCoverage?: number;
  /** Tasks where the coder AgentRun count > 1 (at least one reviewer rejection triggered a retry). */
  tasksRetried?: number;
  /** Tasks with status 'done' where coder ran exactly once (passed review on first attempt). */
  tasksPassedFirstReview?: number;
  /** Count of cycle tasks with lastRetryCause === 'review_rejection'. Absent when no tasks have lastRetryCause set. */
  tasksRetriedByReviewer?: number;
  /** Count of cycle tasks with lastRetryCause === 'ci_failure'. Absent when no tasks have lastRetryCause set. */
  tasksRetriedByCi?: number;
  /** Count of cycle tasks with lastRetryCause === 'pr_body_invalid'. Absent when no tasks have lastRetryCause set. */
  tasksRetriedByPrBody?: number;
}

export interface Cycle {
  _id: number;
  goal: string;
  phase: CyclePhase;
  status: CycleStatus;
  tasks: string[];
  startedAt: Date;
  completedAt?: Date;
  summary?: string;
  metrics?: CycleMetrics;
}

export interface TaskActivityEntry {
  timestamp: Date;
  action: string;
  agentRunId?: string;
}

export interface Task {
  _id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  cycleId: number;
  blockedBy: string[];
  branch?: string;
  prNumber?: number;
  prUrl?: string;
  assignedTo?: string;
  createdBy: string;
  acceptanceCriteria: string[];
  activityLog: TaskActivityEntry[];
  ciStatus?: CIStatus;
  reviewVerdict?: ReviewVerdict;
  retryCount: number;
  lastRetryCause?: 'ci_failure' | 'review_rejection' | 'no_pr' | 'pr_body_invalid';
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ContextFeedback {
  useful: string[];
  missing: string[];
  unnecessary: string[];
}

export interface AgentOutput {
  summary: string;
  filesChanged?: string[];
  decisions: string[];
  branch?: string;
  prNumber?: number;
}

export interface AgentRun {
  _id: string;
  role: string;
  status: AgentRunStatus;
  taskId?: string;
  cycleId: number;
  containerId?: string;
  systemPrompt: string;
  taskPrompt: string;
  model: string;
  budgetUsd: number;
  costUsd?: number;
  tokenUsage?: TokenUsage;
  branch?: string;
  prNumber?: number;
  eventCount: number;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  timeoutAt: Date;
  exitCode?: number;
  error?: string;
  contextFiles: string[];
  contextFeedback?: ContextFeedback;
  output?: AgentOutput;
  outputParseError?: boolean;
  outputValidationWarnings?: string[];
}

// ─── Agent Events ────────────────────────────────────────────────────

export interface TextEvent {
  content: string;
}

export interface ToolUseEvent {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId: string;
}

export interface ToolResultEvent {
  toolUseId: string;
  output: string;
  isError: boolean;
}

export interface ErrorEvent {
  message: string;
  code?: string;
}

export interface CompletionEvent {
  result: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface SystemEvent {
  message: string;
}

export type AgentEventData =
  | TextEvent
  | ToolUseEvent
  | ToolResultEvent
  | ErrorEvent
  | CompletionEvent
  | SystemEvent;

export interface AgentEvent {
  _id: string;
  agentRunId: string;
  sequenceNum: number;
  timestamp: Date;
  type: AgentEventType;
  data: AgentEventData;
}

// ─── Job ─────────────────────────────────────────────────────────────

export interface Job {
  _id: string;
  type: JobType;
  status: JobStatus;
  pool: JobPool;
  payload: Record<string, unknown>;
  requiresApproval: boolean;
  approvalStatus?: ApprovalStatus;
  approvedBy?: string;
  retryCount: number;
  maxRetries: number;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// ─── Knowledge ───────────────────────────────────────────────────────

export interface KnowledgeSource {
  type: 'human' | 'agent';
  agentRunId?: string;
  taskId?: string;
  cycleId?: number;
}

export interface KnowledgeFile {
  _id: string;
  category: KnowledgeCategory;
  title: string;
  snippet: string;
  content: string;
  status: KnowledgeStatus;
  source: KnowledgeSource;
  qualityScore?: number;
  lastReferencedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Control ─────────────────────────────────────────────────────────

export interface CycleOverride {
  paused?: boolean;
  humanMessage?: string;
}

export interface Control {
  _id: 'singleton';
  mode: ControlMode;
  humanMessage?: string;
  spendingCapUsd?: number;
  spentUsd: number;
  cycleOverrides: Record<string, CycleOverride>;
  autoApprovalCategories: string[];
  updatedAt: Date;
}

// ─── Agent Structured Output ─────────────────────────────────────────

export interface PlanTask {
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  acceptanceCriteria: string[];
  blockedBy: number[];
}

export interface OrchestratorPlan {
  goal: string;
  tasks: PlanTask[];
}

export interface ReviewIssue {
  file: string;
  line?: number;
  severity: 'error' | 'warning' | 'info';
  description: string;
}

export interface AgentStructuredOutput {
  summary: string;
  filesChanged?: string[];
  decisions: string[];
  contextFeedback: ContextFeedback;
  branch?: string;
  prNumber?: number;
  plan?: OrchestratorPlan;
  reviewVerdict?: 'approved' | 'changes-requested';
  issues?: ReviewIssue[];
  suggestions?: string[];
}

export interface RetryContext {
  previousError?: string;
  previousSummary?: string;
  reviewIssues?: ReviewIssue[];
  reviewSuggestions?: string[];
  reviewDecisions?: string[];
  filesChanged?: string[];
}

// ─── API Response Types ──────────────────────────────────────────────

export interface StatusResponse {
  uptime: number; // seconds, from process.uptime()
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  activeAgentCount: number;
}

// ─── SSE Event Types ─────────────────────────────────────────────────

export type SSEEventType =
  | 'agent:text_delta'
  | 'agent:text'
  | 'agent:tool_use'
  | 'agent:tool_result'
  | 'agent:error'
  | 'agent:system'
  | 'agent:completion'
  | 'agent:started'
  | 'agent:completed'
  | 'cycle:phase_changed'
  | 'cycle:completed'
  | 'cycle:failed'
  | 'task:created'
  | 'task:status_changed'
  | 'job:requires_approval'
  | 'job:failed'
  | 'review:ready'
  | 'system:spending_warning'
  | 'system:reload_triggered';

// ─── Godot-specific Types ───────────────────────────────────────────

export type TestLayer = 'L1' | 'L2' | 'L3' | 'L4';
export type TestResultStatus = 'passed' | 'failed' | 'error' | 'skipped';

export interface TestFailureDetail {
  testName: string;
  assertion: string;
  expected?: string;
  actual?: string;
  line?: number;
  file?: string;
}

export interface TestResult {
  _id?: string;
  taskId: string;
  cycleId: number;
  agentRunId: string;
  layer: TestLayer;
  status: TestResultStatus;
  durationMs: number;
  totalTests: number;
  passed: number;
  failed: number;
  failures: TestFailureDetail[];
  // L2 performance
  fps?: number;
  nodeCount?: number;
  memoryDeltaMb?: number;
  loadTimeMs?: number;
  // L3 visual
  screenshotIds?: string[];
  visualNotes?: string;
  // L4 PRD compliance
  prdViolations?: PrdViolation[];
  createdAt?: Date;
}

export interface PrdViolation {
  prdRef: string;
  expected: string;
  actual: string;
  severity: 'error' | 'warning';
}

export interface Screenshot {
  _id?: string;
  testResultId?: string;
  taskId: string;
  step: string;
  filepath: string;
  aiAnalysis?: {
    description: string;
    issues: string[];
    confidence: number;
  };
  createdAt?: Date;
}

// ─── Godot Task Extensions ──────────────────────────────────────────

export interface GodotPlanTask extends PlanTask {
  prdRefs?: string[];
  testRequirements?: ('unit' | 'integration' | 'visual' | 'prd-compliance')[];
  testScenarios?: {
    L2?: string[];
    L3?: string[];
  };
  estimatedFiles?: string[];
  requiredAssets?: string[];
  featureRooms?: string[];
  crossDomainRisks?: string[];
}

export interface GodotAgentOutput extends AgentStructuredOutput {
  testResults?: TestResult[];
  screenshots?: Screenshot[];
  sceneChanges?: string[];
  signalChanges?: string[];
  dataChanges?: string[];
  assetChanges?: string[];
  constraintsDiscovered?: string[];
}

// ─── Trust Level (architecture 03-operation-specs.md §4.7) ──────────

export type TrustLevel = 1 | 2 | 3;

export interface GodotControl extends Control {
  trustLevel: TrustLevel;
  retryLimits: {
    test: number;
    review: number;
    global: number;
  };
}
