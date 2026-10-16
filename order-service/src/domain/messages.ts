/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Payload builders for the credit.commands messages, matching
 *        docs/order-credit-contract.md, implementing the approved plan.
 * Author review: PENDING
 */
import type { Errand } from "../errands/errand";
import type { ClosingMessageType, TerminalEventType } from "./transitions";

export function reserveRequestedPayload(e: Errand) {
  return {
    type: "ReserveRequested" as const,
    schema_version: 1 as const,
    operation_id: e.reservationOperationId,
    order_id: e.id,
    requester_id: e.requesterId,
    amount: e.creditAmount,
    occurred_at: e.createdAt.toISOString(),
  };
}

/** `courier_id` is the courier on OrderCompleted and null on the other three. */
export function terminalEventPayload(e: Errand, type: TerminalEventType, operationId: string) {
  if (type === "OrderCompleted" && e.courierId === null) {
    throw new Error(`OrderCompleted for errand ${e.id} has no courier`);
  }
  return {
    type,
    schema_version: 1 as const,
    operation_id: operationId,
    order_id: e.id,
    requester_id: e.requesterId,
    courier_id: type === "OrderCompleted" ? e.courierId : null,
    amount: e.creditAmount,
    occurred_at: e.updatedAt.toISOString(),
  };
}

/** No `courier_id` key: the errand never became visible to couriers. */
export function reservationTimedOutPayload(e: Errand, operationId: string) {
  return {
    type: "ReservationTimedOut" as const,
    schema_version: 1 as const,
    operation_id: operationId,
    order_id: e.id,
    requester_id: e.requesterId,
    amount: e.creditAmount,
    occurred_at: e.updatedAt.toISOString(),
  };
}

export function closingMessagePayload(e: Errand, type: ClosingMessageType, operationId: string) {
  return type === "ReservationTimedOut"
    ? reservationTimedOutPayload(e, operationId)
    : terminalEventPayload(e, type, operationId);
}
