/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Tests for the errand HTTP API (authentication, relationship-based authorization, status
 *        code mapping, lifecycle), written before the implementation per the approved plan.
 * Author review: PENDING
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { createTestDatabase, TestDatabase } from "./helpers";
import { createApp } from "../src/http/app";
import { StubSessionVerifier } from "../src/adapters/sessionVerifier";
import { STUB_SUPPLIERS, StubSupplierDirectory } from "../src/adapters/supplierDirectory";
import { StubCreditBus } from "../src/adapters/creditBus";
import { publishOutboxBatch } from "../src/outbox";

let db: TestDatabase;
let pool: Pool;
let server: Server;
let base: string;
let bus: StubCreditBus;

const realLog = console.log;
const realError = console.error;
before(async () => {
  // Keep the stub bus and service logs out of the test output
  console.log = () => {};
  console.error = () => {};
  db = await createTestDatabase();
  pool = db.pool;
  bus = new StubCreditBus(pool, { limit: 100, delayMs: 0, silentAmount: 999 });
  const app = createApp({ pool, verifier: new StubSessionVerifier(), suppliers: new StubSupplierDirectory() });
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.drop();
  console.log = realLog;
  console.error = realError;
});

const HOUR = 3_600_000;
const member = (id: string) => `Bearer stub.${id}.MEMBER`;
const admin = (id: string) => `Bearer stub.${id}.ADMINISTRATOR`;

async function call(method: string, path: string, auth?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

function createBody(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    supplierId: STUB_SUPPLIERS[0].id,
    items: [{ name: "Latte", quantity: 1 }],
    dropoffLocation: "COM2 lobby",
    creditAmount: 10,
    listingDeadline: new Date(now + HOUR).toISOString(),
    pickupDeadline: new Date(now + 2 * HOUR).toISOString(),
    deliveryDeadline: new Date(now + 3 * HOUR).toISOString(),
    ...overrides,
  };
}

async function createPending(auth: string) {
  const r = await call("POST", "/errands", auth, createBody());
  assert.equal(r.status, 202);
  return r.body;
}

async function createOpen(auth: string) {
  const e = await createPending(auth);
  await publishOutboxBatch(pool, (m) => bus.publish(m));
  await bus.idle();
  return e;
}

test("401 without token", async () => {
  for (const [m, p] of [["GET", "/errands/open"], ["POST", "/errands"], ["GET", "/admin/errands"], ["GET", `/errands/${randomUUID()}`]]) {
    const r = await call(m, p);
    assert.equal(r.status, 401, `${m} ${p}`);
    assert.equal(r.body.error, "UNAUTHENTICATED");
  }
  assert.equal((await call("GET", "/errands/open", "Bearer nonsense")).status, 401);
});

test("health needs no auth", async () => {
  const r = await call("GET", "/health");
  assert.deepEqual(r, { status: 200, body: { status: "ok" } });
});

test("create returns 202 PENDING_RESERVATION", async () => {
  const a = randomUUID();
  const r = await call("POST", "/errands", member(a), createBody());
  assert.equal(r.status, 202);
  assert.equal(r.body.state, "PENDING_RESERVATION");
  assert.equal(r.body.requesterId, a);
  assert.equal(r.body.supplierName, STUB_SUPPLIERS[0].name);
  assert.equal("reservationOperationId" in r.body, false);
  assert.equal(typeof r.body.listingDeadline, "string");
  assert.ok(!Number.isNaN(Date.parse(r.body.createdAt)));
});

test("create with archived/unknown supplier is 422", async () => {
  const r = await call("POST", "/errands", member(randomUUID()), createBody({ supplierId: randomUUID() }));
  assert.equal(r.status, 422);
  assert.equal(r.body.error, "SUPPLIER_UNAVAILABLE");
});

test("create with bad body lists fields", async () => {
  const r = await call("POST", "/errands", member(randomUUID()), createBody({ creditAmount: 0, items: [] }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "VALIDATION_ERROR");
  const fields = r.body.details.map((d: { field: string }) => d.field);
  assert.ok(fields.includes("creditAmount") && fields.includes("items"));
});

test("malformed JSON is 400 VALIDATION_ERROR", async () => {
  const res = await fetch(base + "/errands", {
    method: "POST",
    headers: { authorization: member(randomUUID()), "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "VALIDATION_ERROR");
});

test("full lifecycle over HTTP", async () => {
  const a = randomUUID();
  const b = randomUUID();
  const e = await createOpen(member(a));
  assert.equal((await call("GET", `/errands/${e.id}`, member(a))).body.state, "OPEN");

  const acc = await call("POST", `/errands/${e.id}/accept`, member(b));
  assert.equal(acc.status, 200);
  assert.equal(acc.body.state, "ACCEPTED");
  assert.equal(acc.body.courierId, b);
  assert.equal((await call("POST", `/errands/${e.id}/pickup`, member(b))).body.state, "PICKED_UP");
  assert.equal((await call("POST", `/errands/${e.id}/deliver`, member(b))).body.state, "DELIVERED");
  const done = await call("POST", `/errands/${e.id}/confirm`, member(a));
  assert.equal(done.status, 200);
  assert.equal(done.body.state, "COMPLETED");

  const detail = await call("GET", `/errands/${e.id}`, member(b));
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.history.map((h: { action: string }) => h.action).slice(-4), ["accept", "pickup", "deliver", "confirm"]);
  assert.ok(!Number.isNaN(Date.parse(detail.body.history[0].at)));
});

test("requester accept is 403 CANNOT_ACCEPT_OWN_ERRAND", async () => {
  const a = randomUUID();
  const e = await createOpen(member(a));
  const r = await call("POST", `/errands/${e.id}/accept`, member(a));
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "CANNOT_ACCEPT_OWN_ERRAND");
});

test("second accept is 409 ERRAND_NO_LONGER_AVAILABLE", async () => {
  const e = await createOpen(member(randomUUID()));
  assert.equal((await call("POST", `/errands/${e.id}/accept`, member(randomUUID()))).status, 200);
  const r = await call("POST", `/errands/${e.id}/accept`, member(randomUUID()));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "ERRAND_NO_LONGER_AVAILABLE");
  assert.equal(r.body.currentState, "ACCEPTED");
});

test("second confirm is 409 INVALID_STATE currentState COMPLETED", async () => {
  const a = randomUUID();
  const b = randomUUID();
  const e = await createOpen(member(a));
  for (const act of ["accept", "pickup", "deliver"]) await call("POST", `/errands/${e.id}/${act}`, member(b));
  assert.equal((await call("POST", `/errands/${e.id}/confirm`, member(a))).status, 200);
  const r = await call("POST", `/errands/${e.id}/confirm`, member(a));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "INVALID_STATE");
  assert.equal(r.body.currentState, "COMPLETED");
});

test("wrong party on an action is 403 FORBIDDEN", async () => {
  const a = randomUUID();
  const e = await createOpen(member(a));
  await call("POST", `/errands/${e.id}/accept`, member(randomUUID()));
  const r = await call("POST", `/errands/${e.id}/pickup`, member(a));
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "FORBIDDEN");
  // An unrelated member can't even tell the errand exists
  assert.equal((await call("POST", `/errands/${e.id}/pickup`, member(randomUUID()))).status, 404);
});

test("unrelated member GET of accepted errand is 404", async () => {
  const e = await createOpen(member(randomUUID()));
  await call("POST", `/errands/${e.id}/accept`, member(randomUUID()));
  const r = await call("GET", `/errands/${e.id}`, member(randomUUID()));
  assert.equal(r.status, 404);
  assert.equal(r.body.error, "NOT_FOUND");
  assert.equal((await call("GET", `/errands/${e.id}`, admin(randomUUID()))).status, 200);
});

test("member on /admin/errands is 403", async () => {
  const r = await call("GET", "/admin/errands", member(randomUUID()));
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "FORBIDDEN");
  const r2 = await call("POST", `/admin/errands/${randomUUID()}/resolve`, member(randomUUID()), { outcome: "COURIER", reason: "x" });
  assert.equal(r2.status, 403);
});

test("admin resolve COURIER → COMPLETED", async () => {
  const a = randomUUID();
  const b = randomUUID();
  const e = await createOpen(member(a));
  for (const act of ["accept", "pickup", "deliver"]) await call("POST", `/errands/${e.id}/${act}`, member(b));
  const rej = await call("POST", `/errands/${e.id}/reject`, member(a), { reason: "wrong item" });
  assert.equal(rej.status, 200);
  assert.equal(rej.body.state, "DISPUTED");

  const bad = await call("POST", `/admin/errands/${e.id}/resolve`, admin(randomUUID()), { outcome: "NOBODY", reason: "x" });
  assert.equal(bad.status, 400);
  const r = await call("POST", `/admin/errands/${e.id}/resolve`, admin(randomUUID()), { outcome: "COURIER", reason: "photo proof" });
  assert.equal(r.status, 200);
  assert.equal(r.body.state, "COMPLETED");
  const detail = await call("GET", `/errands/${e.id}`, member(a));
  const last = detail.body.history[detail.body.history.length - 1];
  assert.equal(last.reason, "photo proof");
  assert.equal(detail.body.history.find((h: { action: string }) => h.action === "reject").reason, "wrong item");

  const list = await call("GET", `/admin/errands?courierId=${b}&state=COMPLETED`, admin(randomUUID()));
  assert.equal(list.status, 200);
  assert.equal(list.body.totalItems, 1);
});

test("non-uuid id is 404", async () => {
  const r = await call("GET", "/errands/not-a-uuid", member(randomUUID()));
  assert.equal(r.status, 404);
  assert.equal(r.body.error, "NOT_FOUND");
  assert.equal((await call("POST", "/errands/not-a-uuid/accept", member(randomUUID()))).status, 404);
  assert.equal((await call("POST", "/admin/errands/not-a-uuid/resolve", admin(randomUUID()), { outcome: "COURIER", reason: "x" })).status, 404);
});

test("unknown errand id is 404", async () => {
  assert.equal((await call("POST", `/errands/${randomUUID()}/accept`, member(randomUUID()))).status, 404);
});

test("open list excludes own and shows other's", async () => {
  const a = randomUUID();
  const b = randomUUID();
  const mine = await createOpen(member(a));
  const theirs = await createOpen(member(b));
  const r = await call("GET", "/errands/open?size=100", member(a));
  assert.equal(r.status, 200);
  const ids = r.body.items.map((e: { id: string }) => e.id);
  assert.ok(ids.includes(theirs.id));
  assert.ok(!ids.includes(mine.id));
  assert.equal(r.body.items.every((e: object) => !("reservationOperationId" in e)), true);
});

test("mine lists by role and state", async () => {
  const a = randomUUID();
  const e = await createOpen(member(a));
  const r = await call("GET", "/errands/mine?state=OPEN", member(a));
  assert.deepEqual(r.body.items.map((x: { id: string }) => x.id), [e.id]);
  assert.equal((await call("GET", "/errands/mine?as=courier", member(a))).body.totalItems, 0);
});

test("invalid query parameters are 400 VALIDATION_ERROR", async () => {
  const m = member(randomUUID());
  for (const q of ["page=-1", "page=1.5", "page=abc", "size=0", "size=101", "size=x", "as=driver", "state=BOGUS"]) {
    const r = await call("GET", `/errands/mine?${q}`, m);
    assert.equal(r.status, 400, q);
    assert.equal(r.body.error, "VALIDATION_ERROR");
  }
  assert.equal((await call("GET", "/errands/open?page=-1", m)).status, 400);
  assert.equal((await call("GET", "/admin/errands?requesterId=nope", admin(randomUUID()))).status, 400);
  assert.equal((await call("GET", "/admin/errands?courierId=nope", admin(randomUUID()))).status, 400);
});

test("invalid resolve and reject bodies are 400", async () => {
  const id = randomUUID();
  const adm = admin(randomUUID());
  assert.equal((await call("POST", `/admin/errands/${id}/resolve`, adm, { outcome: "COURIER" })).status, 400);
  assert.equal((await call("POST", `/admin/errands/${id}/resolve`, adm, { outcome: "COURIER", reason: "x".repeat(501) })).status, 400);
  assert.equal((await call("POST", `/admin/errands/${id}/resolve`, adm, { outcome: "COURIER", reason: "" })).status, 400);
  assert.equal((await call("POST", `/errands/${id}/reject`, member(randomUUID()), { reason: "x".repeat(501) })).status, 400);
  assert.equal((await call("POST", `/errands/${id}/reject`, member(randomUUID()), { reason: 5 })).status, 400);
});

test("database failure is 503 SERVICE_UNAVAILABLE and never leaks details", async () => {
  const broken = {
    query: async () => { throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }); },
    connect: async () => { throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }); },
  } as unknown as Pool;
  const app = createApp({ pool: broken, verifier: new StubSessionVerifier(), suppliers: new StubSupplierDirectory() });
  const s = app.listen(0);
  await new Promise<void>((r) => s.once("listening", r));
  try {
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    const h = await fetch(`${url}/health`);
    assert.equal(h.status, 503);
    assert.deepEqual(await h.json(), { status: "unavailable" });
    const r = await fetch(`${url}/errands/open`, { headers: { authorization: member(randomUUID()) } });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, "SERVICE_UNAVAILABLE");
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
});
