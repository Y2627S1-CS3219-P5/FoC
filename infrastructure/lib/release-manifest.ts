import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { ConfigurationError } from "./config.js";

const digestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "must be an immutable sha256 digest");

export const releaseManifestSchema = z
  .object({
    sourceRevision: z
      .string()
      .regex(/^[0-9a-f]{40}$/, "must be a full lowercase Git commit SHA"),
    images: z
      .object({
        frontend: digestSchema,
        userService: digestSchema,
        supplierService: digestSchema,
      })
      .strict(),
  })
  .strict();

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

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
