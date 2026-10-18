// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: exact-name monitoring-only budget creation, inspection, and teardown.
// Author review: PENDING.
import type { DeploymentConfig } from "./config.js";
import {
  parseJson,
  runChecked,
  safeCommandFailure,
  type CommandRunner,
} from "./commands.js";
import { awsArgs } from "./stack-outputs.js";

export const BUDGET_NAME = "foc-demo-monthly";
export interface BudgetEvidence {
  readonly name: typeof BUDGET_NAME;
  readonly scope: "ACCOUNT_WIDE";
  readonly state: "CREATED" | "MATCHES" | "ABSENT" | "PERMISSION_UNAVAILABLE";
  readonly actualPercent: number;
  readonly forecastPercent: number;
}

function evidence(
  config: DeploymentConfig,
  state: BudgetEvidence["state"],
): BudgetEvidence {
  return {
    name: BUDGET_NAME,
    scope: "ACCOUNT_WIDE",
    state,
    ...config.budgetAlerts,
  };
}
function command(config: DeploymentConfig, args: readonly string[]) {
  return {
    executable: "aws",
    args: awsArgs(config, config.edgeRegion, [
      "budgets",
      ...args,
      "--account-id",
      config.accountId,
    ]),
  };
}
function permissionUnavailable(stderr: string): boolean {
  return /AccessDenied(?:Exception)?|not authorized to perform|explicit deny/i.test(
    stderr,
  );
}
function missing(stderr: string): boolean {
  return /NotFoundException/i.test(stderr);
}

export function readMonitoringBudget(
  config: DeploymentConfig,
  runner: CommandRunner,
): BudgetEvidence {
  const response = runner(
    command(config, ["describe-budget", "--budget-name", BUDGET_NAME]),
  );
  if (response.status !== 0) {
    if (permissionUnavailable(response.stderr))
      return evidence(config, "PERMISSION_UNAVAILABLE");
    if (missing(response.stderr)) return evidence(config, "ABSENT");
    throw new Error(`Read FoC budget failed: ${safeCommandFailure(response)}`);
  }
  const { Budget: budget } = parseJson<{
    Budget?: {
      BudgetName?: string;
      BudgetLimit?: { Amount?: string; Unit?: string };
      TimeUnit?: string;
      BudgetType?: string;
      CostFilters?: Record<string, unknown>;
      BillingViewArn?: string;
    };
  }>(response.stdout, "FoC budget");
  if (
    budget?.BudgetName !== BUDGET_NAME ||
    Number(budget.BudgetLimit?.Amount) !== config.monthlyBudgetUsd ||
    budget.BudgetLimit?.Unit !== "USD" ||
    budget.TimeUnit !== "MONTHLY" ||
    budget.BudgetType !== "COST" ||
    Object.keys(budget.CostFilters ?? {}).length !== 0 ||
    budget.BillingViewArn !== undefined
  ) {
    throw new Error(
      "Existing foc-demo-monthly budget differs from the reviewed account-wide configuration; refusing to overwrite it",
    );
  }
  const notifications = runner(
    command(config, [
      "describe-notifications-for-budget",
      "--budget-name",
      BUDGET_NAME,
    ]),
  );
  if (notifications.status !== 0) {
    if (permissionUnavailable(notifications.stderr))
      return evidence(config, "PERMISSION_UNAVAILABLE");
    throw new Error(
      `Read FoC budget notifications failed: ${safeCommandFailure(notifications)}`,
    );
  }
  const rows =
    parseJson<{
      Notifications?: {
        NotificationType?: string;
        ComparisonOperator?: string;
        Threshold?: number;
        ThresholdType?: string;
      }[];
    }>(notifications.stdout, "budget notifications").Notifications ?? [];
  for (const [type, threshold] of [
    ["ACTUAL", config.budgetAlerts.actualPercent],
    ["FORECASTED", config.budgetAlerts.forecastPercent],
  ] as const) {
    const notification = rows.find(
      (row) =>
        row.NotificationType === type &&
        row.Threshold === threshold &&
        (row.ThresholdType === undefined ||
          row.ThresholdType === "PERCENTAGE") &&
        row.ComparisonOperator === "GREATER_THAN",
    );
    if (!notification)
      throw new Error(`FoC budget lacks the reviewed ${type} notification`);
    const subscribers = runner(
      command(config, [
        "describe-subscribers-for-notification",
        "--budget-name",
        BUDGET_NAME,
        "--notification",
        // AWS may omit optional ThresholdType and return transient state. Verify
        // the exact percentage notification with its canonical lookup identity.
        JSON.stringify({
          NotificationType: type,
          ComparisonOperator: "GREATER_THAN",
          Threshold: threshold,
          ThresholdType: "PERCENTAGE",
        }),
      ]),
    );
    if (subscribers.status !== 0) {
      if (permissionUnavailable(subscribers.stderr))
        return evidence(config, "PERMISSION_UNAVAILABLE");
      throw new Error(
        `Read FoC budget subscribers failed: ${safeCommandFailure(subscribers)}`,
      );
    }
    const addresses =
      parseJson<{
        Subscribers?: { SubscriptionType?: string; Address?: string }[];
      }>(subscribers.stdout, "budget subscribers").Subscribers ?? [];
    if (
      !addresses.some(
        (row) =>
          row.SubscriptionType === "EMAIL" && row.Address === config.alertEmail,
      )
    )
      throw new Error(
        `FoC budget ${type} notification lacks the configured email subscriber`,
      );
  }
  return evidence(config, "MATCHES");
}

export function ensureMonitoringBudget(
  config: DeploymentConfig,
  runner: CommandRunner,
): BudgetEvidence {
  const current = readMonitoringBudget(config, runner);
  if (current.state !== "ABSENT") return current;
  const notifications = (
    [
      ["ACTUAL", config.budgetAlerts.actualPercent],
      ["FORECASTED", config.budgetAlerts.forecastPercent],
    ] as const
  ).map(([NotificationType, Threshold]) => ({
    Notification: {
      NotificationType,
      ComparisonOperator: "GREATER_THAN",
      Threshold,
      ThresholdType: "PERCENTAGE",
    },
    Subscribers: [{ SubscriptionType: "EMAIL", Address: config.alertEmail }],
  }));
  const result = runner(
    command(config, [
      "create-budget",
      "--budget",
      JSON.stringify({
        BudgetName: BUDGET_NAME,
        BudgetLimit: { Amount: String(config.monthlyBudgetUsd), Unit: "USD" },
        TimeUnit: "MONTHLY",
        BudgetType: "COST",
      }),
      "--notifications-with-subscribers",
      JSON.stringify(notifications),
      "--resource-tags",
      "Key=Project,Value=FoC",
      "Key=Environment,Value=demo",
    ]),
  );
  if (result.status !== 0) {
    if (permissionUnavailable(result.stderr))
      return evidence(config, "PERMISSION_UNAVAILABLE");
    throw new Error(`Create FoC budget failed: ${safeCommandFailure(result)}`);
  }
  return evidence(config, "CREATED");
}

export function removeMonitoringBudget(
  config: DeploymentConfig,
  runner: CommandRunner,
): BudgetEvidence {
  const current = readMonitoringBudget(config, runner);
  if (current.state === "ABSENT" || current.state === "PERMISSION_UNAVAILABLE")
    return current;
  runChecked(
    runner,
    command(config, ["delete-budget", "--budget-name", BUDGET_NAME]),
    "delete exact FoC monitoring budget",
  );
  return readMonitoringBudget(config, runner);
}
