/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Turns Credit's CreditReserved / CreditReservationRejected replies into errand state
 *        changes under a row lock, implementing the approved plan and the Order <-> Credit contract.
 * Author review: PENDING
 */
import { randomUUID } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { TOPICS } from "../config";
import { inTransaction } from "../db";
import { terminalEventPayload, type CreditResult } from "../domain/messages";
import type { ErrandState } from "../domain/states";
import { mapErrandRow } from "../errands/errand";
import { log } from "../log";
import { insertOutboxEvent } from "../outbox";

export type CreditResultOutcome =
  | "opened"
  | "rejected"
  | "duplicate"
  | "late_reserve_cancelled"
  | "ignored_after_timeout"
  | "ignored_unknown_order"
  | "ignored_operation_mismatch";

async function history(
  client: PoolClient, errandId: string, from: ErrandState, to: ErrandState, action: string, reason: string | null, at: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO errand_history (errand_id, from_state, to_state, action, actor_type, actor_id, reason, at)
     VALUES ($1, $2, $3, $4, 'CREDIT', NULL, $5, $6)`,
    [errandId, from, to, action, reason, at],
  );
}

/**
 * Applies one reply from Credit in a single transaction. The errand row is locked first, so a
 * redelivered or racing reply sees the first outcome, which is final (contract: Replies).
 */
export async function handleCreditResult(pool: Pool, msg: CreditResult): Promise<CreditResultOutcome> {
  return inTransaction(pool, async (client): Promise<CreditResultOutcome> => {
    const { rows } = await client.query(`SELECT * FROM errands WHERE id = $1 FOR UPDATE`, [msg.orderId]);
    if (rows.length === 0) {
      log.warn("credit_result_unknown_order", { type: msg.type, orderId: msg.orderId, eventId: msg.eventId });
      return "ignored_unknown_order";
    }
    const errand = mapErrandRow(rows[0]);
    if (msg.operationId !== errand.reservationOperationId) {
      log.warn("credit_result_operation_mismatch", { type: msg.type, orderId: msg.orderId, eventId: msg.eventId });
      return "ignored_operation_mismatch";
    }
    const now = new Date();

    if (msg.type === "CreditReserved") {
      switch (errand.state) {
        case "PENDING_RESERVATION":
          await client.query(`UPDATE errands SET state = 'OPEN', updated_at = $2 WHERE id = $1`, [errand.id, now]);
          await history(client, errand.id, "PENDING_RESERVATION", "OPEN", "reserved", null, now);
          return "opened";
        case "RESERVATION_REJECTED": {
          const released = await client.query(
            `SELECT 1 FROM errand_history WHERE errand_id = $1 AND action = 'late_reserve_released' LIMIT 1`,
            [errand.id],
          );
          if (released.rows.length > 0) return "duplicate";
          await insertOutboxEvent(client, {
            eventType: "OrderCancelled",
            topic: TOPICS.commands,
            key: errand.id,
            payload: terminalEventPayload({ ...errand, updatedAt: now }, "OrderCancelled", randomUUID()),
          });
          await history(client, errand.id, "RESERVATION_REJECTED", "RESERVATION_REJECTED", "late_reserve_released", null, now);
          return "late_reserve_cancelled";
        }
        case "RESERVATION_TIMED_OUT":
          // The ReservationTimedOut already sent releases the hold
          await history(client, errand.id, "RESERVATION_TIMED_OUT", "RESERVATION_TIMED_OUT", "late_reply_after_timeout", null, now);
          return "ignored_after_timeout";
        default:
          return "duplicate";
      }
    }

    switch (errand.state) {
      case "PENDING_RESERVATION":
        await client.query(
          `UPDATE errands SET state = 'RESERVATION_REJECTED', rejection_reason = $2, closed_at = $3, updated_at = $3 WHERE id = $1`,
          [errand.id, msg.reasonCode, now],
        );
        await history(client, errand.id, "PENDING_RESERVATION", "RESERVATION_REJECTED", "reservation_rejected", msg.reasonCode, now);
        return "rejected";
      case "RESERVATION_TIMED_OUT":
        return "ignored_after_timeout";
      default:
        return "duplicate";
    }
  });
}
