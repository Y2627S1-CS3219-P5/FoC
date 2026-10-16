/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Configuration module (every environment variable read in one place), adapted from
 *        credit-service/src/config.ts (branch_credit) with only the database parts; order
 *        timing settings and topic names added per the approved plan.
 * Author review: PENDING
 */

// The only file that reads process.env. Each part loads only what it needs, so the
// migration runner (which needs just DATABASE_URL) does not require the other settings.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function loadDatabaseConfig() {
  return { databaseUrl: required("DATABASE_URL") };
}

// A whole number >= 1, or `fallback` when the variable is unset
function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`${name} must be a whole number >= 1`);
  }
  return Number(raw);
}

export function loadOrderConfig(): { confirmationWindowMinutes: number; reservationTimeoutSeconds: number } {
  return {
    confirmationWindowMinutes: positiveInteger("CONFIRMATION_WINDOW_MINUTES", 1440),
    reservationTimeoutSeconds: positiveInteger("RESERVATION_TIMEOUT_SECONDS", 30),
  };
}

export const TOPICS = { commands: "credit.commands", results: "credit.results" } as const;

// Same values as User Service; kept here so they can be tuned in one place.
export const DB_RESILIENCE = {
  // Startup connection retries: 0.5 s, 1 s, 2 s, 4 s, 5 s, 5 s ...
  retryInitialDelayMs: 500,
  retryMultiplier: 2,
  retryMaxDelayMs: 5_000,
  retryGiveUpAfterMs: 60_000,
  poolConnectionTimeoutMs: 500,
} as const;
