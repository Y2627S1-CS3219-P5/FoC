/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Service entry point: wait for the database, connect the Kafka producer, start the
 *        consumer and the outbox publisher, and shut down cleanly on SIGTERM/SIGINT.
 * Author review: Reviewed and approved by @phuc
 */
import { CONSUMER_GROUP, loadCreditConfig } from "./config";
import { createPool } from "./db";
import { retryWhileDatabaseUnavailable } from "./dbAvailability";
import { createKafka, createProducer, sendMessages } from "./kafka";
import { errorMessage, log } from "./log";
import { startConsumer } from "./consumer";
import { startOutboxPublisher } from "./publisher";

async function main(): Promise<void> {
  loadCreditConfig(); // fail fast on a bad INITIAL_CREDIT_GRANT
  const pool = createPool();
  await retryWhileDatabaseUnavailable("Startup", () => pool.query("SELECT 1"));

  const kafka = createKafka();
  const producer = createProducer(kafka);
  await producer.connect();

  const consumer = kafka.consumer({
    kafkaJS: {
      groupId: CONSUMER_GROUP,
      fromBeginning: true, // auto.offset.reset=earliest
      autoCommit: false, // offsets are committed per message after it is handled
      readUncommitted: false, // isolation.level=read_committed
    },
  });

  const publisher = startOutboxPublisher(pool, producer);
  await startConsumer(consumer, { pool, send: (messages) => sendMessages(producer, messages) });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutdown", { signal });
    // Consumer first, so no new message starts while the rest closes
    await consumer.disconnect().catch((err) => log.warn("consumer_disconnect_failed", { error: errorMessage(err) }));
    await publisher.stop();
    await producer.disconnect().catch((err) => log.warn("producer_disconnect_failed", { error: errorMessage(err) }));
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log.error("startup_failed", { error: errorMessage(err) });
  process.exit(1);
});
