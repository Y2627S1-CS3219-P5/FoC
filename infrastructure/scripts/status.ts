import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeploymentConfig, configFingerprint } from "../lib/config.js";
import { estimateMonthlyCost, type PricingSnapshot } from "../lib/cost.js";
import { systemCommandRunner } from "../lib/commands.js";
import { readEnvironmentStatus } from "../lib/operations.js";

const infrastructureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

try {
  const { config } = loadDeploymentConfig();
  const pricing = JSON.parse(
    readFileSync(
      resolve(infrastructureRoot, "cost/pricing-snapshot.json"),
      "utf8",
    ),
  ) as PricingSnapshot;
  const costEvidence = estimateMonthlyCost(config, pricing);
  const status = readEnvironmentStatus(
    { config, runner: systemCommandRunner },
    configFingerprint(config),
  );
  const report = { ...status, costEvidence };
  if (process.argv.slice(2).includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Application: ${status.cloudFrontUrl}`);
    console.log(`CloudFront: ${status.distributionState}`);
    console.log(
      `RDS ${status.database.identifier}: ${status.database.state}${status.database.automaticRestartTime ? ` (automatic restart ${status.database.automaticRestartTime})` : ""}`,
    );
    for (const service of Object.values(status.services)) {
      console.log(
        `${service.name}: desired=${service.desired} running=${service.running} pending=${service.pending} rollout=${service.rolloutState}`,
      );
      console.log(
        `  task=${service.taskDefinition} images=${service.images.join(", ") || "none"}`,
      );
    }
    console.log(
      `Target health: ${status.targetHealth.map(({ id, state, reason }) => `${id}=${state}${reason ? ` (${reason})` : ""}`).join(", ") || "none"}`,
    );
    console.log(
      `Non-OK alarms: ${status.alarmsNotOk.map(({ name, state }) => `${name}=${state}`).join(", ") || "none"}`,
    );
    console.log(
      `SNS confirmation pending: ${status.pendingSnsConfirmation ? "yes" : "no"}`,
    );
    console.log(`Approved monthly budget: USD ${status.monthlyBudgetUsd}`);
    console.log(
      `Reproducible monthly estimate: USD ${costEvidence.totalMonthlyUsd}`,
    );
    console.log(
      `Cost approval: ${status.costApproval.approvedBy} at ${status.costApproval.approvedAt}`,
    );
    console.log(`Config SHA-256: ${costEvidence.configFingerprint}`);
    console.log(
      `Pricing snapshot SHA-256: ${costEvidence.pricingSnapshotSha256}`,
    );
    console.log(status.trackingPortalReminder);
  }
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
