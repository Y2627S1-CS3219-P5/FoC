// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const regionSchema = z.enum(["ap-southeast-1"]);
const edgeRegionSchema = z.enum(["us-east-1"]);

const serviceSizingSchema = z
  .object({
    cpu: z.number().int().positive(),
    memoryMiB: z.number().int().positive(),
    cpuTargetPercent: z.number().int().min(1).max(100),
    memoryTargetPercent: z.number().int().min(1).max(100),
  })
  .strict();

const alarmSchema = z
  .object({
    threshold: z.number().nonnegative(),
    evaluationPeriods: z.number().int().positive(),
    periodSeconds: z
      .number()
      .int()
      .positive()
      .refine(
        (period) => period % 60 === 0,
        "must be a multiple of 60 seconds for standard-resolution metrics",
      ),
  })
  .strict();

const runningTaskShortfallAlarmSchema = alarmSchema.refine(
  ({ threshold }) => threshold >= 1,
  "threshold must be at least one missing task",
);

const rateRuleSchema = z
  .object({
    requestsPerEvaluationWindow: z.number().int().min(10),
    evaluationWindowSeconds: z.union([
      z.literal(60),
      z.literal(120),
      z.literal(300),
      z.literal(600),
    ]),
  })
  .strict();

const taskHoursSchema = z
  .object({
    frontend: z.number().min(0).max(1460),
    userService: z.number().min(0).max(1460),
    supplierService: z.number().min(0).max(1460),
  })
  .strict();

const validFargateMemory = new Map<number, ReadonlySet<number>>([
  [256, new Set([512, 1024, 2048])],
  [512, new Set([1024, 2048, 3072, 4096])],
  [1024, new Set([2048, 3072, 4096, 5120, 6144, 7168, 8192])],
  [
    2048,
    new Set(Array.from({ length: 13 }, (_, index) => 4096 + index * 1024)),
  ],
  [
    4096,
    new Set(Array.from({ length: 23 }, (_, index) => 8192 + index * 1024)),
  ],
  [
    8192,
    new Set(Array.from({ length: 12 }, (_, index) => 16384 + index * 4096)),
  ],
  [
    16384,
    new Set(Array.from({ length: 12 }, (_, index) => 32768 + index * 8192)),
  ],
]);

function isValidFargateSize({
  cpu,
  memoryMiB,
}: z.infer<typeof serviceSizingSchema>): boolean {
  return validFargateMemory.get(cpu)?.has(memoryMiB) ?? false;
}

export const deploymentConfigSchema = z
  .object({
    accountId: z
      .string()
      .regex(/^\d{12}$/, "must be a 12-digit AWS account ID"),
    awsProfile: z.string().trim().min(1),
    primaryRegion: regionSchema,
    edgeRegion: edgeRegionSchema,
    owner: z.string().trim().min(1),
    alertEmail: z.string().email(),
    monthlyBudgetUsd: z.number().positive(),
    budgetAlerts: z
      .object({
        actualPercent: z.number().positive().max(100),
        forecastPercent: z.number().positive().max(100),
      })
      .strict(),
    bootstrapAdministrator: z
      .object({
        username: z
          .string()
          .trim()
          .regex(
            /^[A-Za-z0-9_]{3,30}$/,
            "must be 3-30 letters, digits, or underscores",
          ),
        email: z.string().email().endsWith("@u.nus.edu"),
      })
      .strict(),
    services: z
      .object({
        frontend: serviceSizingSchema,
        userService: serviceSizingSchema,
        supplierService: serviceSizingSchema,
      })
      .strict()
      .refine(
        ({ frontend, supplierService, userService }) =>
          [frontend, supplierService, userService].every(isValidFargateSize),
        "each service must use a valid AWS Fargate CPU/memory combination",
      ),
    registry: z
      .object({
        retainedImageCount: z.number().int().positive(),
      })
      .strict(),
    waf: z
      .object({
        global: rateRuleSchema,
        authentication: rateRuleSchema,
      })
      .strict()
      .refine(
        ({ authentication, global }) =>
          authentication.requestsPerEvaluationWindow <
          global.requestsPerEvaluationWindow,
        "authentication rate limit must be stricter than the global limit",
      ),
    alarms: z
      .object({
        unhealthyFrontendTargets: alarmSchema,
        applicationServerErrors: alarmSchema,
        ecsRunningTaskShortfall: runningTaskShortfallAlarmSchema,
        ecsCpuPercent: alarmSchema,
        ecsMemoryPercent: alarmSchema,
        rdsFreeStorageBytes: alarmSchema,
        rdsCpuPercent: alarmSchema,
        rdsConnections: alarmSchema,
        ecsDeploymentFailures: alarmSchema,
      })
      .strict(),
    database: z
      .object({
        allocatedStorageGiB: z.number().int().min(20),
        maximumStorageGiB: z.number().int().positive(),
        backupRetentionDays: z.number().int().min(1).max(7),
      })
      .strict()
      .refine(
        ({ allocatedStorageGiB, maximumStorageGiB }) =>
          maximumStorageGiB >= Math.ceil(allocatedStorageGiB * 1.1),
        "maximumStorageGiB must be at least 110% of allocatedStorageGiB for RDS storage autoscaling",
      ),
    monthlyUsage: z
      .object({
        taskHours: taskHoursSchema,
        rdsInstanceHours: z.number().min(0).max(730),
        albHours: z.number().min(0).max(730),
        albCapacityUnitHours: z.number().nonnegative(),
        cloudFrontRequests: z.number().int().nonnegative(),
        cloudFrontDataOutGb: z.number().nonnegative(),
        wafRequests: z.number().int().nonnegative(),
        secretsApiRequests: z.number().int().nonnegative(),
        ecrStorageGbMonths: z.number().nonnegative(),
        logIngestionGb: z.number().nonnegative(),
        logStorageGbMonths: z.number().nonnegative(),
        // 15 explicit alarms (3 list two metrics) plus 12 target-tracking alarms.
        cloudWatchAlarmMetrics: z.number().int().min(30),
        rdsBackupStorageGbMonths: z.number().nonnegative(),
        oneOffJobVcpuHours: z.number().nonnegative(),
        oneOffJobMemoryGbHours: z.number().nonnegative(),
      })
      .strict(),
    costApproval: z
      .object({
        approvedBy: z.string().trim().min(1),
        approvedAt: z.string().datetime({ offset: true }),
        evidenceKind: z.literal("REPOSITORY_PRICING_SNAPSHOT"),
      })
      .strict(),
    quotaApproval: z
      .object({
        serviceQuotasApiRestriction: z.literal(
          "NUS_ORGANIZATIONS_SCP_EXPLICIT_DENY",
        ),
        reviewedQuota: z.literal("fargate:L-3032A538"),
        confirmedBy: z.string().trim().min(1),
        confirmedAt: z.string().datetime({ offset: true }),
        evidenceReference: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict();

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function configFingerprint(config: DeploymentConfig): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(config)))
    .digest("hex");
}

export function parseDeploymentConfig(input: unknown): DeploymentConfig {
  const parsed = deploymentConfigSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("\n");
    throw new ConfigurationError(
      `Invalid deployment configuration:\n${details}`,
    );
  }
  return parsed.data;
}

export function loadDeploymentConfig(
  path = process.env.FOC_DEPLOYMENT_CONFIG,
): {
  readonly config: DeploymentConfig;
  readonly path: string;
} {
  if (path === undefined || path.trim() === "") {
    throw new ConfigurationError(
      "FOC_DEPLOYMENT_CONFIG must point to a reviewed deployment configuration file",
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
  return { config: parseDeploymentConfig(input), path: absolutePath };
}
