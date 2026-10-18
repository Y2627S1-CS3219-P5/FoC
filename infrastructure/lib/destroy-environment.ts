// Contributor: @ron (AI-assisted).
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: Resumable confirmed teardown of exact captured FoC stack identities.
// Author review: PENDING.
import { z } from "zod";
import { readBootstrapResourceArns } from "./bootstrap-resource-arns.js";
import { BUDGET_NAME, removeMonitoringBudget } from "./budget.js";
import { configFingerprint, type DeploymentConfig } from "./config.js";
import {
  parseJson,
  runChecked,
  safeCommandFailure,
  type CommandRunner,
  type CommandResult,
} from "./commands.js";
import { DEPLOYMENT_TAGS, STACKS, type StackKey } from "./deployment-names.js";
import {
  parseDestroyReceipt,
  resourceSummarySchema,
  sealDestroyReceipt,
  type DestroyReceipt,
  type CapturedDestroyStack,
} from "./destroy-receipt.js";
import {
  captureProviderLogTargets,
  removeProviderLogGroups,
  type ProviderLogTarget,
} from "./provider-logs.js";
import {
  assertAwsIdentity,
  awsArgs,
  loadValidatedStack,
  type ValidatedStack,
} from "./stack-outputs.js";

export interface DestroyContext {
  readonly config: DeploymentConfig;
  readonly runner: CommandRunner;
  readonly resumeReceipt?: unknown;
  readonly recordDestroyReceipt?: (receipt: DestroyReceipt) => void;
  readonly recordProviderLogTargets?: (
    targets: readonly ProviderLogTarget[],
  ) => void;
}

const order = ["edge", "application", "data", "foundation"] as const;

function request(
  context: DestroyContext,
  region: string,
  args: readonly string[],
) {
  return { executable: "aws", args: awsArgs(context.config, region, args) };
}

function readStack(
  context: DestroyContext,
  key: StackKey,
): (ValidatedStack & { readonly arn: string }) | undefined {
  const definition = STACKS[key];
  const region =
    definition.region === "primary"
      ? context.config.primaryRegion
      : context.config.edgeRegion;
  const response = context.runner(
    request(context, region, [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      definition.name,
    ]),
  );
  if (
    response.status !== 0 &&
    /ValidationError.*(?:does not exist|not exist)/i.test(
      response.stderr || response.stdout,
    )
  )
    return undefined;
  if (response.status !== 0)
    throw new Error(
      `Cannot establish exact stack presence for ${definition.name}: ${safeCommandFailure(response)}`,
    );
  const stack = loadValidatedStack(context.config, () => response, key);
  const raw = parseJson<{ Stacks?: { StackId?: string }[] }>(
    response.stdout,
    "teardown stack identity",
  );
  const arn = raw.Stacks?.[0]?.StackId;
  if (
    arn === undefined ||
    !arn.startsWith(
      `arn:aws:cloudformation:${region}:${context.config.accountId}:stack/${definition.name}/`,
    )
  ) {
    throw new Error(
      `Stack ${definition.name} has no valid exact account/region ARN; refusing deletion`,
    );
  }
  if (stack.status === "DELETE_COMPLETE") return undefined;
  return { ...stack, arn };
}

function capture(context: DestroyContext): DestroyReceipt {
  const present: ValidatedStack[] = [];
  const stacks = Object.fromEntries(
    (Object.keys(STACKS) as StackKey[]).map((key) => {
      const definition = STACKS[key];
      const region =
        definition.region === "primary"
          ? context.config.primaryRegion
          : context.config.edgeRegion;
      const stack = readStack(context, key);
      if (stack === undefined)
        return [
          key,
          { name: definition.name, region, arn: null, resources: [] },
        ];
      const response = runChecked(
        context.runner,
        request(context, region, [
          "cloudformation",
          "list-stack-resources",
          "--stack-name",
          stack.arn,
        ]),
        `capture exact resources of ${definition.name}`,
      );
      const resources = z
        .object({
          StackResourceSummaries: z.array(resourceSummarySchema.passthrough()),
        })
        .parse(
          parseJson<unknown>(response.stdout, "teardown resource inventory"),
        )
        .StackResourceSummaries.map((resource) =>
          resourceSummarySchema.parse({
            ResourceType: resource.ResourceType,
            ...(resource.LogicalResourceId === undefined
              ? {}
              : { LogicalResourceId: resource.LogicalResourceId }),
            ...(resource.PhysicalResourceId === undefined
              ? {}
              : { PhysicalResourceId: resource.PhysicalResourceId }),
            ...(resource.ResourceStatus === undefined
              ? {}
              : { ResourceStatus: resource.ResourceStatus }),
          }),
        );
      present.push(stack);
      return [key, { name: stack.name, region, arn: stack.arn, resources }];
    }),
  ) as DestroyReceipt["stacks"];
  const receipt = sealDestroyReceipt({
    schemaVersion: 1,
    accountId: context.config.accountId,
    owner: context.config.owner,
    ownershipTags: { ...DEPLOYMENT_TAGS, Owner: context.config.owner },
    primaryRegion: context.config.primaryRegion,
    edgeRegion: context.config.edgeRegion,
    configFingerprint: configFingerprint(context.config),
    capturedAt: new Date().toISOString(),
    stacks,
    providerLogs: [
      ...captureProviderLogTargets(context.config, context.runner, present),
    ],
  });
  return parseDestroyReceipt(receipt, context.config);
}

function assertCurrentMatches(
  context: DestroyContext,
  key: StackKey,
  captured: CapturedDestroyStack,
): ReturnType<typeof readStack> {
  const current = readStack(context, key);
  if (current !== undefined && current.arn !== captured.arn) {
    throw new Error(
      `Stack ${captured.name} was created/recreated outside the captured teardown inventory; refusing deletion`,
    );
  }
  return current;
}

export function assertDestroyConfirmation(
  config: DeploymentConfig,
  allowDataLoss: boolean,
  confirmation: string | undefined,
): void {
  if (!allowDataLoss) throw new Error("destroy requires --allow-data-loss");
  const expected = `foc-demo:DESTROY:${config.accountId}`;
  if (confirmation !== expected)
    throw new Error(`destroy requires --confirm ${expected}`);
}

export function destroyEnvironment(
  context: DestroyContext,
  allowDataLoss: boolean,
  confirmation: string | undefined,
): readonly string[] {
  assertDestroyConfirmation(context.config, allowDataLoss, confirmation);
  if (context.recordDestroyReceipt === undefined) {
    throw new Error(
      "Teardown requires a trusted atomic owner-only receipt writer before any deletion",
    );
  }
  assertAwsIdentity(context.config, context.runner);
  const receipt =
    context.resumeReceipt === undefined
      ? capture(context)
      : parseDestroyReceipt(context.resumeReceipt, context.config);
  const targets = deriveTargets(receipt);
  // Check every remaining current ARN/tag identity before the first mutation.
  for (const key of order)
    assertCurrentMatches(context, key, receipt.stacks[key]);
  context.recordDestroyReceipt(receipt);
  context.recordProviderLogTargets?.(receipt.providerLogs);
  for (const key of order) {
    const captured = receipt.stacks[key];
    const current = assertCurrentMatches(context, key, captured);
    if (current === undefined || captured.arn === null) continue;
    if (current.status !== "DELETE_IN_PROGRESS") {
      runChecked(
        context.runner,
        request(context, captured.region, [
          "cloudformation",
          "delete-stack",
          "--stack-name",
          captured.arn,
        ]),
        `delete exact stack ${captured.name}`,
      );
    }
    runChecked(
      context.runner,
      request(context, captured.region, [
        "cloudformation",
        "wait",
        "stack-delete-complete",
        "--stack-name",
        captured.arn,
      ]),
      `wait for exact stack ${captured.name} deletion`,
    );
  }
  const providerCleanup = removeProviderLogGroups(
    context.config,
    context.runner,
    receipt.providerLogs,
  );
  const budget = removeMonitoringBudget(context.config, context.runner);
  return [
    ...providerCleanup,
    ...inspectResiduals(context, receipt, targets),
    ...(budget.state === "ABSENT"
      ? []
      : [`budget:${BUDGET_NAME}:${budget.state}`]),
  ];
}

type Target = { readonly name: string; readonly region: string };
interface Targets {
  readonly repositories: Target[];
  readonly clusters: Target[];
  readonly databases: Target[];
  readonly distributions: Target[];
  readonly logs: Target[];
}
const inspectedTypes = new Set([
  "AWS::ECR::Repository",
  "AWS::ECS::Cluster",
  "AWS::RDS::DBInstance",
  "AWS::CloudFront::Distribution",
  "AWS::Logs::LogGroup",
]);

function deriveTargets(receipt: DestroyReceipt): Targets {
  const targets: Targets = {
    repositories: [],
    clusters: [],
    databases: [],
    distributions: [],
    logs: receipt.providerLogs.map(({ logGroupName, region }) => ({
      name: logGroupName,
      region,
    })),
  };
  for (const stack of Object.values(receipt.stacks)) {
    for (const resource of stack.resources) {
      if (!inspectedTypes.has(resource.ResourceType)) continue;
      const name = resource.PhysicalResourceId;
      if (name === undefined) {
        if (resource.ResourceStatus === "DELETE_COMPLETE") continue;
        throw new Error(
          `Cannot resolve ${resource.ResourceType} target ${resource.LogicalResourceId ?? "<unnamed>"} in ${stack.name}: no physical identity (${resource.ResourceStatus ?? "unknown status"}); inspect the partial deployment`,
        );
      }
      const target = { name, region: stack.region };
      switch (resource.ResourceType) {
        case "AWS::ECR::Repository":
          targets.repositories.push(target);
          break;
        case "AWS::ECS::Cluster":
          targets.clusters.push(target);
          break;
        case "AWS::RDS::DBInstance":
          targets.databases.push(target);
          break;
        case "AWS::CloudFront::Distribution":
          targets.distributions.push(target);
          break;
        case "AWS::Logs::LogGroup":
          targets.logs.push(target);
          break;
      }
    }
  }
  return targets;
}

function stillExists(result: CommandResult, missing: RegExp): boolean {
  if (result.status === 0) return true;
  if (missing.test(result.stderr || result.stdout)) return false;
  throw new Error(`Residual inspection failed: ${safeCommandFailure(result)}`);
}

function inspectResiduals(
  context: DestroyContext,
  receipt: DestroyReceipt,
  targets: Targets,
): string[] {
  const residuals: string[] = [];
  for (const key of order)
    if (readStack(context, key) !== undefined) residuals.push(`stack:${key}`);
  for (const [kind, rows, args, missing] of [
    [
      "ecr",
      targets.repositories,
      (name: string) => [
        "ecr",
        "describe-repositories",
        "--repository-names",
        name,
      ],
      /RepositoryNotFoundException/i,
    ],
    [
      "rds",
      targets.databases,
      (name: string) => [
        "rds",
        "describe-db-instances",
        "--db-instance-identifier",
        name,
      ],
      /DBInstanceNotFound/i,
    ],
    [
      "cloudfront",
      targets.distributions,
      (name: string) => ["cloudfront", "get-distribution", "--id", name],
      /NoSuchDistribution/i,
    ],
  ] as const) {
    for (const row of rows)
      if (
        stillExists(
          context.runner(request(context, row.region, args(row.name))),
          missing,
        )
      )
        residuals.push(`${kind}:${row.region}:${row.name}`);
  }
  for (const target of targets.clusters) {
    const result = runChecked(
      context.runner,
      request(context, target.region, [
        "ecs",
        "describe-clusters",
        "--clusters",
        target.name,
      ]),
      "inspect captured ECS cluster",
    );
    const parsed = z
      .object({
        clusters: z.array(z.object({ status: z.string() })),
        failures: z.array(z.object({ reason: z.string() })).optional(),
      })
      .parse(parseJson<unknown>(result.stdout, "ECS residual check"));
    if (
      parsed.clusters.some(({ status }) => status !== "INACTIVE") ||
      parsed.failures?.some(({ reason }) => reason !== "MISSING")
    )
      residuals.push(`ecs:${target.region}:${target.name}`);
  }
  for (const target of targets.logs) {
    const result = context.runner(
      request(context, target.region, [
        "logs",
        "describe-log-groups",
        "--log-group-name-prefix",
        target.name,
      ]),
    );
    if (result.status !== 0) {
      residuals.push(`logs-check-failed:${target.region}:${target.name}`);
      continue;
    }
    const parsed = z
      .object({ logGroups: z.array(z.object({ logGroupName: z.string() })) })
      .parse(parseJson<unknown>(result.stdout, "regional log residue"));
    if (
      parsed.logGroups.some(({ logGroupName }) => logGroupName === target.name)
    )
      residuals.push(`logs:${target.region}:${target.name}`);
  }
  for (const region of [receipt.primaryRegion, receipt.edgeRegion]) {
    const tagged = context.runner(
      request(context, region, [
        "resourcegroupstaggingapi",
        "get-resources",
        "--tag-filters",
        "Key=Project,Values=FoC",
        "Key=Environment,Values=demo",
      ]),
    );
    if (tagged.status !== 0) {
      residuals.push(`tagged-resource-check-failed:${region}`);
      continue;
    }
    const parsed = z
      .object({
        ResourceTagMappingList: z.array(z.object({ ResourceARN: z.string() })),
      })
      .parse(parseJson<unknown>(tagged.stdout, "tagged residue inventory"));
    if (parsed.ResourceTagMappingList.length === 0) continue;
    try {
      const bootstrap = readBootstrapResourceArns(
        context.config,
        context.runner,
        region,
      );
      if (
        parsed.ResourceTagMappingList.some(
          ({ ResourceARN }) => !bootstrap.has(ResourceARN),
        )
      )
        residuals.push(`tagged-resources:${region}`);
    } catch {
      residuals.push(
        `bootstrap-inventory-check-failed:${region}`,
        `tagged-resources:${region}`,
      );
    }
  }
  return residuals;
}
