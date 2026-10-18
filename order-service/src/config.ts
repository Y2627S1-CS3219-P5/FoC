/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Configuration module (every environment variable read in one place), adapted from
 *        credit-service/src/config.ts (branch_credit) with only the database parts; order
 *        timing settings and topic names added per the approved plan.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Added the PORT setting for the service entry point.
 * Author review of additional changes: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: CREDIT_MODE=kafka, Kafka settings, the credit.results DLQ topic, and the publisher and
 *        consumer timings for the Kafka integration with Credit Service.
 * Author review of additional changes: Reviewed and approved by @phuc
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: AUTH_MODE=user-service with its URL and timeout, and a startup check that refuses
 *        CREDIT_MODE=kafka with stub sessions.
 * Author review of additional changes: Reviewed and approved by @phuc
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
// Service. Supplier only has a stub so far; Auth can ask User Service, and Credit can use Kafka.
function stubMode(name: string): "stub" {
  const value = process.env[name] || STUB_ONLY;
  if (value !== STUB_ONLY) throw new Error(`${name}=${value} is not implemented yet`);
  return STUB_ONLY;
}

export type CreditMode = "stub" | "kafka";
export type AuthMode = "stub" | "user-service";

function authMode(): AuthMode {
  const value = process.env.AUTH_MODE || STUB_ONLY;
  if (value !== "stub" && value !== "user-service") throw new Error(`AUTH_MODE must be stub or user-service, not ${value}`);
  return value;
}

function creditMode(): CreditMode {
  const value = process.env.CREDIT_MODE || STUB_ONLY;
  if (value !== "stub" && value !== "kafka") throw new Error(`CREDIT_MODE must be stub or kafka, not ${value}`);
  return value;
}

export function loadAdapterConfig(): {
  authMode: AuthMode;
  supplierMode: "stub";
  creditMode: CreditMode;
  stubCreditLimit: number;
  stubCreditDelayMs: number;
  stubCreditSilentAmount: number;
} {
  const auth = authMode();
  const credit = creditMode();
  // A stub session is whatever UUID the caller writes in the token. With real credits behind
  // it, anyone who knows another user's id could spend that user's credits
  if (credit === "kafka" && auth !== "user-service") {
    throw new Error("CREDIT_MODE=kafka moves real credits, so it needs AUTH_MODE=user-service (stub sessions can impersonate any user)");
  }
  return {
    authMode: auth,
    supplierMode: stubMode("SUPPLIER_MODE"),
    creditMode: credit,
    stubCreditLimit: positiveInteger("STUB_CREDIT_LIMIT", 100),
    stubCreditDelayMs: positiveInteger("STUB_CREDIT_DELAY_MS", 500),
    // A ReserveRequested for exactly this amount gets no reply, to demonstrate the timeout
    stubCreditSilentAmount: positiveInteger("STUB_CREDIT_SILENT_AMOUNT", 999),
  };
}

/** User Service session verification, read only when AUTH_MODE=user-service. */
export function loadUserServiceConfig(): { baseUrl: string; timeoutMs: number } {
  const baseUrl = required("USER_SERVICE_BASE_URL");
  let protocol: string;
  try {
    protocol = new URL(baseUrl).protocol;
  } catch {
    protocol = "";
  }
  // "user-service:3001" parses as a URL with scheme "user-service:", so the scheme is checked too
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("USER_SERVICE_BASE_URL must be an absolute http(s) URL, e.g. http://user-service:3001");
  }
  return { baseUrl, timeoutMs: positiveInteger("USER_SERVICE_VERIFY_TIMEOUT_MS", 1000) };
}

/** Kafka connection, read only when CREDIT_MODE=kafka. */
export function loadKafkaConfig(): { brokers: string[]; clientId: string } {
  const brokers = required("KAFKA_BROKERS").split(",").map((b) => b.trim()).filter(Boolean);
  if (brokers.length === 0) throw new Error("KAFKA_BROKERS lists no broker");
  return { brokers, clientId: process.env.KAFKA_CLIENT_ID || "order-service" };
}

// Kafka topics, created by kafka/create-topics.sh. The DLQ holds credit.results replies Order
// Service could not apply, with the reason.
export const TOPICS = {
  commands: "credit.commands",
  results: "credit.results",
  resultsDlq: "credit.results.dlq",
} as const;

export const CONSUMER_GROUP = "order-service";

// credit.results consumer. A reply that keeps failing for a reason other than an outage is
// retried in place maxAttempts times in total, then sent to the DLQ. Database or Kafka outages
// are not counted: the reply is redelivered until the outage ends, because dead-lettering it
// would lose a valid reply.
export const CONSUMER = {
  maxAttempts: 5,
  retryInitialDelayMs: 200,
  retryMaxDelayMs: 5_000,
  // Kafka connection, subscription and topic checks are retried in the background at this pace
  connectRetryInitialMs: 500,
  connectRetryMaxMs: 10_000,
} as const;

// How often the Kafka adapters log their counters, the outbox backlog and the oldest age
export const METRICS_INTERVAL_MS = 60_000;

// Deadline sweeper: how often it runs and how many errands one transaction handles
export const SWEEPER = { intervalMs: 5_000, batchSize: 100 } as const;

// Outbox publisher. Up to batchSize rows per send, without waiting for a full batch. A commit
// that adds a row wakes the publisher (NOTIFY on wakeChannel); idlePollMs is the fallback poll.
// A failed send backs off from idlePollMs, doubling to maxBackoffMs, and a wake does not cut
// the back-off short. lockId is the advisory lock that lets one replica publish at a time.
export const OUTBOX = {
  batchSize: 100,
  idlePollMs: 200,
  maxBackoffMs: 5_000,
  wakeChannel: "order_outbox",
  lockId: 3_219_002,
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
