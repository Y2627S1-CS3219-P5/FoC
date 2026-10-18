// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { loadDeploymentConfig } from "../lib/config.js";
import { systemCommandRunner } from "../lib/commands.js";
import { stopEnvironment } from "../lib/operations.js";

try {
  const { config } = loadDeploymentConfig();
  const result = stopEnvironment({ config, runner: systemCommandRunner });
  console.log(
    "PASS: ECS desired counts and autoscaling are zero; RDS is stopped.",
  );
  console.log(
    "CloudFront, WAF, ALB, storage/backups, Secrets Manager, ECR, and logs can still cost money.",
  );
  console.log("AWS restarts a stopped RDS instance after at most seven days.");
  if (result.automaticRestartTime) {
    console.log(
      `Reported automatic restart time: ${result.automaticRestartTime}`,
    );
  }
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
