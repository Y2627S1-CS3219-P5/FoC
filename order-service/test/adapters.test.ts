/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Tests for the stub session verifier, supplier directory, credit bus and adapter
 *        configuration, written before the implementation per the approved plan.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Added the restart test for StubCreditBus.restore().
 * Author review: Reviewed and approved by @mattis.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { Pool } from "pg";
import { StubCreditBus } from "../src/adapters/creditBus";
import { StubSessionVerifier } from "../src/adapters/sessionVerifier";
import { STUB_SUPPLIERS, StubSupplierDirectory } from "../src/adapters/supplierDirectory";
import { loadAdapterConfig } from "../src/config";
import { sweepDeadlines } from "../src/deadlines/sweeper";
import { applyTransition, createErrand } from "../src/errands/repository";
import type { Actor, Errand } from "../src/errands/errand";
import { publishOutboxBatch, type OutboxMessage } from "../src/outbox";
import { createTestDatabase, type TestDatabase } from "./helpers";

let db: TestDatabase;
let pool: Pool;
let bus: StubCreditBus;
let logged: Record<string, unknown>[];

before(async () => {
  db = await createTestDatabase();
  pool = db.pool;
});
after(async () => db.drop());
beforeEach(() => {
  bus = new StubCreditBus(pool, { limit: 100, delayMs: 0, silentAmount: 999 });
  logged = [];
  const capture = (line: string) => void logged.push(JSON.parse(line));
  mock.method(console, "log", capture);
  mock.method(console, "error", capture);
});
afterEach(() => mock.restoreAll());

const HOUR = 3_600_000;
const REQUESTER = "a1111111-1111-4111-8111-111111111111";
const COURIER = "b2222222-2222-4222-8222-222222222222";
const member = (id: string): Actor => ({ kind: "user", id, role: "MEMBER" });

async function newErrand(creditAmount: number): Promise<Errand> {
  const now = Date.now();
  return createErrand(
    pool,
    REQUESTER,
    {
      supplierId: STUB_SUPPLIERS[0].id,
      items: [{ name: "Latte", quantity: 1 }],
      dropoffLocation: "COM2 lobby",
      notes: null,
      creditAmount,
      listingDeadline: new Date(now + HOUR),
      pickupDeadline: new Date(now + 2 * HOUR),
      deliveryDeadline: new Date(now + 3 * HOUR),
    },
    STUB_SUPPLIERS[0],
  );
}

async function flush(): Promise<void> {
  await publishOutboxBatch(pool, (m) => bus.publish(m));
  await bus.idle();
}
async function state(id: string): Promise<{ state: string; rejection_reason: string | null }> {
  const { rows } = await pool.query("SELECT state, rejection_reason FROM errands WHERE id = $1", [id]);
  return rows[0];
}
async function step(id: string, action: "accept" | "pickup" | "deliver" | "confirm"): Promise<void> {
  const actor = action === "confirm" ? member(REQUESTER) : member(COURIER);
  assert.equal((await applyTransition(pool, id, action, actor)).ok, true, action);
}
function terminal(orderId: string, over: Record<string, unknown> = {}): OutboxMessage {
  return {
    eventId: randomUUID(),
    topic: "credit.commands",
    key: orderId,
    payload: {
      type: "OrderCancelled", schema_version: 1, operation_id: randomUUID(), order_id: orderId,
      requester_id: REQUESTER, courier_id: null, amount: 10, occurred_at: new Date().toISOString(), ...over,
    },
  };
}

describe("stub credit bus", () => {
  it("stub bus opens errand within limit", async () => {
    const e = await newErrand(10);
    await flush();
    assert.equal((await state(e.id)).state, "OPEN");
    assert.equal(bus.hold(e.id)?.status, "HELD");
  });

  it("stub bus rejects over limit", async () => {
    const e = await newErrand(150);
    await flush();
    const s = await state(e.id);
    assert.equal(s.state, "RESERVATION_REJECTED");
    assert.equal(s.rejection_reason, "INSUFFICIENT_CREDIT");
  });

  it("silent reply ends in timeout and the hold is released", async () => {
    const e = await newErrand(999);
    await flush();
    assert.equal((await state(e.id)).state, "PENDING_RESERVATION");
    assert.equal(bus.hold(e.id)?.status, "HELD");
    await sweepDeadlines(pool, new Date(e.reservationDeadline.getTime() + 1000));
    await flush();
    assert.equal((await state(e.id)).state, "RESERVATION_TIMED_OUT");
    assert.equal(bus.hold(e.id)?.status, "RELEASED");
    assert.deepEqual(bus.violations(), []);
  });

  it("stub bus makes no hold for a rejected reserve, so a terminal event breaks rule 3", async () => {
    const e = await newErrand(150);
    await flush();
    assert.equal(bus.hold(e.id), undefined);
    await bus.publish([terminal(e.id)]);
    assert.equal(bus.violations().length, 1);
    assert.match(bus.violations()[0], /rule 3/);
  });

  it("stub bus treats ReservationTimedOut after a rejected reserve as a no-op", async () => {
    const e = await newErrand(150);
    await flush();
    const m = terminal(e.id, { type: "ReservationTimedOut", amount: 150 });
    delete m.payload.courier_id;
    await bus.publish([m]);
    assert.deepEqual(bus.violations(), []);
    assert.equal(bus.hold(e.id), undefined);
  });

  it("stub bus flags a terminal event sent before the reserve reply is delivered", async () => {
    bus = new StubCreditBus(pool, { limit: 100, delayMs: 100, silentAmount: 999 });
    const e = await newErrand(10);
    await publishOutboxBatch(pool, (m) => bus.publish(m));
    await bus.publish([terminal(e.id)]);
    assert.equal(bus.violations().length, 1);
    assert.match(bus.violations()[0], /rule 3/);
    assert.equal(bus.hold(e.id)?.status, "HELD");
    await bus.idle();
    assert.equal((await state(e.id)).state, "OPEN");
  });

  it("stub bus accepts a full lifecycle with no violations", async () => {
    const e = await newErrand(10);
    await flush();
    for (const a of ["accept", "pickup", "deliver", "confirm"] as const) await step(e.id, a);
    await flush();
    assert.equal((await state(e.id)).state, "COMPLETED");
    assert.deepEqual(bus.violations(), []);
    assert.equal(bus.hold(e.id)?.status, "CAPTURED");
  });

  it("stub bus flags a terminal event with the wrong amount", async () => {
    const e = await newErrand(10);
    await flush();
    await bus.publish([terminal(e.id, { amount: 11 })]);
    assert.equal(bus.violations().length, 1);
    assert.match(bus.violations()[0], /amount/);
    assert.equal(bus.hold(e.id)?.status, "HELD");
    assert.ok(logged.some((l) => l.event === "credit.stub.contract_violation"));
  });

  it("a restarted bus rebuilds its holds from published rows: no false violation", async () => {
    const e = await newErrand(10);
    await flush();
    for (const a of ["accept", "pickup", "deliver"] as const) await step(e.id, a);
    assert.equal((await state(e.id)).state, "DELIVERED");

    const bus2 = new StubCreditBus(pool, { limit: 100, delayMs: 0, silentAmount: 999 });
    await bus2.restore();
    assert.equal(bus2.hold(e.id)?.status, "HELD");
    await step(e.id, "confirm");
    await publishOutboxBatch(pool, (m) => bus2.publish(m));
    await bus2.idle();
    assert.deepEqual(bus2.violations(), []);
    assert.equal(bus2.hold(e.id)?.status, "CAPTURED");
  });

  it("stub bus ignores a duplicate terminal event", async () => {
    const e = await newErrand(10);
    await flush();
    const m = terminal(e.id, { type: "OrderCompleted", courier_id: COURIER });
    await bus.publish([m]);
    await bus.publish([m]);
    assert.equal(bus.hold(e.id)?.status, "CAPTURED");
    assert.deepEqual(bus.violations(), []);
    assert.equal(logged.filter((l) => l.event === "credit.stub.duplicate").length, 1);
  });

  it("stub bus flags a different closing message after the hold is finalised", async () => {
    const e = await newErrand(10);
    await flush();
    await bus.publish([terminal(e.id), terminal(e.id, { type: "OrderExpired" })]);
    assert.equal(bus.hold(e.id)?.status, "RELEASED");
    assert.equal(bus.violations().length, 1);
  });

  it("stub bus flags a missing hold and a broken courier_id rule", async () => {
    const e = await newErrand(10);
    await flush();
    await bus.publish([terminal(randomUUID())]);
    await bus.publish([terminal(e.id, { type: "OrderCompleted", courier_id: REQUESTER })]);
    await bus.publish([terminal(e.id, { courier_id: COURIER })]);
    await bus.publish([terminal(e.id, { schema_version: 2 })]);
    assert.equal(bus.violations().length, 4);
    assert.equal(bus.hold(e.id)?.status, "HELD");
  });

  it("stub bus treats ReservationTimedOut without a hold as harmless", async () => {
    const m = terminal(randomUUID(), { type: "ReservationTimedOut" });
    delete m.payload.courier_id;
    await bus.publish([m]);
    assert.deepEqual(bus.violations(), []);
  });
});

describe("stub session verifier", () => {
  it("stub verifier parses role and rejects malformed tokens", async () => {
    const v = new StubSessionVerifier();
    const id = "A1111111-1111-4111-8111-111111111111";
    assert.deepEqual(await v.verify(`Bearer stub.${id}.MEMBER`), { id: id.toLowerCase(), role: "MEMBER" });
    assert.deepEqual(await v.verify(`Bearer stub.${REQUESTER}.ADMINISTRATOR`), { id: REQUESTER, role: "ADMINISTRATOR" });
    for (const bad of [
      undefined, "", "Bearer", `stub.${REQUESTER}.MEMBER`, `Bearer stub.${REQUESTER}.member`, `Bearer stub.${REQUESTER}.ROOT`,
      "Bearer stub.not-a-uuid.MEMBER", `Bearer stub.${REQUESTER}.MEMBER.x`, `bearer stub.${REQUESTER}.MEMBER`, `Bearer  stub.${REQUESTER}.MEMBER`,
    ]) {
      assert.equal(await v.verify(bad), null, String(bad));
    }
  });
});

describe("stub supplier directory", () => {
  it("returns the three fixed suppliers and null for unknown ids", async () => {
    const d = new StubSupplierDirectory();
    assert.equal(STUB_SUPPLIERS.length, 3);
    for (const n of [1, 2, 3]) {
      const id = `00000000-0000-4000-8000-00000000000${n}`;
      assert.equal((await d.getActiveSupplier(id))?.id, id);
    }
    assert.equal(await d.getActiveSupplier(randomUUID()), null);
  });
});

describe("adapter config", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ["AUTH_MODE", "SUPPLIER_MODE", "CREDIT_MODE", "STUB_CREDIT_LIMIT", "STUB_CREDIT_DELAY_MS", "STUB_CREDIT_SILENT_AMOUNT"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("config rejects AUTH_MODE=user-service", () => {
    process.env.AUTH_MODE = "user-service";
    assert.throws(() => loadAdapterConfig(), /^Error: AUTH_MODE=user-service is not implemented yet$/);
  });

  it("config defaults to stubs with limit 100, delay 500 and silent amount 999", () => {
    for (const k of ["AUTH_MODE", "SUPPLIER_MODE", "CREDIT_MODE", "STUB_CREDIT_LIMIT", "STUB_CREDIT_DELAY_MS", "STUB_CREDIT_SILENT_AMOUNT"]) delete process.env[k];
    assert.deepEqual(loadAdapterConfig(), {
      authMode: "stub", supplierMode: "stub", creditMode: "stub",
      stubCreditLimit: 100, stubCreditDelayMs: 500, stubCreditSilentAmount: 999,
    });
  });
});
