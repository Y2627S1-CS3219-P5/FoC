/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Outbox insert, adapted from credit-service/src/outbox.ts (branch_credit) without
 *        causation_id and without adding event_id to the payload (the contract fixes its keys).
 * Author review: PENDING
 */
import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";

/**
 * Adds an event to the outbox. Call it inside the transaction that makes the change, so the
 * event exists if and only if the change committed. Returns the row's event_id.
 */
export async function insertOutboxEvent(
  client: PoolClient,
  event: { eventType: string; topic: string; key: string; payload: Record<string, unknown> },
): Promise<string> {
  const eventId = randomUUID();
  await client.query(
    `INSERT INTO outbox (event_id, event_type, topic, message_key, payload) VALUES ($1, $2, $3, $4, $5)`,
    [eventId, event.eventType, event.topic, event.key, event.payload],
  );
  return eventId;
}
