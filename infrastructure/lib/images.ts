// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DeploymentConfig } from "./config.js";
import {
  parseJson,
  runChecked,
  safeCommandFailure,
  type CommandRunner,
} from "./commands.js";
import { REPOSITORY_NAMES } from "./deployment-names.js";
import { resolveImageScanDigest } from "./image-scan-target.js";
import {
  parseReleaseManifest,
  type ReleaseImage,
  type ReleaseManifest,
  writeReleaseManifest,
} from "./release-manifest.js";
import {
  assertAwsIdentity,
  awsArgs,
  loadValidatedStack,
  requireOutput,
} from "./stack-outputs.js";

type ImageKey = keyof ReleaseManifest["images"];

interface ImageSpec {
  readonly key: ImageKey;
  readonly repositoryOutputName: string;
  readonly repositoryOutputUri: string;
  readonly context: string;
  readonly dockerfile: string;
  readonly target?: string;
}

const IMAGE_SPECS = [
  {
    key: "frontend",
    repositoryOutputName: "FrontendRepositoryName",
    repositoryOutputUri: "FrontendRepositoryUri",
    context: "frontend",
    dockerfile: "frontend/Dockerfile",
    target: "cloud",
  },
  {
    key: "userService",
    repositoryOutputName: "UserServiceRepositoryName",
    repositoryOutputUri: "UserServiceRepositoryUri",
    context: "user-service",
    dockerfile: "user-service/Dockerfile",
  },
  {
    key: "supplierService",
    repositoryOutputName: "SupplierServiceRepositoryName",
    repositoryOutputUri: "SupplierServiceRepositoryUri",
    context: ".",
    dockerfile: "supplier-service/Dockerfile",
  },
] as const satisfies readonly ImageSpec[];

interface DescribeImagesResponse {
  readonly imageDetails?: readonly { readonly imageDigest?: string }[];
}

interface ScanResponse {
  readonly registryId?: string;
  readonly repositoryName?: string;
  readonly imageId?: { readonly imageDigest?: string };
  readonly imageScanStatus?: {
    readonly status?: string;
    readonly description?: string;
  };
  readonly imageScanFindings?: {
    readonly findingSeverityCounts?: Readonly<Record<string, number>>;
  };
}

interface PreparedImage {
  readonly spec: ImageSpec;
  readonly repositoryName: string;
  readonly repositoryUri: string;
  digest: string | undefined;
}

export interface PrepareImagesOptions {
  readonly config: DeploymentConfig;
  readonly runner: CommandRunner;
  readonly repositoryRoot: string;
  readonly infrastructureRoot: string;
  readonly now?: Date;
  readonly manifestPath?: string;
}

export interface PreparedRelease {
  readonly manifest: ReleaseManifest;
  readonly path: string;
  readonly reused: readonly ImageKey[];
  readonly pushed: readonly ImageKey[];
}

export function prepareReleaseImages(
  options: PrepareImagesOptions,
): PreparedRelease {
  const { config, runner, repositoryRoot, infrastructureRoot } = options;
  assertAwsIdentity(config, runner);
  const revision = requireCleanRevision(runner, repositoryRoot);
  const foundation = loadValidatedStack(config, runner, "foundation", [
    "FrontendRepositoryName",
    "FrontendRepositoryUri",
    "UserServiceRepositoryName",
    "UserServiceRepositoryUri",
    "SupplierServiceRepositoryName",
    "SupplierServiceRepositoryUri",
  ]);
  const prepared: PreparedImage[] = IMAGE_SPECS.map((spec) => {
    const repositoryName = requireOutput(foundation, spec.repositoryOutputName);
    const repositoryUri = requireOutput(foundation, spec.repositoryOutputUri);
    if (repositoryName !== REPOSITORY_NAMES[spec.key]) {
      throw new Error(
        `Foundation output ${spec.repositoryOutputName} must be ${REPOSITORY_NAMES[spec.key]}; received ${repositoryName}`,
      );
    }
    return { spec, repositoryName, repositoryUri, digest: undefined };
  });

  const missing: PreparedImage[] = [];
  for (const image of prepared) {
    image.digest = findExistingDigest(
      config,
      runner,
      image.repositoryName,
      revision,
    );
    if (image.digest === undefined) missing.push(image);
  }

  if (missing.length > 0) {
    loginToRegistry(config, runner, registryHost(prepared[0]?.repositoryUri));
    for (const image of missing) {
      buildAndPush(runner, repositoryRoot, image, revision);
      image.digest = requireImageDigest(
        config,
        runner,
        image.repositoryName,
        revision,
      );
    }
  }

  const images = Object.fromEntries(
    prepared.map((image) => [
      image.spec.key,
      toReleaseImage(config, runner, image, revision),
    ]),
  ) as ReleaseManifest["images"];
  const path =
    options.manifestPath ??
    resolve(
      infrastructureRoot,
      "artifacts",
      "releases",
      revision,
      "release-manifest.json",
    );
  const existing = loadExistingManifest(path);
  if (existing !== undefined) {
    for (const key of Object.keys(images) as ImageKey[]) {
      if (existing.images[key].digest !== images[key].digest) {
        throw new Error(
          `Existing release manifest digest for ${key} does not match ECR; refusing to continue`,
        );
      }
      if (
        existing.images[key].scan.scannedDigest !==
        images[key].scan.scannedDigest
      ) {
        throw new Error(
          `Existing release manifest scanned digest for ${key} does not match ECR; refusing to continue`,
        );
      }
    }
  }
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    accountId: config.accountId,
    region: config.primaryRegion,
    sourceRevision: revision,
    builtAt: existing?.builtAt ?? (options.now ?? new Date()).toISOString(),
    images,
  };
  writeReleaseManifest(path, manifest);
  return {
    manifest,
    path,
    reused: prepared
      .filter((image) => !missing.includes(image))
      .map(({ spec }) => spec.key),
    pushed: missing.map(({ spec }) => spec.key),
  };
}

export function requireCleanRevision(
  runner: CommandRunner,
  repositoryRoot: string,
): string {
  const revision = runChecked(
    runner,
    {
      executable: "git",
      args: ["rev-parse", "HEAD"],
      cwd: repositoryRoot,
    },
    "resolve Git revision",
  ).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("Release requires a full committed 40-character Git SHA");
  }
  const status = runChecked(
    runner,
    {
      executable: "git",
      args: ["status", "--porcelain=v1", "--untracked-files=all"],
      cwd: repositoryRoot,
    },
    "inspect Git worktree",
  ).stdout.trim();
  if (status !== "") {
    throw new Error(
      "Release requires a completely clean tracked and untracked Git worktree",
    );
  }
  return revision;
}

function findExistingDigest(
  config: DeploymentConfig,
  runner: CommandRunner,
  repositoryName: string,
  revision: string,
): string | undefined {
  const result = runner({
    executable: "aws",
    args: awsArgs(config, config.primaryRegion, [
      "ecr",
      "describe-images",
      "--repository-name",
      repositoryName,
      "--image-ids",
      `imageTag=${revision}`,
    ]),
  });
  if (result.status !== 0) {
    if (/ImageNotFoundException/.test(result.stderr || result.stdout))
      return undefined;
    throw new Error(
      `Cannot inspect immutable image ${repositoryName}:${revision}: ${safeCommandFailure(result)}`,
    );
  }
  const response = parseJson<DescribeImagesResponse>(result.stdout, "ECR");
  const digest = response.imageDetails?.[0]?.imageDigest;
  if (digest === undefined || !/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error(
      `ECR returned no valid digest for ${repositoryName}:${revision}`,
    );
  }
  return digest;
}

function requireImageDigest(
  config: DeploymentConfig,
  runner: CommandRunner,
  repositoryName: string,
  revision: string,
): string {
  const digest = findExistingDigest(config, runner, repositoryName, revision);
  if (digest === undefined) {
    throw new Error(
      `Pushed image ${repositoryName}:${revision} was not found in ECR`,
    );
  }
  return digest;
}

function loginToRegistry(
  config: DeploymentConfig,
  runner: CommandRunner,
  registry: string,
): void {
  const password = runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.primaryRegion, [
        "ecr",
        "get-login-password",
      ]),
    },
    "obtain temporary ECR login",
  ).stdout;
  runChecked(
    runner,
    {
      executable: "docker",
      args: ["login", "--username", "AWS", "--password-stdin", registry],
      input: password,
    },
    "authenticate Docker to ECR",
  );
}

function buildAndPush(
  runner: CommandRunner,
  repositoryRoot: string,
  image: PreparedImage,
  revision: string,
): void {
  const tag = `${image.repositoryUri}:${revision}`;
  const args = [
    "build",
    "--pull",
    "--platform",
    "linux/amd64",
    "--file",
    image.spec.dockerfile,
    "--tag",
    tag,
  ];
  if (image.spec.target !== undefined) args.push("--target", image.spec.target);
  args.push(image.spec.context);
  runChecked(
    runner,
    { executable: "docker", args, cwd: repositoryRoot },
    `build ${image.spec.key} image`,
  );
  runChecked(
    runner,
    { executable: "docker", args: ["push", tag], cwd: repositoryRoot },
    `push ${image.spec.key} image`,
  );
}

function toReleaseImage(
  config: DeploymentConfig,
  runner: CommandRunner,
  image: PreparedImage,
  revision: string,
): ReleaseImage {
  const digest = image.digest;
  if (digest === undefined)
    throw new Error(`Missing digest for ${image.spec.key}`);
  const scannedDigest = resolveImageScanDigest(
    config,
    runner,
    image.repositoryName,
    digest,
  );
  runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.primaryRegion, [
        "ecr",
        "wait",
        "image-scan-complete",
        "--repository-name",
        image.repositoryName,
        "--image-id",
        `imageDigest=${scannedDigest}`,
      ]),
    },
    `wait for ${image.spec.key} vulnerability scan`,
  );
  const scanResult = runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.primaryRegion, [
        "ecr",
        "describe-image-scan-findings",
        "--repository-name",
        image.repositoryName,
        "--image-id",
        `imageDigest=${scannedDigest}`,
      ]),
    },
    `read ${image.spec.key} vulnerability scan`,
  );
  const scan = parseJson<ScanResponse>(scanResult.stdout, "ECR scan");
  if (
    scan.registryId !== config.accountId ||
    scan.repositoryName !== image.repositoryName ||
    scan.imageId?.imageDigest !== scannedDigest
  ) {
    throw new Error(
      `${image.spec.key} vulnerability scan identity does not match the resolved scanned digest`,
    );
  }
  if (scan.imageScanStatus?.status !== "COMPLETE") {
    throw new Error(
      `${image.spec.key} vulnerability scan did not complete: ${scan.imageScanStatus?.description ?? scan.imageScanStatus?.status ?? "missing status"}`,
    );
  }
  return {
    repositoryName: image.repositoryName,
    repositoryUri: image.repositoryUri,
    immutableTag: revision,
    digest,
    digestUri: `${image.repositoryUri}@${digest}`,
    scan: {
      scannedDigest,
      status: "COMPLETE",
      findings: { ...(scan.imageScanFindings?.findingSeverityCounts ?? {}) },
    },
  };
}

function registryHost(repositoryUri: string | undefined): string {
  if (repositoryUri === undefined)
    throw new Error("No ECR repositories were returned");
  const host = repositoryUri.split("/")[0];
  if (host === undefined || host === "")
    throw new Error("Invalid ECR repository URI");
  return host;
}

function loadExistingManifest(path: string): ReleaseManifest | undefined {
  if (!existsSync(path)) return undefined;
  return parseReleaseManifest(
    JSON.parse(readFileSync(path, "utf8")) as unknown,
  );
}
