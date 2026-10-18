// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeploymentConfig } from "../lib/config.js";
import { systemCommandRunner } from "../lib/commands.js";
import { runCloudSmoke } from "../lib/smoke.js";

const infrastructureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = resolve(infrastructureRoot, "..");

try {
  const { config } = loadDeploymentConfig();
  const evidence = runCloudSmoke({
    config,
    runner: systemCommandRunner,
    repositoryRoot,
  });
  console.log(
    `PASS: API and browser smoke journeys through ${evidence.baseUrl}`,
  );
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
