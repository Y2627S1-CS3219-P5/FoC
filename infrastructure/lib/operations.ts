// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import type { DeploymentConfig } from "./config.js";
import type { ProviderLogTarget } from "./provider-logs.js";
import { readMonitoringBudget, type BudgetEvidence } from "./budget.js";
import { parseJson, runChecked, type CommandRunner } from "./commands.js";
import {
  SERVICE_NAMES,
  SERVICE_OUTPUTS,
  SERVICE_START_ORDER,
  SERVICE_STOP_ORDER,
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
    readonly Protocol?: string;
    readonly TopicArn?: string;
    readonly Owner?: string;
  }[];
}

export interface OperationContext {
  readonly config: DeploymentConfig;
  readonly runner: CommandRunner;
  readonly recordProviderLogTargets?: (
    targets: readonly ProviderLogTarget[],
  ) => void;
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
  readonly snsDeliveryReady: boolean;
  readonly snsSubscriptionState:
    "CONFIRMED" | "PENDING" | "MISSING" | "MISMATCHED";
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
  const topicArn = requireOutput(inventory.application, "AlertTopicArn");
  const expectedTopic = `arn:aws:sns:${context.config.primaryRegion}:${context.config.accountId}:foc-demo-alerts`;
  const rows = subscriptions.Subscriptions ?? [];
  const matching = rows.filter(
    (subscription) =>
      topicArn === expectedTopic &&
      subscription.TopicArn === topicArn &&
      subscription.Owner === context.config.accountId &&
      subscription.Protocol === "email" &&
      subscription.Endpoint === context.config.alertEmail,
  );
  const confirmed = matching.some(
    ({ SubscriptionArn }) =>
      SubscriptionArn?.startsWith(`${topicArn}:`) === true &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        SubscriptionArn.slice(topicArn.length + 1),
      ),
  );
  const snsSubscriptionState = confirmed
    ? "CONFIRMED"
    : matching.some(
          ({ SubscriptionArn }) => SubscriptionArn === "PendingConfirmation",
        )
      ? "PENDING"
      : rows.length === 0
        ? "MISSING"
        : "MISMATCHED";
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
    pendingSnsConfirmation: snsSubscriptionState === "PENDING",
    snsDeliveryReady: confirmed,
    snsSubscriptionState,
    monthlyBudgetUsd: context.config.monthlyBudgetUsd,
    monitoringBudget: readMonitoringBudget(context.config, context.runner),
    costApproval: context.config.costApproval,
    trackingPortalReminder:
      "Use the NUS tracking portal for authoritative remaining project credit; stopped services are not zero-cost.",
  };
}

export {
  assertDestroyConfirmation,
  destroyEnvironment,
} from "./destroy-environment.js";

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
