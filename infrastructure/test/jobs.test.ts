import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommandRequest, CommandRunner } from "../lib/commands.js";
import { JOBS } from "../lib/deployment-names.js";
import { runReleaseJobs } from "../lib/jobs.js";
import { validConfig, validReleaseManifest } from "./fixtures.js";
import {
  argumentAfter,
  stackResponse,
  success,
} from "./release-tooling-fixtures.js";

function jobRunner(options: {
  readonly calls: CommandRequest[];
  readonly failJob?: string;
}): CommandRunner {
  const config = validConfig();
  const manifest = validReleaseManifest();
  return (request) => {
    options.calls.push(request);
    const [service, operation] = request.args;
    if (service === "sts") {
      return success(
        JSON.stringify({
          Account: config.accountId,
          Arn: "arn:aws:sts::caller",
        }),
      );
    }
    if (service === "cloudformation") {
      const stackName = argumentAfter(request, "--stack-name");
      if (stackName === "foc-demo-foundation") {
        return stackResponse(config, stackName, {
          ClusterName: "foc-demo-cluster",
          PublicTaskSubnetIds: "subnet-a,subnet-b",
        });
      }
      const outputs: Record<string, string> = {
        DeploymentJobSecurityGroupId: "sg-jobs",
      };
      for (const job of JOBS) {
        outputs[job.taskOutput] =
          `arn:aws:ecs:ap-southeast-1:${config.accountId}:task-definition/foc-demo-${job.key}:7`;
        outputs[job.containerOutput] = `${pascal(job.key)}Container`;
        outputs[`${pascal(job.key)}LogGroupName`] = `/foc/demo/jobs/${job.key}`;
      }
      return stackResponse(config, "foc-demo-data", outputs);
    }
    if (service === "ecs" && operation === "describe-task-definition") {
      const task = argumentAfter(request, "--task-definition") ?? "";
      const job = JOBS.find(({ key }) => task.includes(key));
      assert.ok(job);
      const image =
        job.image === "bootstrap"
          ? "asset-bootstrap@sha256:dddd"
          : manifest.images[job.image].digestUri;
      return success(
        JSON.stringify({
          taskDefinition: {
            taskDefinitionArn: task,
            containerDefinitions: [
              { name: `${pascal(job.key)}Container`, image, essential: true },
            ],
          },
        }),
      );
    }
    if (service === "ecs" && operation === "run-task") {
      const taskDefinition = argumentAfter(request, "--task-definition") ?? "";
      const job = JOBS.find(({ key }) => taskDefinition.includes(key));
      assert.ok(job);
      return success(
        JSON.stringify({
          tasks: [{ taskArn: `arn:aws:ecs:task/${job.key}` }],
          failures: [],
        }),
      );
    }
    if (service === "ecs" && operation === "wait") return success();
    if (service === "ecs" && operation === "describe-tasks") {
      const taskArn = argumentAfter(request, "--tasks");
      const job = JOBS.find(({ key }) => taskArn?.includes(key));
      assert.ok(job);
      const exitCode = options.failJob === job.key ? 1 : 0;
      return success(
        JSON.stringify({
          tasks: [
            {
              taskArn: `arn:aws:ecs:task/${job.key}`,
              taskDefinitionArn: `arn:aws:ecs:ap-southeast-1:${config.accountId}:task-definition/foc-demo-${job.key}:7`,
              stoppedReason:
                exitCode === 0 ? "Essential container exited" : "Job failed",
              containers: [
                {
                  name: `${pascal(job.key)}Container`,
                  exitCode,
                  ...(exitCode === 0 ? {} : { reason: "migration failed" }),
                },
              ],
            },
          ],
          failures: [],
        }),
      );
    }
    return success();
  };
}

test("runs bootstrap, migrations, and seed in strict order", () => {
  const calls: CommandRequest[] = [];
  const evidence = runReleaseJobs({
    config: validConfig(),
    manifest: validReleaseManifest(),
    runner: jobRunner({ calls }),
    now: new Date("2026-10-18T10:00:00Z"),
  });
  assert.deepEqual(
    evidence.jobs.map(({ job }) => job),
    JOBS.map(({ key }) => key),
  );
  const runOrder = calls
    .filter(({ args }) => args[0] === "ecs" && args[1] === "run-task")
    .map((request) => argumentAfter(request, "--task-definition"));
  assert.deepEqual(
    runOrder,
    JOBS.map(
      ({ key }) =>
        `arn:aws:ecs:ap-southeast-1:${validConfig().accountId}:task-definition/foc-demo-${key}:7`,
    ),
  );
});

test("halts before the next job when a container exits nonzero", () => {
  const calls: CommandRequest[] = [];
  assert.throws(
    () =>
      runReleaseJobs({
        config: validConfig(),
        manifest: validReleaseManifest(),
        runner: jobRunner({ calls, failJob: "user-migration" }),
      }),
    /user-migration failed/,
  );
  const runCalls = calls.filter(
    ({ args }) => args[0] === "ecs" && args[1] === "run-task",
  );
  assert.equal(runCalls.length, 2);
  assert.equal(
    runCalls.some(({ args }) =>
      args.some((arg) => arg.includes("supplier-migration")),
    ),
    false,
  );
});

function pascal(value: string): string {
  return value
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
}
