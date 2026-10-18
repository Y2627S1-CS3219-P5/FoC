import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DeploymentConfig } from "./config.js";
import { configFingerprint } from "./config.js";
import type { CostEstimate, PricingSnapshot } from "./cost.js";
import { estimateMonthlyCost, pricingSnapshotHash } from "./cost.js";
import type { PreflightReport } from "./preflight.js";

export interface GatePaths {
  readonly preflightReport: string;
  readonly costEstimate: string;
  readonly pricingSnapshot: string;
}

export class DeploymentGateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DeploymentGateError";
  }
}

function readJson<T>(path: string, label: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new DeploymentGateError(
      `${label} is missing or invalid at ${path}: ${reason}`,
    );
  }
}

export function defaultGatePaths(infrastructureRoot: string): GatePaths {
  return {
    preflightReport: resolve(
      infrastructureRoot,
      "artifacts/preflight-report.json",
    ),
    costEstimate: resolve(infrastructureRoot, "artifacts/cost-estimate.json"),
    pricingSnapshot: resolve(infrastructureRoot, "cost/pricing-snapshot.json"),
  };
}

export function assertDeploymentGate(
  config: DeploymentConfig,
  paths: GatePaths,
  now = new Date(),
): void {
  const expectedFingerprint = configFingerprint(config);
  const preflight = readJson<PreflightReport>(
    paths.preflightReport,
    "preflight report",
  );
  const estimate = readJson<CostEstimate>(paths.costEstimate, "cost estimate");
  const pricing = readJson<PricingSnapshot>(
    paths.pricingSnapshot,
    "pricing snapshot",
  );
  const expectedEstimate = estimateMonthlyCost(config, pricing);

  const failures: string[] = [];
  if (preflight.schemaVersion !== 1 || preflight.status !== "PASS") {
    failures.push("read-only AWS preflight has not passed");
  }
  if (preflight.configFingerprint !== expectedFingerprint) {
    failures.push(
      "preflight report was generated for different configuration inputs",
    );
  }
  if (preflight.accountId !== config.accountId) {
    failures.push(
      "preflight caller account does not match the approved account",
    );
  }
  const validUntil = Date.parse(preflight.validUntil);
  if (!Number.isFinite(validUntil) || validUntil <= now.getTime()) {
    failures.push("preflight report is expired; run npm run preflight again");
  }

  if (estimate.schemaVersion !== 1) {
    failures.push("cost estimate schema is unsupported");
  }
  if (estimate.configFingerprint !== expectedFingerprint) {
    failures.push(
      "cost estimate was generated for different configuration inputs",
    );
  }
  if (estimate.pricingSnapshotSha256 !== pricingSnapshotHash(pricing)) {
    failures.push(
      "cost estimate does not match the committed pricing snapshot",
    );
  }
  if (
    estimate.totalMonthlyUsd !== expectedEstimate.totalMonthlyUsd ||
    estimate.approvedMonthlyBudgetUsd !==
      expectedEstimate.approvedMonthlyBudgetUsd ||
    JSON.stringify(estimate.lineItems) !==
      JSON.stringify(expectedEstimate.lineItems)
  ) {
    failures.push("cost estimate does not match deterministic recalculation");
  }
  if (!estimate.withinApprovedBudget) {
    failures.push("cost estimate exceeds the approved monthly budget");
  }
  if (
    estimate.approval.approvedBy !== config.costApproval.approvedBy ||
    estimate.approval.approvedAt !== config.costApproval.approvedAt ||
    estimate.approval.pricingCalculatorEstimateUrl !==
      config.costApproval.pricingCalculatorEstimateUrl
  ) {
    failures.push(
      "cost approval does not match the reviewed deployment configuration",
    );
  }
  const approvedAt = Date.parse(config.costApproval.approvedAt);
  if (!Number.isFinite(approvedAt) || approvedAt > now.getTime()) {
    failures.push("cost approval timestamp is invalid or in the future");
  }
  const quotaConfirmedAt = Date.parse(config.quotaApproval.confirmedAt);
  if (!Number.isFinite(quotaConfirmedAt) || quotaConfirmedAt > now.getTime()) {
    failures.push("quota confirmation timestamp is invalid or in the future");
  }

  if (failures.length > 0) {
    throw new DeploymentGateError(
      `Provisioning is blocked:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
  }
}
