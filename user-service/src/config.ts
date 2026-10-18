// Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing and verification. Author review: PENDING.
// Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18. Scope: added the
// verified-TLS discrete RDS connection configuration seam for issue #48 while
// retaining local DATABASE_URL compatibility. Author review: PENDING.
// Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18. Scope: added an
// explicit cloud-only publisher switch for issue #49. Author review: PENDING.
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: Moved every environment variable read into this one module, per the author's
 *        decision that all configuration (including secrets) is read in one place.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: Added the author's resilience timings (DB_RESILIENCE).
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: Added the audit-log HMAC key setting (loadAuditKey).
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */

import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

// The only file that reads process.env. Each part loads only what it needs, so the
// migration runner (which needs just database settings) does not require JWT_SECRET etc.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function optionalBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export function loadKafkaConfig() {
  const brokers = required("KAFKA_BROKERS").split(",").map((broker) => broker.trim()).filter(Boolean);
  if (brokers.length === 0) throw new Error("KAFKA_BROKERS must contain at least one broker");
  return { brokers, clientId: process.env.KAFKA_CLIENT_ID || "user-service" };
}

export const OUTBOX = {
  topic: "user.account-status",
  lockId: 3219004,
  batchSize: 100,
  idlePollMs: 200,
  retentionDays: 7,
  cleanupIntervalMs: 60 * 60 * 1000,
} as const;

const DISCRETE_DATABASE_SETTINGS = [
  "DATABASE_HOST",
  "DATABASE_PORT",
  "DATABASE_NAME",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
  "DATABASE_SSL_CA_PATH",
] as const;

function readDatabaseCa(path: string): string {
  let ca: string;
  try {
    ca = readFileSync(path, "utf8");
  } catch {
    throw new Error("DATABASE_SSL_CA_PATH cannot be read");
  }
  if (ca.trim() === "") {
    throw new Error("DATABASE_SSL_CA_PATH must contain a CA certificate");
  }
  return ca;
}

/**
 * Local Compose supplies DATABASE_URL. Cloud tasks supply discrete fields so the
 * password is never embedded in a URL and RDS certificate/hostname verification
 * cannot be weakened accidentally.
 */
export function loadDatabaseConfig(): PoolConfig {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const presentDiscreteSettings = DISCRETE_DATABASE_SETTINGS.filter(
    (name) => (process.env[name]?.trim() ?? "") !== "",
  );

  if (databaseUrl && presentDiscreteSettings.length > 0) {
    throw new Error(
      "DATABASE_URL cannot be combined with discrete DATABASE_* settings",
    );
  }
  if (databaseUrl) {
    return { connectionString: databaseUrl };
  }
  if (presentDiscreteSettings.length !== DISCRETE_DATABASE_SETTINGS.length) {
    throw new Error(
      "Set DATABASE_URL or every discrete DATABASE_* setting",
    );
  }

  const host = required("DATABASE_HOST").trim();
  const portText = required("DATABASE_PORT").trim();
  if (!/^\d+$/.test(portText)) {
    throw new Error("DATABASE_PORT must be an integer between 1 and 65535");
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("DATABASE_PORT must be an integer between 1 and 65535");
  }

  return {
    host,
    port,
    database: required("DATABASE_NAME").trim(),
    user: required("DATABASE_USER").trim(),
    password: required("DATABASE_PASSWORD"),
    ssl: {
      ca: readDatabaseCa(required("DATABASE_SSL_CA_PATH").trim()),
      rejectUnauthorized: true,
      servername: host,
    },
  };
}

export function loadAppConfig() {
  return {
    port: Number(process.env.PORT) || 3001,
    jwtSecret: required("JWT_SECRET"),
    accessTokenTtlSeconds: Number(process.env.JWT_ACCESS_TOKEN_TTL) || 1800,
    allowedEmailDomain: required("ALLOWED_EMAIL_DOMAIN").toLowerCase(),
    // Browsers may only call this service from these origins
    corsOrigins: (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    // Local/full deployments retain publishing by default. The approved AWS
    // User+Supplier slice sets this explicitly to false because it has no Kafka
    // or account-status consumers; durable outbox writes remain enabled.
    accountStatusPublishingEnabled: optionalBoolean(
      "ACCOUNT_STATUS_PUBLISHING_ENABLED",
      true,
    ),
    bootstrapAdmin: {
      username: process.env.BOOTSTRAP_ADMIN_USERNAME,
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    },
  };
}

// How the service copes with the database being unreachable. Values are the author's
// estimates; they are kept here so they can be tuned in one place.
export const DB_RESILIENCE = {
  // Startup connection retries (service and migration runner): 0.5 s, 1 s, 2 s, 4 s, 5 s, 5 s ...
  retryInitialDelayMs: 500,
  retryMultiplier: 2,
  retryMaxDelayMs: 5_000,
  retryGiveUpAfterMs: 60_000,
  // Must stay well under Supplier's /auth/verify timeout (USER_SERVICE_VERIFY_TIMEOUT_MS,
  // 1000 ms) so callers receive our 503, not their own timeout
  poolConnectionTimeoutMs: 500,
  // /health answers within this time even if the database hangs
  readinessTimeoutMs: 1_000,
  // Graceful shutdown limit; below Docker's 10 s before it force-kills the container
  shutdownTimeoutMs: 8_000,
} as const;

// Key for the audit-log hash chain (US-NFR1.2.1). At least 32 random bytes, written as hex
// (e.g. `openssl rand -hex 32`). Missing or too short: refuse to start rather than write
// entries that can never be verified. The key is assumed never to change during the project.
export function loadAuditKey(): Buffer {
  const hex = required("AUDIT_HMAC_KEY");
  if (!/^(?:[0-9a-fA-F]{2}){32,}$/.test(hex)) {
    throw new Error("AUDIT_HMAC_KEY must be at least 32 random bytes in hex (e.g. openssl rand -hex 32)");
  }
  return Buffer.from(hex, "hex");
}
