import { loadDeploymentConfig } from "../lib/config.js";
import { systemCommandRunner } from "../lib/commands.js";
import { destroyEnvironment } from "../lib/operations.js";

try {
  const args = process.argv.slice(2);
  const confirmationIndex = args.indexOf("--confirm");
  const confirmation =
    confirmationIndex < 0 ? undefined : args[confirmationIndex + 1];
  const { config } = loadDeploymentConfig();
  console.error(
    "WARNING: Supplier/User data, secrets, images, and retained logs will be permanently removed.",
  );
  const residuals = destroyEnvironment(
    { config, runner: systemCommandRunner },
    args.includes("--allow-data-loss"),
    confirmation,
  );
  if (residuals.length > 0) {
    throw new Error(
      `Deletion completed with residue requiring manual review: ${residuals.join(", ")}`,
    );
  }
  console.log(
    "PASS: all four exact FoC demo stacks were deleted with no known residue.",
  );
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
