// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeploymentConfig } from "../lib/config.js";
import { runPreflight } from "../lib/preflight.js";

const infrastructureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputPath = resolve(
  infrastructureRoot,
  "artifacts/preflight-report.json",
);

try {
  const { config } = loadDeploymentConfig();
  const report = runPreflight(config);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });

  for (const check of report.checks) {
    process.stdout.write(
      `${check.status.padEnd(7)} ${check.id}: ${check.detail}\n`,
    );
  }
  process.stdout.write(`\nPreflight ${report.status}; report: ${outputPath}\n`);
  if (report.status !== "PASS") {
    process.exitCode = 1;
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Preflight failed: ${message}\n`);
  process.exitCode = 1;
}
