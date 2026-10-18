// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
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
