// ─── Defaults ────────────────────────────────────────────────────────

export const DEFAULT_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_BUDGET_USD = 5;
export const DEFAULT_MAX_RETRIES = 1;

// ─── Timeouts (aligned with architecture 05-infrastructure.md §5.4) ─

export const ORCHESTRATOR_TIMEOUT_MS = 10 * 60 * 1_000; // 10 min (5 min arch + buffer for Godot import)
export const CODER_TIMEOUT_MS = 15 * 60 * 1_000; // 15 min (10 min arch + buffer for amd64 emulation)
export const TESTER_TIMEOUT_MS = 10 * 60 * 1_000; // 10 min
export const REVIEWER_TIMEOUT_MS = 5 * 60 * 1_000; // 5 min
export const INTEGRATOR_TIMEOUT_MS = 10 * 60 * 1_000; // 10 min base (dynamic: + test_count * 5s, max 30min)
export const CURATOR_TIMEOUT_MS = 5 * 60 * 1_000; // 5 min
export const INTEGRATOR_MAX_TIMEOUT_MS = 30 * 60 * 1_000; // 30 min absolute max

// Godot-specific test timeouts
export const GUT_TIMEOUT_MS = 3 * 60 * 1_000; // 3 min (configurable via performance_thresholds.json)
export const INTEGRATION_TEST_TIMEOUT_MS = 2 * 60 * 1_000; // 2 min
export const VISUAL_TEST_TIMEOUT_MS = 5 * 60 * 1_000; // 5 min
export const GODOT_IMPORT_TIMEOUT_S = 120; // 2 min (entrypoint.sh timeout command)

export const CONCURRENT_AGENT_SLOTS = 3;
export const CONCURRENT_INFRA_SLOTS = 2; // Architecture: 2 infra slots
export const GODOT_EDITOR_SLOTS = 1; // MCP Pro single connection
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

export const TOOL_RESULT_MAX_BYTES = 10_240;

export const QUALITY_SCORE_USEFUL_DELTA = 1.0;
export const QUALITY_SCORE_UNNECESSARY_DELTA = -1.5;
export const QUALITY_SCORE_DECAY = 0.95;
export const QUALITY_SCORE_MIN = -10;
export const QUALITY_SCORE_MAX = 100;

export const SPENDING_WARNING_THRESHOLD = 0.8;

export const CONFLICT_RETRY_ESCALATION_THRESHOLD = 0.2;

// Retry limits (architecture 03-operation-specs.md §4.7)
export const MAX_TEST_RETRIES = 1; // TEST phase: per-task max 1 retry
export const MAX_REVIEW_CYCLES = 1; // REVIEW phase: per-task max 1 retry
export const MAX_GLOBAL_RETRIES = 3; // TEST + REVIEW total per cycle → blocked
export const MAX_RETRY_CODER_RUNS = 1; // Legacy compat (same as MAX_TEST_RETRIES)

export const NETWORK_TIMEOUT_MS = 300_000;

// ─── Timeout Map ─────────────────────────────────────────────────────

export const ROLE_TIMEOUT_MS: Record<string, number> = {
  orchestrator: ORCHESTRATOR_TIMEOUT_MS,
  coder: CODER_TIMEOUT_MS,
  tester: TESTER_TIMEOUT_MS,
  reviewer: REVIEWER_TIMEOUT_MS,
  curator: CURATOR_TIMEOUT_MS,
  integrator: INTEGRATOR_TIMEOUT_MS,
};

// ─── Protected Paths (Godot critical files) ──────────────────────────

export const PROTECTED_PATHS = [
  'agents/',
  'prd/',
  'knowledge/boot.md',
  'project.godot',
  'export_presets.cfg',
  '.gutconfig.json',
  'docker/',
  'rooms/_tree.yaml',
];

// ─── Container Labels ────────────────────────────────────────────────

export const AGENT_CONTAINER_LABEL = 'harness';
export const AGENT_CONTAINER_LABEL_VALUE = 'agent';
// Legacy label key, read-only. Kept so the first boot after the
// Phase A rename can still discover and clean up containers started under
// the old label. Remove after one release cycle once no zombie-farm
// containers are expected on any dev machine.
export const LEGACY_AGENT_CONTAINER_LABEL = 'zombie-farm';

// ─── Task ID Format ──────────────────────────────────────────────────

export const TASK_ID_PREFIX = 'TASK-';
export const TASK_ID_PAD_LENGTH = 3;

// ─── Retry Backoff ──────────────────────────────────────────────────

export const RETRY_BACKOFF_MS = [30_000, 120_000]; // 30s, 2min (2 tiers; DEFAULT_MAX_RETRIES=1)

// ─── Spec Type Priority (for context builder sorting) ───────────────

export const SPEC_TYPE_PRIORITY: Record<string, number> = {
  constraint: 0,
  decision: 1,
  convention: 2,
  context: 3,
  intent: 4,
  contract: 5,
  change: 6,
};

// ─── Godot ───────────────────────────────────────────────────────────

export const GODOT_VERSION = '4.6.1';
export const AGENT_DOCKER_IMAGE = `godot-agent:${GODOT_VERSION}`;

// ─── Reload ─────────────────────────────────────────────────────────

export const RELOAD_TRIGGER_PATH = '/reload/trigger';
