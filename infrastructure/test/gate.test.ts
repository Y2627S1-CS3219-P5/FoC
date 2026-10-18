import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { configFingerprint } from "../lib/config.js";
import { estimateMonthlyCost, type PricingSnapshot } from "../lib/cost.js";
import { assertDeploymentGate, DeploymentGateError } from "../lib/gate.js";
import type { PreflightReport } from "../lib/preflight.js";
import {
  REQUIRED_DIRECT_CAPABILITY_CHECK_IDS,
  REQUIRED_QUOTA_CHECK_IDS,
} from "../lib/preflight.js";
import { validConfig } from "./fixtures.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pricingText = readFileSync(
  resolve(root, "cost/pricing-snapshot.json"),
  "utf8",
);
const pricing = JSON.parse(pricingText) as PricingSnapshot;

function withArtifacts(
  mutate: (values: {
    preflight: PreflightReport;
    estimate: ReturnType<typeof estimateMonthlyCost>;
  }) => void,
  check: (paths: {
    preflightReport: string;
    costEstimate: string;
    pricingSnapshot: string;
  }) => void,
): void {
  const directory = mkdtempSync(resolve(tmpdir(), "foc-gate-test-"));
  try {
    const config = validConfig();
    const values = {
      preflight: {
        schemaVersion: 1,
        generatedAt: "2026-10-18T08:00:00.000Z",
        validUntil: "2026-10-19T08:00:00.000Z",
        configFingerprint: configFingerprint(config),
        accountId: config.accountId,
        callerArn: "arn:aws:sts::656253649128:assumed-role/NusRole/tester",
        status: "PASS",
        checks: [
          ...REQUIRED_DIRECT_CAPABILITY_CHECK_IDS.map((id) => ({
            id,
            status: "PASS" as const,
            detail: "verified",
          })),
          ...REQUIRED_QUOTA_CHECK_IDS.map((id) => ({
            id,
            status: "PASS" as const,
            detail: "verified live",
          })),
        ],
      } satisfies PreflightReport,
      estimate: estimateMonthlyCost(config, pricing),
    };
    mutate(values);
    const paths = {
      preflightReport: resolve(directory, "preflight.json"),
      costEstimate: resolve(directory, "estimate.json"),
      pricingSnapshot: resolve(directory, "pricing.json"),
    };
    writeFileSync(paths.preflightReport, JSON.stringify(values.preflight));
    writeFileSync(paths.costEstimate, JSON.stringify(values.estimate));
    writeFileSync(paths.pricingSnapshot, pricingText);
    check(paths);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("allows a current matching preflight and cost approval", () => {
  withArtifacts(
    () => undefined,
    (paths) =>
      assert.doesNotThrow(() =>
        assertDeploymentGate(
          validConfig(),
          paths,
          new Date("2026-10-18T09:00:00Z"),
        ),
      ),
  );
});

test("allows the complete NUS SCP and manual quota-review fallback", () => {
  withArtifacts(
    ({ preflight }) => {
      for (const check of preflight.checks) {
        if (
          (REQUIRED_QUOTA_CHECK_IDS as readonly string[]).includes(check.id)
        ) {
          Object.assign(check, { status: "WARNING" });
        }
      }
    },
    (paths) =>
      assert.doesNotThrow(() =>
        assertDeploymentGate(
          validConfig(),
          paths,
          new Date("2026-10-18T09:00:00Z"),
        ),
      ),
  );
});

test("blocks quota fallback evidence without direct capability evidence", () => {
  withArtifacts(
    ({ preflight }) => {
      const requiredCheck = preflight.checks.find(
        ({ id }) => id === REQUIRED_DIRECT_CAPABILITY_CHECK_IDS[0],
      );
      Object.assign(requiredCheck ?? {}, { status: "BLOCKED" });
      for (const check of preflight.checks) {
        if (
          (REQUIRED_QUOTA_CHECK_IDS as readonly string[]).includes(check.id)
        ) {
          Object.assign(check, { status: "WARNING" });
        }
      }
    },
    (paths) =>
      assert.throws(
        () =>
          assertDeploymentGate(
            validConfig(),
            paths,
            new Date("2026-10-18T09:00:00Z"),
          ),
        /direct service and capability checks/,
      ),
  );
});

test("blocks an expired preflight", () => {
  withArtifacts(
    ({ preflight }) => {
      Object.assign(preflight, { validUntil: "2026-10-18T08:30:00.000Z" });
    },
    (paths) =>
      assert.throws(
        () =>
          assertDeploymentGate(
            validConfig(),
            paths,
            new Date("2026-10-18T09:00:00Z"),
          ),
        /expired/,
      ),
  );
});

test("blocks stale artifacts after any configuration change", () => {
  withArtifacts(
    () => undefined,
    (paths) => {
      const changed = validConfig();
      changed.owner = "different-owner";
      assert.throws(
        () =>
          assertDeploymentGate(
            changed,
            paths,
            new Date("2026-10-18T09:00:00Z"),
          ),
        DeploymentGateError,
      );
    },
  );
});

test("blocks a failed cost comparison", () => {
  withArtifacts(
    ({ estimate }) => {
      Object.assign(estimate, { withinApprovedBudget: false });
    },
    (paths) =>
      assert.throws(
        () =>
          assertDeploymentGate(
            validConfig(),
            paths,
            new Date("2026-10-18T09:00:00Z"),
          ),
        /exceeds the approved monthly budget/,
      ),
  );
});

test("blocks cost evidence with a changed pricing fingerprint", () => {
  withArtifacts(
    ({ estimate }) => {
      Object.assign(estimate, { pricingSnapshotSha256: "0".repeat(64) });
    },
    (paths) =>
      assert.throws(
        () =>
          assertDeploymentGate(
            validConfig(),
            paths,
            new Date("2026-10-18T09:00:00Z"),
          ),
        /committed pricing snapshot/,
      ),
  );
});

test("blocks cost evidence with a changed named approval", () => {
  withArtifacts(
    ({ estimate }) => {
      Object.assign(estimate.approval, { approvedBy: "someone-else" });
    },
    (paths) =>
      assert.throws(
        () =>
          assertDeploymentGate(
            validConfig(),
            paths,
            new Date("2026-10-18T09:00:00Z"),
          ),
        /cost approval does not match/,
      ),
  );
});
