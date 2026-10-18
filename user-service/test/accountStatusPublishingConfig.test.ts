// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: issue #49 publisher feature-gate tests.
// Author review: PENDING.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { Pool } from "pg";
import { startAccountStatusPublishing } from "../src/accountStatusPublishing";
import { loadAppConfig } from "../src/config";

const ENVIRONMENT = [
  "JWT_SECRET",
  "ALLOWED_EMAIL_DOMAIN",
  "ACCOUNT_STATUS_PUBLISHING_ENABLED",
] as const;
const original = Object.fromEntries(
  ENVIRONMENT.map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret";
  process.env.ALLOWED_EMAIL_DOMAIN = "u.nus.edu";
  delete process.env.ACCOUNT_STATUS_PUBLISHING_ENABLED;
});

afterEach(() => {
  for (const name of ENVIRONMENT) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("keeps publishing enabled by default for local/full deployments", () => {
  assert.equal(loadAppConfig().accountStatusPublishingEnabled, true);
});

test("accepts an explicit disabled cloud deployment", async () => {
  process.env.ACCOUNT_STATUS_PUBLISHING_ENABLED = "false";
  assert.equal(loadAppConfig().accountStatusPublishingEnabled, false);

  let producerCreated = false;
  const lifecycle = startAccountStatusPublishing(
    false,
    {} as Pool,
    () => {
      producerCreated = true;
      throw new Error("producer must not be created");
    },
  );
  await lifecycle.stop();
  assert.equal(producerCreated, false);
});

test("rejects ambiguous publisher settings", () => {
  process.env.ACCOUNT_STATUS_PUBLISHING_ENABLED = "sometimes";
  assert.throws(() => loadAppConfig(), /must be true or false/);
});
