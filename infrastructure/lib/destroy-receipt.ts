// Contributor: @ron (AI-assisted).
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: Owner-only exact-stack teardown inventory and resume integrity checks.
// Author review: PENDING.
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { z } from "zod";
import { canonicalJson } from "./canonical-json.js";
import { configFingerprint, type DeploymentConfig } from "./config.js";
import { DEPLOYMENT_TAGS, STACKS } from "./deployment-names.js";

export const resourceSummarySchema = z
  .object({
    LogicalResourceId: z.string().optional(),
    ResourceType: z.string(),
    PhysicalResourceId: z.string().optional(),
    ResourceStatus: z.string().optional(),
  })
  .strict();

const capturedStackSchema = z
  .object({
    name: z.string(),
    region: z.string(),
    arn: z.string().nullable(),
    resources: z.array(resourceSummarySchema),
  })
  .strict();
const providerSchema = z
  .object({
    stackName: z.string(),
    functionName: z.string(),
    region: z.string(),
    logGroupName: z.string(),
  })
  .strict();
const receiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    accountId: z.string(),
    owner: z.string(),
    ownershipTags: z.record(z.string(), z.string()),
    primaryRegion: z.string(),
    edgeRegion: z.string(),
    configFingerprint: z.string(),
    capturedAt: z.string().datetime(),
    stacks: z
      .object({
        foundation: capturedStackSchema,
        data: capturedStackSchema,
        application: capturedStackSchema,
        edge: capturedStackSchema,
      })
      .strict(),
    providerLogs: z.array(providerSchema),
    inventorySha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type DestroyReceipt = z.infer<typeof receiptSchema>;
export type CapturedDestroyStack =
  DestroyReceipt["stacks"][keyof DestroyReceipt["stacks"]];

export function sealDestroyReceipt(
  input: Omit<DestroyReceipt, "inventorySha256">,
): DestroyReceipt {
  return {
    ...input,
    inventorySha256: createHash("sha256")
      .update(canonicalJson(input))
      .digest("hex"),
  };
}

export function parseDestroyReceipt(
  input: unknown,
  config: DeploymentConfig,
): DestroyReceipt {
  const receipt = receiptSchema.parse(input);
  const { inventorySha256, ...unsigned } = receipt;
  if (sealDestroyReceipt(unsigned).inventorySha256 !== inventorySha256)
    throw new Error(
      "Teardown receipt integrity mismatch; refusing modified inventory",
    );
  if (
    receipt.accountId !== config.accountId ||
    receipt.owner !== config.owner ||
    receipt.primaryRegion !== config.primaryRegion ||
    receipt.edgeRegion !== config.edgeRegion ||
    receipt.configFingerprint !== configFingerprint(config)
  ) {
    throw new Error(
      "Teardown receipt belongs to a different account, owner, region, or reviewed configuration",
    );
  }
  if (
    canonicalJson(receipt.ownershipTags) !==
    canonicalJson({ ...DEPLOYMENT_TAGS, Owner: config.owner })
  ) {
    throw new Error(
      "Teardown receipt ownership tags do not match the reviewed FoC environment",
    );
  }
  for (const key of Object.keys(STACKS) as (keyof typeof STACKS)[]) {
    const stack = receipt.stacks[key];
    const definition = STACKS[key];
    const region =
      definition.region === "primary"
        ? config.primaryRegion
        : config.edgeRegion;
    if (
      stack.name !== definition.name ||
      stack.region !== region ||
      (stack.arn !== null &&
        !stack.arn.startsWith(
          `arn:aws:cloudformation:${region}:${config.accountId}:stack/${definition.name}/`,
        )) ||
      (stack.arn === null && stack.resources.length > 0)
    ) {
      throw new Error(
        `Teardown receipt has an invalid exact stack identity for ${key}`,
      );
    }
  }
  for (const provider of receipt.providerLogs) {
    const stack = Object.values(receipt.stacks).find(
      ({ name, region }) =>
        name === provider.stackName && region === provider.region,
    );
    if (
      stack?.arn === null ||
      stack === undefined ||
      provider.logGroupName !== `/aws/lambda/${provider.functionName}` ||
      !provider.functionName.startsWith(`${stack.name}-`) ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(provider.functionName) ||
      !stack.resources.some(
        (resource) =>
          resource.ResourceType === "AWS::Lambda::Function" &&
          resource.PhysicalResourceId === provider.functionName,
      )
    ) {
      throw new Error(
        "Teardown receipt provider is not proven by the captured exact stack resources",
      );
    }
  }
  return receipt;
}

export function readDestroyReceipt(
  path: string,
  config: DeploymentConfig,
): DestroyReceipt {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid !== undefined && stat.uid !== process.getuid())
  ) {
    throw new Error(
      "Teardown receipt must be a regular owner-only file belonging to the current operator",
    );
  }
  return parseDestroyReceipt(
    JSON.parse(readFileSync(path, "utf8")) as unknown,
    config,
  );
}
