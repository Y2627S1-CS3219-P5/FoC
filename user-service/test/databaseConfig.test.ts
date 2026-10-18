// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: issue #48 tests for local and verified-TLS cloud database configuration.
// Author review: PENDING.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { loadDatabaseConfig } from "../src/config";

const DATABASE_ENV = [
  "DATABASE_URL",
  "DATABASE_HOST",
  "DATABASE_PORT",
  "DATABASE_NAME",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
  "DATABASE_SSL_CA_PATH",
] as const;
const original = Object.fromEntries(
  DATABASE_ENV.map((name) => [name, process.env[name]]),
);
let directory: string;

beforeEach(() => {
  for (const name of DATABASE_ENV) delete process.env[name];
  directory = mkdtempSync(join(tmpdir(), "foc-user-db-config-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  for (const name of DATABASE_ENV) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("keeps the local DATABASE_URL configuration path", () => {
  process.env.DATABASE_URL = "postgres://local:local@user-db:5432/users";
  assert.deepEqual(loadDatabaseConfig(), {
    connectionString: "postgres://local:local@user-db:5432/users",
  });
});

test("builds a discrete RDS configuration with CA and hostname verification", () => {
  const caPath = join(directory, "rds.pem");
  writeFileSync(caPath, "TEST CA\n", { mode: 0o600 });
  Object.assign(process.env, {
    DATABASE_HOST: "foc.example.ap-southeast-1.rds.amazonaws.com",
    DATABASE_PORT: "5432",
    DATABASE_NAME: "users",
    DATABASE_USER: "user_app",
    DATABASE_PASSWORD: "never-render-me",
    DATABASE_SSL_CA_PATH: caPath,
  });

  assert.deepEqual(loadDatabaseConfig(), {
    host: "foc.example.ap-southeast-1.rds.amazonaws.com",
    port: 5432,
    database: "users",
    user: "user_app",
    password: "never-render-me",
    ssl: {
      ca: "TEST CA\n",
      rejectUnauthorized: true,
      servername: "foc.example.ap-southeast-1.rds.amazonaws.com",
    },
  });
});

test("fails closed for mixed, partial, invalid-port, missing, and empty CA settings", () => {
  process.env.DATABASE_URL = "postgres://secret@localhost/users";
  process.env.DATABASE_HOST = "localhost";
  assert.throws(() => loadDatabaseConfig(), /cannot be combined/);

  delete process.env.DATABASE_URL;
  assert.throws(() => loadDatabaseConfig(), /every discrete/);

  const caPath = join(directory, "rds.pem");
  writeFileSync(caPath, "", { mode: 0o600 });
  Object.assign(process.env, {
    DATABASE_HOST: "db.example.test",
    DATABASE_PORT: "not-a-port",
    DATABASE_NAME: "users",
    DATABASE_USER: "user_app",
    DATABASE_PASSWORD: "never-render-me",
    DATABASE_SSL_CA_PATH: caPath,
  });
  assert.throws(() => loadDatabaseConfig(), /DATABASE_PORT/);
  process.env.DATABASE_PORT = "5432";
  assert.throws(() => loadDatabaseConfig(), /must contain a CA/);
  process.env.DATABASE_SSL_CA_PATH = join(directory, "missing.pem");
  assert.throws(() => loadDatabaseConfig(), /cannot be read/);
});

test("configuration errors never render the password or URL", () => {
  process.env.DATABASE_URL = "postgres://user:super-secret@localhost/users";
  process.env.DATABASE_HOST = "localhost";
  assert.throws(
    () => loadDatabaseConfig(),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /super-secret|postgres:\/\//);
      return true;
    },
  );
});
