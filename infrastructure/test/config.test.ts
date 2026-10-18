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

test("requires maximum database storage to be at least 110% of initial storage", () => {
  const invalid = validConfig();
  invalid.database.allocatedStorageGiB = 21;
  invalid.database.maximumStorageGiB = 23;
  assert.throws(() => parseDeploymentConfig(invalid), /110%/);

  invalid.database.maximumStorageGiB = 24;
  assert.doesNotThrow(() => parseDeploymentConfig(invalid));
});

test("requires a positive ECR image retention count", () => {
  const invalid = validConfig();
  invalid.registry.retainedImageCount = 0;
  assert.throws(() => parseDeploymentConfig(invalid), /retainedImageCount/);
});

test("requires repository pricing-snapshot cost evidence", () => {
  const invalid = structuredClone(validConfig()) as Record<string, unknown>;
  invalid.costApproval = {
    ...validConfig().costApproval,
    evidenceKind: "EXTERNAL_SHARED_LINK",
  };
  assert.throws(
    () => parseDeploymentConfig(invalid),
    /REPOSITORY_PRICING_SNAPSHOT/,
  );
});

test("requires the exact NUS quota restriction and reviewed Fargate quota", () => {
  const wrongRestriction = structuredClone(validConfig()) as Record<
    string,
    unknown
  >;
  wrongRestriction.quotaApproval = {
    ...validConfig().quotaApproval,
    serviceQuotasApiRestriction: "GENERIC_ACCESS_DENIED",
  };
  assert.throws(
    () => parseDeploymentConfig(wrongRestriction),
    /NUS_ORGANIZATIONS_SCP_EXPLICIT_DENY/,
  );

  const wrongQuota = structuredClone(validConfig()) as Record<string, unknown>;
  wrongQuota.quotaApproval = {
    ...validConfig().quotaApproval,
    reviewedQuota: "ec2:some-other-quota",
  };
  assert.throws(() => parseDeploymentConfig(wrongQuota), /fargate:L-3032A538/);
});

test("requires named manual quota approval evidence", () => {
  const missingEvidence = validConfig();
  missingEvidence.quotaApproval.confirmedBy = "";
  missingEvidence.quotaApproval.evidenceReference = "";
  assert.throws(
    () => parseDeploymentConfig(missingEvidence),
    /quotaApproval\.(confirmedBy|evidenceReference)/,
  );
});

test("rejects sub-minute periods for standard-resolution metrics", () => {
  const invalid = validConfig();
  invalid.alarms.ecsRunningTaskShortfall.periodSeconds = 45;
  assert.throws(() => parseDeploymentConfig(invalid), /multiple of 60/);
});

test("requires a positive running-task shortfall threshold", () => {
  const invalid = validConfig();
  invalid.alarms.ecsRunningTaskShortfall.threshold = 0;
  assert.throws(
    () => parseDeploymentConfig(invalid),
    /at least one missing task/,
  );
});

test("configuration fingerprint is independent of JSON key order", () => {
  const config = validConfig();
  const reversed = Object.fromEntries(Object.entries(config).reverse());
  assert.equal(
    configFingerprint(config),
    configFingerprint(parseDeploymentConfig(reversed)),
  );
});
