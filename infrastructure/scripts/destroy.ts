// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { loadDeploymentConfig } from "../lib/config.js";
import { systemCommandRunner } from "../lib/commands.js";
import { destroyEnvironment } from "../lib/operations.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeOwnerOnlyJson } from "../lib/private-json.js";
import { existsSync } from "node:fs";
import { readDestroyReceipt } from "../lib/destroy-receipt.js";

try {
  const args = process.argv.slice(2);
  const confirmationIndex = args.indexOf("--confirm");
  const confirmation =
    confirmationIndex < 0 ? undefined : args[confirmationIndex + 1];
  const { config } = loadDeploymentConfig();
  const receiptPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "artifacts",
    "teardown-receipt.json",
  );
  const resume = args.includes("--resume");
  if (!resume && existsSync(receiptPath)) {
    throw new Error(
      "A teardown receipt already exists; use --resume to continue it, or archive it only after reviewing a completed teardown",
    );
  }
  const receipt = resume ? readDestroyReceipt(receiptPath, config) : undefined;
  console.error(
    "WARNING: Supplier/User data, secrets, images, and retained logs will be permanently removed.",
  );
  const residuals = destroyEnvironment(
    {
      config,
      runner: systemCommandRunner,
      ...(receipt === undefined ? {} : { resumeReceipt: receipt }),
      recordDestroyReceipt: (inventory) =>
        writeOwnerOnlyJson(receiptPath, inventory),
    },
    args.includes("--allow-data-loss"),
    confirmation,
  );
  if (residuals.length > 0) {
    throw new Error(
      `Deletion completed with residue requiring manual review: ${residuals.join(", ")}`,
    );
  }
  console.log(
    "PASS: captured FoC demo stacks are absent with no known residue; teardown receipt retained.",
  );
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
