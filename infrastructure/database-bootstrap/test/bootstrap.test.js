// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: issue #48 tests for idempotency, isolation, repair, and cleanup.
// Author review: PENDING.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  BOOTSTRAP_LOCK_ID,
  loadBootstrapConfig,
  runBootstrap,
} from "../src/bootstrap.js";

const directories = [];
afterEach(() => {
  while (directories.length > 0) {
    rmSync(directories.pop(), { recursive: true, force: true });
  }
});

function config(passwordSuffix = "one") {
  return {
    connection: {
      host: "postgres",
      port: 5432,
      user: "focmaster",
      password: `master-${passwordSuffix}`,
      ssl: { ca: "TEST CA", rejectUnauthorized: true, servername: "postgres" },
    },
    rolePasswords: {
      user_migrator: `um-${passwordSuffix}`,
      user_app: `ua-${passwordSuffix}`,
      supplier_migrator: `sm-${passwordSuffix}`,
      supplier_app: `sa-${passwordSuffix}`,
    },
  };
}

function fakeClients({
  failSchema = false,
  elevatedRole = false,
  wrongDatabaseOwner = false,
} = {}) {
  const state = {
    roles: new Set(),
    databases: new Set(wrongDatabaseOwner ? ["users"] : []),
    clients: [],
    formatCalls: [],
    queries: [],
  };
  const factory = ({ database }) => {
    const client = {
      database,
      connected: false,
      ended: false,
      async connect() {
        this.connected = true;
      },
      async end() {
        this.ended = true;
      },
      async query(text, values = []) {
        state.queries.push({ database, text, values });
        if (text.startsWith("SELECT rolsuper")) {
          return {
            rowCount: 1,
            rows: [
              {
                rolsuper: elevatedRole,
                rolreplication: false,
                rolbypassrls: false,
              },
            ],
          };
        }
        if (
          failSchema &&
          database === "users" &&
          text.includes("SELECT format")
        ) {
          throw new Error("synthetic schema failure");
        }
        if (text.includes("FROM pg_roles")) {
          return { rowCount: state.roles.has(values[0]) ? 1 : 0, rows: [] };
        }
        if (text.includes("FROM pg_database")) {
          return {
            rowCount: state.databases.has(values[0]) ? 1 : 0,
            rows: state.databases.has(values[0])
              ? [
                  {
                    owner: wrongDatabaseOwner
                      ? "unexpected_owner"
                      : values[0] === "users"
                        ? "user_migrator"
                        : "supplier_migrator",
                  },
                ]
              : [],
          };
        }
        if (text.startsWith("SELECT format")) {
          const [template, ...args] = values;
          state.formatCalls.push({ database, template, args });
          return {
            rows: [{ statement: `FORMATTED:${state.formatCalls.length}` }],
          };
        }
        if (text.startsWith("FORMATTED:")) {
          const call = state.formatCalls[Number(text.split(":")[1]) - 1];
          if (call.template.startsWith("CREATE ROLE"))
            state.roles.add(call.args[0]);
          if (call.template.startsWith("CREATE DATABASE")) {
            state.databases.add(call.args[0]);
          }
        }
        return { rowCount: 1, rows: [] };
      },
    };
    state.clients.push(client);
    return client;
  };
  return { factory, state };
}

test("creates missing resources, repairs every run, and resynchronizes passwords", async () => {
  const { factory, state } = fakeClients();
  const messages = [];
  const logger = { info: (message) => messages.push(message) };
  await runBootstrap(config("one"), { clientFactory: factory, logger });
  const firstCreateCount = state.formatCalls.filter(({ template }) =>
    template.startsWith("CREATE"),
  ).length;
  await runBootstrap(config("two"), { clientFactory: factory, logger });

  assert.equal(firstCreateCount, 6);
  assert.equal(
    state.formatCalls.filter(({ template }) => template.startsWith("CREATE"))
      .length,
    firstCreateCount,
  );
  const alteredPasswords = state.formatCalls
    .filter(({ template }) => template.startsWith("ALTER ROLE"))
    .map(({ args }) => args[1]);
  assert.ok(alteredPasswords.includes("um-two"));
  assert.ok(alteredPasswords.includes("sa-two"));
  assert.ok(messages.includes("Database bootstrap completed"));
  assert.equal(
    state.clients.every(({ ended }) => ended),
    true,
  );
});

test("grants only SET ROLE membership to master and refuses an elevated service role", async () => {
  const { factory, state } = fakeClients();
  await runBootstrap(config(), {
    clientFactory: factory,
    logger: { info() {} },
  });
  const grants = state.formatCalls.filter(({ template }) =>
    template.startsWith("GRANT %I TO"),
  );
  assert.deepEqual(
    grants.map(({ args }) => args),
    [
      ["user_migrator", "focmaster"],
      ["supplier_migrator", "focmaster"],
    ],
  );
  assert.ok(
    grants.every(({ template }) =>
      template.includes("WITH INHERIT FALSE, SET TRUE"),
    ),
  );
  assert.ok(
    state.clients.filter(({ database }) => database !== "postgres").length ===
      2,
  );
  const elevated = fakeClients({ elevatedRole: true });
  await assert.rejects(
    runBootstrap(config(), {
      clientFactory: elevated.factory,
      logger: { info() {} },
    }),
    /unexpectedly elevated/,
  );
});

test("refuses an existing database owned by an unexpected role before changing database grants", async () => {
  const { factory, state } = fakeClients({ wrongDatabaseOwner: true });
  await assert.rejects(
    runBootstrap(config(), { clientFactory: factory, logger: { info() {} } }),
    /unexpected owner for database users/,
  );
  assert.equal(
    state.formatCalls.some(
      ({ template }) =>
        template.includes("PRIVILEGES ON DATABASE") ||
        template.includes("CONNECT, TEMPORARY"),
    ),
    false,
  );
});

test("applies explicit public and cross-service database/schema revokes", async () => {
  const { factory, state } = fakeClients();
  await runBootstrap(config(), {
    clientFactory: factory,
    logger: { info() {} },
  });
  const templates = state.formatCalls.map(({ database, template, args }) => ({
    database,
    template,
    args,
  }));
  assert.ok(
    templates.some(
      ({ template, args }) =>
        template.includes("REVOKE CONNECT, TEMPORARY") && args[0] === "users",
    ),
  );
  assert.ok(
    templates.some(
      ({ database, template, args }) =>
        database === "users" &&
        template.includes("REVOKE ALL ON SCHEMA") &&
        args[0] === "supplier_app",
    ),
  );
  assert.ok(
    templates.some(
      ({ database, template, args }) =>
        database === "supplier" &&
        template.includes("REVOKE ALL ON SCHEMA") &&
        args[0] === "user_migrator",
    ),
  );
});

test("releases the advisory lock and closes clients after failure", async () => {
  const { factory, state } = fakeClients({ failSchema: true });
  await assert.rejects(
    runBootstrap(config(), { clientFactory: factory, logger: { info() {} } }),
    /synthetic schema failure/,
  );
  assert.ok(
    state.queries.some(
      ({ text, values }) =>
        text.includes("pg_advisory_unlock") && values[0] === BOOTSTRAP_LOCK_ID,
    ),
  );
  assert.equal(
    state.clients.every(({ ended }) => ended),
    true,
  );
});

test("loads complete verified-TLS settings without rendering secrets on error", () => {
  const directory = mkdtempSync(join(tmpdir(), "foc-bootstrap-"));
  directories.push(directory);
  const caPath = join(directory, "ca.pem");
  writeFileSync(caPath, "TEST CA\n");
  const env = {
    DATABASE_HOST: "postgres",
    DATABASE_PORT: "5432",
    DATABASE_SSL_CA_PATH: caPath,
    MASTER_PASSWORD: "master-secret",
    USER_MIGRATOR_PASSWORD: "um-secret",
    USER_RUNTIME_PASSWORD: "ua-secret",
    SUPPLIER_MIGRATOR_PASSWORD: "sm-secret",
    SUPPLIER_RUNTIME_PASSWORD: "sa-secret",
  };
  const loaded = loadBootstrapConfig(env);
  assert.deepEqual(loaded.connection.ssl, {
    ca: "TEST CA\n",
    rejectUnauthorized: true,
    servername: "postgres",
  });

  env.DATABASE_PORT = "invalid";
  assert.throws(
    () => loadBootstrapConfig(env),
    (error) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /-secret/);
      return true;
    },
  );
});
