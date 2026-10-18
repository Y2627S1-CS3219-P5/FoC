// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommandRequest, CommandRunner } from "../lib/commands.js";
import { configFingerprint } from "../lib/config.js";
import {
  assertDestroyConfirmation,
  destroyEnvironment,
  readEnvironmentStatus,
  startEnvironment,
  stopEnvironment,
  waitForApplicationServices,
} from "../lib/operations.js";
import { validConfig } from "./fixtures.js";
import {
  argumentAfter,
  failure,
  stackResponse,
  success,
} from "./release-tooling-fixtures.js";

function operationRunner(options: {
  readonly calls: CommandRequest[];
  readonly initialRdsState?: "available" | "stopped";
  readonly expectedDesired?: number;
}): CommandRunner {
  const config = validConfig();
  let rdsState = options.initialRdsState ?? "available";
  return (request) => {
    options.calls.push(request);
    const [service, operation] = request.args;
    if (service === "budgets") return failure("NotFoundException");
    if (service === "sts") {
      return success(
        JSON.stringify({
          Account: config.accountId,
          Arn: "arn:aws:sts::caller",
        }),
      );
    }
    if (service === "cloudformation") {
      const stack = argumentAfter(request, "--stack-name") ?? "";
      return stackOutput(config, stack);
    }
    if (service === "rds" && operation === "describe-db-instances") {
      return success(
        JSON.stringify({
          DBInstances: [
            {
              DBInstanceIdentifier: "foc-demo-database",
              DBInstanceStatus: rdsState,
              ...(rdsState === "stopped"
                ? { AutomaticRestartTime: "2026-10-25T10:00:00Z" }
                : {}),
            },
          ],
        }),
      );
    }
    if (service === "rds" && operation === "start-db-instance") {
      rdsState = "available";
      return success();
    }
    if (service === "rds" && operation === "stop-db-instance") {
      rdsState = "stopped";
      return success();
    }
    if (service === "rds" && operation === "wait") return success();
    if (service === "application-autoscaling") return success();
    if (
      service === "ecs" &&
      (operation === "update-service" || operation === "wait")
    ) {
      return success();
    }
    if (service === "ecs" && operation === "describe-services") {
      const desired = options.expectedDesired ?? 1;
      const names = request.args.slice(
        request.args.indexOf("--services") + 1,
        request.args.indexOf("--profile"),
      );
      return success(
        JSON.stringify({
          failures: [],
          services: names.map((serviceName) => ({
            serviceName,
            desiredCount: desired,
            runningCount: desired,
            pendingCount: 0,
            taskDefinition: `arn:task-definition/${serviceName}:3`,
            deployments: [{ status: "PRIMARY", rolloutState: "COMPLETED" }],
          })),
        }),
      );
    }
    if (service === "ecs" && operation === "describe-task-definition") {
      return success(
        JSON.stringify({
          taskDefinition: {
            containerDefinitions: [
              {
                image: `${config.accountId}.dkr.ecr.${config.primaryRegion}.amazonaws.com/image@sha256:${"a".repeat(64)}`,
              },
            ],
          },
        }),
      );
    }
    if (service === "elbv2") {
      return success(
        JSON.stringify({
          TargetHealthDescriptions: [
            { Target: { Id: "10.0.0.1" }, TargetHealth: { State: "healthy" } },
          ],
        }),
      );
    }
    if (service === "cloudwatch") {
      return success(JSON.stringify({ MetricAlarms: [], CompositeAlarms: [] }));
    }
    if (service === "sns") {
      return success(JSON.stringify({ Subscriptions: [] }));
    }
    if (service === "cloudfront") {
      return success(JSON.stringify({ Distribution: { Status: "Deployed" } }));
    }
    if (request.executable === "curl") {
      return success(request.args.at(-1)?.endsWith("whoami") ? "401" : "200");
    }
    return success();
  };
}

test("start is idempotent, starts RDS first, and restores scaling 1..2", () => {
  const calls: CommandRequest[] = [];
  startEnvironment({
    config: validConfig(),
    runner: operationRunner({
      calls,
      initialRdsState: "stopped",
      expectedDesired: 1,
    }),
  });
  const operations = calls.map(
    ({ args }) => `${args[0] ?? ""}:${args[1] ?? ""}`,
  );
  const rdsStart = operations.indexOf("rds:start-db-instance");
  const firstScale = operations.indexOf(
    "application-autoscaling:register-scalable-target",
  );
  assert.ok(rdsStart >= 0 && rdsStart < firstScale);
  const scaleCalls = calls.filter(
    ({ args }) => args[0] === "application-autoscaling",
  );
  assert.equal(scaleCalls.length, 3);
  for (const request of scaleCalls) {
    assert.equal(argumentAfter(request, "--min-capacity"), "1");
    assert.equal(argumentAfter(request, "--max-capacity"), "2");
    assert.match(argumentAfter(request, "--suspended-state") ?? "", /false/);
  }
});

test("stop disables scaling before desired zero and stops RDS last", () => {
  const calls: CommandRequest[] = [];
  const result = stopEnvironment({
    config: validConfig(),
    runner: operationRunner({
      calls,
      initialRdsState: "available",
      expectedDesired: 0,
    }),
  });
  assert.equal(result.automaticRestartTime, "2026-10-25T10:00:00Z");
  const mutations = calls.filter(
    ({ args }) =>
      ["application-autoscaling", "ecs", "rds"].includes(args[0] ?? "") &&
      [
        "register-scalable-target",
        "update-service",
        "stop-db-instance",
      ].includes(args[1] ?? ""),
  );
  assert.equal(mutations.at(-1)?.args[1], "stop-db-instance");
  for (let index = 0; index < 6; index += 2) {
    assert.equal(mutations[index]?.args[0], "application-autoscaling");
    assert.equal(argumentAfter(mutations[index]!, "--min-capacity"), "0");
    assert.match(
      argumentAfter(mutations[index]!, "--suspended-state") ?? "",
      /true/,
    );
    assert.equal(mutations[index + 1]?.args[1], "update-service");
    assert.equal(argumentAfter(mutations[index + 1]!, "--desired-count"), "0");
  }
});

test("first Application rollout verification does not require Edge to exist", () => {
  const calls: CommandRequest[] = [];
  waitForApplicationServices({
    config: validConfig(),
    runner: operationRunner({ calls, expectedDesired: 1 }),
  });
  const describedStacks = calls
    .filter(
      ({ args }) =>
        args[0] === "cloudformation" && args[1] === "describe-stacks",
    )
    .map((request) => argumentAfter(request, "--stack-name"));
  assert.deepEqual(describedStacks, [
    "foc-demo-foundation",
    "foc-demo-application",
  ]);
});

test("status is read-only and reports that stopped is not zero-cost", () => {
  const calls: CommandRequest[] = [];
  const config = validConfig();
  const status = readEnvironmentStatus(
    { config, runner: operationRunner({ calls, initialRdsState: "stopped" }) },
    configFingerprint(config),
  );
  assert.equal(status.database.state, "stopped");
  assert.equal(status.costApproval.approvedBy, "course-team-leader");
  assert.equal(status.costApproval.evidenceKind, "REPOSITORY_PRICING_SNAPSHOT");
  assert.match(status.trackingPortalReminder, /not zero-cost/);
  const mutating = new Set([
    "start-db-instance",
    "stop-db-instance",
    "update-service",
    "register-scalable-target",
    "delete-stack",
  ]);
  assert.equal(
    calls.some(({ args }) => mutating.has(args[1] ?? "")),
    false,
  );
});

test("destroy refuses missing confirmation before any command", () => {
  const calls: CommandRequest[] = [];
  assert.throws(
    () =>
      destroyEnvironment(
        {
          config: validConfig(),
          runner: (request) => {
            calls.push(request);
            return success();
          },
        },
        false,
        undefined,
      ),
    /allow-data-loss/,
  );
  assert.deepEqual(calls, []);
  assert.throws(
    () => assertDestroyConfirmation(validConfig(), true, "wrong"),
    /foc-demo:DESTROY:656253649128/,
  );
});

test("destroy deletes only the four exact stacks in reverse dependency order", () => {
  const calls: CommandRequest[] = [];
  const config = validConfig();
  const deleted = new Set<string>();
  const runner: CommandRunner = (request) => {
    calls.push(request);
    const [service, operation] = request.args;
    if (service === "sts") {
      return success(
        JSON.stringify({ Account: config.accountId, Arn: "arn:caller" }),
      );
    }
    if (service === "cloudformation" && operation === "delete-stack") {
      deleted.add(argumentAfter(request, "--stack-name") ?? "");
      return success();
    }
    if (service === "cloudformation" && operation === "wait") return success();
    if (service === "cloudformation" && operation === "describe-stacks") {
      const stack = argumentAfter(request, "--stack-name") ?? "";
      return deleted.has(stack)
        ? failure("ValidationError: does not exist")
        : stackOutput(config, stack);
    }
    if (service === "ecs" && operation === "describe-clusters") {
      return success(JSON.stringify({ clusters: [{ status: "INACTIVE" }] }));
    }
    if (service === "logs") return success(JSON.stringify({ logGroups: [] }));
    if (service === "budgets") return failure("NotFoundException");
    if (service === "resourcegroupstaggingapi") {
      return success(JSON.stringify({ ResourceTagMappingList: [] }));
    }
    if (service === "ecr") return failure("RepositoryNotFoundException");
    if (service === "rds") return failure("DBInstanceNotFoundFault");
    if (service === "cloudfront") return failure("NoSuchDistribution");
    throw new Error(`Unexpected command: ${request.args.join(" ")}`);
  };
  const residuals = destroyEnvironment(
    { config, runner },
    true,
    `foc-demo:DESTROY:${config.accountId}`,
  );
  assert.deepEqual(residuals, []);
  assert.ok(
    calls.some(
      ({ args }) =>
        argumentAfter(
          { executable: "aws", args },
          "--log-group-name-prefix",
        ) === "/aws/ecs/containerinsights/foc-demo-cluster/performance",
    ),
  );
  const order = calls
    .filter(
      ({ args }) => args[0] === "cloudformation" && args[1] === "delete-stack",
    )
    .map((request) => argumentAfter(request, "--stack-name"));
  assert.deepEqual(order, [
    "foc-demo-edge",
    "foc-demo-application",
    "foc-demo-data",
    "foc-demo-foundation",
  ]);
});

test("destroy fails closed when a residual check is unauthorized", () => {
  const calls: CommandRequest[] = [];
  const config = validConfig();
  const baseRunner = operationRunner({ calls });
  const runner: CommandRunner = (request) => {
    if (
      request.args[0] === "cloudformation" &&
      request.args[1] === "delete-stack"
    ) {
      calls.push(request);
      return success();
    }
    if (request.args[0] === "cloudformation" && request.args[1] === "wait") {
      calls.push(request);
      return success();
    }
    if (
      request.args[0] === "cloudformation" &&
      request.args[1] === "describe-stacks" &&
      calls.some(
        ({ args }) =>
          args[0] === "cloudformation" && args[1] === "delete-stack",
      )
    )
      return failure("AccessDenied: cloudformation:DescribeStacks");
    return baseRunner(request);
  };

  assert.throws(
    () =>
      destroyEnvironment(
        { config, runner },
        true,
        `foc-demo:DESTROY:${config.accountId}`,
      ),
    /Residual inspection failed: AccessDenied/,
  );
});

function stackOutput(config: ReturnType<typeof validConfig>, name: string) {
  if (name === "foc-demo-foundation") {
    return stackResponse(config, name, { ClusterName: "foc-demo-cluster" });
  }
  if (name === "foc-demo-data") {
    return stackResponse(config, name, {
      DatabaseInstanceIdentifier: "foc-demo-database",
    });
  }
  if (name === "foc-demo-application") {
    return stackResponse(config, name, {
      FrontendServiceName: "foc-demo-frontend",
      UserServiceServiceName: "foc-demo-user-service",
      SupplierServiceServiceName: "foc-demo-supplier-service",
      FrontendTargetGroupArn: "arn:target-group",
      AlertTopicArn: "arn:topic",
      FrontendLogGroupName: "/foc/demo/services/frontend",
      UserServiceLogGroupName: "/foc/demo/services/user-service",
      SupplierServiceLogGroupName: "/foc/demo/services/supplier-service",
    });
  }
  return stackResponse(config, "foc-demo-edge", {
    DistributionDomainName: "example.cloudfront.net",
    DistributionId: "EDIST",
  });
}
