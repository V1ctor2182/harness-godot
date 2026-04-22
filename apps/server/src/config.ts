import 'dotenv/config';

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  return raw ? parseInt(raw, 10) : fallback;
}

export const config = {
  port: envInt('PORT', 3001),
  mongodbUri: env('MONGODB_URI', 'mongodb://localhost:27017/ludus'),
  nodeEnv: env('NODE_ENV', 'development'),
  logLevel: env('LOG_LEVEL', 'info'),

  claudeCodeOauthToken: env('CLAUDE_CODE_OAUTH_TOKEN', ''),
  ghToken: env('GH_TOKEN', ''),
  githubRepoUrl: env('GITHUB_REPO_URL', ''),
  baseBranch: env('BASE_BRANCH', 'master'),

  defaultModel: env('DEFAULT_MODEL', 'claude-sonnet-4-6'),
  coderTimeoutMs: envInt('CODER_TIMEOUT_MS', 1_800_000),
  orchestratorTimeoutMs: envInt('ORCHESTRATOR_TIMEOUT_MS', 1_200_000),
  reviewerTimeoutMs: envInt('REVIEWER_TIMEOUT_MS', 900_000),
  defaultBudgetUsd: envInt('DEFAULT_BUDGET_USD', 5),

  concurrentAgentSlots: envInt('CONCURRENT_AGENT_SLOTS', 3),
  concurrentInfraSlots: envInt('CONCURRENT_INFRA_SLOTS', 8),
  jobPollIntervalMs: envInt('JOB_POLL_INTERVAL_MS', 5_000),

  sseHeartbeatIntervalMs: envInt('SSE_HEARTBEAT_INTERVAL_MS', 30_000),

  serverApiUrl: env('SERVER_API_URL', 'http://host.docker.internal:3001/api'),

  agentEventTtlDays: envInt('AGENT_EVENT_TTL_DAYS', 30),
  jobRetentionDays: envInt('JOB_RETENTION_DAYS', 30),

  discordWebhookUrl: env('DISCORD_WEBHOOK_URL', ''),

  // Project repo where milestones, assets, and eventually agent prompts
  // and knowledge live (see basic-doc/plan-harness-decoupling.md Phase C).
  // PROJECT_REPO_LOCAL_PATH is canonical; GAME_REPO_LOCAL_PATH is accepted
  // as a deprecated alias for one release cycle so existing .env files
  // keep working.
  projectRepoLocalPath:
    process.env.PROJECT_REPO_LOCAL_PATH ?? process.env.GAME_REPO_LOCAL_PATH ?? '',
} as const;
