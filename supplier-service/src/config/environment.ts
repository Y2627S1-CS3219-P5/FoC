/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added bounded Supplier runtime environment parsing.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25; added User
 * Service verification endpoint and timeout parsing for issue #16.
 * Author review of additional changes: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25; exposed the
 * repository/container Supplier image directory convention for issue #17.
 * Author review of issue #17 changes: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18; added the
 * verified-TLS discrete RDS connection configuration seam for issue #48 while
 * retaining local DATABASE_URL compatibility. Author review: PENDING.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PoolConfig } from "pg";

export interface SessionVerificationConfiguration {
  userServiceBaseUrl: string;
  timeoutMs: number;
}

const MAX_ABORT_SIGNAL_TIMEOUT_MS = 2_147_483_647;

const DISCRETE_DATABASE_SETTINGS = [
  "DATABASE_HOST",
  "DATABASE_PORT",
  "DATABASE_NAME",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
  "DATABASE_SSL_CA_PATH",
] as const;

function requiredDatabaseSetting(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function readDatabaseCa(path: string): string {
  let ca: string;
  try {
    ca = readFileSync(path, "utf8");
  } catch {
    throw new Error("DATABASE_SSL_CA_PATH cannot be read.");
  }
  if (ca.trim() === "") {
    throw new Error("DATABASE_SSL_CA_PATH must contain a CA certificate.");
  }
  return ca;
}

/** Accepts either the local URL or the complete, verified-TLS cloud form. */
export function getDatabaseConfig(): PoolConfig {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const presentDiscreteSettings = DISCRETE_DATABASE_SETTINGS.filter(
    (name) => (process.env[name]?.trim() ?? "") !== "",
  );
  if (databaseUrl && presentDiscreteSettings.length > 0) {
    throw new Error(
      "DATABASE_URL cannot be combined with discrete DATABASE_* settings.",
    );
  }
  if (databaseUrl) {
    return { connectionString: databaseUrl };
  }
  if (presentDiscreteSettings.length !== DISCRETE_DATABASE_SETTINGS.length) {
    throw new Error(
      "Set DATABASE_URL or every discrete DATABASE_* setting.",
    );
  }

  const host = requiredDatabaseSetting("DATABASE_HOST").trim();
  const portText = requiredDatabaseSetting("DATABASE_PORT").trim();
  if (!/^\d+$/.test(portText)) {
    throw new Error("DATABASE_PORT must be an integer between 1 and 65535.");
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("DATABASE_PORT must be an integer between 1 and 65535.");
  }

  return {
    host,
    port,
    database: requiredDatabaseSetting("DATABASE_NAME").trim(),
    user: requiredDatabaseSetting("DATABASE_USER").trim(),
    password: requiredDatabaseSetting("DATABASE_PASSWORD"),
    ssl: {
      ca: readDatabaseCa(
        requiredDatabaseSetting("DATABASE_SSL_CA_PATH").trim(),
      ),
      rejectUnauthorized: true,
      servername: host,
    },
  };
}

export function getRuntimeDatabaseRole(): string | undefined {
  const role = process.env.DATABASE_RUNTIME_ROLE?.trim();
  if (!role) {
    return undefined;
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(role)) {
    throw new Error(
      "DATABASE_RUNTIME_ROLE must be a PostgreSQL identifier of at most 63 characters.",
    );
  }

  return role;
}

export function getPort(): number {
  const configuredPort = process.env.PORT ?? "3000";
  if (!/^\d+$/.test(configuredPort)) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const port = Number(configuredPort);
  if (port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

export function getSupplierImageDirectory(): string {
  return resolve(process.cwd(), "../data/images");
}

export function getSessionVerificationConfiguration(): SessionVerificationConfiguration {
  const configuredBaseUrl = process.env.USER_SERVICE_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    throw new Error("USER_SERVICE_BASE_URL is required.");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new Error("USER_SERVICE_BASE_URL must be a valid HTTP(S) URL.");
  }

  if (
    (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
    baseUrl.username !== "" ||
    baseUrl.password !== "" ||
    baseUrl.search !== "" ||
    baseUrl.hash !== ""
  ) {
    throw new Error(
      "USER_SERVICE_BASE_URL must be an HTTP(S) URL without credentials, a query, or a fragment.",
    );
  }

  const configuredTimeout = process.env.USER_SERVICE_VERIFY_TIMEOUT_MS?.trim();
  if (!configuredTimeout || !/^\d+$/.test(configuredTimeout)) {
    throw new Error(
      "USER_SERVICE_VERIFY_TIMEOUT_MS must be a positive integer in milliseconds.",
    );
  }

  const timeoutMs = Number(configuredTimeout);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_ABORT_SIGNAL_TIMEOUT_MS
  ) {
    throw new Error(
      `USER_SERVICE_VERIFY_TIMEOUT_MS must be between 1 and ${MAX_ABORT_SIGNAL_TIMEOUT_MS}.`,
    );
  }

  return {
    userServiceBaseUrl: baseUrl.toString(),
    timeoutMs,
  };
}
