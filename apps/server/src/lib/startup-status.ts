// Startup status — shared between index.ts (writer) and health.ts (reader).
// Separate module to avoid circular dependency: index → app → health → index.

let startupReady = false;
let lastRecovery: {
  orphansFound: number;
  jobsFailed: number;
  roomsSeeded: number;
} | null = null;

export function getStartupStatus() {
  return { startupReady, lastRecovery };
}

export function setStartupStatus(ready: boolean, recovery: typeof lastRecovery) {
  startupReady = ready;
  lastRecovery = recovery;
}
