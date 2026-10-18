// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: Resolve immutable runnable ECR scan targets without dropping attestations.
// Author review: PENDING.
import { z } from "zod";
import type { DeploymentConfig } from "./config.js";
import { parseJson, runChecked, type CommandRunner } from "./commands.js";
import { awsArgs } from "./stack-outputs.js";

const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const imageTypes = [
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
] as const;
const descriptorSchema = z.object({
  mediaType: z.string().min(1),
  digest: digestSchema,
  size: z.number().int().nonnegative(),
});
const imageManifestSchema = z.object({
  schemaVersion: z.literal(2),
  mediaType: z.enum(imageTypes),
  config: descriptorSchema.extend({
    mediaType: z.enum([
      "application/vnd.oci.image.config.v1+json",
      "application/vnd.docker.container.image.v1+json",
    ]),
  }),
  layers: z.array(descriptorSchema),
  artifactType: z.undefined().optional(),
});
const manifestSchema = z.discriminatedUnion("mediaType", [
  imageManifestSchema,
  z.object({
    schemaVersion: z.literal(2),
    mediaType: z.enum([
      "application/vnd.oci.image.index.v1+json",
      "application/vnd.docker.distribution.manifest.list.v2+json",
    ]),
    manifests: z.array(
      descriptorSchema.extend({
        platform: z
          .object({ os: z.string(), architecture: z.string() })
          .optional(),
        annotations: z.record(z.string(), z.string()).optional(),
        artifactType: z.string().optional(),
      }),
    ),
  }),
]);
const responseSchema = z.object({
  failures: z.array(z.unknown()).max(0).optional(),
  images: z
    .array(
      z.object({
        registryId: z.string(),
        repositoryName: z.string(),
        imageId: z.object({ imageDigest: digestSchema }),
        imageManifest: z.string().min(1),
        imageManifestMediaType: z.string().optional(),
      }),
    )
    .length(1),
});

function readManifest(
  config: DeploymentConfig,
  runner: CommandRunner,
  repositoryName: string,
  digest: string,
): z.infer<typeof manifestSchema> {
  const result = runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.primaryRegion, [
        "ecr",
        "batch-get-image",
        "--repository-name",
        repositoryName,
        "--image-ids",
        `imageDigest=${digest}`,
      ]),
    },
    `read immutable manifest ${repositoryName}@${digest}`,
  );
  const response = responseSchema.safeParse(
    parseJson<unknown>(result.stdout, "ECR image manifest response"),
  );
  if (!response.success) {
    throw new Error(
      `ECR returned a missing, failed, or malformed manifest for ${repositoryName}@${digest}`,
    );
  }
  const image = response.data.images[0]!;
  if (
    image.registryId !== config.accountId ||
    image.repositoryName !== repositoryName ||
    image.imageId.imageDigest !== digest
  ) {
    throw new Error(
      `ECR manifest identity does not match ${repositoryName}@${digest}`,
    );
  }
  const parsed = manifestSchema.safeParse(
    parseJson<unknown>(image.imageManifest, "ECR image manifest"),
  );
  if (
    !parsed.success ||
    (image.imageManifestMediaType !== undefined &&
      image.imageManifestMediaType !== parsed.data.mediaType)
  ) {
    throw new Error(
      `ECR returned an unsupported or malformed image manifest for ${repositoryName}@${digest}`,
    );
  }
  return parsed.data;
}

/** Keep the index for deployment; ECR scans its runnable platform manifest. */
export function resolveImageScanDigest(
  config: DeploymentConfig,
  runner: CommandRunner,
  repositoryName: string,
  rootDigest: string,
): string {
  const manifest = readManifest(config, runner, repositoryName, rootDigest);
  if (!("manifests" in manifest)) return rootDigest;
  const runnable = manifest.manifests.filter(
    (child) =>
      child.platform?.os === "linux" &&
      child.platform.architecture === "amd64" &&
      imageTypes.some((type) => type === child.mediaType) &&
      child.annotations?.["vnd.docker.reference.type"] === undefined &&
      child.artifactType === undefined,
  );
  if (runnable.length !== 1) {
    throw new Error(
      `Image index ${repositoryName}@${rootDigest} must contain exactly one runnable linux/amd64 manifest`,
    );
  }
  const child = runnable[0]!;
  const childManifest = readManifest(
    config,
    runner,
    repositoryName,
    child.digest,
  );
  if (
    "manifests" in childManifest ||
    childManifest.mediaType !== child.mediaType
  ) {
    throw new Error(
      `Selected linux/amd64 child is not a matching runnable image manifest`,
    );
  }
  return child.digest;
}
