// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { writeOwnerOnlyJson } from "./private-json.js";
import type { DeploymentConfig } from "./config.js";
import { parseJson, runChecked, type CommandRunner } from "./commands.js";
import { JOBS, type JobDefinition } from "./deployment-names.js";
import type { ReleaseManifest } from "./release-manifest.js";
import {
  assertAwsIdentity,
  awsArgs,
  loadValidatedStack,
  requireOutput,
} from "./stack-outputs.js";

interface TaskDefinitionResponse {
  readonly taskDefinition?: {
    readonly taskDefinitionArn?: string;
    readonly containerDefinitions?: readonly {
      readonly name?: string;
      readonly image?: string;
      readonly essential?: boolean;
    }[];
  };
}

interface RunTaskResponse {
  readonly failures?: readonly {
    readonly arn?: string;
    readonly reason?: string;
  }[];
  readonly tasks?: readonly { readonly taskArn?: string }[];
}

interface DescribeTasksResponse {
  readonly failures?: readonly {
    readonly arn?: string;
    readonly reason?: string;
  }[];
  readonly tasks?: readonly {
    readonly taskArn?: string;
    readonly taskDefinitionArn?: string;
    readonly createdAt?: string;
    readonly startedAt?: string;
    readonly stoppedAt?: string;
    readonly stopCode?: string;
    readonly stoppedReason?: string;
    readonly containers?: readonly {
      readonly name?: string;
      readonly exitCode?: number;
      readonly reason?: string;
    }[];
  }[];
}

export interface JobEvidence {
  readonly job: JobDefinition["key"];
  readonly taskArn: string;
  readonly taskDefinitionArn: string;
  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly stoppedAt?: string;
  readonly stopCode?: string;
  readonly stoppedReason?: string;
  readonly exitCode: number;
}

export interface ReleaseJobsEvidence {
  readonly schemaVersion: 1;
  readonly release: string;
  readonly generatedAt: string;
  readonly jobs: readonly JobEvidence[];
}

export interface RunReleaseJobsOptions {
  readonly config: DeploymentConfig;
  readonly manifest: ReleaseManifest;
  readonly runner: CommandRunner;
  readonly now?: Date;
  readonly evidencePath?: string;
}

export function runReleaseJobs(
  options: RunReleaseJobsOptions,
): ReleaseJobsEvidence {
  const { config, manifest, runner } = options;
  assertAwsIdentity(config, runner);
  if (
    manifest.accountId !== config.accountId ||
    manifest.region !== config.primaryRegion
  ) {
    throw new Error(
      "Release manifest account or region does not match configuration",
    );
  }
  const foundation = loadValidatedStack(config, runner, "foundation", [
    "ClusterName",
    "PublicTaskSubnetIds",
  ]);
  const data = loadValidatedStack(config, runner, "data", [
    "DeploymentJobSecurityGroupId",
    ...JOBS.flatMap(({ taskOutput, containerOutput }) => [
      taskOutput,
      containerOutput,
    ]),
    ...JOBS.map(({ key }) => `${pascal(key)}LogGroupName`),
  ]);
  const cluster = requireOutput(foundation, "ClusterName");
  const subnets = requireOutput(foundation, "PublicTaskSubnetIds")
    .split(",")
    .map((subnet) => subnet.trim())
    .filter(Boolean);
  if (subnets.length === 0)
    throw new Error("No public task subnets were output");
  const securityGroup = requireOutput(data, "DeploymentJobSecurityGroupId");
  const jobs: JobEvidence[] = [];

  for (const job of JOBS) {
    const taskDefinitionArn = requireOutput(data, job.taskOutput);
    const containerName = requireOutput(data, job.containerOutput);
    validateTaskDefinition(
      config,
      runner,
      taskDefinitionArn,
      containerName,
      job.image === "bootstrap"
        ? undefined
        : manifest.images[job.image].digestUri,
    );
    jobs.push(
      runOneJob({
        config,
        runner,
        job,
        cluster,
        subnets,
        securityGroup,
        taskDefinitionArn,
        containerName,
        logGroupName: requireOutput(data, `${pascal(job.key)}LogGroupName`),
        release: manifest.sourceRevision,
      }),
    );
  }

  const evidence: ReleaseJobsEvidence = {
    schemaVersion: 1,
    release: manifest.sourceRevision,
    generatedAt: (options.now ?? new Date()).toISOString(),
    jobs,
  };
  if (options.evidencePath !== undefined) {
    writeEvidence(options.evidencePath, evidence);
  }
  return evidence;
}

function validateTaskDefinition(
  config: DeploymentConfig,
  runner: CommandRunner,
  taskDefinitionArn: string,
  containerName: string,
  expectedImage: string | undefined,
): void {
  const result = runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.primaryRegion, [
        "ecs",
        "describe-task-definition",
        "--task-definition",
        taskDefinitionArn,
      ]),
    },
    `validate task definition ${taskDefinitionArn}`,
  );
  const response = parseJson<TaskDefinitionResponse>(result.stdout, "ECS");
  if (response.taskDefinition?.taskDefinitionArn !== taskDefinitionArn) {
    throw new Error(
      `ECS did not return exact task definition ${taskDefinitionArn}`,
    );
  }
  const container = response.taskDefinition.containerDefinitions?.find(
    ({ name }) => name === containerName,
  );
  if (container === undefined || container.essential === false) {
    throw new Error(
      `Task definition ${taskDefinitionArn} lacks essential container ${containerName}`,
    );
  }
  if (expectedImage !== undefined && container.image !== expectedImage) {
    throw new Error(
      `Task ${taskDefinitionArn} image ${container.image ?? "<missing>"} does not match release digest ${expectedImage}`,
    );
  }
}

function runOneJob(options: {
  readonly config: DeploymentConfig;
  readonly runner: CommandRunner;
  readonly job: JobDefinition;
  readonly cluster: string;
  readonly subnets: readonly string[];
  readonly securityGroup: string;
  readonly taskDefinitionArn: string;
  readonly containerName: string;
  readonly logGroupName: string;
  readonly release: string;
}): JobEvidence {
  const { config, runner, job } = options;
  const networkConfiguration = JSON.stringify({
    awsvpcConfiguration: {
      subnets: options.subnets,
      securityGroups: [options.securityGroup],
      assignPublicIp: "ENABLED",
    },
  });
  const startedBy = `foc-${options.release.slice(0, 7)}-${job.key}`.slice(
    0,
    36,
  );
  const run = runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.primaryRegion, [
        "ecs",
        "run-task",
        "--cluster",
        options.cluster,
        "--launch-type",
        "FARGATE",
        "--platform-version",
        "1.4.0",
        "--task-definition",
        options.taskDefinitionArn,
        "--network-configuration",
        networkConfiguration,
        "--started-by",
        startedBy,
        "--enable-ecs-managed-tags",
        "--propagate-tags",
        "TASK_DEFINITION",
        "--tags",
        "key=Project,value=FoC",
        "key=Environment,value=demo",
        "key=Issue,value=44",
        `key=Release,value=${options.release}`,
        `key=Job,value=${job.key}`,
      ]),
    },
    `start ${job.key}`,
  );
  const started = parseJson<RunTaskResponse>(run.stdout, "ECS run-task");
  if ((started.failures?.length ?? 0) > 0) {
    throw new Error(
      `${job.key} placement failed: ${started.failures?.map(({ reason }) => reason ?? "unknown").join(", ")}`,
    );
  }
  const taskArn = started.tasks?.[0]?.taskArn;
  if (taskArn === undefined || started.tasks?.length !== 1) {
    throw new Error(`${job.key} did not start exactly one ECS task`);
  }
  runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.primaryRegion, [
        "ecs",
        "wait",
        "tasks-stopped",
        "--cluster",
        options.cluster,
        "--tasks",
        taskArn,
      ]),
    },
    `wait for ${job.key}`,
  );
  const described = runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.primaryRegion, [
        "ecs",
        "describe-tasks",
        "--cluster",
        options.cluster,
        "--tasks",
        taskArn,
      ]),
    },
    `inspect ${job.key}`,
  );
  const response = parseJson<DescribeTasksResponse>(described.stdout, "ECS");
  if ((response.failures?.length ?? 0) > 0) {
    throw new Error(`${job.key} task could not be described`);
  }
  const task = response.tasks?.[0];
  const container = task?.containers?.find(
    ({ name }) => name === options.containerName,
  );
  const failedEssential = task?.containers?.find(
    ({ exitCode }) => exitCode !== undefined && exitCode !== 0,
  );
  if (
    task?.taskArn !== taskArn ||
    task.taskDefinitionArn !== options.taskDefinitionArn ||
    container?.exitCode !== 0 ||
    failedEssential !== undefined
  ) {
    throw new Error(
      `${job.key} failed for task ${taskArn}: ${container?.reason ?? task?.stoppedReason ?? "missing or nonzero exit code"}. Inspect safely with: aws logs tail ${options.logGroupName} --profile ${config.awsProfile} --region ${config.primaryRegion}`,
    );
  }
  return {
    job: job.key,
    taskArn,
    taskDefinitionArn: options.taskDefinitionArn,
    ...(task.createdAt === undefined ? {} : { createdAt: task.createdAt }),
    ...(task.startedAt === undefined ? {} : { startedAt: task.startedAt }),
    ...(task.stoppedAt === undefined ? {} : { stoppedAt: task.stoppedAt }),
    ...(task.stopCode === undefined ? {} : { stopCode: task.stopCode }),
    ...(task.stoppedReason === undefined
      ? {}
      : { stoppedReason: task.stoppedReason }),
    exitCode: container.exitCode,
  };
}

function writeEvidence(path: string, evidence: ReleaseJobsEvidence): void {
  writeOwnerOnlyJson(path, evidence);
}

function pascal(value: string): string {
  return value
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
}
