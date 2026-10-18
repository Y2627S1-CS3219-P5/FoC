/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added the private PostgreSQL pool and Drizzle connection lifecycle.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18. Scope: consumed
 * verified-TLS database configuration for issue #48. Author review: PENDING.
 */
import { Injectable, OnApplicationShutdown } from "@nestjs/common";

import { getDatabaseConfig } from "../config/environment";
import { createDatabaseConnection } from "./connection";

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly connection = createDatabaseConnection(getDatabaseConfig());

  readonly client = this.connection.database;

  async ping(): Promise<void> {
    await this.connection.pool.query("select 1");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.connection.pool.end();
  }
}
