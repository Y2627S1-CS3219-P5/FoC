// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommandRequest, CommandRunner } from "../lib/commands.js";
import { runCloudSmoke } from "../lib/smoke.js";
import { validConfig } from "./fixtures.js";
import {
  argumentAfter,
  stackResponse,
  success,
} from "./release-tooling-fixtures.js";

test("reuses API and browser journeys through the gateway without probing private health", () => {
  const config = validConfig();
  const calls: CommandRequest[] = [];
  const runner: CommandRunner = (request) => {
    calls.push(request);
    const [service] = request.args;
    if (service === "sts") {
      return success(
        JSON.stringify({ Account: config.accountId, Arn: "arn:caller" }),
      );
    }
    if (service === "cloudformation") {
      const stack = argumentAfter(request, "--stack-name") ?? "";
      if (stack === "foc-demo-data") {
        return stackResponse(config, stack, {
          BootstrapAdministratorSecretArn: "arn:bootstrap-secret",
        });
      }
      if (stack === "foc-demo-edge") {
        return stackResponse(config, stack, {
          DistributionDomainName: "example.cloudfront.net",
        });
      }
      return stackResponse(config, stack, {});
    }
    if (service === "secretsmanager") {
      return success(JSON.stringify({ SecretString: "SecretAdminPassword1" }));
    }
    if (request.executable === "curl") {
      const url = request.args.at(-1) ?? "";
      return success(url === "https://example.cloudfront.net/" ? "200" : "404");
    }
    return success();
  };
  const evidence = runCloudSmoke({
    config,
    runner,
    repositoryRoot: "/repo",
  });
  assert.equal(evidence.apiJourneys, "PASS");
  assert.equal(evidence.browserJourneys, "PASS");
  const api = calls.find(({ executable }) => executable === "bash");
  const browser = calls.find(
    ({ executable, args }) =>
      executable === "npm" && args.includes("test:e2e:browser"),
  );
  assert.equal(
    api?.env?.API_GATEWAY_BASE_URL,
    "https://example.cloudfront.net",
  );
  assert.equal(
    browser?.env?.SUPPLIER_UI_BASE_URL,
    "https://example.cloudfront.net",
  );
  assert.equal(api?.env?.API_ADMIN_PASSWORD, "SecretAdminPassword1");
  assert.equal(
    calls.some(
      ({ args }) =>
        args.includes("SecretAdminPassword1") ||
        args.some((arg) => arg.includes("Authorization: Bearer")),
    ),
    false,
  );
  const publicChecks = calls
    .filter(({ executable }) => executable === "curl")
    .map(({ args }) => args.at(-1));
  assert.ok(publicChecks.includes("https://example.cloudfront.net/health"));
  assert.ok(publicChecks.includes("https://example.cloudfront.net/api/docs"));
  for (const path of [
    "/%61uth/verify",
    "/api/%64ocs",
    "/api/v1/%65rrands",
    "/api/v1/unused/../credits",
  ]) {
    assert.equal(evidence.forbiddenRoutes[path], 404);
  }
  assert.ok(
    calls
      .filter(({ executable }) => executable === "curl")
      .every(({ args }) => args.includes("--path-as-is")),
  );
});
