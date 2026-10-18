import { loadDeploymentConfig, configFingerprint } from "../lib/config.js";
import { systemCommandRunner } from "../lib/commands.js";
import { readEnvironmentStatus } from "../lib/operations.js";

try {
  const { config } = loadDeploymentConfig();
  const status = readEnvironmentStatus(
    { config, runner: systemCommandRunner },
    configFingerprint(config),
  );
  if (process.argv.slice(2).includes("--json")) {
    console.log(JSON.stringify(status, null, 2));
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
    console.log(`Approved estimate: ${status.pricingCalculatorEstimateUrl}`);
    console.log(status.trackingPortalReminder);
  }
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
