// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFocDemoApp } from "../lib/app.js";
import { loadDeploymentConfig } from "../lib/config.js";
import { assertDeploymentGate, defaultGatePaths } from "../lib/gate.js";
import { loadReleaseManifest } from "../lib/release-manifest.js";

const infrastructureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const { config } = loadDeploymentConfig();
assertDeploymentGate(config, defaultGatePaths(infrastructureRoot));
const phase = process.env.FOC_CDK_PHASE;
if (phase === "foundation") {
  createFocDemoApp(config, undefined, "foundation");
} else if (phase === undefined || phase === "release") {
  const { manifest } = loadReleaseManifest();
  createFocDemoApp(config, manifest, "release");
} else {
  throw new Error("FOC_CDK_PHASE must be 'foundation' or 'release'");
}
