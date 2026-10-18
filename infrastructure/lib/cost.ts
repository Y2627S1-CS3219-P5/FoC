import { createHash } from "node:crypto";
import type { DeploymentConfig } from "./config.js";
import { configFingerprint } from "./config.js";

export interface PricingSnapshot {
  readonly schemaVersion: 1;
  readonly currency: "USD";
  readonly capturedAt: string;
  readonly primaryRegion: "ap-southeast-1";
  readonly rates: Readonly<Record<string, string>>;
  readonly sources: readonly {
    readonly service: string;
    readonly publicationDate: string;
    readonly url: string;
  }[];
}

export interface CostLineItem {
  readonly id: string;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly rateUsd: string;
  readonly rateUnit: string;
  readonly monthlyUsd: string;
}

export interface CostEstimate {
  readonly schemaVersion: 1;
  readonly configFingerprint: string;
  readonly pricingSnapshotSha256: string;
  readonly pricingCapturedAt: string;
  readonly currency: "USD";
  readonly lineItems: readonly CostLineItem[];
  readonly totalMonthlyUsd: string;
  readonly approvedMonthlyBudgetUsd: string;
  readonly withinApprovedBudget: boolean;
  readonly approval: DeploymentConfig["costApproval"];
}

const NANO_SCALE = 1_000_000_000n;
const QUANTITY_SCALE = 1_000_000n;

function decimalToInteger(value: string, decimalPlaces: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (match === null) {
    throw new Error(`Invalid non-negative decimal: ${value}`);
  }
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  if (fraction.length > decimalPlaces) {
    throw new Error(`${value} has more than ${decimalPlaces} decimal places`);
  }
  return BigInt(`${whole}${fraction.padEnd(decimalPlaces, "0")}`);
}

function numberToQuantity(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid quantity: ${value}`);
  }
  return decimalToInteger(value.toFixed(6), 6);
}

function formatScaled(
  value: bigint,
  scale: bigint,
  decimalPlaces: number,
): string {
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimalPlaces, "0");
  return `${whole}.${fraction}`;
}

function formatNanos(value: bigint): string {
  return formatScaled(value, NANO_SCALE, 9);
}

function rateNanos(snapshot: PricingSnapshot, key: string): bigint {
  const rate = snapshot.rates[key];
  if (rate === undefined) {
    throw new Error(`Pricing snapshot is missing rate ${key}`);
  }
  return decimalToInteger(rate, 9);
}

function snapshotHash(snapshot: PricingSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function estimateMonthlyCost(
  config: DeploymentConfig,
  snapshot: PricingSnapshot,
): CostEstimate {
  const lineItems: CostLineItem[] = [];
  let totalNanos = 0n;

  const add = (
    id: string,
    description: string,
    rateKey: string,
    quantity: number,
    unit: string,
    rateUnit: string,
    divisor = 1,
  ): void => {
    const quantityScaled = numberToQuantity(quantity);
    const rate = rateNanos(snapshot, rateKey);
    const divisorScaled = QUANTITY_SCALE * BigInt(divisor);
    const amount = (rate * quantityScaled + divisorScaled / 2n) / divisorScaled;
    totalNanos += amount;
    lineItems.push({
      id,
      description,
      quantity: quantity.toFixed(6),
      unit,
      rateUsd: snapshot.rates[rateKey] ?? "",
      rateUnit,
      monthlyUsd: formatNanos(amount),
    });
  };

  const serviceEntries = [
    [
      "frontend",
      config.services.frontend,
      config.monthlyUsage.taskHours.frontend,
    ],
    [
      "user-service",
      config.services.userService,
      config.monthlyUsage.taskHours.userService,
    ],
    [
      "supplier-service",
      config.services.supplierService,
      config.monthlyUsage.taskHours.supplierService,
    ],
  ] as const;

  for (const [id, sizing, taskHours] of serviceEntries) {
    add(
      `${id}-vcpu`,
      `${id} Fargate vCPU`,
      "fargateVcpuHour",
      (sizing.cpu / 1024) * taskHours,
      "vCPU-hours",
      "vCPU-hour",
    );
    add(
      `${id}-memory`,
      `${id} Fargate memory`,
      "fargateMemoryGbHour",
      (sizing.memoryMiB / 1024) * taskHours,
      "GB-hours",
      "GB-hour",
    );
  }

  add(
    "one-off-vcpu",
    "Database bootstrap, migration, seed, and smoke-job vCPU",
    "fargateVcpuHour",
    config.monthlyUsage.oneOffJobVcpuHours,
    "vCPU-hours",
    "vCPU-hour",
  );
  add(
    "one-off-memory",
    "Database bootstrap, migration, seed, and smoke-job memory",
    "fargateMemoryGbHour",
    config.monthlyUsage.oneOffJobMemoryGbHours,
    "GB-hours",
    "GB-hour",
  );
  const totalTaskHours =
    config.monthlyUsage.taskHours.frontend +
    config.monthlyUsage.taskHours.userService +
    config.monthlyUsage.taskHours.supplierService;
  add(
    "public-ipv4",
    "Public IPv4 addresses assigned to running Fargate tasks",
    "publicIpv4Hour",
    totalTaskHours,
    "address-hours",
    "address-hour",
  );
  add(
    "rds-compute",
    "RDS PostgreSQL Single-AZ db.t4g.micro",
    "rdsPostgresT4gMicroHour",
    config.monthlyUsage.rdsInstanceHours,
    "instance-hours",
    "instance-hour",
  );
  add(
    "rds-storage",
    "RDS gp3 provisioned storage",
    "rdsGp3GbMonth",
    config.database.allocatedStorageGiB,
    "GB-months",
    "GB-month",
  );
  add(
    "rds-backup",
    "RDS backup storage above the free allocation",
    "rdsBackupGbMonth",
    config.monthlyUsage.rdsBackupStorageGbMonths,
    "GB-months",
    "GB-month",
  );
  add(
    "alb-hours",
    "Application Load Balancer",
    "albHour",
    config.monthlyUsage.albHours,
    "hours",
    "hour",
  );
  add(
    "alb-capacity",
    "Application Load Balancer capacity",
    "albLcuHour",
    config.monthlyUsage.albCapacityUnitHours,
    "LCU-hours",
    "LCU-hour",
  );
  add(
    "cloudfront-data",
    "CloudFront Asia-Pacific viewer data transfer",
    "cloudFrontAsiaPacificDataOutGb",
    config.monthlyUsage.cloudFrontDataOutGb,
    "GB",
    "GB",
  );
  add(
    "cloudfront-requests",
    "CloudFront HTTPS requests",
    "cloudFrontHttpsRequestsPer10000",
    config.monthlyUsage.cloudFrontRequests,
    "requests",
    "10,000 requests",
    10_000,
  );
  add(
    "waf-acl",
    "AWS WAF web ACL",
    "wafWebAclMonth",
    1,
    "ACL-month",
    "ACL-month",
  );
  add(
    "waf-rules",
    "Two rate rules and one managed rule group",
    "wafRuleMonth",
    3,
    "rule-months",
    "rule-month",
  );
  add(
    "waf-requests",
    "AWS WAF processed requests",
    "wafRequestsPerMillion",
    config.monthlyUsage.wafRequests,
    "requests",
    "1,000,000 requests",
    1_000_000,
  );
  add(
    "secrets-storage",
    "Eight Secrets Manager secrets",
    "secretsManagerSecretMonth",
    8,
    "secret-months",
    "secret-month",
  );
  add(
    "secrets-requests",
    "Secrets Manager API requests",
    "secretsManagerCallsPer10000",
    config.monthlyUsage.secretsApiRequests,
    "requests",
    "10,000 requests",
    10_000,
  );
  add(
    "logs-ingestion",
    "CloudWatch Logs ingestion",
    "cloudWatchLogIngestionGb",
    config.monthlyUsage.logIngestionGb,
    "GB",
    "GB",
  );
  add(
    "logs-storage",
    "CloudWatch Logs retained storage",
    "cloudWatchLogStorageGbMonth",
    config.monthlyUsage.logStorageGbMonths,
    "GB-months",
    "GB-month",
  );
  add(
    "alarms",
    "CloudWatch standard alarm metrics",
    "cloudWatchAlarmMetricMonth",
    config.monthlyUsage.cloudWatchAlarmMetrics,
    "metric-months",
    "metric-month",
  );
  add(
    "ecr-storage",
    "Private ECR image storage",
    "ecrStorageGbMonth",
    config.monthlyUsage.ecrStorageGbMonths,
    "GB-months",
    "GB-month",
  );
  add(
    "budget",
    "Monitoring-only AWS Budget",
    "monitoringBudgetMonth",
    1,
    "budget-month",
    "budget-month",
  );
  add(
    "ecs-control-plane",
    "ECS and Service Connect control plane",
    "ecsServiceConnectControlPlaneMonth",
    1,
    "month",
    "month",
  );

  const budgetNanos = numberToQuantity(config.monthlyBudgetUsd) * 1000n;
  return {
    schemaVersion: 1,
    configFingerprint: configFingerprint(config),
    pricingSnapshotSha256: snapshotHash(snapshot),
    pricingCapturedAt: snapshot.capturedAt,
    currency: "USD",
    lineItems,
    totalMonthlyUsd: formatNanos(totalNanos),
    approvedMonthlyBudgetUsd: formatNanos(budgetNanos),
    withinApprovedBudget: totalNanos <= budgetNanos,
    approval: config.costApproval,
  };
}

export function pricingSnapshotHash(snapshot: PricingSnapshot): string {
  return snapshotHash(snapshot);
}
