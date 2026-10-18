// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: Verify the pinned CLI can consume the deployed construct library's assembly.
// Author review: PENDING.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { createFocDemoApp } from "../lib/app.js";
import { validConfig, validReleaseManifest } from "./fixtures.js";

test("pinned CLI strictly synthesizes all four stacks and diffs without AWS access", () => {
  const scratch = mkdtempSync(resolve(tmpdir(), "foc-cdk-cli-"));
  const cdkConfig = JSON.parse(
    readFileSync(new URL("../cdk.json", import.meta.url), "utf8"),
  ) as { readonly context: Readonly<Record<string, unknown>> };
  const lookupContext = JSON.parse(
    readFileSync(new URL("../cdk.context.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;
  const previousContext = process.env.CDK_CONTEXT_JSON;
  const previousOutdir = process.env.CDK_OUTDIR;
  process.env.CDK_CONTEXT_JSON = JSON.stringify({
    ...cdkConfig.context,
    ...lookupContext,
    "availability-zones:account=656253649128:region=ap-southeast-1": [
      "ap-southeast-1a",
      "ap-southeast-1b",
    ],
  });
  process.env.CDK_OUTDIR = resolve(scratch, "assembly");
  let app;
  try {
    app = createFocDemoApp(validConfig(), validReleaseManifest());
  } finally {
    if (previousContext === undefined) delete process.env.CDK_CONTEXT_JSON;
    else process.env.CDK_CONTEXT_JSON = previousContext;
    if (previousOutdir === undefined) delete process.env.CDK_OUTDIR;
    else process.env.CDK_OUTDIR = previousOutdir;
  }
  const assembly = app.synth();
  const cli = createRequire(import.meta.url).resolve("aws-cdk/bin/cdk");
  const env = {
    ...process.env,
    AWS_ACCESS_KEY_ID: "",
    AWS_SECRET_ACCESS_KEY: "",
    AWS_SESSION_TOKEN: "",
    AWS_PROFILE: "offline-cli-compatibility-test",
    AWS_CONFIG_FILE: resolve(scratch, "no-aws-config"),
    AWS_SHARED_CREDENTIALS_FILE: resolve(scratch, "no-aws-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
  };
  const common = [
    "--app",
    assembly.directory,
    "--output",
    assembly.directory,
    "--strict",
    "--exclusively",
    "--no-lookups",
    "--no-notices",
    "--no-color",
  ];
  try {
    for (const args of [
      [
        "synth",
        "FoCDemoFoundation",
        "FoCDemoData",
        "FoCDemoApplication",
        "FoCDemoEdge",
        ...common,
        "--quiet",
      ],
      [
        "diff",
        "FoCDemoFoundation",
        ...common,
        "--template",
        resolve(assembly.directory, "FoCDemoFoundation.template.json"),
        "--no-change-set",
      ],
    ]) {
      const result = spawnSync(process.execPath, [cli, ...args], {
        env,
        encoding: "utf8",
        timeout: 30_000,
      });
      assert.equal(
        result.status,
        0,
        `${args[0]} failed: ${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`,
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
