import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import type { CommandRequest, CommandRunner } from "../lib/commands.js";
import {
  calculateDeploymentPlan,
  deployExactStack,
  verifyApprovedPlan,
  type PlanOptions,
} from "../lib/deployment-plan.js";
import { applyApprovedDeployment } from "../lib/deploy.js";
import { validConfig, validReleaseManifest } from "./fixtures.js";
import { success } from "./release-tooling-fixtures.js";

function withPlanFiles(
  check: (options: PlanOptions, calls: CommandRequest[]) => void,
): void {
  const root = mkdtempSync(resolve(tmpdir(), "foc-plan-"));
  try {
    const infrastructureRoot = resolve(root, "infrastructure");
    mkdirSync(resolve(infrastructureRoot, "cdk.out"), { recursive: true });
    for (const id of ["FoCDemoData", "FoCDemoApplication", "FoCDemoEdge"]) {
      writeFileSync(
        resolve(infrastructureRoot, "cdk.out", `${id}.template.json`),
        `{"id":"${id}"}`,
      );
    }
    const calls: CommandRequest[] = [];
    const runner: CommandRunner = (request) => {
      calls.push(request);
      if (request.executable === "git") {
        return success(`${validReleaseManifest().sourceRevision}\n`);
      }
      if (request.executable === "npx" && request.args[1] === "diff") {
        return success("Stack diff\n+ resource\n");
      }
      if (request.executable === "aws" && request.args[0] === "sts") {
        return success(
          JSON.stringify({
            Account: validConfig().accountId,
            Arn: "arn:aws:sts::caller",
          }),
        );
      }
      return success();
    };
    check(
      {
        config: validConfig(),
        phase: "release",
        runner,
        repositoryRoot: root,
        infrastructureRoot,
        releaseManifest: validReleaseManifest(),
        releaseManifestPath: resolve(root, "release.json"),
      },
      calls,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("hashes the exact config, manifest, templates, stacks, and diff", () => {
  withPlanFiles((options) => {
    const first = calculateDeploymentPlan(options);
    const second = calculateDeploymentPlan(options);
    assert.equal(first.approvalToken, second.approvalToken);
    assert.match(first.approvalToken, /^[0-9a-f]{64}$/);
    assert.deepEqual(
      first.plan.stacks.map(({ name }) => name),
      ["foc-demo-data", "foc-demo-application", "foc-demo-edge"],
    );
  });
});

test("rejects an approval token when the recalculated diff changed", () => {
  withPlanFiles((options) => {
    const first = calculateDeploymentPlan(options);
    let diffCount = 0;
    const changedRunner: CommandRunner = (request) => {
      if (request.executable === "git") {
        return success(`${validReleaseManifest().sourceRevision}\n`);
      }
      if (request.executable === "npx" && request.args[1] === "diff") {
        diffCount += 1;
        return success(`changed diff ${diffCount}`);
      }
      return success();
    };
    assert.throws(
      () =>
        verifyApprovedPlan(
          { ...options, runner: changedRunner },
          first.approvalToken,
        ),
      /Deployment plan changed/,
    );
  });
});

test("deploy command accepts only a stack in the allowlisted phase", () => {
  withPlanFiles((options, calls) => {
    deployExactStack(options, "data");
    assert.throws(() => deployExactStack(options, "foundation"), /not part/);
    const deploy = calls.find(
      ({ executable, args }) => executable === "npx" && args[1] === "deploy",
    );
    assert.deepEqual(deploy?.args.slice(0, 4), [
      "cdk",
      "deploy",
      "FoCDemoData",
      "--exclusively",
    ]);
  });
});

test("never deploys Application when an ordered database job fails", () => {
  withPlanFiles((options, calls) => {
    const plan = calculateDeploymentPlan(options);
    assert.throws(
      () =>
        applyApprovedDeployment({
          ...options,
          approvalToken: plan.approvalToken,
          runJobs: () => {
            throw new Error("migration failed");
          },
        }),
      /migration failed/,
    );
    const deployed = calls
      .filter(
        ({ executable, args }) => executable === "npx" && args[1] === "deploy",
      )
      .map(({ args }) => args[2]);
    assert.deepEqual(deployed, ["FoCDemoData"]);
  });
});
