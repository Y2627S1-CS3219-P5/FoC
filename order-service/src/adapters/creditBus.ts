/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Stub Credit Service behind MessagePublisher. It holds credits in memory like the real
 *        service, replies to ReserveRequested, and checks every message against
 *        docs/order-credit-contract.md, implementing the approved plan.
 * Author review: PENDING
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { handleCreditResult } from "../credit/creditResults";
import { errorMessage, log } from "../log";
import type { MessagePublisher, OutboxMessage } from "../outbox";

export interface StubHold {
  requesterId: string;
  amount: number;
  status: "HELD" | "CAPTURED" | "RELEASED";
  operationIds: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL = ["OrderCompleted", "OrderCancelled", "OrderExpired", "OrderFailed"];

export class StubCreditBus implements MessagePublisher {
  private readonly holds = new Map<string, StubHold>();
  private readonly found: string[] = [];
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly pool: Pool,
    private readonly opts: { limit: number; delayMs: number; silentAmount: number },
  ) {}

  /** Processes the messages in order; their effects on the holds are in place when this resolves. */
  async publish(messages: OutboxMessage[]): Promise<void> {
    for (const m of messages) {
      log.info("credit.stub.sent", { eventId: m.eventId, topic: m.topic, key: m.key, type: m.payload.type });
      this.process(m.payload);
    }
  }

  /** The hold for an errand, if the stub made one (for tests). */
  hold(orderId: string): StubHold | undefined {
    return this.holds.get(orderId);
  }

  /** Every contract violation seen so far (for tests). */
  violations(): string[] {
    return [...this.found];
  }

  /** Resolves when no replies are pending (for tests). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  private violation(p: Record<string, unknown>, reason: string): void {
    this.found.push(reason);
    log.warn("credit.stub.contract_violation", { type: p.type, orderId: p.order_id, operationId: p.operation_id, reason });
  }

  // Missing or malformed required fields, or null if the payload is well-formed
  private shapeProblem(p: Record<string, unknown>): string | null {
    if (p.schema_version !== 1) return "schema_version is not 1";
    for (const f of ["operation_id", "order_id", "requester_id"]) {
      if (typeof p[f] !== "string" || !UUID_RE.test(p[f] as string)) return `${f} is missing or not a UUID`;
    }
    if (!Number.isSafeInteger(p.amount) || (p.amount as number) < 1) return "amount is missing or not a whole number";
    if (typeof p.occurred_at !== "string" || Number.isNaN(Date.parse(p.occurred_at))) return "occurred_at is missing or not a timestamp";
    return null;
  }

  private courierProblem(p: Record<string, unknown>): string | null {
    if (p.type === "OrderCompleted") {
      if (typeof p.courier_id !== "string" || !UUID_RE.test(p.courier_id)) return "OrderCompleted needs a UUID courier_id";
      if (p.courier_id.toLowerCase() === (p.requester_id as string).toLowerCase()) return "OrderCompleted courier_id equals requester_id";
    } else if (TERMINAL.includes(p.type as string)) {
      if (p.courier_id !== null) return `${p.type} needs courier_id null`;
    } else if ("courier_id" in p) {
      return `${p.type} must not have a courier_id`;
    }
    return null;
  }

  private process(p: Record<string, unknown>): void {
    const type = p.type;
    if (type !== "ReserveRequested" && type !== "ReservationTimedOut" && !TERMINAL.includes(type as string)) {
      return this.violation(p, `unknown type ${String(type)}`);
    }
    const problem = this.shapeProblem(p) ?? this.courierProblem(p);
    if (problem) return this.violation(p, problem);

    const orderId = p.order_id as string;
    const operationId = p.operation_id as string;
    const hold = this.holds.get(orderId);

    if (hold?.operationIds.includes(operationId)) {
      log.info("credit.stub.duplicate", { type, orderId, operationId });
      return;
    }

    if (type === "ReserveRequested") {
      if (hold) return this.violation(p, "second ReserveRequested for the order with a different operation_id (rule 1)");
      this.holds.set(orderId, {
        requesterId: p.requester_id as string, amount: p.amount as number, status: "HELD", operationIds: [operationId],
      });
      log.info("credit.stub.applied", { type, orderId, operationId, status: "HELD" });
      // A lost reply is mimicked by the silent amount: the hold exists but nothing answers
      if (p.amount !== this.opts.silentAmount) this.scheduleReply(orderId, operationId, p.amount as number);
      return;
    }

    if (!hold) {
      if (type === "ReservationTimedOut") {
        log.info("credit.stub.applied", { type, orderId, operationId, status: "NO_HOLD" });
        return;
      }
      return this.violation(p, "terminal event with no hold (rule 3)");
    }
    if (hold.status !== "HELD") {
      return this.violation(p, `hold already ${hold.status} by a different operation_id (rule 2)`);
    }
    if (p.requester_id !== hold.requesterId) return this.violation(p, "requester_id differs from the hold (rule 4)");
    if (p.amount !== hold.amount) return this.violation(p, `amount ${String(p.amount)} differs from the held amount ${hold.amount} (rule 4)`);

    hold.status = type === "OrderCompleted" ? "CAPTURED" : "RELEASED";
    hold.operationIds.push(operationId);
    log.info("credit.stub.applied", { type, orderId, operationId, status: hold.status });
  }

  private scheduleReply(orderId: string, operationId: string, amount: number): void {
    const task = (async () => {
      await new Promise((resolve) => setTimeout(resolve, this.opts.delayMs));
      const eventId = randomUUID();
      try {
        await handleCreditResult(
          this.pool,
          amount <= this.opts.limit
            ? { type: "CreditReserved", eventId, operationId, orderId, reservationId: randomUUID() }
            : { type: "CreditReservationRejected", eventId, operationId, orderId, reasonCode: "INSUFFICIENT_CREDIT" },
        );
      } catch (err) {
        log.error("credit.stub.reply_failed", { orderId, error: errorMessage(err) });
      }
    })();
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }
}
