import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { DeploymentConfig } from "./config.js";
import { configFingerprint } from "./config.js";
import { runChecked, type CommandRunner } from "./commands.js";
import type { CostEstimate } from "./cost.js";
import { STACKS, type StackKey } from "./deployment-names.js";
import {
  releaseManifestHash,
  type ReleaseManifest,
} from "./release-manifest.js";
import { assertAwsIdentity } from "./stack-outputs.js";

export type DeploymentPhase = "foundation" | "release";

const PHASE_STACKS = {
  foundation: ["foundation"],
  release: ["data", "application", "edge"],
} as const satisfies Readonly<Record<DeploymentPhase, readonly StackKey[]>>;

export interface PlannedStack {
  readonly key: StackKey;
  readonly cdkId: string;
  readonly name: string;
  readonly region: string;
  readonly templateSha256: string;
}

export interface DeploymentPlan {
  readonly schemaVersion: 1;
  readonly phase: DeploymentPhase;
  readonly accountId: string;
  readonly primaryRegion: string;
  readonly edgeRegion: string;
  readonly sourceRevision: string;
  readonly configFingerprint: string;
  readonly costEvidence: {
    readonly pricingSnapshotSha256: string;
    readonly pricingCapturedAt: string;
    readonly totalMonthlyUsd: string;
    readonly approvedMonthlyBudgetUsd: string;
    readonly approvedBy: string;
    readonly approvedAt: string;
    readonly evidenceKind: "REPOSITORY_PRICING_SNAPSHOT";
  };
  readonly releaseManifestSha256: string | null;
  readonly stacks: readonly PlannedStack[];
  readonly diff: string;
}

export interface DeploymentPlanResult {
  readonly plan: DeploymentPlan;
  readonly approvalToken: string;
  readonly path?: string;
}

export interface PlanOptions {
  readonly config: DeploymentConfig;
  readonly phase: DeploymentPhase;
  readonly runner: CommandRunner;
  readonly repositoryRoot: string;
  readonly infrastructureRoot: string;
  readonly releaseManifest?: ReleaseManifest;
  readonly releaseManifestPath?: string;
  readonly costEstimatePath?: string;
  readonly planPath?: string;
}

export function createDeploymentPlan(
  options: PlanOptions,
): DeploymentPlanResult {
  const result = calculateDeploymentPlan(options);
  if (options.planPath !== undefined) {
    writeOwnerOnlyJson(options.planPath, {
      ...result.plan,
      approvalToken: result.approvalToken,
    });
    return { ...result, path: resolve(options.planPath) };
  }
  return result;
}

export function calculateDeploymentPlan(
  options: PlanOptions,
): DeploymentPlanResult {
  validatePlanInputs(options);
  const { config, runner, infrastructureRoot, repositoryRoot } = options;
  runChecked(
    runner,
    { executable: "npm", args: ["run", "gate"], cwd: infrastructureRoot },
    "deployment gate",
  );
  const revision = runChecked(
    runner,
    {
      executable: "git",
      args: ["rev-parse", "HEAD"],
      cwd: repositoryRoot,
    },
    "resolve plan revision",
  ).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("Deployment plan requires a full Git revision");
  }
  if (
    options.phase === "release" &&
    options.releaseManifest?.sourceRevision !== revision
  ) {
    throw new Error("Release manifest revision does not match current HEAD");
  }
  const costEstimate = readApprovedCostEstimate(
    options.costEstimatePath ??
      resolve(infrastructureRoot, "artifacts/cost-estimate.json"),
    config,
  );
  const stackKeys = PHASE_STACKS[options.phase];
  const cdkIds = stackKeys.map((key) => STACKS[key].cdkId);
  const env = cdkEnvironment(options);
  runChecked(
    runner,
    {
      executable: "npx",
      args: ["cdk", "synth", ...cdkIds, "--strict", "--exclusively"],
      cwd: infrastructureRoot,
      env,
    },
    `synthesize ${options.phase} phase`,
  );
  const diff = runChecked(
    runner,
    {
      executable: "npx",
      args: [
        "cdk",
        "diff",
        ...cdkIds,
        "--method=template",
        "--no-color",
        "--strict",
        "--exclusively",
      ],
      cwd: infrastructureRoot,
      env,
    },
    `diff ${options.phase} phase`,
  );
  const stacks = stackKeys.map((key): PlannedStack => {
    const definition = STACKS[key];
    const region =
      definition.region === "primary"
        ? config.primaryRegion
        : config.edgeRegion;
    const templatePath = resolve(
      infrastructureRoot,
      "cdk.out",
      `${definition.cdkId}.template.json`,
    );
    return {
      key,
      cdkId: definition.cdkId,
      name: definition.name,
      region,
      templateSha256: sha256(readFileSync(templatePath)),
    };
  });
  const plan: DeploymentPlan = {
    schemaVersion: 1,
    phase: options.phase,
    accountId: config.accountId,
    primaryRegion: config.primaryRegion,
    edgeRegion: config.edgeRegion,
    sourceRevision: revision,
    configFingerprint: configFingerprint(config),
    costEvidence: {
      pricingSnapshotSha256: costEstimate.pricingSnapshotSha256,
      pricingCapturedAt: costEstimate.pricingCapturedAt,
      totalMonthlyUsd: costEstimate.totalMonthlyUsd,
      approvedMonthlyBudgetUsd: costEstimate.approvedMonthlyBudgetUsd,
      approvedBy: costEstimate.approval.approvedBy,
      approvedAt: costEstimate.approval.approvedAt,
      evidenceKind: costEstimate.approval.evidenceKind,
    },
    releaseManifestSha256:
      options.releaseManifest === undefined
        ? null
        : releaseManifestHash(options.releaseManifest),
    stacks,
    diff: `${diff.stdout}${diff.stderr}`,
  };
  return { plan, approvalToken: deploymentPlanHash(plan) };
}

export function verifyApprovedPlan(
  options: PlanOptions,
  approvalToken: string,
): DeploymentPlanResult {
  if (!/^[0-9a-f]{64}$/.test(approvalToken)) {
    throw new Error("--approve-plan must be an exact SHA-256 approval token");
  }
  const recalculated = calculateDeploymentPlan(options);
  if (recalculated.approvalToken !== approvalToken) {
    throw new Error(
      `Deployment plan changed: reviewed ${approvalToken}, current ${recalculated.approvalToken}`,
    );
  }
  assertAwsIdentity(options.config, options.runner);
  return recalculated;
}

export function deployExactStack(options: PlanOptions, key: StackKey): void {
  if (!PHASE_STACKS[options.phase].some((candidate) => candidate === key)) {
    throw new Error(`Stack ${key} is not part of ${options.phase} phase`);
  }
  runChecked(
    options.runner,
    {
      executable: "npx",
      args: [
        "cdk",
        "deploy",
        STACKS[key].cdkId,
        "--exclusively",
        "--require-approval",
        "never",
      ],
      cwd: options.infrastructureRoot,
      env: cdkEnvironment(options),
    },
    `deploy exact stack ${STACKS[key].name}`,
  );
}

export function deploymentPlanHash(plan: DeploymentPlan): string {
  return sha256(JSON.stringify(canonicalize(plan)));
}

function validatePlanInputs(options: PlanOptions): void {
  if (options.phase === "release") {
    if (
      options.releaseManifest === undefined ||
      options.releaseManifestPath === undefined
    ) {
      throw new Error(
        "Release planning requires an immutable manifest and path",
      );
    }
  }
}

function cdkEnvironment(
  options: PlanOptions,
): Readonly<Record<string, string | undefined>> {
  return {
    FOC_CDK_PHASE: options.phase,
    FOC_DEPLOYMENT_CONFIG: process.env.FOC_DEPLOYMENT_CONFIG,
    FOC_RELEASE_MANIFEST:
      options.phase === "release" ? options.releaseManifestPath : undefined,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readApprovedCostEstimate(
  path: string,
  config: DeploymentConfig,
): CostEstimate {
  let estimate: CostEstimate;
  try {
    estimate = JSON.parse(readFileSync(path, "utf8")) as CostEstimate;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot read approved cost estimate at ${path}: ${reason}`,
      {
        cause: error,
      },
    );
  }
  if (
    estimate.schemaVersion !== 2 ||
    estimate.configFingerprint !== configFingerprint(config) ||
    !estimate.withinApprovedBudget ||
    !/^[0-9a-f]{64}$/.test(estimate.pricingSnapshotSha256) ||
    estimate.approval.approvedBy !== config.costApproval.approvedBy ||
    estimate.approval.approvedAt !== config.costApproval.approvedAt ||
    estimate.approval.evidenceKind !== config.costApproval.evidenceKind
  ) {
    throw new Error(
      "Approved cost estimate does not match the current deployment configuration",
    );
  }
  return estimate;
}

function writeOwnerOnlyJson(path: string, value: unknown): void {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true, mode: 0o700 });
  const temporary = `${absolutePath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(temporary, 0o600);
  renameSync(temporary, absolutePath);
  chmodSync(absolutePath, 0o600);
}
