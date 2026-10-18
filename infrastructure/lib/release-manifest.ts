import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { resolve } from "node:path";
import { z } from "zod";
import { ConfigurationError } from "./config.js";

const digestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "must be an immutable sha256 digest");

const imageScanSchema = z
  .object({
    status: z.literal("COMPLETE"),
    findings: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();

const releaseImageSchema = z
  .object({
    repositoryName: z.string().trim().min(1),
    repositoryUri: z.string().trim().min(1),
    immutableTag: z
      .string()
      .regex(/^[0-9a-f]{40}$/, "must equal a full Git commit SHA"),
    digest: digestSchema,
    digestUri: z.string().regex(/@sha256:[0-9a-f]{64}$/),
    scan: imageScanSchema,
  })
  .strict()
  .superRefine((image, context) => {
    if (image.digestUri !== `${image.repositoryUri}@${image.digest}`) {
      context.addIssue({
        code: "custom",
        message: "digestUri must combine repositoryUri and digest",
        path: ["digestUri"],
      });
    }
  });

export const releaseManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    accountId: z.string().regex(/^\d{12}$/),
    region: z.literal("ap-southeast-1"),
    sourceRevision: z
      .string()
      .regex(/^[0-9a-f]{40}$/, "must be a full lowercase Git commit SHA"),
    builtAt: z.string().datetime({ offset: true }),
    images: z
      .object({
        frontend: releaseImageSchema,
        userService: releaseImageSchema,
        supplierService: releaseImageSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, context) => {
    for (const [component, image] of Object.entries(manifest.images)) {
      if (image.immutableTag !== manifest.sourceRevision) {
        context.addIssue({
          code: "custom",
          message: "immutableTag must equal sourceRevision",
          path: ["images", component, "immutableTag"],
        });
      }
    }
  });

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type ReleaseImage =
  ReleaseManifest["images"][keyof ReleaseManifest["images"]];

export function parseReleaseManifest(input: unknown): ReleaseManifest {
  const parsed = releaseManifestSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`)
      .join("\n");
    throw new ConfigurationError(`Invalid release manifest:\n${details}`);
  }
  return parsed.data;
}

export function loadReleaseManifest(path = process.env.FOC_RELEASE_MANIFEST): {
  readonly manifest: ReleaseManifest;
  readonly path: string;
} {
  if (path === undefined || path.trim() === "") {
    throw new ConfigurationError(
      "FOC_RELEASE_MANIFEST must point to a reviewed immutable release manifest",
    );
  }
  const absolutePath = resolve(path);
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError(`Cannot read ${absolutePath}: ${reason}`);
  }
  return { manifest: parseReleaseManifest(input), path: absolutePath };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function releaseManifestHash(manifest: ReleaseManifest): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(manifest)))
    .digest("hex");
}

export function writeReleaseManifest(
  path: string,
  manifest: ReleaseManifest,
): void {
  const parsed = parseReleaseManifest(manifest);
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, absolutePath);
  chmodSync(absolutePath, 0o600);
}
