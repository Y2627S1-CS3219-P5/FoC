// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeploymentConfig } from "../lib/config.js";
import { assertDeploymentGate, defaultGatePaths } from "../lib/gate.js";

const infrastructureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

try {
  const { config } = loadDeploymentConfig();
  assertDeploymentGate(config, defaultGatePaths(infrastructureRoot));
  process.stdout.write(
    "PASS: deployment inputs, cost approval, and AWS preflight are current.\n",
  );
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
