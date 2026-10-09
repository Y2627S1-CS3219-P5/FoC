/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: DATABASE_URL is now read through config.ts. This disclosure covers only that change.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: Pool connection timeout, and pool events wired to state-change logging so a
 *        dropped connection no longer crashes the process.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { Pool } from "pg";
import { loadDatabaseConfig, DB_RESILIENCE } from "./config";
import { markDatabaseDown, markDatabaseUp } from "./dbAvailability";

// we use a pool to keep a few connections open and reuse them across req
export const pool = new Pool({
  connectionString: loadDatabaseConfig().databaseUrl,
  // Give up quickly when no connection can be made, so callers get a 503 (see DB_RESILIENCE)
  connectionTimeoutMillis: DB_RESILIENCE.poolConnectionTimeoutMs,
});

// An idle connection that the database drops (e.g. a restart) is reported here. Without a
// listener Node would crash the process; the pool discards the connection and makes a new
// one when needed.
pool.on("error", (err) => markDatabaseDown(err));
// A new connection succeeded, so the database is reachable
pool.on("connect", () => markDatabaseUp());
