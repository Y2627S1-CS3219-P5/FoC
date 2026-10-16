/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Configuration module (every environment variable read in one place), adapted from
 *        credit-service/src/config.ts (branch_credit) with only the database parts; order
 *        timing settings and topic names added per the approved plan.
 * Author review: PENDING
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Added the PORT setting for the service entry point.
 * Author review of additional changes: PENDING
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

export function loadServerConfig(): { port: number } {
  return { port: positiveInteger("PORT", 3002) };
}

export function loadOrderConfig(): { confirmationWindowMinutes: number; reservationTimeoutSeconds: number } {
  return {
    confirmationWindowMinutes: positiveInteger("CONFIRMATION_WINDOW_MINUTES", 1440),
    reservationTimeoutSeconds: positiveInteger("RESERVATION_TIMEOUT_SECONDS", 30),
  };
}

const STUB_ONLY = "stub";

// AUTH_MODE, SUPPLIER_MODE and CREDIT_MODE pick the adapter for User, Supplier and Credit
// Service. Only the stubs exist so far; the real adapters come in a later project.
function stubMode(name: string): "stub" {
  const value = process.env[name] || STUB_ONLY;
  if (value !== STUB_ONLY) throw new Error(`${name}=${value} is not implemented yet`);
  return STUB_ONLY;
}

export function loadAdapterConfig(): {
  authMode: "stub";
  supplierMode: "stub";
  creditMode: "stub";
  stubCreditLimit: number;
  stubCreditDelayMs: number;
  stubCreditSilentAmount: number;
} {
  return {
    authMode: stubMode("AUTH_MODE"),
    supplierMode: stubMode("SUPPLIER_MODE"),
    creditMode: stubMode("CREDIT_MODE"),
    stubCreditLimit: positiveInteger("STUB_CREDIT_LIMIT", 100),
    stubCreditDelayMs: positiveInteger("STUB_CREDIT_DELAY_MS", 500),
    // A ReserveRequested for exactly this amount gets no reply, to demonstrate the timeout
    stubCreditSilentAmount: positiveInteger("STUB_CREDIT_SILENT_AMOUNT", 999),
  };
}

export const TOPICS = { commands: "credit.commands", results: "credit.results" } as const;

// Deadline sweeper: how often it runs and how many errands one transaction handles
export const SWEEPER = { intervalMs: 5_000, batchSize: 100 } as const;

// Outbox publisher: rows per batch and the pause when there is nothing to send
export const OUTBOX = { batchSize: 100, idlePollMs: 250 } as const;

// Same values as User Service; kept here so they can be tuned in one place.
export const DB_RESILIENCE = {
  // Startup connection retries: 0.5 s, 1 s, 2 s, 4 s, 5 s, 5 s ...
  retryInitialDelayMs: 500,
  retryMultiplier: 2,
  retryMaxDelayMs: 5_000,
  retryGiveUpAfterMs: 60_000,
  poolConnectionTimeoutMs: 500,
} as const;
