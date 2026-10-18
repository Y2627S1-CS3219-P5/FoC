// Contributor: @ron (AI-assisted); implementation review pending.
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
import { createFocDemoApp } from "../lib/app.js";
import { configFingerprint } from "../lib/config.js";
import {
  calculateDeploymentPlan,
  deployExactStack,
  verifyApprovedPlan,
  type PlanOptions,
} from "../lib/deployment-plan.js";
import { applyApprovedDeployment } from "../lib/deploy.js";
import { validConfig, validReleaseManifest } from "./fixtures.js";
import {
  argumentAfter,
  stackResponse,
  success,
} from "./release-tooling-fixtures.js";

function withPlanFiles(
  check: (options: PlanOptions, calls: CommandRequest[]) => void,
): void {
  const root = mkdtempSync(resolve(tmpdir(), "foc-plan-"));
  try {
    const infrastructureRoot = resolve(root, "infrastructure");
    mkdirSync(resolve(infrastructureRoot, "cdk.out"), { recursive: true });
    mkdirSync(resolve(infrastructureRoot, "artifacts"), { recursive: true });
    for (const id of [
      "FoCDemoFoundation",
      "FoCDemoData",
      "FoCDemoApplication",
      "FoCDemoEdge",
    ]) {
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
      if (
        request.args[0] === "cloudformation" &&
        request.args[1] === "describe-stacks"
      ) {
        return stackResponse(
          config,
          argumentAfter(request, "--stack-name") ?? "",
          {},
        );
      }
      if (
        request.args[0] === "cloudformation" &&
        request.args[1] === "list-stack-resources"
      ) {
        return success(JSON.stringify({ StackResourceSummaries: [] }));
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
      [
        "foc-demo-foundation",
        "foc-demo-data",
        "foc-demo-application",
        "foc-demo-edge",
      ],
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

test("release order establishes every real CDK export before its consumer", () => {
  // This is the actual first-deploy seam: the image-independent phase has no
  // consumers, so CDK has not yet generated its cross-stack exports.
  const foundationAssembly = createFocDemoApp(
    validConfig(),
    undefined,
    "foundation",
  ).synth();
  const releaseAssembly = createFocDemoApp(
    validConfig(),
    validReleaseManifest(),
    "release",
  ).synth();
  const initial = foundationAssembly.getStackArtifact("FoCDemoFoundation");
  const reconciled = releaseAssembly.getStackArtifact("FoCDemoFoundation");
  const initialTemplate: unknown = initial.template;
  const reconciledTemplate: unknown = reconciled.template;
  assert.ok(isRecord(initialTemplate));
  assert.ok(isRecord(reconciledTemplate));
  const availableExports = exportsIn(initialTemplate);
  assert.equal(availableExports.size, 0);
  assert.ok(exportsIn(reconciledTemplate).size > 0);
  // Publishing the newly generated outputs does not replace or alter resources.
  assert.deepEqual(initialTemplate.Resources, reconciledTemplate.Resources);

  withPlanFiles((options) => {
    for (const stack of releaseAssembly.stacks) {
      writeFileSync(
        resolve(
          options.infrastructureRoot,
          "cdk.out",
          `${stack.id}.template.json`,
        ),
        JSON.stringify(stack.template),
      );
    }
    const { plan } = calculateDeploymentPlan(options);
    for (const planned of plan.stacks) {
      const stack = releaseAssembly.getStackArtifact(planned.cdkId);
      const missing = [...importsIn(stack.template)].filter(
        (name) => !availableExports.has(name),
      );
      assert.deepEqual(
        missing,
        [],
        `${stack.stackName} has unavailable imports`,
      );
      for (const name of exportsIn(stack.template)) availableExports.add(name);
    }
  });
});

test("binds release approval to the reconciled Foundation template", () => {
  withPlanFiles((options) => {
    const first = calculateDeploymentPlan(options);
    writeFileSync(
      resolve(
        options.infrastructureRoot,
        "cdk.out/FoCDemoFoundation.template.json",
      ),
      '{"Outputs":{"newExport":{"Value":"changed"}}}',
    );
    const changed = calculateDeploymentPlan(options);
    assert.notEqual(changed.approvalToken, first.approvalToken);
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
    assert.throws(
      () => deployExactStack({ ...options, phase: "foundation" }, "data"),
      /not part/,
    );
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
    assert.deepEqual(deployed, ["FoCDemoFoundation", "FoCDemoData"]);
  });
});

test("never deploys Data or runs jobs when Foundation reconciliation fails", () => {
  withPlanFiles((options, calls) => {
    const plan = calculateDeploymentPlan(options);
    let ranJobs = false;
    const runner: CommandRunner = (request) => {
      if (
        request.executable === "npx" &&
        request.args[1] === "deploy" &&
        request.args[2] === "FoCDemoFoundation"
      ) {
        calls.push(request);
        return { status: 1, stdout: "", stderr: "foundation failed" };
      }
      return options.runner(request);
    };
    assert.throws(
      () =>
        applyApprovedDeployment({
          ...options,
          runner,
          approvalToken: plan.approvalToken,
          runJobs: () => {
            ranJobs = true;
          },
        }),
      /foundation failed/,
    );
    assert.equal(ranJobs, false);
    assert.deepEqual(
      calls
        .filter(
          ({ executable, args }) =>
            executable === "npx" && args[1] === "deploy",
        )
        .map(({ args }) => args[2]),
      ["FoCDemoFoundation"],
    );
  });
});

function exportsIn(template: unknown): Set<string> {
  assert.ok(isRecord(template));
  const names = new Set<string>();
  if (!isRecord(template.Outputs)) return names;
  for (const output of Object.values(template.Outputs)) {
    if (!isRecord(output) || !isRecord(output.Export)) continue;
    assert.ok(typeof output.Export.Name === "string");
    names.add(output.Export.Name);
  }
  return names;
}

function importsIn(template: unknown): Set<string> {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
    } else if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (key === "Fn::ImportValue") {
          assert.ok(typeof child === "string");
          names.add(child);
        } else {
          visit(child);
        }
      }
    }
  };
  visit(template);
  return names;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
