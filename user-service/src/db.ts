/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: DATABASE_URL is now read through config.ts. This disclosure covers only that change.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Pool } from "pg";
import { loadDatabaseConfig } from "./config";

// we use a pool to keep a few connections open and reuse them across req
export const pool = new Pool({ connectionString: loadDatabaseConfig().databaseUrl });
