// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeploymentConfig } from "../lib/config.js";
import { systemCommandRunner } from "../lib/commands.js";
import { assertDeploymentGate, defaultGatePaths } from "../lib/gate.js";
import { runReleaseJobs } from "../lib/jobs.js";
import { loadReleaseManifest } from "../lib/release-manifest.js";

const infrastructureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

try {
  const { config } = loadDeploymentConfig();
  const { manifest } = loadReleaseManifest();
  assertDeploymentGate(config, defaultGatePaths(infrastructureRoot));
  const evidence = runReleaseJobs({
    config,
    manifest,
    runner: systemCommandRunner,
    evidencePath: resolve(
      infrastructureRoot,
      "artifacts",
      "releases",
      manifest.sourceRevision,
      "database-jobs.json",
    ),
  });
  for (const job of evidence.jobs)
    console.log(`${job.job}: PASS (${job.taskArn})`);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
