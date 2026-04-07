import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const DISCORD_WEBHOOK_URL = config.discordWebhookUrl;

async function sendDiscord(content: string): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      logger.warn({ status: res.status }, '[notifier] Discord webhook returned non-OK status');
    }
  } catch (err) {
    logger.error({ err }, '[notifier] Discord webhook failed');
  }
}

export async function notifyJobRequiresApproval(jobType: string, jobId: string): Promise<void> {
  await sendDiscord(`⏳ Job requires approval: **${jobType}** (\`${jobId}\`)`);
}

export async function notifySpendingWarning(percent: number): Promise<void> {
  await sendDiscord(`💰 Spending at **${percent}%** of cap`);
}

export async function notifyRateLimited(): Promise<void> {
  await sendDiscord(`⚠️ Rate limited — system paused. Resets 6am UTC.`);
}

export async function notifyCycleCompleted(cycleId: number): Promise<void> {
  await sendDiscord(`✅ Cycle **${cycleId}** completed`);
}

export async function notifyCycleFailed(cycleId: number): Promise<void> {
  await sendDiscord(`❌ Cycle **${cycleId}** failed`);
}

export async function notifyPlanQuestions(cycleId: number): Promise<void> {
  await sendDiscord(`❓ Orchestrator has questions for Cycle **${cycleId}** — check Dashboard`);
}
