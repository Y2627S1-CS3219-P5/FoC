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
  failure,
  stackResponse,
  success,
} from "./release-tooling-fixtures.js";

const revision = validReleaseManifest().sourceRevision;
const frontendIndexDigest =
  "sha256:7c55bd077f4ee809fcee5b39df72ac72e7bc861a17eb7bf86b0afa14885e3208";
const frontendChildDigest =
  "sha256:7138e045ee96ec95ad8baa11f20b68cbfb56801ba69994dc8fd87e950b7962d9";
const ociImageType = "application/vnd.oci.image.manifest.v1+json";
const frontendIndex = {
  schemaVersion: 2,
  mediaType: "application/vnd.oci.image.index.v1+json",
  manifests: [
    {
      mediaType: ociImageType,
      digest: frontendChildDigest,
      size: 2498,
      platform: { architecture: "amd64", os: "linux" },
    },
    {
      mediaType: ociImageType,
      digest: `sha256:${"e".repeat(64)}`,
      size: 566,
      annotations: {
        "vnd.docker.reference.digest": frontendChildDigest,
        "vnd.docker.reference.type": "attestation-manifest",
      },
      platform: { architecture: "unknown", os: "unknown" },
    },
  ],
};
const standaloneManifest = {
  schemaVersion: 2,
  mediaType: ociImageType,
  config: {
    mediaType: "application/vnd.oci.image.config.v1+json",
    digest: `sha256:${"f".repeat(64)}`,
    size: 100,
  },
  layers: [],
};

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
    if (service === "ecr" && operation === "batch-get-image") {
      const repository = argumentAfter(request, "--repository-name");
      const digest = argumentAfter(request, "--image-ids")?.replace(
        "imageDigest=",
        "",
      );
      return success(
        JSON.stringify({
          failures: [],
          images: [
            {
              registryId: config.accountId,
              repositoryName: repository,
              imageId: { imageDigest: digest },
              imageManifest: JSON.stringify(standaloneManifest),
              imageManifestMediaType: standaloneManifest.mediaType,
            },
          ],
        }),
      );
    }
    if (service === "ecr" && operation === "describe-image-scan-findings") {
      return success(
        JSON.stringify({
          registryId: config.accountId,
          repositoryName: argumentAfter(request, "--repository-name"),
          imageId: {
            imageDigest: argumentAfter(request, "--image-id")?.replace(
              "imageDigest=",
              "",
            ),
          },
          imageScanStatus: { status: options.scanStatus ?? "COMPLETE" },
          imageScanFindings: { findingSeverityCounts: { MEDIUM: 2 } },
        }),
      );
    }
    return success();
  };
}

function prepareForTest(runner: CommandRunner) {
  const directory = mkdtempSync(resolve(tmpdir(), "foc-images-"));
  try {
    return prepareReleaseImages({
      config: validConfig(),
      runner,
      repositoryRoot: directory,
      infrastructureRoot: directory,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function frontendIndexRunner(manifest: unknown): CommandRunner {
  const base = imageRunner();
  return (request) => {
    if (
      request.args[0] === "ecr" &&
      request.args[1] === "batch-get-image" &&
      argumentAfter(request, "--repository-name") === "foc-demo-frontend" &&
      argumentAfter(request, "--image-ids") ===
        `imageDigest=${DIGESTS.frontend}`
    ) {
      return success(
        JSON.stringify({
          failures: [],
          images: [
            {
              registryId: validConfig().accountId,
              repositoryName: "foc-demo-frontend",
              imageId: { imageDigest: DIGESTS.frontend },
              imageManifest: JSON.stringify(manifest),
            },
          ],
        }),
      );
    }
    return base(request);
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
      result.manifest.images.frontend.scan.scannedDigest,
      DIGESTS.frontend,
    );
    assert.equal(
      calls.some(({ executable }) => executable === "docker"),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("scans the runnable amd64 child while preserving the deployed OCI index and provenance", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "foc-images-"));
  const baseRunner = imageRunner();
  const scanIds: string[] = [];
  const runner: CommandRunner = (request) => {
    const [service, operation] = request.args;
    const repository = argumentAfter(request, "--repository-name");
    if (service === "ecr" && repository === "foc-demo-frontend") {
      if (operation === "describe-images") {
        return success(
          JSON.stringify({
            imageDetails: [{ imageDigest: frontendIndexDigest }],
          }),
        );
      }
      if (operation === "batch-get-image") {
        const requested = argumentAfter(request, "--image-ids");
        if (requested === `imageDigest=${frontendIndexDigest}`) {
          return success(
            JSON.stringify({
              failures: [],
              images: [
                {
                  registryId: validConfig().accountId,
                  repositoryName: repository,
                  imageId: { imageDigest: frontendIndexDigest },
                  imageManifest: JSON.stringify(frontendIndex),
                  imageManifestMediaType: frontendIndex.mediaType,
                },
              ],
            }),
          );
        }
      }
      if (
        operation === "wait" ||
        operation === "describe-image-scan-findings"
      ) {
        const id = argumentAfter(request, "--image-id") ?? "";
        scanIds.push(id);
        if (id !== `imageDigest=${frontendChildDigest}`) {
          return failure(
            "ScanNotFoundException: index is not a runnable image",
          );
        }
        return operation === "wait"
          ? success()
          : success(
              JSON.stringify({
                registryId: validConfig().accountId,
                repositoryName: repository,
                imageId: { imageDigest: frontendChildDigest },
                imageScanStatus: { status: "COMPLETE" },
                imageScanFindings: { findingSeverityCounts: { HIGH: 1 } },
              }),
            );
      }
    }
    return baseRunner(request);
  };
  try {
    const result = prepareReleaseImages({
      config: validConfig(),
      runner,
      repositoryRoot: directory,
      infrastructureRoot: directory,
    });
    assert.equal(result.manifest.images.frontend.digest, frontendIndexDigest);
    assert.equal(
      result.manifest.images.frontend.scan.scannedDigest,
      frontendChildDigest,
    );
    assert.equal(
      result.manifest.images.frontend.digestUri,
      `${validConfig().accountId}.dkr.ecr.ap-southeast-1.amazonaws.com/foc-demo-frontend@${frontendIndexDigest}`,
    );
    assert.deepEqual(scanIds, [
      `imageDigest=${frontendChildDigest}`,
      `imageDigest=${frontendChildDigest}`,
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("supports Docker manifest lists without scanning their root digest", () => {
  const manifest = {
    ...frontendIndex,
    mediaType: "application/vnd.docker.distribution.manifest.list.v2+json",
  };
  const result = prepareForTest(frontendIndexRunner(manifest));
  assert.equal(result.manifest.images.frontend.digest, DIGESTS.frontend);
  assert.equal(
    result.manifest.images.frontend.scan.scannedDigest,
    frontendChildDigest,
  );
});

test("scans a standalone Docker image manifest directly", () => {
  const manifest = {
    ...standaloneManifest,
    mediaType: "application/vnd.docker.distribution.manifest.v2+json",
    config: {
      ...standaloneManifest.config,
      mediaType: "application/vnd.docker.container.image.v1+json",
    },
  };
  const result = prepareForTest(frontendIndexRunner(manifest));
  assert.equal(
    result.manifest.images.frontend.scan.scannedDigest,
    DIGESTS.frontend,
  );
});

test("rejects a missing or non-runnable selected child manifest", () => {
  const base = frontendIndexRunner(frontendIndex);
  for (const response of [
    failure("ImageNotFoundException"),
    success(JSON.stringify({ failures: [], images: [] })),
    success(
      JSON.stringify({
        images: [
          {
            registryId: validConfig().accountId,
            repositoryName: "foc-demo-frontend",
            imageId: { imageDigest: frontendChildDigest },
            imageManifest: JSON.stringify(frontendIndex),
          },
        ],
      }),
    ),
  ]) {
    assert.throws(
      () =>
        prepareForTest((request) =>
          request.args[1] === "batch-get-image" &&
          argumentAfter(request, "--image-ids") ===
            `imageDigest=${frontendChildDigest}`
            ? response
            : base(request),
        ),
      /immutable manifest|malformed manifest|matching runnable image manifest/,
    );
  }
});

test("rejects missing, duplicate, wrong-platform, attestation-only and malformed image indexes", () => {
  const runnable = frontendIndex.manifests[0]!;
  const attestation = frontendIndex.manifests[1]!;
  for (const manifest of [
    { ...frontendIndex, manifests: [] },
    { ...frontendIndex, manifests: [runnable, runnable] },
    {
      ...frontendIndex,
      manifests: [
        { ...runnable, platform: { os: "linux", architecture: "arm64" } },
      ],
    },
    { ...frontendIndex, manifests: [attestation] },
    {
      ...frontendIndex,
      manifests: [
        { ...attestation, platform: { os: "linux", architecture: "amd64" } },
      ],
    },
    { ...frontendIndex, manifests: [{ ...runnable, digest: "sha256:broken" }] },
    {
      ...frontendIndex,
      manifests: [{ ...runnable, mediaType: frontendIndex.mediaType }],
    },
    { ...frontendIndex, schemaVersion: 1 },
  ]) {
    assert.throws(
      () => prepareForTest(frontendIndexRunner(manifest)),
      /exactly one runnable linux\/amd64|malformed image manifest/,
    );
  }
});

test("fails closed on ECR manifest errors, missing images, identity changes and malformed JSON", () => {
  for (const response of [
    failure("AccessDeniedException"),
    success(
      JSON.stringify({
        failures: [{ failureCode: "ImageNotFound" }],
        images: [],
      }),
    ),
    success(JSON.stringify({ failures: [], images: [] })),
    success("{not-json"),
    success(
      JSON.stringify({
        images: [
          {
            registryId: validConfig().accountId,
            repositoryName: "foc-demo-frontend",
            imageId: { imageDigest: frontendChildDigest },
            imageManifest: JSON.stringify(standaloneManifest),
          },
        ],
      }),
    ),
  ]) {
    const base = imageRunner();
    assert.throws(
      () =>
        prepareForTest((request) =>
          request.args[0] === "ecr" && request.args[1] === "batch-get-image"
            ? response
            : base(request),
        ),
      /immutable manifest|manifest identity|malformed manifest|valid JSON/,
    );
  }
});

test("rejects scan findings for a different digest", () => {
  const base = imageRunner();
  assert.throws(
    () =>
      prepareForTest((request) =>
        request.args[0] === "ecr" &&
        request.args[1] === "describe-image-scan-findings"
          ? success(
              JSON.stringify({
                registryId: validConfig().accountId,
                repositoryName: "foc-demo-frontend",
                imageId: { imageDigest: frontendChildDigest },
                imageScanStatus: { status: "COMPLETE" },
              }),
            )
          : base(request),
      ),
    /scan identity does not match/,
  );
});

test("refreshes official base tags while retaining amd64 builds and immutable SHA tags", () => {
  const calls: CommandRequest[] = [];
  const base = imageRunner({ calls });
  let descriptions = 0;
  prepareForTest((request) => {
    if (
      request.args[0] === "ecr" &&
      request.args[1] === "describe-images" &&
      ++descriptions <= 3
    ) {
      return failure("ImageNotFoundException");
    }
    return base(request);
  });
  const builds = calls.filter(
    ({ executable, args }) => executable === "docker" && args[0] === "build",
  );
  assert.equal(builds.length, 3);
  for (const build of builds) {
    assert.ok(build.args.includes("--pull"));
    assert.equal(argumentAfter(build, "--platform"), "linux/amd64");
    assert.ok(argumentAfter(build, "--tag")?.endsWith(`:${revision}`));
    assert.ok(
      build.args.every((arg) => !/--(?:provenance|sbom)=false/.test(arg)),
    );
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

test("blocks a local manifest whose scanned digest disagrees with immutable ECR", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "foc-images-"));
  const path = resolve(directory, "release-manifest.json");
  try {
    const manifest = validReleaseManifest();
    manifest.images.frontend.scan.scannedDigest = frontendChildDigest;
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
      /scanned digest.*does not match ECR/,
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
