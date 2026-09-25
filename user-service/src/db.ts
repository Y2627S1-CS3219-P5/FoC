import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// we use a pool to keep a few connections open and reuse them across req
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
