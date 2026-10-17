/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Outbox insert, batch publisher and publisher loop, adapted from credit-service/src/outbox.ts
 *        and src/publisher.ts (branch_credit) without causation_id, retention cleanup or event_id in
 *        the payload (the contract fixes its keys); the loop takes a MessagePublisher.
 * Author review: Reviewed and approved by @mattis.
 */
import { randomUUID } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { OUTBOX } from "./config";
import { inTransaction } from "./db";
import { errorMessage, log } from "./log";

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

export interface OutboxMessage {
  eventId: string;
  topic: string;
  key: string;
  payload: Record<string, unknown>;
}

/** Where the outbox publisher sends messages (Kafka later; StubCreditBus for now). */
export interface MessagePublisher {
  publish(messages: OutboxMessage[]): Promise<void>;
}

/**
 * Publishes up to OUTBOX.batchSize unpublished events, oldest first. `produce` must resolve
 * only once every message is acknowledged; if it throws, nothing is marked and the events are
 * retried in a later batch. The transaction stays open through produce() and the marking, so
 * the row locks stop another publisher instance from taking the same rows. Returns the count.
 */
export async function publishOutboxBatch(
  pool: Pool,
  produce: (messages: OutboxMessage[]) => Promise<void>,
): Promise<number> {
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `SELECT event_id, topic, message_key, payload
       FROM outbox
       WHERE published_at IS NULL
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [OUTBOX.batchSize],
    );
    if (rows.length === 0) return 0;

    await produce(rows.map((r) => ({ eventId: r.event_id, topic: r.topic, key: r.message_key, payload: r.payload })));

    await client.query("UPDATE outbox SET published_at = now() WHERE event_id = ANY($1::uuid[])", [
      rows.map((r) => r.event_id),
    ]);
    return rows.length;
  });
}

/**
 * Publishes outbox events until stop() is called. Batches run back to back while there is
 * work; when the outbox is empty it waits OUTBOX.idlePollMs. A failed batch is retried after
 * a growing pause. Batches never overlap; stop() waits for the running one.
 */
export function startOutboxPublisher(pool: Pool, publisher: MessagePublisher): { stop(): Promise<void> } {
  let stopping = false;
  let wake: (() => void) | undefined;
  let timer: NodeJS.Timeout | undefined;
  // Resolves after ms, or at once when stop() is called
  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      // stop() may have been called while a batch was running, when there was no pause to wake
      if (stopping) return resolve();
      wake = resolve;
      timer = setTimeout(resolve, ms);
    });

  const loop = (async () => {
    let failures = 0;
    while (!stopping) {
      try {
        const published = await publishOutboxBatch(pool, (m) => publisher.publish(m));
        if (failures > 0) log.info("outbox_publisher_recovered", { afterFailures: failures });
        failures = 0;
        if (published > 0) log.info("outbox_published", { count: published });
        else await pause(OUTBOX.idlePollMs);
      } catch (err) {
        failures++;
        if (failures === 1) log.warn("outbox_publish_failed", { error: errorMessage(err) });
        await pause(Math.min(OUTBOX.idlePollMs * 2 ** failures, 5_000));
      }
    }
  })();

  return {
    async stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      wake?.();
      await loop;
    },
  };
}
