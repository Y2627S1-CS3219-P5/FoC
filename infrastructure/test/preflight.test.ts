import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommandResult, CommandRunner } from "../lib/preflight.js";
import { runPreflight } from "../lib/preflight.js";
import { validConfig } from "./fixtures.js";

interface FakeOptions {
  readonly accountId?: string;
  readonly bootstrapExists?: boolean;
  readonly quotasReadable?: boolean;
  readonly denyService?: string;
}

function success(stdout = "{}"): CommandResult {
  return { status: 0, stdout, stderr: "" };
}

function failure(message: string): CommandResult {
  return { status: 254, stdout: "", stderr: message };
}

function fakeRunner(
  options: FakeOptions = {},
  calls: string[][] = [],
): CommandRunner {
  return (executable, args) => {
    calls.push([executable, ...args]);
    if (executable === "aws" && args[0] === "--version") {
      return success("aws-cli/2.38.1");
    }
    if (args[0] === "configure") {
      return success("ap-southeast-1\n");
    }
    const operation = `${args[0] ?? ""}:${args[1] ?? ""}`;
    if (options.denyService === operation) {
      return failure(`AccessDenied: ${operation}`);
    }
    if (operation === "sts:get-caller-identity") {
      const account = options.accountId ?? "656253649128";
      return success(
        JSON.stringify({
          Account: account,
          Arn: `arn:aws:sts::${account}:assumed-role/NusRole/tester@u.nus.edu`,
        }),
      );
    }
    if (operation === "rds:describe-db-engine-versions") {
      return success(JSON.stringify({ DBEngineVersions: [{}] }));
    }
    if (operation === "rds:describe-orderable-db-instance-options") {
      return success(
        JSON.stringify({
          OrderableDBInstanceOptions: [{ StorageType: "gp3" }],
        }),
      );
    }
    if (operation === "ecs:describe-capacity-providers") {
      return success(
        JSON.stringify({
          capacityProviders: [
            { name: "FARGATE", status: "ACTIVE" },
            { name: "FARGATE_SPOT", status: "ACTIVE" },
          ],
        }),
      );
    }
    if (operation === "ec2:describe-managed-prefix-lists") {
      return success(JSON.stringify({ PrefixLists: [{}] }));
    }
    if (operation === "wafv2:list-available-managed-rule-groups") {
      return success(
        JSON.stringify({
          ManagedRuleGroups: [
            { VendorName: "AWS", Name: "AWSManagedRulesCommonRuleSet" },
          ],
        }),
      );
    }
    if (
      operation === "service-quotas:list-services" ||
      operation === "service-quotas:get-service-quota"
    ) {
      return options.quotasReadable === false
        ? failure("AccessDeniedException: explicit deny in Organizations SCP")
        : success(JSON.stringify({ Quota: { Value: 6 } }));
    }
    if (operation === "cloudformation:describe-stacks") {
      return options.bootstrapExists === false
        ? failure("ValidationError: Stack with id CDKToolkit does not exist")
        : success(
            JSON.stringify({ Stacks: [{ StackStatus: "CREATE_COMPLETE" }] }),
          );
    }
    if (operation === "ssm:get-parameter") {
      return options.bootstrapExists === false
        ? failure("ParameterNotFound")
        : success(JSON.stringify({ Parameter: { Value: "27" } }));
    }
    if (operation === "iam:simulate-principal-policy") {
      return success(
        JSON.stringify({
          EvaluationResults: Array.from({ length: 14 }, () => ({
            EvalDecision: "allowed",
          })),
        }),
      );
    }
    return success();
  };
}

test("passes when all required read-only capabilities and bootstrap stacks are present", () => {
  const calls: string[][] = [];
  const report = runPreflight(
    validConfig(),
    fakeRunner({}, calls),
    new Date("2026-10-18T08:00:00.000Z"),
  );
  assert.equal(report.status, "PASS");
  assert.equal(report.validUntil, "2026-10-19T08:00:00.000Z");
  assert.ok(report.checks.length >= 20);
  assert.equal(
    calls.some((call) => call.includes("create-stack")),
    false,
    "preflight must not execute mutating AWS operations",
  );
});

test("blocks a caller authenticated to the wrong AWS account", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({ accountId: "111122223333" }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.equal(
    report.checks.find(({ id }) => id === "caller-identity")?.status,
    "BLOCKED",
  );
});

test("blocks an explicit school SCP denial of Service Quotas", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({ quotasReadable: false }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.match(
    report.checks.find(({ id }) => id === "service-quotas")?.detail ?? "",
    /Organizations SCP/,
  );
});

test("blocks missing CDK bootstrap in either required region", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({ bootstrapExists: false }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.equal(
    report.checks.filter(
      ({ id, status }) =>
        id.startsWith("cdk-bootstrap-") && status === "BLOCKED",
    ).length,
    2,
  );
});

test("blocks a required service read denial", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({ denyService: "secretsmanager:list-secrets" }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.equal(
    report.checks.find(({ id }) => id === "secrets-manager-read")?.status,
    "BLOCKED",
  );
});
