/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added an isolated, repeatable live integration check for the Supplier
 * authenticated read increment against PostgreSQL and the real User Service.
 * Author review: Required before merge.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectName = "foc-supplier-smoke";
const supplierPort = "3900";
const userPort = "3901";
const supplierBaseUrl = `http://127.0.0.1:${supplierPort}`;
const userBaseUrl = `http://127.0.0.1:${userPort}`;
const printerId = "ac2288df-661c-5d78-bcc1-ac6bca30fe51";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const testEnvironment = {
  ...process.env,
  JWT_SECRET: "supplier-smoke-only-jwt-secret-32-characters",
  SUPPLIER_DB_ADMIN_PASSWORD: "supplier-smoke-admin-password",
  SUPPLIER_DB_ADMIN_USER: "supplier_bootstrap",
  SUPPLIER_DB_NAME: "supplier",
  SUPPLIER_DB_MIGRATION_PASSWORD: "supplier-smoke-migration-password",
  SUPPLIER_DB_MIGRATION_USER: "supplier_migrator",
  SUPPLIER_DB_PASSWORD: "supplier-smoke-runtime-password",
  SUPPLIER_DB_USER: "supplier_app",
  USER_SERVICE_VERIFY_TIMEOUT_MS: "1000",
  ALLOWED_EMAIL_DOMAIN: "u.nus.edu",
  BOOTSTRAP_ADMIN_USERNAME: "supplier_smoke_admin",
  BOOTSTRAP_ADMIN_EMAIL: "supplier-smoke-admin@u.nus.edu",
  BOOTSTRAP_ADMIN_PASSWORD: "SupplierSmokeAdmin1",
  SUPPLIER_PORT: supplierPort,
  USER_PORT: userPort,
};

let stackStarted = false;

function compose(args, options = {}) {
  return execFileSync(
    "docker",
    ["compose", "--project-name", projectName, ...args],
    {
      cwd: repoRoot,
      env: testEnvironment,
      encoding: "utf8",
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    },
  );
}

function resetStack() {
  compose(["down", "--volumes", "--remove-orphans"], { capture: true });
}

async function waitFor(url, description) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${description} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`${description} did not become ready`, { cause: lastError });
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text === "" ? undefined : JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, received: ${text}`);
  }
  return { response, body };
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login(identifier, password) {
  const { response, body } = await jsonRequest(`${userBaseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  assert.equal(response.status, 200, `login failed: ${JSON.stringify(body)}`);
  assert.equal(body.tokenType, "Bearer");
  assert.equal(typeof body.accessToken, "string");
  return body.accessToken;
}

async function supplierRequest(path, token, headers = {}) {
  return jsonRequest(`${supplierBaseUrl}${path}`, {
    headers: { ...headers, ...bearer(token) },
  });
}

function assertStableNameOrder(items) {
  const keys = items.map(({ name, id }) => `${name}\0${id}`);
  assert.deepEqual(keys, [...keys].sort());
}

function psql(sql, capture = false) {
  return compose(
    [
      "exec",
      "-T",
      "supplier-db",
      "psql",
      "--username",
      "supplier_bootstrap",
      "--dbname",
      "supplier",
      "--tuples-only",
      "--no-align",
      "--command",
      sql,
    ],
    { capture },
  );
}

async function run() {
  console.info("Resetting the dedicated Supplier smoke stack...");
  resetStack();
  compose(["up", "--detach", "--build", "--wait"]);
  stackStarted = true;

  await waitFor(`${supplierBaseUrl}/health`, "Supplier health");
  await waitFor(`${userBaseUrl}/health`, "User health");

  const supplierCount = psql("SELECT count(*) FROM suppliers;", true).trim();
  assert.equal(supplierCount, "21");

  const registration = await jsonRequest(`${userBaseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "supplier_smoke_member",
      email: "supplier-smoke-member@u.nus.edu",
      password: "SupplierSmokeMember1",
    }),
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.role, "MEMBER");

  const memberToken = await login(
    "supplier_smoke_member",
    "SupplierSmokeMember1",
  );
  const adminToken = await login(
    "supplier_smoke_admin",
    "SupplierSmokeAdmin1",
  );

  const invalid = await jsonRequest(`${supplierBaseUrl}/api/v1/suppliers`, {
    headers: {
      Authorization: "Bearer invalid-token",
      "X-Request-Id": "client-chosen-id",
    },
  });
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.body.code, "UNAUTHENTICATED");
  const requestId = invalid.response.headers.get("x-request-id");
  assert.match(requestId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(requestId, "client-chosen-id");
  assert.equal(invalid.body.requestId, requestId);

  const defaultList = await supplierRequest("/api/v1/suppliers", memberToken);
  assert.equal(defaultList.response.status, 200);
  assert.equal(defaultList.body.totalItems, 21);
  assert.equal(defaultList.body.page, 0);
  assert.equal(defaultList.body.size, 12);
  assertStableNameOrder(defaultList.body.items);

  const descendingList = await supplierRequest(
    "/api/v1/suppliers?size=100&sort=name,desc",
    memberToken,
  );
  assert.equal(descendingList.response.status, 200);
  assert.equal(descendingList.body.totalItems, 21);
  const descendingNames = descendingList.body.items.map(({ name }) => name);
  assert.deepEqual(descendingNames, [...descendingNames].sort().reverse());

  const firstPage = await supplierRequest(
    "/api/v1/suppliers?size=5&page=0&sort=name,asc",
    memberToken,
  );
  const firstPageAgain = await supplierRequest(
    "/api/v1/suppliers?size=5&page=0&sort=name,asc",
    memberToken,
  );
  const secondPage = await supplierRequest(
    "/api/v1/suppliers?size=5&page=1&sort=name,asc",
    memberToken,
  );
  const firstIds = firstPage.body.items.map(({ id }) => id);
  assert.deepEqual(
    firstPageAgain.body.items.map(({ id }) => id),
    firstIds,
  );
  assert.equal(
    secondPage.body.items.some(({ id }) => firstIds.includes(id)),
    false,
  );

  const filtered = await supplierRequest(
    "/api/v1/suppliers?q=next%20to%20lt19&buildingCode=COM2&category=PRINTING",
    memberToken,
  );
  assert.equal(filtered.response.status, 200);
  assert.deepEqual(filtered.body.items.map(({ id }) => id), [printerId]);

  const detail = await supplierRequest(
    `/api/v1/suppliers/${printerId}`,
    memberToken,
  );
  assert.equal(detail.response.status, 200);
  assert.equal(detail.response.headers.get("etag"), '"v0"');
  assert.equal(detail.body.imagePath, "/assets/suppliers/PRINTER_COM2.jpeg");

  const asset = await fetch(
    `${supplierBaseUrl}/assets/suppliers/PRINTER_COM2.jpeg`,
  );
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /^image\/jpeg/);
  assert.ok((await asset.arrayBuffer()).byteLength > 0);

  const unsafeOffset = await supplierRequest(
    `/api/v1/suppliers?page=${Number.MAX_SAFE_INTEGER}&size=100`,
    memberToken,
  );
  assert.equal(unsafeOffset.response.status, 400);
  assert.equal(typeof unsafeOffset.body.fieldErrors.page, "string");

  psql(
    `UPDATE suppliers SET status = 'ARCHIVED', archived_at = now() WHERE id = '${printerId}';`,
  );

  const archivedAsMember = await supplierRequest(
    "/api/v1/suppliers?status=ARCHIVED",
    memberToken,
  );
  assert.equal(archivedAsMember.response.status, 403);

  const archivedDetailAsMember = await supplierRequest(
    `/api/v1/suppliers/${printerId}`,
    memberToken,
  );
  assert.equal(archivedDetailAsMember.response.status, 404);

  const archivedAsAdmin = await supplierRequest(
    "/api/v1/suppliers?status=ARCHIVED",
    adminToken,
  );
  assert.equal(archivedAsAdmin.response.status, 200);
  assert.deepEqual(archivedAsAdmin.body.items.map(({ id }) => id), [printerId]);

  const archivedDetailAsAdmin = await supplierRequest(
    `/api/v1/suppliers/${printerId}`,
    adminToken,
  );
  assert.equal(archivedDetailAsAdmin.response.status, 200);
  assert.equal(archivedDetailAsAdmin.response.headers.get("etag"), '"v0"');

  const repeatSeed = compose(
    [
      "run",
      "--rm",
      "--no-deps",
      "supplier-service",
      "node",
      "dist/database/seed/run.js",
    ],
    { capture: true },
  );
  assert.match(
    repeatSeed,
    /Supplier seed completed: 0 inserted, 21 already present\./,
  );
  assert.equal(
    psql(
      `SELECT status FROM suppliers WHERE id = '${printerId}';`,
      true,
    ).trim(),
    "ARCHIVED",
  );

  compose(["stop", "user-service"]);
  const unavailable = await supplierRequest(
    "/api/v1/suppliers",
    memberToken,
  );
  assert.equal(unavailable.response.status, 503);
  assert.equal(unavailable.body.code, "AUTHENTICATION_UNAVAILABLE");
  const healthWhileUserDown = await fetch(`${supplierBaseUrl}/health`);
  assert.equal(healthWhileUserDown.status, 200);

  compose(["start", "user-service"]);
  await waitFor(`${userBaseUrl}/health`, "restarted User health");
  const recovered = await supplierRequest("/api/v1/suppliers", memberToken);
  assert.equal(recovered.response.status, 200);

  console.info(
    "PASS: 21-row seed, repeat seed, real login/verification, catalogue reads, " +
      "stable paging, roles, errors, ETag, request IDs, assets, and fail-closed auth.",
  );
}

try {
  await run();
} finally {
  if (stackStarted) {
    console.info("Removing the dedicated Supplier smoke stack and volumes...");
  }
  resetStack();
}
