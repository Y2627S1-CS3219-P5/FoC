import { resolve } from "node:path";
import type { CommandRunner } from "./commands.js";
import {
  deployExactStack,
  verifyApprovedPlan,
  type PlanOptions,
} from "./deployment-plan.js";
import { runReleaseJobs } from "./jobs.js";
import { waitForApplicationServices } from "./operations.js";
import { runCloudSmoke, type SmokeEvidence } from "./smoke.js";
import { awsArgs, loadValidatedStack, requireOutput } from "./stack-outputs.js";
import { runChecked } from "./commands.js";

export interface ApplyDeploymentOptions extends PlanOptions {
  readonly approvalToken: string;
  readonly runJobs?: () => void;
  readonly runSmoke?: () => SmokeEvidence;
}

export interface ApplyDeploymentResult {
  readonly phase: "foundation" | "release";
  readonly approvalToken: string;
  readonly cloudFrontUrl?: string;
}

export function applyApprovedDeployment(
  options: ApplyDeploymentOptions,
): ApplyDeploymentResult {
  const verified = verifyApprovedPlan(options, options.approvalToken);
  if (options.phase === "foundation") {
    deployExactStack(options, "foundation");
    return { phase: "foundation", approvalToken: verified.approvalToken };
  }
  if (options.releaseManifest === undefined) {
    throw new Error("Release apply requires a release manifest");
  }

  deployExactStack(options, "data");
  const jobs =
    options.runJobs ??
    (() => {
      runReleaseJobs({
        config: options.config,
        manifest: options.releaseManifest!,
        runner: options.runner,
        evidencePath: resolve(
          options.infrastructureRoot,
          "artifacts",
          "releases",
          options.releaseManifest!.sourceRevision,
          "database-jobs.json",
        ),
      });
    });
  jobs();
  deployExactStack(options, "application");
  waitForApplicationServices({
    config: options.config,
    runner: options.runner,
  });
  deployExactStack(options, "edge");
  waitForDistribution(options.config, options.runner);
  const smoke =
    options.runSmoke ??
    (() =>
      runCloudSmoke({
        config: options.config,
        runner: options.runner,
        repositoryRoot: options.repositoryRoot,
      }));
  const evidence = smoke();
  return {
    phase: "release",
    approvalToken: verified.approvalToken,
    cloudFrontUrl: evidence.baseUrl,
  };
}

function waitForDistribution(
  config: ApplyDeploymentOptions["config"],
  runner: CommandRunner,
): void {
  const edge = loadValidatedStack(config, runner, "edge", ["DistributionId"]);
  runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.edgeRegion, [
        "cloudfront",
        "wait",
        "distribution-deployed",
        "--id",
        requireOutput(edge, "DistributionId"),
      ]),
    },
    "wait for CloudFront distribution deployment",
  );
}
