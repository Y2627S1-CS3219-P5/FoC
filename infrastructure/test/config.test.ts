import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConfigurationError,
  configFingerprint,
  parseDeploymentConfig,
} from "../lib/config.js";
import { validConfig } from "./fixtures.js";

test("accepts a complete reviewed deployment configuration", () => {
  assert.deepEqual(parseDeploymentConfig(validConfig()), validConfig());
});

test("rejects missing and placeholder deployment inputs", () => {
  const incomplete = {
    ...validConfig(),
    owner: "",
    monthlyBudgetUsd: "REPLACE_WITH_APPROVED_NUMBER",
  };
  assert.throws(() => parseDeploymentConfig(incomplete), ConfigurationError);
});

test("requires a NUS bootstrap administrator email", () => {
  const invalid = {
    ...validConfig(),
    bootstrapAdministrator: {
      ...validConfig().bootstrapAdministrator,
      email: "admin@example.com",
    },
  };
  assert.throws(() => parseDeploymentConfig(invalid), /u\.nus\.edu/);
});

test("rejects invalid Fargate CPU and memory combinations", () => {
  const invalid = validConfig();
  invalid.services.frontend.memoryMiB = 768;
  assert.throws(() => parseDeploymentConfig(invalid), /Fargate CPU\/memory/);
});

test("requires authentication rate limiting to be stricter", () => {
  const invalid = validConfig();
  invalid.waf.authentication.requestsPerEvaluationWindow = 3000;
  assert.throws(() => parseDeploymentConfig(invalid), /stricter/);
});

test("requires maximum database storage to cover initial storage", () => {
  const invalid = validConfig();
  invalid.database.maximumStorageGiB = 10;
  assert.throws(() => parseDeploymentConfig(invalid), /maximumStorageGiB/);
});

test("configuration fingerprint is independent of JSON key order", () => {
  const config = validConfig();
  const reversed = Object.fromEntries(Object.entries(config).reverse());
  assert.equal(
    configFingerprint(config),
    configFingerprint(parseDeploymentConfig(reversed)),
  );
});
