// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeploymentConfig } from "../lib/config.js";
import { estimateMonthlyCost, type PricingSnapshot } from "../lib/cost.js";

const infrastructureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const pricingPath = resolve(infrastructureRoot, "cost/pricing-snapshot.json");
const outputPath = resolve(infrastructureRoot, "artifacts/cost-estimate.json");

try {
  const { config } = loadDeploymentConfig();
  const snapshot = JSON.parse(
    readFileSync(pricingPath, "utf8"),
  ) as PricingSnapshot;
  const estimate = estimateMonthlyCost(config, snapshot);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(estimate, null, 2)}\n`, {
    mode: 0o600,
  });

  for (const item of estimate.lineItems) {
    process.stdout.write(
      `${item.description.padEnd(62)} $${item.monthlyUsd}\n`,
    );
  }
  process.stdout.write(
    `\nEstimated monthly total: $${estimate.totalMonthlyUsd}\n`,
  );
  process.stdout.write(
    `Approved monthly budget: $${estimate.approvedMonthlyBudgetUsd}\n`,
  );
  process.stdout.write(`Estimate artifact: ${outputPath}\n`);
  if (!estimate.withinApprovedBudget) {
    process.stderr.write(
      "BLOCKED: estimate exceeds the approved monthly budget.\n",
    );
    process.exitCode = 1;
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Cost estimate failed: ${message}\n`);
  process.exitCode = 1;
}
