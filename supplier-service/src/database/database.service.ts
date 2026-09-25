/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added the private PostgreSQL pool and Drizzle connection lifecycle.
 * Author review required before submission.
 */
import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseUrl } from "../config/environment";
import * as schema from "./schema";

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool = new Pool({ connectionString: getDatabaseUrl() });

  readonly client: NodePgDatabase<typeof schema> = drizzle(this.pool, {
    schema,
  });

  async ping(): Promise<void> {
    await this.pool.query("select 1");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
