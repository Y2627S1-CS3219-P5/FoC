// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: issue #49 feature gate for the account-status publisher.
// Author review: PENDING.
import { Pool } from "pg";
import { createProducer } from "./kafka";
import { startOutboxPublisher, StatusProducer } from "./publisher";

export interface PublisherLifecycle {
  stop(): Promise<void>;
}

/**
 * Starts Kafka publishing only when the deployed slice has a broker and
 * consumers. Disabling this does not disable transactional outbox writes, so
 * status changes remain durable for an explicitly enabled later deployment.
 */
export function startAccountStatusPublishing(
  enabled: boolean,
  db: Pool,
  producerFactory: () => StatusProducer = createProducer,
): PublisherLifecycle {
  if (!enabled) {
    console.info("account_status_publishing_disabled");
    return { stop: async () => undefined };
  }
  return startOutboxPublisher(db, producerFactory());
}
