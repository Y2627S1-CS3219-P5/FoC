import { loadDeploymentConfig } from "../lib/config.js";
import { systemCommandRunner } from "../lib/commands.js";
import { startEnvironment } from "../lib/operations.js";

try {
  const { config } = loadDeploymentConfig();
  startEnvironment({ config, runner: systemCommandRunner });
  console.log("PASS: RDS and all three ECS services are active and healthy.");
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
