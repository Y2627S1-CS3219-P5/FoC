import type { DeploymentConfig } from "../lib/config.js";

const alarm = {
  threshold: 1,
  evaluationPeriods: 2,
  periodSeconds: 60,
} as const;

export function validConfig(): DeploymentConfig {
  return {
    accountId: "656253649128",
    awsProfile: "foc-dev",
    primaryRegion: "ap-southeast-1",
    edgeRegion: "us-east-1",
    owner: "course-team-owner",
    alertEmail: "alerts@u.nus.edu",
    monthlyBudgetUsd: 110,
    bootstrapAdministrator: {
      username: "demo_admin",
      email: "demo_admin@u.nus.edu",
    },
    services: {
      frontend: {
        cpu: 256,
        memoryMiB: 1024,
        cpuTargetPercent: 60,
        memoryTargetPercent: 70,
      },
      userService: {
        cpu: 256,
        memoryMiB: 1024,
        cpuTargetPercent: 60,
        memoryTargetPercent: 70,
      },
      supplierService: {
        cpu: 256,
        memoryMiB: 1024,
        cpuTargetPercent: 60,
        memoryTargetPercent: 70,
      },
    },
    waf: {
      global: {
        requestsPerEvaluationWindow: 2000,
        evaluationWindowSeconds: 300,
      },
      authentication: {
        requestsPerEvaluationWindow: 200,
        evaluationWindowSeconds: 300,
      },
    },
    alarms: {
      unhealthyFrontendTargets: alarm,
      applicationServerErrors: alarm,
      ecsCpuPercent: { ...alarm, threshold: 80 },
      ecsMemoryPercent: { ...alarm, threshold: 80 },
      rdsFreeStorageBytes: { ...alarm, threshold: 2_000_000_000 },
      rdsCpuPercent: { ...alarm, threshold: 80 },
      rdsConnections: { ...alarm, threshold: 50 },
      ecsDeploymentFailures: alarm,
    },
    database: {
      allocatedStorageGiB: 20,
      maximumStorageGiB: 100,
      backupRetentionDays: 1,
    },
    monthlyUsage: {
      taskHours: {
        frontend: 730,
        userService: 730,
        supplierService: 730,
      },
      rdsInstanceHours: 730,
      albHours: 730,
      albCapacityUnitHours: 73,
      cloudFrontRequests: 100_000,
      cloudFrontDataOutGb: 10,
      wafRequests: 100_000,
      secretsApiRequests: 1_000,
      ecrStorageGbMonths: 3,
      logIngestionGb: 1,
      logStorageGbMonths: 1,
      cloudWatchAlarmMetrics: 12,
      rdsBackupStorageGbMonths: 0,
      oneOffJobVcpuHours: 0,
      oneOffJobMemoryGbHours: 0,
    },
    costApproval: {
      approvedBy: "course-team-leader",
      approvedAt: "2026-10-18T08:00:00.000Z",
      pricingCalculatorEstimateUrl:
        "https://calculator.aws/#/estimate?id=reviewed",
    },
    quotaApproval: {
      confirmedBy: "course-team-leader",
      confirmedAt: "2026-10-18T08:00:00.000Z",
      evidenceReference: "NUS quota confirmation ticket EXAMPLE-1",
    },
  };
}
