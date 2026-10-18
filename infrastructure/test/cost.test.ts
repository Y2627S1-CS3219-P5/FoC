// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
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
  assert.equal(estimate.totalMonthlyUsd, "134.557012500");
  assert.equal(estimate.withinApprovedBudget, true);
  assert.equal(estimate.schemaVersion, 2);
  assert.match(estimate.configFingerprint, /^[0-9a-f]{64}$/);
  assert.match(estimate.pricingSnapshotSha256, /^[0-9a-f]{64}$/);
  assert.equal(estimate.approval.evidenceKind, "REPOSITORY_PRICING_SNAPSHOT");
  assert.equal(estimate.lineItems.length, 31);
  assert.equal(
    estimateMonthlyCost(validConfig(), pricing).totalMonthlyUsd,
    estimate.totalMonthlyUsd,
  );
});

test("prices all deployed WAF and alarm resources and original Container Insights", () => {
  const config = validConfig();
  const estimate = estimateMonthlyCost(config, pricing);
  const quantities = Object.fromEntries(
    estimate.lineItems.map((item) => [item.id, item.quantity]),
  );
  assert.equal(quantities["waf-rules"], "4.000000");
  assert.equal(quantities.alarms, "30.000000");
  assert.equal(quantities["container-insights-metrics"], "62050.000000");
  config.monthlyUsage.taskHours = {
    frontend: 80,
    userService: 80,
    supplierService: 80,
  };
  const active = estimateMonthlyCost(config, pricing);
  assert.equal(
    active.lineItems.find((item) => item.id === "container-insights-metrics")
      ?.quantity,
    "6800.000000",
  );
  assert.equal(
    active.lineItems.find((item) => item.id === "alb-hours")?.quantity,
    "730.000000",
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
