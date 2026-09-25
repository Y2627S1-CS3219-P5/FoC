import { pool } from "./db";

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username      VARCHAR(30)  NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,30}$'),
      email         VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT         NOT NULL,
      display_name  VARCHAR(50)  NOT NULL CHECK (length(display_name) >= 1),
      role          TEXT NOT NULL DEFAULT 'MEMBER'
                    CHECK (role IN ('MEMBER', 'ADMINISTRATOR')),
      status        TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
                    CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci ON users (lower(username));
  `);
}
