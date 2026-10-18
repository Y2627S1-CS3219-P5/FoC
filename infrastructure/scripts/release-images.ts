// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeploymentConfig } from "../lib/config.js";
import { systemCommandRunner } from "../lib/commands.js";
import { assertDeploymentGate, defaultGatePaths } from "../lib/gate.js";
import { prepareReleaseImages } from "../lib/images.js";

const infrastructureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = resolve(infrastructureRoot, "..");

try {
  const { config } = loadDeploymentConfig();
  assertDeploymentGate(config, defaultGatePaths(infrastructureRoot));
  const result = prepareReleaseImages({
    config,
    runner: systemCommandRunner,
    repositoryRoot,
    infrastructureRoot,
  });
  console.log(`Release manifest: ${result.path}`);
  console.log(`Pushed: ${result.pushed.join(", ") || "none"}`);
  console.log(
    `Reused immutable ECR images: ${result.reused.join(", ") || "none"}`,
  );
  console.log(
    "Vulnerability findings were recorded; no severity rejection policy is configured.",
  );
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
