// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import type { CommandRequest, CommandRunner } from "../lib/commands.js";
import { prepareReleaseImages } from "../lib/images.js";
import { writeReleaseManifest } from "../lib/release-manifest.js";
import { validConfig, validReleaseManifest } from "./fixtures.js";
import {
  argumentAfter,
  DIGESTS,
  stackResponse,
  success,
} from "./release-tooling-fixtures.js";

const revision = validReleaseManifest().sourceRevision;

function imageRunner(
  options: {
    readonly dirty?: boolean;
    readonly scanStatus?: string;
    readonly calls?: CommandRequest[];
  } = {},
): CommandRunner {
  const config = validConfig();
  return (request) => {
    options.calls?.push(request);
    const [service, operation] = request.args;
    if (request.executable === "git" && service === "rev-parse") {
      return success(`${revision}\n`);
    }
    if (request.executable === "git" && service === "status") {
      return success(options.dirty ? "?? unexpected.txt\n" : "");
    }
    if (service === "sts" && operation === "get-caller-identity") {
      return success(
        JSON.stringify({
          Account: config.accountId,
          Arn: "arn:aws:sts::caller",
        }),
      );
    }
    if (service === "cloudformation" && operation === "describe-stacks") {
      return stackResponse(config, "foc-demo-foundation", {
        FrontendRepositoryName: "foc-demo-frontend",
        FrontendRepositoryUri: `${config.accountId}.dkr.ecr.${config.primaryRegion}.amazonaws.com/foc-demo-frontend`,
        UserServiceRepositoryName: "foc-demo-user-service",
        UserServiceRepositoryUri: `${config.accountId}.dkr.ecr.${config.primaryRegion}.amazonaws.com/foc-demo-user-service`,
        SupplierServiceRepositoryName: "foc-demo-supplier-service",
        SupplierServiceRepositoryUri: `${config.accountId}.dkr.ecr.${config.primaryRegion}.amazonaws.com/foc-demo-supplier-service`,
      });
    }
    if (service === "ecr" && operation === "describe-images") {
      const repository = argumentAfter(request, "--repository-name") ?? "";
      const digest = repository.includes("user-service")
        ? DIGESTS.userService
        : repository.includes("supplier-service")
          ? DIGESTS.supplierService
          : DIGESTS.frontend;
      return success(
        JSON.stringify({ imageDetails: [{ imageDigest: digest }] }),
      );
    }
    if (service === "ecr" && operation === "wait") return success();
    if (service === "ecr" && operation === "describe-image-scan-findings") {
      return success(
        JSON.stringify({
          imageScanStatus: { status: options.scanStatus ?? "COMPLETE" },
          imageScanFindings: { findingSeverityCounts: { MEDIUM: 2 } },
        }),
      );
    }
    return success();
  };
}

test("reuses existing immutable SHA images without Docker and records scans", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "foc-images-"));
  const calls: CommandRequest[] = [];
  try {
    const result = prepareReleaseImages({
      config: validConfig(),
      runner: imageRunner({ calls }),
      repositoryRoot: directory,
      infrastructureRoot: directory,
      now: new Date("2026-10-18T10:00:00.000Z"),
    });
    assert.deepEqual(result.reused, [
      "frontend",
      "userService",
      "supplierService",
    ]);
    assert.deepEqual(result.pushed, []);
    assert.equal(result.manifest.images.frontend.digest, DIGESTS.frontend);
    assert.deepEqual(result.manifest.images.frontend.scan.findings, {
      MEDIUM: 2,
    });
    assert.equal(
      calls.some(({ executable }) => executable === "docker"),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("blocks SHA tagging when the Git worktree is dirty", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "foc-images-"));
  try {
    assert.throws(
      () =>
        prepareReleaseImages({
          config: validConfig(),
          runner: imageRunner({ dirty: true }),
          repositoryRoot: directory,
          infrastructureRoot: directory,
        }),
      /completely clean/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("blocks a local manifest whose digest disagrees with immutable ECR", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "foc-images-"));
  const path = resolve(directory, "release-manifest.json");
  try {
    const manifest = validReleaseManifest();
    const digest = `sha256:${"d".repeat(64)}`;
    manifest.images.frontend.digest = digest;
    manifest.images.frontend.digestUri = `${manifest.images.frontend.repositoryUri}@${digest}`;
    writeReleaseManifest(path, manifest);
    assert.throws(
      () =>
        prepareReleaseImages({
          config: validConfig(),
          runner: imageRunner(),
          repositoryRoot: directory,
          infrastructureRoot: directory,
          manifestPath: path,
        }),
      /does not match ECR/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("blocks an incomplete or failed vulnerability scan without inventing a severity threshold", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "foc-images-"));
  try {
    assert.throws(
      () =>
        prepareReleaseImages({
          config: validConfig(),
          runner: imageRunner({ scanStatus: "FAILED" }),
          repositoryRoot: directory,
          infrastructureRoot: directory,
        }),
      /did not complete/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
