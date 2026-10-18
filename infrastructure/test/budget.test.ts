// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: budget permission fallback, exact configuration, and deletion tests.
// Author review: PENDING.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ensureMonitoringBudget,
  readMonitoringBudget,
  removeMonitoringBudget,
} from "../lib/budget.js";
import {
  parseJson,
  type CommandRequest,
  type CommandRunner,
} from "../lib/commands.js";
import { validConfig } from "./fixtures.js";
import { failure, success } from "./release-tooling-fixtures.js";

test("creates only the exact account-wide monitoring budget with two email alerts", () => {
  const config = validConfig();
  config.monthlyBudgetUsd = 60;
  const calls: CommandRequest[] = [];
  const runner: CommandRunner = (request) => {
    calls.push(request);
    return request.args[1] === "describe-budget"
      ? failure("NotFoundException")
      : success();
  };
  const result = ensureMonitoringBudget(config, runner);
  assert.equal(result.state, "CREATED");
  const create = calls[1]!;
  const budget = parseJson<unknown>(
    create.args[create.args.indexOf("--budget") + 1]!,
    "created budget",
  );
  assert.deepEqual(budget, {
    BudgetName: "foc-demo-monthly",
    BudgetLimit: { Amount: "60", Unit: "USD" },
    TimeUnit: "MONTHLY",
    BudgetType: "COST",
  });
  const alerts = parseJson<{ Notification: { Threshold: number } }[]>(
    create.args[create.args.indexOf("--notifications-with-subscribers") + 1]!,
    "created notifications",
  );
  assert.deepEqual(
    alerts.map(
      (row: { Notification: { Threshold: number } }) =>
        row.Notification.Threshold,
    ),
    [80, 100],
  );
  assert.ok(create.args.includes("us-east-1"));
  assert.ok(create.args.includes(config.accountId));
  assert.equal(
    create.args.some((arg) => arg.includes("BudgetActions")),
    false,
  );
});

test("records optional Budgets permission denial but fails other errors", () => {
  assert.equal(
    ensureMonitoringBudget(validConfig(), () =>
      failure("AccessDeniedException: explicit deny"),
    ).state,
    "PERMISSION_UNAVAILABLE",
  );
  assert.throws(
    () =>
      ensureMonitoringBudget(validConfig(), () =>
        failure("ThrottlingException"),
      ),
    /Read FoC budget failed/,
  );
});

test("never overwrites or deletes a same-name budget with different settings", () => {
  const runner = () =>
    success(
      JSON.stringify({
        Budget: {
          BudgetName: "foc-demo-monthly",
          BudgetLimit: { Amount: "999", Unit: "USD" },
        },
      }),
    );
  assert.throws(() => readMonitoringBudget(validConfig(), runner), /differs/);
  assert.throws(() => removeMonitoringBudget(validConfig(), runner), /differs/);
});

test("verifies omitted notification threshold types with explicit percentage subscriber lookups", () => {
  const config = validConfig();
  const runner: CommandRunner = (request) => {
    switch (request.args[1]) {
      case "describe-budget":
        return success(
          JSON.stringify({
            Budget: {
              BudgetName: "foc-demo-monthly",
              BudgetLimit: {
                Amount: String(config.monthlyBudgetUsd),
                Unit: "USD",
              },
              TimeUnit: "MONTHLY",
              BudgetType: "COST",
            },
          }),
        );
      case "describe-notifications-for-budget":
        return success(
          JSON.stringify({
            Notifications: [
              {
                NotificationType: "ACTUAL",
                ComparisonOperator: "GREATER_THAN",
                Threshold: 80,
                NotificationState: "OK",
              },
              {
                NotificationType: "FORECASTED",
                ComparisonOperator: "GREATER_THAN",
                Threshold: 100,
                NotificationState: "OK",
              },
            ],
          }),
        );
      case "describe-subscribers-for-notification": {
        const notification = parseJson<Record<string, unknown>>(
          request.args[request.args.indexOf("--notification") + 1]!,
          "canonical percentage lookup",
        );
        assert.ok(
          notification.NotificationType === "ACTUAL" ||
            notification.NotificationType === "FORECASTED",
        );
        assert.deepEqual(notification, {
          NotificationType: notification.NotificationType,
          ComparisonOperator: "GREATER_THAN",
          Threshold: notification.NotificationType === "ACTUAL" ? 80 : 100,
          ThresholdType: "PERCENTAGE",
        });
        return success(
          JSON.stringify({
            Subscribers: [
              { SubscriptionType: "EMAIL", Address: config.alertEmail },
            ],
          }),
        );
      }
      default:
        throw new Error("Unexpected or mutating budget command");
    }
  };
  assert.equal(ensureMonitoringBudget(config, runner).state, "MATCHES");
});

test("rejects changed notification values, unverified percentages, and subscribers without mutation", () => {
  const config = validConfig();
  const scenarios = [
    { patch: { ThresholdType: "ABSOLUTE_VALUE" }, expected: /lacks.*ACTUAL/ },
    { patch: { ThresholdType: "UNKNOWN" }, expected: /lacks.*ACTUAL/ },
    { patch: { Threshold: 81 }, expected: /lacks.*ACTUAL/ },
    { patch: { ComparisonOperator: "EQUAL_TO" }, expected: /lacks.*ACTUAL/ },
    {
      patch: {},
      subscriberResponse: failure("NotFoundException"),
      expected: /Read FoC budget subscribers failed/,
    },
    {
      patch: {},
      subscriberResponse: success(
        JSON.stringify({
          Subscribers: [
            { SubscriptionType: "EMAIL", Address: "different@u.nus.edu" },
          ],
        }),
      ),
      expected: /lacks the configured email subscriber/,
    },
  ];
  for (const scenario of scenarios) {
    const runner: CommandRunner = (request) => {
      switch (request.args[1]) {
        case "describe-budget":
          return success(
            JSON.stringify({
              Budget: {
                BudgetName: "foc-demo-monthly",
                BudgetLimit: {
                  Amount: String(config.monthlyBudgetUsd),
                  Unit: "USD",
                },
                TimeUnit: "MONTHLY",
                BudgetType: "COST",
              },
            }),
          );
        case "describe-notifications-for-budget":
          return success(
            JSON.stringify({
              Notifications: [
                {
                  NotificationType: "ACTUAL",
                  ComparisonOperator: "GREATER_THAN",
                  Threshold: 80,
                  NotificationState: "OK",
                  ...scenario.patch,
                },
                {
                  NotificationType: "FORECASTED",
                  ComparisonOperator: "GREATER_THAN",
                  Threshold: 100,
                  NotificationState: "OK",
                },
              ],
            }),
          );
        case "describe-subscribers-for-notification":
          return scenario.subscriberResponse ?? success("{}");
        default:
          throw new Error("Unexpected or mutating budget command");
      }
    };
    assert.throws(
      () => ensureMonitoringBudget(config, runner),
      scenario.expected,
    );
    assert.throws(
      () => removeMonitoringBudget(config, runner),
      scenario.expected,
    );
  }
});

test("validates subscribers and deletes only the matching budget then checks absence", () => {
  const config = validConfig();
  let deleted = false;
  const calls: CommandRequest[] = [];
  const runner: CommandRunner = (request) => {
    calls.push(request);
    switch (request.args[1]) {
      case "describe-budget":
        return deleted
          ? failure("NotFoundException")
          : success(
              JSON.stringify({
                Budget: {
                  BudgetName: "foc-demo-monthly",
                  BudgetLimit: {
                    Amount: String(config.monthlyBudgetUsd),
                    Unit: "USD",
                  },
                  TimeUnit: "MONTHLY",
                  BudgetType: "COST",
                },
              }),
            );
      case "describe-notifications-for-budget":
        return success(
          JSON.stringify({
            Notifications: [
              ["ACTUAL", 80],
              ["FORECASTED", 100],
            ].map(([NotificationType, Threshold]) => ({
              NotificationType,
              Threshold,
              ThresholdType: "PERCENTAGE",
              ComparisonOperator: "GREATER_THAN",
            })),
          }),
        );
      case "describe-subscribers-for-notification":
        return success(
          JSON.stringify({
            Subscribers: [
              { SubscriptionType: "EMAIL", Address: config.alertEmail },
            ],
          }),
        );
      case "delete-budget":
        deleted = true;
        return success();
      default:
        throw new Error("Unexpected budget command");
    }
  };
  assert.equal(removeMonitoringBudget(config, runner).state, "ABSENT");
  assert.equal(
    calls.filter(({ args }) => args[1] === "delete-budget").length,
    1,
  );
});
