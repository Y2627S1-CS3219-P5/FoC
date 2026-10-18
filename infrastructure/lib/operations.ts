// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import type { DeploymentConfig } from "./config.js";
import {
  BUDGET_NAME,
  readMonitoringBudget,
  removeMonitoringBudget,
  type BudgetEvidence,
} from "./budget.js";
import {
  parseJson,
  runChecked,
  safeCommandFailure,
  type CommandResult,
  type CommandRunner,
} from "./commands.js";
import {
  REPOSITORY_NAMES,
  SERVICE_LOG_OUTPUTS,
  SERVICE_NAMES,
  SERVICE_OUTPUTS,
  SERVICE_START_ORDER,
  SERVICE_STOP_ORDER,
  STACKS,
  type ServiceKey,
  type StackKey,
} from "./deployment-names.js";
import { runReadinessSmoke } from "./smoke.js";
import {
  assertAwsIdentity,
  awsArgs,
  loadValidatedStack,
  requireOutput,
  type ValidatedStack,
} from "./stack-outputs.js";

interface RdsResponse {
  readonly DBInstances?: readonly {
    readonly DBInstanceIdentifier?: string;
    readonly DBInstanceStatus?: string;
    readonly AutomaticRestartTime?: string;
  }[];
}

interface ServicesResponse {
  readonly failures?: readonly {
    readonly arn?: string;
    readonly reason?: string;
  }[];
  readonly services?: readonly {
    readonly serviceName?: string;
    readonly desiredCount?: number;
    readonly runningCount?: number;
    readonly pendingCount?: number;
    readonly taskDefinition?: string;
    readonly deployments?: readonly {
      readonly status?: string;
      readonly rolloutState?: string;
      readonly taskDefinition?: string;
    }[];
  }[];
}

interface TaskDefinitionResponse {
  readonly taskDefinition?: {
    readonly containerDefinitions?: readonly { readonly image?: string }[];
  };
}

interface TargetHealthResponse {
  readonly TargetHealthDescriptions?: readonly {
    readonly Target?: { readonly Id?: string };
    readonly TargetHealth?: {
      readonly State?: string;
      readonly Reason?: string;
    };
  }[];
}

interface AlarmsResponse {
  readonly MetricAlarms?: readonly {
    readonly AlarmName?: string;
    readonly StateValue?: string;
  }[];
  readonly CompositeAlarms?: readonly {
    readonly AlarmName?: string;
    readonly StateValue?: string;
  }[];
}

interface SubscriptionsResponse {
  readonly Subscriptions?: readonly {
    readonly Endpoint?: string;
    readonly SubscriptionArn?: string;
  }[];
}

export interface OperationContext {
  readonly config: DeploymentConfig;
  readonly runner: CommandRunner;
}

export interface ServiceStatus {
  readonly name: string;
  readonly desired: number;
  readonly running: number;
  readonly pending: number;
  readonly rolloutState: string;
  readonly taskDefinition: string;
  readonly images: readonly string[];
}

export interface EnvironmentStatus {
  readonly accountId: string;
  readonly callerArn: string;
  readonly profile: string;
  readonly configFingerprint: string;
  readonly stacks: Readonly<Record<StackKey, string>>;
  readonly cloudFrontUrl: string;
  readonly distributionState: string;
  readonly database: {
    readonly identifier: string;
    readonly state: string;
    readonly automaticRestartTime?: string;
  };
  readonly services: Readonly<Record<ServiceKey, ServiceStatus>>;
  readonly targetHealth: readonly {
    readonly id: string;
    readonly state: string;
    readonly reason?: string;
  }[];
  readonly alarmsNotOk: readonly {
    readonly name: string;
    readonly state: string;
  }[];
  readonly pendingSnsConfirmation: boolean;
  readonly monthlyBudgetUsd: number;
  readonly monitoringBudget: BudgetEvidence;
  readonly costApproval: DeploymentConfig["costApproval"];
  readonly trackingPortalReminder: string;
}

export function startEnvironment(context: OperationContext): void {
  const inventory = operationalInventory(context);
  const databaseState = readDatabase(
    context,
    requireOutput(inventory.data, "DatabaseInstanceIdentifier"),
  );
  if (databaseState.state === "stopped") {
    awsMutation(
      context,
      [
        "rds",
        "start-db-instance",
        "--db-instance-identifier",
        databaseState.identifier,
      ],
      "start RDS",
    );
    awsWait(
      context,
      [
        "rds",
        "wait",
        "db-instance-available",
        "--db-instance-identifier",
        databaseState.identifier,
      ],
      "wait for RDS availability",
    );
  } else if (databaseState.state !== "available") {
    throw new Error(
      `RDS ${databaseState.identifier} is ${databaseState.state}; wait for a stable available/stopped state`,
    );
  }
  for (const key of SERVICE_START_ORDER) {
    setScaling(context, inventory, key, 1, 2, false);
    updateDesiredCount(context, inventory, key, 1);
  }
  waitAndVerifyServices(context, inventory, 1);
  runReadinessSmoke(
    context.runner,
    requireOutput(inventory.edge, "DistributionDomainName"),
  );
}

export function stopEnvironment(context: OperationContext): {
  readonly automaticRestartTime?: string;
} {
  const inventory = operationalInventory(context);
  for (const key of SERVICE_STOP_ORDER) {
    setScaling(context, inventory, key, 0, 0, true);
    updateDesiredCount(context, inventory, key, 0);
  }
  waitAndVerifyServices(context, inventory, 0);
  const database = readDatabase(
    context,
    requireOutput(inventory.data, "DatabaseInstanceIdentifier"),
  );
  if (database.state === "available") {
    awsMutation(
      context,
      [
        "rds",
        "stop-db-instance",
        "--db-instance-identifier",
        database.identifier,
      ],
      "stop RDS",
    );
    awsWait(
      context,
      [
        "rds",
        "wait",
        "db-instance-stopped",
        "--db-instance-identifier",
        database.identifier,
      ],
      "wait for RDS stop",
    );
  } else if (database.state !== "stopped") {
    throw new Error(
      `RDS ${database.identifier} is ${database.state}; refusing another stop mutation`,
    );
  }
  const stopped = readDatabase(context, database.identifier);
  return stopped.automaticRestartTime === undefined
    ? {}
    : { automaticRestartTime: stopped.automaticRestartTime };
}

export function waitForApplicationServices(context: OperationContext): void {
  assertAwsIdentity(context.config, context.runner);
  const inventory = loadServiceInventory(context);
  waitAndVerifyServices(context, inventory, 1);
}

export function readEnvironmentStatus(
  context: OperationContext,
  configFingerprint: string,
): EnvironmentStatus {
  const identity = assertAwsIdentity(context.config, context.runner);
  const inventory = loadInventory(context);
  const cluster = requireOutput(inventory.foundation, "ClusterName");
  const namesByKey = serviceNames(inventory.application);
  const response = describeServices(
    context,
    cluster,
    Object.values(namesByKey),
  );
  const services = Object.fromEntries(
    (Object.keys(namesByKey) as ServiceKey[]).map((key) => {
      const name = namesByKey[key];
      const service = response.services?.find(
        ({ serviceName }) => serviceName === name,
      );
      if (service === undefined)
        throw new Error(`ECS did not return service ${name}`);
      const primary = service.deployments?.filter(
        ({ status }) => status === "PRIMARY",
      );
      const taskDefinition = service.taskDefinition ?? "<missing>";
      return [
        key,
        {
          name,
          desired: service.desiredCount ?? -1,
          running: service.runningCount ?? -1,
          pending: service.pendingCount ?? -1,
          rolloutState: primary?.[0]?.rolloutState ?? "UNKNOWN",
          taskDefinition,
          images: readTaskImages(context, taskDefinition),
        } satisfies ServiceStatus,
      ];
    }),
  ) as Readonly<Record<ServiceKey, ServiceStatus>>;
  const database = readDatabase(
    context,
    requireOutput(inventory.data, "DatabaseInstanceIdentifier"),
  );
  const targets = awsRead<TargetHealthResponse>(
    context,
    [
      "elbv2",
      "describe-target-health",
      "--target-group-arn",
      requireOutput(inventory.application, "FrontendTargetGroupArn"),
    ],
    "read frontend target health",
  );
  const alarms = awsRead<AlarmsResponse>(
    context,
    ["cloudwatch", "describe-alarms", "--alarm-name-prefix", "foc-demo"],
    "read FoC alarms",
  );
  const alarmRows = [
    ...(alarms.MetricAlarms ?? []),
    ...(alarms.CompositeAlarms ?? []),
  ]
    .filter(({ StateValue }) => StateValue !== "OK")
    .map(({ AlarmName, StateValue }) => ({
      name: AlarmName ?? "<unnamed>",
      state: StateValue ?? "UNKNOWN",
    }));
  const subscriptions = awsRead<SubscriptionsResponse>(
    context,
    [
      "sns",
      "list-subscriptions-by-topic",
      "--topic-arn",
      requireOutput(inventory.application, "AlertTopicArn"),
    ],
    "read alarm subscriptions",
  );
  const distribution = awsRead<{
    readonly Distribution?: { readonly Status?: string };
  }>(
    context,
    [
      "cloudfront",
      "get-distribution",
      "--id",
      requireOutput(inventory.edge, "DistributionId"),
    ],
    "read CloudFront distribution",
    context.config.edgeRegion,
  );
  return {
    accountId: identity.accountId,
    callerArn: identity.arn,
    profile: context.config.awsProfile,
    configFingerprint,
    stacks: Object.fromEntries(
      (Object.keys(inventory) as StackKey[]).map((key) => [
        key,
        inventory[key].status,
      ]),
    ) as Readonly<Record<StackKey, string>>,
    cloudFrontUrl: `https://${requireOutput(inventory.edge, "DistributionDomainName")}`,
    distributionState: distribution.Distribution?.Status ?? "UNKNOWN",
    database,
    services,
    targetHealth: (targets.TargetHealthDescriptions ?? []).map(
      ({ Target, TargetHealth }) => ({
        id: Target?.Id ?? "<unknown>",
        state: TargetHealth?.State ?? "UNKNOWN",
        ...(TargetHealth?.Reason === undefined
          ? {}
          : { reason: TargetHealth.Reason }),
      }),
    ),
    alarmsNotOk: alarmRows,
    pendingSnsConfirmation: (subscriptions.Subscriptions ?? []).some(
      ({ SubscriptionArn }) => SubscriptionArn === "PendingConfirmation",
    ),
    monthlyBudgetUsd: context.config.monthlyBudgetUsd,
    monitoringBudget: readMonitoringBudget(context.config, context.runner),
    costApproval: context.config.costApproval,
    trackingPortalReminder:
      "Use the NUS tracking portal for authoritative remaining project credit; stopped services are not zero-cost.",
  };
}

export function assertDestroyConfirmation(
  config: DeploymentConfig,
  allowDataLoss: boolean,
  confirmation: string | undefined,
): void {
  if (!allowDataLoss) throw new Error("destroy requires --allow-data-loss");
  const expected = `foc-demo:DESTROY:${config.accountId}`;
  if (confirmation !== expected) {
    throw new Error(`destroy requires --confirm ${expected}`);
  }
}

export function destroyEnvironment(
  context: OperationContext,
  allowDataLoss: boolean,
  confirmation: string | undefined,
): readonly string[] {
  assertDestroyConfirmation(context.config, allowDataLoss, confirmation);
  assertAwsIdentity(context.config, context.runner);
  const inventory = loadInventory(context);
  const residualTargets = captureResidualTargets(inventory);
  for (const key of ["edge", "application", "data", "foundation"] as const) {
    const stack = STACKS[key];
    const region =
      stack.region === "primary"
        ? context.config.primaryRegion
        : context.config.edgeRegion;
    runChecked(
      context.runner,
      {
        executable: "aws",
        args: awsArgs(context.config, region, [
          "cloudformation",
          "delete-stack",
          "--stack-name",
          stack.name,
        ]),
      },
      `delete exact stack ${stack.name}`,
    );
    runChecked(
      context.runner,
      {
        executable: "aws",
        args: awsArgs(context.config, region, [
          "cloudformation",
          "wait",
          "stack-delete-complete",
          "--stack-name",
          stack.name,
        ]),
      },
      `wait for exact stack ${stack.name} deletion`,
    );
  }
  const budget = removeMonitoringBudget(context.config, context.runner);
  return [
    ...inspectResiduals(context, residualTargets),
    ...(budget.state === "ABSENT"
      ? []
      : [`budget:${BUDGET_NAME}:${budget.state}`]),
  ];
}

function operationalInventory(
  context: OperationContext,
): ReturnType<typeof loadInventory> {
  assertAwsIdentity(context.config, context.runner);
  return loadInventory(context);
}

function loadInventory(context: OperationContext): {
  readonly foundation: ValidatedStack;
  readonly data: ValidatedStack;
  readonly application: ValidatedStack;
  readonly edge: ValidatedStack;
} {
  const services = loadServiceInventory(context);
  return {
    foundation: services.foundation,
    data: loadValidatedStack(context.config, context.runner, "data", [
      "DatabaseInstanceIdentifier",
    ]),
    application: services.application,
    edge: loadValidatedStack(context.config, context.runner, "edge", [
      "DistributionDomainName",
      "DistributionId",
    ]),
  };
}

function loadServiceInventory(context: OperationContext): {
  readonly foundation: ValidatedStack;
  readonly application: ValidatedStack;
} {
  return {
    foundation: loadValidatedStack(
      context.config,
      context.runner,
      "foundation",
      ["ClusterName"],
    ),
    application: loadValidatedStack(
      context.config,
      context.runner,
      "application",
      [
        "FrontendServiceName",
        "UserServiceServiceName",
        "SupplierServiceServiceName",
        "FrontendTargetGroupArn",
        "AlertTopicArn",
      ],
    ),
  };
}

function readDatabase(
  context: OperationContext,
  identifier: string,
): EnvironmentStatus["database"] {
  const response = awsRead<RdsResponse>(
    context,
    ["rds", "describe-db-instances", "--db-instance-identifier", identifier],
    "read exact RDS instance",
  );
  const database = response.DBInstances?.[0];
  if (
    database?.DBInstanceIdentifier !== identifier ||
    database.DBInstanceStatus === undefined
  ) {
    throw new Error(`RDS did not return exact instance ${identifier}`);
  }
  return {
    identifier,
    state: database.DBInstanceStatus,
    ...(database.AutomaticRestartTime === undefined
      ? {}
      : { automaticRestartTime: database.AutomaticRestartTime }),
  };
}

function serviceNames(
  application: ValidatedStack,
): Readonly<Record<ServiceKey, string>> {
  return Object.fromEntries(
    (Object.keys(SERVICE_NAMES) as ServiceKey[]).map((key) => {
      const value = requireOutput(application, SERVICE_OUTPUTS[key]);
      if (value !== SERVICE_NAMES[key]) {
        throw new Error(`Unexpected ECS service output ${value} for ${key}`);
      }
      return [key, value];
    }),
  ) as Readonly<Record<ServiceKey, string>>;
}

function setScaling(
  context: OperationContext,
  inventory: ReturnType<typeof loadInventory>,
  key: ServiceKey,
  min: number,
  max: number,
  suspended: boolean,
): void {
  const cluster = requireOutput(inventory.foundation, "ClusterName");
  const name = serviceNames(inventory.application)[key];
  awsMutation(
    context,
    [
      "application-autoscaling",
      "register-scalable-target",
      "--service-namespace",
      "ecs",
      "--scalable-dimension",
      "ecs:service:DesiredCount",
      "--resource-id",
      `service/${cluster}/${name}`,
      "--min-capacity",
      String(min),
      "--max-capacity",
      String(max),
      "--suspended-state",
      `DynamicScalingInSuspended=${suspended},DynamicScalingOutSuspended=${suspended},ScheduledScalingSuspended=${suspended}`,
    ],
    `set ${name} autoscaling ${min}..${max}`,
  );
}

function updateDesiredCount(
  context: OperationContext,
  inventory: ReturnType<typeof loadInventory>,
  key: ServiceKey,
  desired: number,
): void {
  awsMutation(
    context,
    [
      "ecs",
      "update-service",
      "--cluster",
      requireOutput(inventory.foundation, "ClusterName"),
      "--service",
      serviceNames(inventory.application)[key],
      "--desired-count",
      String(desired),
    ],
    `set ${key} desired count to ${desired}`,
  );
}

function waitAndVerifyServices(
  context: OperationContext,
  inventory: ReturnType<typeof loadServiceInventory>,
  expectedDesired: number,
): void {
  const cluster = requireOutput(inventory.foundation, "ClusterName");
  const names = Object.values(serviceNames(inventory.application));
  awsWait(
    context,
    [
      "ecs",
      "wait",
      "services-stable",
      "--cluster",
      cluster,
      "--services",
      ...names,
    ],
    "wait for ECS services",
  );
  const response = describeServices(context, cluster, names);
  if ((response.failures?.length ?? 0) > 0)
    throw new Error("ECS returned service failures");
  for (const name of names) {
    const service = response.services?.find(
      ({ serviceName }) => serviceName === name,
    );
    const primary =
      service?.deployments?.filter(({ status }) => status === "PRIMARY") ?? [];
    if (
      service?.desiredCount !== expectedDesired ||
      service.runningCount !== expectedDesired ||
      service.pendingCount !== 0 ||
      primary.length !== 1 ||
      (expectedDesired > 0 && primary[0]?.rolloutState !== "COMPLETED")
    ) {
      throw new Error(
        `ECS service ${name} did not reach verified steady state`,
      );
    }
  }
}

function describeServices(
  context: OperationContext,
  cluster: string,
  names: readonly string[],
): ServicesResponse {
  return awsRead<ServicesResponse>(
    context,
    ["ecs", "describe-services", "--cluster", cluster, "--services", ...names],
    "read ECS services",
  );
}

function readTaskImages(
  context: OperationContext,
  taskDefinition: string,
): readonly string[] {
  if (taskDefinition === "<missing>") return [];
  const response = awsRead<TaskDefinitionResponse>(
    context,
    ["ecs", "describe-task-definition", "--task-definition", taskDefinition],
    `read task definition ${taskDefinition}`,
  );
  return (response.taskDefinition?.containerDefinitions ?? []).flatMap(
    ({ image }) => (image === undefined ? [] : [image]),
  );
}

function awsRead<T>(
  context: OperationContext,
  args: readonly string[],
  label: string,
  region: string = context.config.primaryRegion,
): T {
  const result = runChecked(
    context.runner,
    { executable: "aws", args: awsArgs(context.config, region, args) },
    label,
  );
  return parseJson<T>(result.stdout, label);
}

function awsMutation(
  context: OperationContext,
  args: readonly string[],
  label: string,
): void {
  runChecked(
    context.runner,
    {
      executable: "aws",
      args: awsArgs(context.config, context.config.primaryRegion, args),
    },
    label,
  );
}

function awsWait(
  context: OperationContext,
  args: readonly string[],
  label: string,
): void {
  awsMutation(context, args, label);
}

interface ResidualTargets {
  readonly clusterName: string;
  readonly databaseIdentifier: string;
  readonly distributionId: string;
  readonly logGroups: readonly string[];
}

function captureResidualTargets(
  inventory: ReturnType<typeof loadInventory>,
): ResidualTargets {
  return {
    clusterName: requireOutput(inventory.foundation, "ClusterName"),
    databaseIdentifier: requireOutput(
      inventory.data,
      "DatabaseInstanceIdentifier",
    ),
    distributionId: requireOutput(inventory.edge, "DistributionId"),
    logGroups: [
      ...Object.values(SERVICE_LOG_OUTPUTS).flatMap((key) => {
        const value = inventory.application.outputs[key];
        return value === undefined ? [] : [value];
      }),
      "/foc/demo/jobs/database-bootstrap",
      "/foc/demo/jobs/user-migration",
      "/foc/demo/jobs/supplier-migration",
      "/foc/demo/jobs/supplier-seed",
      "/aws/ecs/containerinsights/foc-demo-cluster/performance",
      "/foc/demo/events/ecs-deployment-failures",
    ],
  };
}

function inspectResiduals(
  context: OperationContext,
  targets: ResidualTargets,
): readonly string[] {
  const residuals: string[] = [];
  for (const [key, stack] of Object.entries(STACKS) as [
    StackKey,
    (typeof STACKS)[StackKey],
  ][]) {
    const region =
      stack.region === "primary"
        ? context.config.primaryRegion
        : context.config.edgeRegion;
    if (
      resourceStillExists(
        context.runner({
          executable: "aws",
          args: awsArgs(context.config, region, [
            "cloudformation",
            "describe-stacks",
            "--stack-name",
            stack.name,
          ]),
        }),
        /ValidationError.*(?:does not exist|not exist)/i,
      )
    )
      residuals.push(`stack:${key}`);
  }
  for (const repository of Object.values(REPOSITORY_NAMES)) {
    if (
      resourceStillExists(
        context.runner({
          executable: "aws",
          args: awsArgs(context.config, context.config.primaryRegion, [
            "ecr",
            "describe-repositories",
            "--repository-names",
            repository,
          ]),
        }),
        /RepositoryNotFoundException/i,
      )
    )
      residuals.push(`ecr:${repository}`);
  }
  if (
    resourceStillExists(
      context.runner({
        executable: "aws",
        args: awsArgs(context.config, context.config.primaryRegion, [
          "ecs",
          "describe-clusters",
          "--clusters",
          targets.clusterName,
        ]),
      }),
      undefined,
      true,
    )
  )
    residuals.push(`ecs:${targets.clusterName}`);
  if (
    resourceStillExists(
      context.runner({
        executable: "aws",
        args: awsArgs(context.config, context.config.primaryRegion, [
          "rds",
          "describe-db-instances",
          "--db-instance-identifier",
          targets.databaseIdentifier,
        ]),
      }),
      /DBInstanceNotFound/i,
    )
  )
    residuals.push(`rds:${targets.databaseIdentifier}`);
  if (
    resourceStillExists(
      context.runner({
        executable: "aws",
        args: awsArgs(context.config, context.config.edgeRegion, [
          "cloudfront",
          "get-distribution",
          "--id",
          targets.distributionId,
        ]),
      }),
      /NoSuchDistribution/i,
    )
  )
    residuals.push(`cloudfront:${targets.distributionId}`);
  for (const logGroup of targets.logGroups) {
    const result = context.runner({
      executable: "aws",
      args: awsArgs(context.config, context.config.primaryRegion, [
        "logs",
        "describe-log-groups",
        "--log-group-name-prefix",
        logGroup,
      ]),
    });
    if (result.status !== 0) {
      residuals.push(`logs-check-failed:${logGroup}`);
      continue;
    }
    const response = parseJson<{
      readonly logGroups?: readonly { readonly logGroupName?: string }[];
    }>(result.stdout, "CloudWatch Logs residual check");
    if (
      (response.logGroups ?? []).some(
        ({ logGroupName }) => logGroupName === logGroup,
      )
    ) {
      residuals.push(`logs:${logGroup}`);
    }
  }
  for (const region of [
    context.config.primaryRegion,
    context.config.edgeRegion,
  ]) {
    const tagged = context.runner({
      executable: "aws",
      args: awsArgs(context.config, region, [
        "resourcegroupstaggingapi",
        "get-resources",
        "--tag-filters",
        "Key=Project,Values=FoC",
        "Key=Environment,Values=demo",
      ]),
    });
    if (tagged.status === 0) {
      const response = parseJson<{
        readonly ResourceTagMappingList?: readonly unknown[];
      }>(tagged.stdout, `tagged residual check in ${region}`);
      if ((response.ResourceTagMappingList?.length ?? 0) > 0)
        residuals.push(`tagged-resources:${region}`);
    } else {
      residuals.push(`tagged-resource-check-failed:${region}`);
    }
  }
  return residuals;
}

function resourceStillExists(
  result: CommandResult,
  expectedNotFound?: RegExp,
  inspectCluster = false,
): boolean {
  if (result.status !== 0) {
    const diagnostic = result.stderr || result.stdout;
    if (expectedNotFound?.test(diagnostic) === true) return false;
    throw new Error(
      `Residual inspection failed: ${safeCommandFailure(result)}`,
    );
  }
  if (!inspectCluster) return true;
  try {
    const response = parseJson<{
      readonly clusters?: readonly { readonly status?: string }[];
    }>(result.stdout, "ECS residual check");
    return (response.clusters ?? []).some(
      ({ status }) => status !== "INACTIVE",
    );
  } catch {
    return true;
  }
}
