// ─── Defaults ────────────────────────────────────────────────────────

export const DEFAULT_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_BUDGET_USD = 5;
export const DEFAULT_MAX_RETRIES = 3;

export const CODER_TIMEOUT_MS = 1_800_000; // 30 min
export const ORCHESTRATOR_TIMEOUT_MS = 1_200_000; // 20 min
export const REVIEWER_TIMEOUT_MS = 900_000; // 15 min

export const CONCURRENT_AGENT_SLOTS = 3;
export const CONCURRENT_INFRA_SLOTS = 8;
export const JOB_POLL_INTERVAL_MS = 5_000;

export const SSE_HEARTBEAT_INTERVAL_MS = 30_000;

export const AGENT_EVENT_TTL_DAYS = 30;
export const JOB_RETENTION_DAYS = 30;

// ─── Resource Limits ─────────────────────────────────────────────────

export const CONTAINER_MEMORY_MB = 4096;
export const CONTAINER_MEMORY_MAX_MB = 8192;
export const CONTAINER_CPU_COUNT = 1;

// ─── Constraints ─────────────────────────────────────────────────────

export const MIN_PLAN_TASKS = 3;
export const MAX_PLAN_TASKS = 7;

export const TOOL_RESULT_MAX_BYTES = 10_240; // 10 KB truncation for ToolResultEvent.output

export const QUALITY_SCORE_USEFUL_DELTA = 1.0;
export const QUALITY_SCORE_UNNECESSARY_DELTA = -1.5;
export const QUALITY_SCORE_DECAY = 0.95;
export const QUALITY_SCORE_MIN = -10;
export const QUALITY_SCORE_MAX = 100;

export const SPENDING_WARNING_THRESHOLD = 0.8;

export const CONFLICT_RETRY_ESCALATION_THRESHOLD = 0.2; // 20% of tasks

export const MAX_REVIEW_CYCLES = 2; // Max coder→reviewer round-trips before auto-failing
export const MAX_RETRY_CODER_RUNS = 3; // Max coder attempts per task (including CI failures) before auto-failing

export const NETWORK_TIMEOUT_MS = 300_000; // 5 min no-event kill threshold

// ─── Timeout Map ─────────────────────────────────────────────────────

export const ROLE_TIMEOUT_MS: Record<string, number> = {
  orchestrator: ORCHESTRATOR_TIMEOUT_MS,
  coder: CODER_TIMEOUT_MS,
  reviewer: REVIEWER_TIMEOUT_MS,
  curator: REVIEWER_TIMEOUT_MS, // Same timeout as reviewer
  integrator: CODER_TIMEOUT_MS, // Same timeout as coder — merging + conflict resolution + tests
};

// ─── Protected Paths ─────────────────────────────────────────────────
// PRs modifying these always require human approval, regardless of auto-approval settings

export const PROTECTED_PATHS = ['CLAUDE.md', 'agents/', 'docs/architecture.md', 'docker/'];

// ─── Container Labels ────────────────────────────────────────────────

export const AGENT_CONTAINER_LABEL = 'erika';
export const AGENT_CONTAINER_LABEL_VALUE = 'agent';

// ─── Task ID Format ──────────────────────────────────────────────────

export const TASK_ID_PREFIX = 'TASK-';
export const TASK_ID_PAD_LENGTH = 3;

// ─── Reload ─────────────────────────────────────────────────────────

export const RELOAD_TRIGGER_PATH = '/reload/trigger';

export const AGENT_DOCKER_IMAGE = 'godot-agent:4.6.1';
export const MAX_TEST_RETRIES = 3;

