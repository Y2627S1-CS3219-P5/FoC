// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: Exact-stack provider log retention and guarded post-deletion cleanup.
// Author review: PENDING.
import { z } from "zod";
import type { DeploymentConfig } from "./config.js";
import { parseJson, runChecked, type CommandRunner } from "./commands.js";
import { DEPLOYMENT_TAGS, STACKS } from "./deployment-names.js";
import { awsArgs, type ValidatedStack } from "./stack-outputs.js";

export interface ProviderLogTarget {
  readonly stackName: string;
  readonly functionName: string;
  readonly region: string;
  readonly logGroupName: string;
}

export const PROVIDER_LOG_RETENTION_DAYS = 14;

const resourcesSchema = z.object({
  StackResourceSummaries: z.array(
    z.object({
      ResourceType: z.string(),
      PhysicalResourceId: z.string().optional(),
    }),
  ),
});

function request(
  config: DeploymentConfig,
  region: string,
  args: readonly string[],
) {
  return { executable: "aws", args: awsArgs(config, region, args) };
}

function validateTarget(
  config: DeploymentConfig,
  target: ProviderLogTarget,
): void {
  const stack = Object.values(STACKS).find(
    ({ name }) => name === target.stackName,
  );
  const region =
    stack?.region === "primary" ? config.primaryRegion : config.edgeRegion;
  if (
    stack === undefined ||
    target.region !== region ||
    !target.functionName.startsWith(`${target.stackName}-`) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(target.functionName) ||
    target.logGroupName !== `/aws/lambda/${target.functionName}`
  ) {
    throw new Error(
      "Refusing provider log lifecycle outside an exact FoC stack/default group",
    );
  }
}

export function captureProviderLogTargets(
  config: DeploymentConfig,
  runner: CommandRunner,
  stacks: readonly ValidatedStack[],
): readonly ProviderLogTarget[] {
  const targets: ProviderLogTarget[] = [];
  for (const stack of stacks) {
    const result = runChecked(
      runner,
      request(config, stack.region, [
        "cloudformation",
        "list-stack-resources",
        "--stack-name",
        stack.name,
      ]),
      `capture exact provider resources for ${stack.name}`,
    );
    const parsed = resourcesSchema.safeParse(
      parseJson<unknown>(result.stdout, "provider stack resources"),
    );
    if (!parsed.success)
      throw new Error(
        `Missing or malformed provider resource inventory for ${stack.name}`,
      );
    for (const resource of parsed.data.StackResourceSummaries) {
      if (resource.ResourceType !== "AWS::Lambda::Function") continue;
      const target: ProviderLogTarget = {
        stackName: stack.name,
        functionName: resource.PhysicalResourceId ?? "",
        region: stack.region,
        logGroupName: `/aws/lambda/${resource.PhysicalResourceId ?? ""}`,
      };
      validateTarget(config, target);
      const response = runChecked(
        runner,
        request(config, target.region, [
          "lambda",
          "get-function-configuration",
          "--function-name",
          target.functionName,
        ]),
        `verify exact provider logging for ${target.functionName}`,
      );
      const fn = parseJson<{
        FunctionName?: string;
        FunctionArn?: string;
        LoggingConfig?: { LogGroup?: string };
      }>(response.stdout, "provider function configuration");
      if (
        fn.FunctionName !== target.functionName ||
        fn.FunctionArn !==
          `arn:aws:lambda:${target.region}:${config.accountId}:function:${target.functionName}` ||
        (fn.LoggingConfig?.LogGroup !== undefined &&
          fn.LoggingConfig.LogGroup !== target.logGroupName)
      ) {
        throw new Error(
          `Provider ${target.functionName} has an unexpected identity or custom/shared log destination; manual review required`,
        );
      }
      targets.push(target);
    }
  }
  return targets;
}

function readExactGroup(
  config: DeploymentConfig,
  runner: CommandRunner,
  target: ProviderLogTarget,
) {
  const response = runChecked(
    runner,
    request(config, target.region, [
      "logs",
      "describe-log-groups",
      "--log-group-name-prefix",
      target.logGroupName,
    ]),
    `inspect exact provider group ${target.logGroupName}`,
  );
  const parsed = z
    .object({
      logGroups: z.array(
        z.object({
          logGroupName: z.string(),
          retentionInDays: z.number().int().optional(),
        }),
      ),
    })
    .safeParse(parseJson<unknown>(response.stdout, "provider log groups"));
  if (!parsed.success)
    throw new Error(
      `Malformed provider log-group inventory for ${target.logGroupName}`,
    );
  return parsed.data.logGroups.find(
    ({ logGroupName }) => logGroupName === target.logGroupName,
  );
}

/** CDK creates some core providers after aspects; keep their default groups exact. */
export function ensureProviderLogRetention(
  config: DeploymentConfig,
  runner: CommandRunner,
  stack: ValidatedStack,
): void {
  const targets = captureProviderLogTargets(config, runner, [stack]);
  for (const target of targets) {
    let group = readExactGroup(config, runner, target);
    if (group === undefined) {
      const created = runner(
        request(config, target.region, [
          "logs",
          "create-log-group",
          "--log-group-name",
          target.logGroupName,
          "--tags",
          JSON.stringify({ ...DEPLOYMENT_TAGS, Owner: config.owner }),
        ]),
      );
      if (
        created.status !== 0 &&
        !/ResourceAlreadyExistsException/.test(created.stderr || created.stdout)
      ) {
        throw new Error(
          `Cannot create exact provider log group ${target.logGroupName}`,
        );
      }
      group = readExactGroup(config, runner, target);
      if (group === undefined)
        throw new Error(
          `Provider group ${target.logGroupName} is still missing after creation`,
        );
    }
    if (group.retentionInDays !== PROVIDER_LOG_RETENTION_DAYS) {
      runChecked(
        runner,
        request(config, target.region, [
          "logs",
          "put-retention-policy",
          "--log-group-name",
          target.logGroupName,
          "--retention-in-days",
          String(PROVIDER_LOG_RETENTION_DAYS),
        ]),
        `bound provider log retention for ${target.functionName}`,
      );
    }
    if (
      readExactGroup(config, runner, target)?.retentionInDays !==
      PROVIDER_LOG_RETENTION_DAYS
    ) {
      throw new Error(
        `Provider group ${target.logGroupName} did not retain the reviewed 14-day policy`,
      );
    }
  }
}

/** Delete captured default groups only after every owning function is absent. */
export function removeProviderLogGroups(
  config: DeploymentConfig,
  runner: CommandRunner,
  targets: readonly ProviderLogTarget[],
): readonly string[] {
  const blocked: string[] = [];
  for (const target of targets) validateTarget(config, target);
  for (const target of targets) {
    const response = runner(
      request(config, target.region, [
        "lambda",
        "get-function-configuration",
        "--function-name",
        target.functionName,
      ]),
    );
    if (
      response.status === 0 ||
      !/ResourceNotFoundException/.test(response.stderr || response.stdout)
    ) {
      blocked.push(
        `provider-function-not-confirmed-absent:${target.region}:${target.functionName}`,
      );
    }
  }
  if (blocked.length > 0) return blocked;
  for (const target of targets) {
    try {
      if (readExactGroup(config, runner, target) === undefined) continue;
      const result = runner(
        request(config, target.region, [
          "logs",
          "delete-log-group",
          "--log-group-name",
          target.logGroupName,
        ]),
      );
      if (
        result.status !== 0 &&
        !/ResourceNotFoundException/.test(result.stderr || result.stdout)
      ) {
        blocked.push(
          `provider-log-cleanup-failed:${target.region}:${target.logGroupName}`,
        );
      }
    } catch {
      blocked.push(
        `provider-log-cleanup-check-failed:${target.region}:${target.logGroupName}`,
      );
    }
  }
  return blocked;
}
