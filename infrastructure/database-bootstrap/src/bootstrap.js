// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: idempotent isolated-database and role bootstrap implementation for issue #48.
// Author review: PENDING.
import { readFileSync } from "node:fs";
import { Client } from "pg";

// Cluster-wide lock, deliberately outside User Service's 3219001-3219004 range.
export const BOOTSTRAP_LOCK_ID = 3_219_048;

const SERVICES = [
  {
    database: "users",
    migrator: { name: "user_migrator", passwordEnv: "USER_MIGRATOR_PASSWORD" },
    runtime: { name: "user_app", passwordEnv: "USER_RUNTIME_PASSWORD" },
    otherRoles: ["supplier_migrator", "supplier_app"],
  },
  {
    database: "supplier",
    migrator: {
      name: "supplier_migrator",
      passwordEnv: "SUPPLIER_MIGRATOR_PASSWORD",
    },
    runtime: { name: "supplier_app", passwordEnv: "SUPPLIER_RUNTIME_PASSWORD" },
    otherRoles: ["user_migrator", "user_app"],
  },
];

function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function loadBootstrapConfig(env = process.env) {
  const host = required(env, "DATABASE_HOST").trim();
  const portText = required(env, "DATABASE_PORT").trim();
  if (!/^\d+$/.test(portText)) {
    throw new Error("DATABASE_PORT must be an integer between 1 and 65535");
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("DATABASE_PORT must be an integer between 1 and 65535");
  }
  const caPath = required(env, "DATABASE_SSL_CA_PATH").trim();
  let ca;
  try {
    ca = readFileSync(caPath, "utf8");
  } catch {
    throw new Error("DATABASE_SSL_CA_PATH cannot be read");
  }
  if (ca.trim() === "") {
    throw new Error("DATABASE_SSL_CA_PATH must contain a CA certificate");
  }

  return {
    connection: {
      host,
      port,
      user: "focmaster",
      password: required(env, "MASTER_PASSWORD"),
      ssl: { ca, rejectUnauthorized: true, servername: host },
    },
    rolePasswords: Object.fromEntries(
      SERVICES.flatMap(({ migrator, runtime }) => [migrator, runtime]).map(
        ({ name, passwordEnv }) => [name, required(env, passwordEnv)],
      ),
    ),
  };
}

async function formattedStatement(client, template, values) {
  const placeholders = values
    .map((_, index) => `$${index + 2}::text`)
    .join(", ");
  const result = await client.query(
    `SELECT format($1::text${placeholders === "" ? "" : `, ${placeholders}`}) AS statement`,
    [template, ...values],
  );
  const statement = result.rows[0]?.statement;
  if (typeof statement !== "string" || statement === "") {
    throw new Error("PostgreSQL did not produce a bootstrap statement");
  }
  await client.query(statement);
}

async function ensureRole(client, name, password) {
  const result = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    [name],
  );
  if (result.rowCount === 0) {
    await formattedStatement(client, "CREATE ROLE %I", [name]);
  }
  await formattedStatement(
    client,
    "ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L",
    [name, password],
  );
}

async function ensureDatabase(client, database, owner) {
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [database],
  );
  if (result.rowCount === 0) {
    // CREATE DATABASE cannot run inside a transaction. The session advisory lock
    // still serializes the complete bootstrap operation.
    await formattedStatement(client, "CREATE DATABASE %I OWNER %I", [
      database,
      owner,
    ]);
  }
  await formattedStatement(client, "ALTER DATABASE %I OWNER TO %I", [
    database,
    owner,
  ]);
}

async function isolateDatabase(client, service) {
  const { database, migrator, runtime, otherRoles } = service;
  await formattedStatement(
    client,
    "REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC",
    [database],
  );
  await formattedStatement(
    client,
    "GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I",
    [database, migrator.name],
  );
  await formattedStatement(client, "GRANT CONNECT ON DATABASE %I TO %I", [
    database,
    runtime.name,
  ]);
  for (const otherRole of otherRoles) {
    await formattedStatement(
      client,
      "REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I",
      [database, otherRole],
    );
  }
}

async function isolateSchema(client, service) {
  const { migrator, runtime, otherRoles } = service;
  await formattedStatement(client, "ALTER SCHEMA public OWNER TO %I", [
    migrator.name,
  ]);
  await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
  for (const otherRole of otherRoles) {
    await formattedStatement(client, "REVOKE ALL ON SCHEMA public FROM %I", [
      otherRole,
    ]);
  }
  await formattedStatement(client, "GRANT ALL ON SCHEMA public TO %I", [
    migrator.name,
  ]);
  await formattedStatement(client, "GRANT USAGE ON SCHEMA public TO %I", [
    runtime.name,
  ]);
}

export async function runBootstrap(
  config,
  {
    clientFactory = (clientConfig) => new Client(clientConfig),
    logger = console,
  } = {},
) {
  const master = clientFactory({ ...config.connection, database: "postgres" });
  let locked = false;
  await master.connect();
  try {
    await master.query("SELECT pg_advisory_lock($1)", [BOOTSTRAP_LOCK_ID]);
    locked = true;
    for (const service of SERVICES) {
      for (const role of [service.migrator, service.runtime]) {
        await ensureRole(master, role.name, config.rolePasswords[role.name]);
        logger.info(`Database bootstrap: synchronized role ${role.name}`);
      }
    }
    for (const service of SERVICES) {
      await ensureDatabase(master, service.database, service.migrator.name);
      await isolateDatabase(master, service);
      logger.info(
        `Database bootstrap: synchronized database ${service.database}`,
      );
    }

    for (const service of SERVICES) {
      const databaseClient = clientFactory({
        ...config.connection,
        database: service.database,
      });
      await databaseClient.connect();
      try {
        await isolateSchema(databaseClient, service);
      } finally {
        await databaseClient.end();
      }
    }
    logger.info("Database bootstrap completed");
  } finally {
    try {
      if (locked) {
        await master.query("SELECT pg_advisory_unlock($1)", [
          BOOTSTRAP_LOCK_ID,
        ]);
      }
    } finally {
      await master.end();
    }
  }
}
