import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { estimateMonthlyCost, type PricingSnapshot } from "../lib/cost.js";
import { validConfig } from "./fixtures.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pricing = JSON.parse(
  readFileSync(resolve(root, "cost/pricing-snapshot.json"), "utf8"),
) as PricingSnapshot;

test("reproduces the reviewed always-on planning estimate deterministically", () => {
  const estimate = estimateMonthlyCost(validConfig(), pricing);
  assert.equal(estimate.totalMonthlyUsd, "105.547300000");
  assert.equal(estimate.withinApprovedBudget, true);
  assert.equal(estimate.lineItems.length, 27);
  assert.equal(
    estimateMonthlyCost(validConfig(), pricing).totalMonthlyUsd,
    estimate.totalMonthlyUsd,
  );
});

test("blocks an estimate above the approved monthly budget", () => {
  const config = validConfig();
  config.monthlyBudgetUsd = 100;
  const estimate = estimateMonthlyCost(config, pricing);
  assert.equal(estimate.withinApprovedBudget, false);
  assert.equal(estimate.approvedMonthlyBudgetUsd, "100.000000000");
});

test("configuration changes invalidate the estimate fingerprint", () => {
  const original = estimateMonthlyCost(validConfig(), pricing);
  const changed = validConfig();
  changed.monthlyUsage.cloudFrontRequests += 1;
  const updated = estimateMonthlyCost(changed, pricing);
  assert.notEqual(updated.configFingerprint, original.configFingerprint);
});
