import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeploymentConfig } from "../lib/config.js";
import { systemCommandRunner } from "../lib/commands.js";
import {
  createDeploymentPlan,
  type DeploymentPhase,
} from "../lib/deployment-plan.js";
import { applyApprovedDeployment } from "../lib/deploy.js";
import { loadReleaseManifest } from "../lib/release-manifest.js";

const infrastructureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = resolve(infrastructureRoot, "..");

try {
  const [action, ...args] = process.argv.slice(2);
  if (action !== "plan" && action !== "apply") usage();
  const phaseValue = option(args, "--phase");
  if (phaseValue !== "foundation" && phaseValue !== "release") usage();
  const phase: DeploymentPhase = phaseValue;
  const { config } = loadDeploymentConfig();
  const release = phase === "release" ? loadReleaseManifest() : undefined;
  const options = {
    config,
    phase,
    runner: systemCommandRunner,
    repositoryRoot,
    infrastructureRoot,
    ...(release === undefined
      ? {}
      : {
          releaseManifest: release.manifest,
          releaseManifestPath: release.path,
        }),
  };
  if (action === "plan") {
    const result = createDeploymentPlan({
      ...options,
      planPath: resolve(
        infrastructureRoot,
        "artifacts",
        "plans",
        `${phase}-plan.json`,
      ),
    });
    console.log(result.plan.diff || "No CloudFormation differences.");
    console.log(`Approval token: ${result.approvalToken}`);
    console.log(`Plan evidence: ${result.path ?? "not written"}`);
  } else {
    const approvalToken = option(args, "--approve-plan");
    if (approvalToken === undefined) usage();
    const result = applyApprovedDeployment({
      ...options,
      approvalToken,
    });
    console.log(
      `PASS: applied exact ${result.phase} plan ${result.approvalToken}`,
    );
    if (result.cloudFrontUrl)
      console.log(`Application: ${result.cloudFrontUrl}`);
  }
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function usage(): never {
  throw new Error(
    "Usage: npm run deploy -- {plan|apply} --phase {foundation|release} [--approve-plan <sha256>]",
  );
}
