// Contributor: @ron (AI-assisted).
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: Partial deployment, interrupted teardown, receipt ownership and replacement guards.
// Author review: PENDING.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import type { CommandRequest, CommandRunner } from "../lib/commands.js";
import { destroyEnvironment } from "../lib/destroy-environment.js";
import {
  readDestroyReceipt,
  sealDestroyReceipt,
  type DestroyReceipt,
} from "../lib/destroy-receipt.js";
import { STACKS, type StackKey } from "../lib/deployment-names.js";
import { writeOwnerOnlyJson } from "../lib/private-json.js";
import { validConfig } from "./fixtures.js";
import {
  argumentAfter,
  failure,
  stackResponse,
  success,
} from "./release-tooling-fixtures.js";

function fixture(
  present: readonly StackKey[] = ["foundation", "data", "application", "edge"],
) {
  const config = validConfig();
  const calls: CommandRequest[] = [];
  const arns = new Map(
    present.map((key) => [
      key,
      `arn:aws:cloudformation:${STACKS[key].region === "primary" ? config.primaryRegion : config.edgeRegion}:${config.accountId}:stack/${STACKS[key].name}/exact-stack-id`,
    ]),
  );
  let interrupt: StackKey | undefined;
  let denied: StackKey | undefined;
  let unresolved = false;
  let waitInterrupt: StackKey | undefined;
  const deleting = new Set<StackKey>();
  const defaultGroup = "/aws/lambda/foc-demo-foundation-handler";
  let providerGroupExists = present.includes("foundation");
  const runner: CommandRunner = (request) => {
    calls.push(request);
    const [service, operation] = request.args;
    const rawName = argumentAfter(request, "--stack-name") ?? "";
    const name = rawName.startsWith("arn:") ? rawName.split("/")[1] : rawName;
    const key = (Object.keys(STACKS) as StackKey[]).find(
      (candidate) => STACKS[candidate].name === name,
    );
    if (service === "sts")
      return success(
        JSON.stringify({ Account: config.accountId, Arn: "arn:caller" }),
      );
    if (
      service === "cloudformation" &&
      operation === "describe-stacks" &&
      key !== undefined
    ) {
      if (denied === key)
        return failure("AccessDeniedException: DescribeStacks");
      const arn = arns.get(key);
      if (arn === undefined)
        return failure("ValidationError: Stack does not exist");
      const result = JSON.parse(
        stackResponse(
          config,
          name!,
          {},
          deleting.has(key) ? "DELETE_IN_PROGRESS" : "CREATE_COMPLETE",
        ).stdout,
      ) as {
        Stacks: { StackId: string }[];
      };
      result.Stacks[0]!.StackId = arn;
      return success(JSON.stringify(result));
    }
    if (
      service === "cloudformation" &&
      operation === "list-stack-resources" &&
      key !== undefined
    ) {
      const resources =
        key === "foundation"
          ? [
              {
                ResourceType: "AWS::Lambda::Function",
                PhysicalResourceId: "foc-demo-foundation-handler",
              },
              {
                ResourceType: "AWS::Logs::LogGroup",
                PhysicalResourceId:
                  "/aws/ecs/containerinsights/foc-demo-cluster/performance",
              },
              {
                ResourceType: "AWS::ECR::Repository",
                PhysicalResourceId: "foc-demo-frontend",
              },
              {
                ResourceType: "AWS::ECS::Cluster",
                PhysicalResourceId: "foc-demo-cluster",
              },
            ]
          : key === "data"
            ? [
                unresolved
                  ? {
                      ResourceType: "AWS::RDS::DBInstance",
                      LogicalResourceId: "Database",
                      ResourceStatus: "CREATE_IN_PROGRESS",
                    }
                  : {
                      ResourceType: "AWS::RDS::DBInstance",
                      PhysicalResourceId: "foc-demo-database",
                    },
              ]
            : key === "edge"
              ? [
                  {
                    ResourceType: "AWS::CloudFront::Distribution",
                    PhysicalResourceId: "EDIST",
                  },
                ]
              : [];
      return success(JSON.stringify({ StackResourceSummaries: resources }));
    }
    if (
      service === "cloudformation" &&
      operation === "delete-stack" &&
      key !== undefined
    ) {
      assert.equal(
        rawName,
        arns.get(key),
        "mutation must target the captured immutable stack ARN",
      );
      if (interrupt === key)
        return failure("ThrottlingException: simulated interruption");
      if (waitInterrupt === key) deleting.add(key);
      else arns.delete(key);
      return success();
    }
    if (
      service === "cloudformation" &&
      operation === "wait" &&
      key !== undefined
    ) {
      if (waitInterrupt === key)
        return failure("Waiter timed out: simulated interruption");
      if (deleting.has(key)) {
        arns.delete(key);
        deleting.delete(key);
      }
      return success();
    }
    if (service === "lambda")
      return arns.has("foundation")
        ? success(
            JSON.stringify({
              FunctionName: "foc-demo-foundation-handler",
              FunctionArn: `arn:aws:lambda:${config.primaryRegion}:${config.accountId}:function:foc-demo-foundation-handler`,
              LoggingConfig: { LogGroup: defaultGroup },
            }),
          )
        : failure("ResourceNotFoundException: Function not found");
    if (service === "logs" && operation === "delete-log-group") {
      assert.equal(argumentAfter(request, "--log-group-name"), defaultGroup);
      providerGroupExists = false;
      return success();
    }
    if (service === "logs")
      return success(
        JSON.stringify({
          logGroups:
            providerGroupExists &&
            argumentAfter(request, "--log-group-name-prefix") === defaultGroup
              ? [{ logGroupName: defaultGroup }]
              : [],
        }),
      );
    if (service === "ecs")
      return success(
        JSON.stringify({ clusters: [], failures: [{ reason: "MISSING" }] }),
      );
    if (service === "ecr") return failure("RepositoryNotFoundException");
    if (service === "rds") return failure("DBInstanceNotFoundFault");
    if (service === "cloudfront") return failure("NoSuchDistribution");
    if (service === "budgets") return failure("NotFoundException");
    if (service === "resourcegroupstaggingapi")
      return success(JSON.stringify({ ResourceTagMappingList: [] }));
    throw new Error(`Unexpected teardown command ${service}:${operation}`);
  };
  return {
    config,
    calls,
    runner,
    arns,
    recordDestroyReceipt: () => undefined,
    interruptWait: (key?: StackKey) => {
      waitInterrupt = key;
    },
    setInterrupt: (key?: StackKey) => {
      interrupt = key;
    },
    deny: (key: StackKey) => {
      denied = key;
    },
    makeUnresolved: () => {
      unresolved = true;
    },
  };
}

function captureOnly(environment: ReturnType<typeof fixture>): DestroyReceipt {
  let receipt: DestroyReceipt | undefined;
  assert.throws(
    () =>
      destroyEnvironment(
        {
          ...environment,
          recordDestroyReceipt: (value) => {
            receipt = value;
            throw new Error("captured before mutation");
          },
        },
        true,
        `foc-demo:DESTROY:${environment.config.accountId}`,
      ),
    /captured before mutation/,
  );
  assert.ok(receipt);
  assert.equal(
    environment.calls.some(({ args }) => args[1] === "delete-stack"),
    false,
  );
  return receipt;
}

test("destroys an initial Foundation-only deployment using exact resources without any service outputs", () => {
  const environment = fixture(["foundation"]);
  let saved: DestroyReceipt | undefined;
  assert.deepEqual(
    destroyEnvironment(
      {
        ...environment,
        recordDestroyReceipt: (receipt) => {
          saved = receipt;
          assert.equal(
            environment.calls.some(({ args }) => args[1] === "delete-stack"),
            false,
          );
        },
      },
      true,
      `foc-demo:DESTROY:${environment.config.accountId}`,
    ),
    [],
  );
  assert.ok(saved);
  assert.deepEqual(
    destroyEnvironment(
      { ...environment, resumeReceipt: saved },
      true,
      `foc-demo:DESTROY:${environment.config.accountId}`,
    ),
    [],
  );
  assert.equal(saved.stacks.edge.arn, null);
  assert.equal(
    environment.calls.filter(({ args }) => args[1] === "delete-stack").length,
    1,
  );
});

test("resumes a stack already in DELETE_IN_PROGRESS without issuing another delete", () => {
  const environment = fixture();
  environment.interruptWait("edge");
  let saved: DestroyReceipt | undefined;
  assert.throws(
    () =>
      destroyEnvironment(
        {
          ...environment,
          recordDestroyReceipt: (receipt) => {
            saved = receipt;
          },
        },
        true,
        `foc-demo:DESTROY:${environment.config.accountId}`,
      ),
    /Waiter timed out/,
  );
  assert.ok(saved);
  environment.interruptWait();
  assert.deepEqual(
    destroyEnvironment(
      { ...environment, resumeReceipt: saved },
      true,
      `foc-demo:DESTROY:${environment.config.accountId}`,
    ),
    [],
  );
  assert.equal(
    environment.calls.filter(
      (request) =>
        request.args[1] === "delete-stack" &&
        argumentAfter(request, "--stack-name") === saved!.stacks.edge.arn,
    ).length,
    1,
  );
});

test("resumes an interrupted teardown from its original receipt and skips already absent stacks", () => {
  const environment = fixture();
  environment.setInterrupt("application");
  let saved: DestroyReceipt | undefined;
  assert.throws(
    () =>
      destroyEnvironment(
        {
          ...environment,
          recordDestroyReceipt: (receipt) => {
            saved = receipt;
          },
        },
        true,
        `foc-demo:DESTROY:${environment.config.accountId}`,
      ),
    /simulated interruption/,
  );
  assert.ok(saved);
  assert.equal(environment.arns.has("edge"), false);
  environment.setInterrupt();
  assert.deepEqual(
    destroyEnvironment(
      { ...environment, resumeReceipt: saved },
      true,
      `foc-demo:DESTROY:${environment.config.accountId}`,
    ),
    [],
  );
  assert.equal(
    environment.calls.filter(
      (request) =>
        request.args[1] === "delete-stack" &&
        argumentAfter(request, "--stack-name") === saved!.stacks.edge.arn,
    ).length,
    1,
  );
});

test("rejects modified, wrong-account and recreated same-name stack receipts before any mutation", () => {
  const environment = fixture();
  const saved = captureOnly(environment);
  const { inventorySha256, ...unsigned } = saved;
  for (const receipt of [
    { ...saved, owner: "modified", inventorySha256 },
    sealDestroyReceipt({ ...unsigned, accountId: "111122223333" }),
  ]) {
    assert.throws(
      () =>
        destroyEnvironment(
          { ...environment, resumeReceipt: receipt },
          true,
          `foc-demo:DESTROY:${environment.config.accountId}`,
        ),
      /integrity mismatch|different account/,
    );
  }
  environment.arns.set(
    "foundation",
    saved.stacks.foundation.arn!.replace(
      "exact-stack-id",
      "replacement-stack-id",
    ),
  );
  assert.throws(
    () =>
      destroyEnvironment(
        { ...environment, resumeReceipt: saved },
        true,
        `foc-demo:DESTROY:${environment.config.accountId}`,
      ),
    /created\/recreated/,
  );
  assert.equal(
    environment.calls.some(({ args }) => args[1] === "delete-stack"),
    false,
  );
});

test("refuses newly created stacks that were absent in the captured partial deployment", () => {
  const environment = fixture(["foundation"]);
  const saved = captureOnly(environment);
  environment.arns.set(
    "edge",
    `arn:aws:cloudformation:${environment.config.edgeRegion}:${environment.config.accountId}:stack/foc-demo-edge/new-stack-id`,
  );
  assert.throws(
    () =>
      destroyEnvironment(
        { ...environment, resumeReceipt: saved },
        true,
        `foc-demo:DESTROY:${environment.config.accountId}`,
      ),
    /created\/recreated/,
  );
  assert.equal(
    environment.calls.some(({ args }) => args[1] === "delete-stack"),
    false,
  );
});

test("never treats unauthorized stack reads as absence or guesses unresolved partial resource identities", () => {
  const denied = fixture(["foundation"]);
  denied.deny("edge");
  assert.throws(
    () =>
      destroyEnvironment(
        denied,
        true,
        `foc-demo:DESTROY:${denied.config.accountId}`,
      ),
    /AccessDenied/,
  );
  assert.equal(
    denied.calls.some(({ args }) => args[1] === "delete-stack"),
    false,
  );
  const unresolved = fixture();
  unresolved.makeUnresolved();
  assert.throws(
    () =>
      destroyEnvironment(
        unresolved,
        true,
        `foc-demo:DESTROY:${unresolved.config.accountId}`,
      ),
    /Cannot resolve AWS::RDS::DBInstance target Database.*CREATE_IN_PROGRESS/,
  );
  assert.equal(
    unresolved.calls.some(({ args }) => args[1] === "delete-stack"),
    false,
  );
});

test("requires durable receipt persistence and rejects changed current ownership tags before deletion", () => {
  const environment = fixture();
  assert.throws(
    () =>
      destroyEnvironment(
        { config: environment.config, runner: environment.runner },
        true,
        `foc-demo:DESTROY:${environment.config.accountId}`,
      ),
    /trusted atomic owner-only receipt writer/,
  );
  assert.equal(environment.calls.length, 0);
  const receipt = captureOnly(environment);
  const runner: CommandRunner = (request) => {
    const result = environment.runner(request);
    if (
      request.args[0] === "cloudformation" &&
      request.args[1] === "describe-stacks" &&
      result.status === 0
    ) {
      const parsed = JSON.parse(result.stdout) as {
        Stacks: { Tags: { Key: string; Value: string }[] }[];
      };
      parsed.Stacks[0]!.Tags.find(({ Key }) => Key === "Owner")!.Value =
        "another-owner";
      return success(JSON.stringify(parsed));
    }
    return result;
  };
  assert.throws(
    () =>
      destroyEnvironment(
        { ...environment, runner, resumeReceipt: receipt },
        true,
        `foc-demo:DESTROY:${environment.config.accountId}`,
      ),
    /tag Owner/,
  );
  assert.equal(
    environment.calls.some(({ args }) => args[1] === "delete-stack"),
    false,
  );
});

test("loads only a regular owner-only atomic receipt and rejects shared permissions or symlinks", () => {
  const environment = fixture(["foundation"]);
  const receipt = captureOnly(environment);
  const directory = mkdtempSync(resolve(tmpdir(), "foc-destroy-receipt-"));
  const path = resolve(directory, "receipt.json");
  try {
    writeOwnerOnlyJson(path, receipt);
    assert.deepEqual(readDestroyReceipt(path, environment.config), receipt);
    chmodSync(path, 0o644);
    assert.throws(
      () => readDestroyReceipt(path, environment.config),
      /owner-only/,
    );
    chmodSync(path, 0o600);
    const link = resolve(directory, "symlink.json");
    symlinkSync(path, link);
    assert.throws(
      () => readDestroyReceipt(link, environment.config),
      /regular owner-only/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
