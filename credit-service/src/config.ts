/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Configuration module following the User Service pattern (every environment variable
 *        read in one place), with the Credit Service's settings from implementation-proposal.md.
 * Author review: Reviewed and approved by @phuc
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

export function loadCreditConfig() {
  const grant = Number(process.env.INITIAL_CREDIT_GRANT ?? 100);
  if (!Number.isSafeInteger(grant) || grant < 0) {
    throw new Error("INITIAL_CREDIT_GRANT must be a whole number >= 0");
  }
  return { initialCreditGrant: grant };
}

// Kafka topic for replies to Order Service (decision D9; created by kafka/create-topics.sh)
export const CREDIT_RESULTS_TOPIC = "credit.results";

// Outbox publisher (implementation-proposal.md §4.4)
export const OUTBOX = {
  batchSize: 100,
  retentionDays: 7,
} as const;

// Same values as User Service; kept here so they can be tuned in one place.
export const DB_RESILIENCE = {
  // Startup connection retries: 0.5 s, 1 s, 2 s, 4 s, 5 s, 5 s ...
  retryInitialDelayMs: 500,
  retryMultiplier: 2,
  retryMaxDelayMs: 5_000,
  retryGiveUpAfterMs: 60_000,
  poolConnectionTimeoutMs: 500,
} as const;
