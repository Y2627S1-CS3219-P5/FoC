// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import type { CommandRequest, CommandRunner } from "../lib/commands.js";
import { configFingerprint } from "../lib/config.js";
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
    mkdirSync(resolve(infrastructureRoot, "artifacts"), { recursive: true });
    for (const id of ["FoCDemoData", "FoCDemoApplication", "FoCDemoEdge"]) {
      writeFileSync(
        resolve(infrastructureRoot, "cdk.out", `${id}.template.json`),
        `{"id":"${id}"}`,
      );
    }
    const calls: CommandRequest[] = [];
    const config = validConfig();
    writeFileSync(
      resolve(infrastructureRoot, "artifacts/cost-estimate.json"),
      JSON.stringify({
        schemaVersion: 2,
        configFingerprint: configFingerprint(config),
        pricingSnapshotSha256: "f".repeat(64),
        pricingCapturedAt: "2026-10-18",
        currency: "USD",
        lineItems: [],
        totalMonthlyUsd: "105.547300000",
        approvedMonthlyBudgetUsd: "110.000000000",
        withinApprovedBudget: true,
        approval: config.costApproval,
      }),
    );
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
        config,
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
    assert.equal(first.plan.costEvidence.pricingSnapshotSha256, "f".repeat(64));
    assert.deepEqual(
      first.plan.stacks.map(({ name }) => name),
      ["foc-demo-data", "foc-demo-application", "foc-demo-edge"],
    );
  });
});

test("diff disables change sets using the pinned CDK CLI's supported flag", () => {
  withPlanFiles((options, calls) => {
    calculateDeploymentPlan(options);
    const diffs = calls.filter(
      ({ executable, args }) => executable === "npx" && args[1] === "diff",
    );
    assert.equal(diffs.length, 1);
    assert.ok(diffs[0]?.args.includes("--no-change-set"));
    assert.ok(
      diffs[0]?.args.every((argument) => !argument.startsWith("--method")),
    );
  });
});

test("synth, diff, and deploy use the configured AWS profile", () => {
  withPlanFiles((options, calls) => {
    calculateDeploymentPlan(options);
    deployExactStack(options, "data");
    const cdkCalls = calls.filter(
      ({ executable, args }) => executable === "npx" && args[0] === "cdk",
    );
    assert.deepEqual(
      cdkCalls.map(({ args }) => args[1]),
      ["synth", "diff", "deploy"],
    );
    for (const request of cdkCalls) {
      assert.equal(request.env?.AWS_PROFILE, options.config.awsProfile);
    }
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

test("binds plan approval to the exact pricing evidence", () => {
  withPlanFiles((options) => {
    const first = calculateDeploymentPlan(options);
    const estimatePath = resolve(
      options.infrastructureRoot,
      "artifacts/cost-estimate.json",
    );
    const changed = JSON.parse(readFileSync(estimatePath, "utf8")) as Record<
      string,
      unknown
    >;
    changed.pricingSnapshotSha256 = "e".repeat(64);
    writeFileSync(estimatePath, JSON.stringify(changed));
    const second = calculateDeploymentPlan(options);
    assert.notEqual(second.approvalToken, first.approvalToken);
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
