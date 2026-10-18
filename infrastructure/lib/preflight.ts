import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { DeploymentConfig } from "./config.js";
import { configFingerprint } from "./config.js";

export type CheckStatus = "PASS" | "BLOCKED" | "WARNING";

export interface PreflightCheck {
  readonly id: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface PreflightReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly validUntil: string;
  readonly configFingerprint: string;
  readonly accountId?: string;
  readonly callerArn?: string;
  readonly status: "PASS" | "BLOCKED";
  readonly checks: readonly PreflightCheck[];
}

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (
  executable: string,
  args: readonly string[],
) => CommandResult;

export const REQUIRED_DIRECT_CAPABILITY_CHECK_IDS = [
  "vpc-read",
  "ecs-read",
  "ecr-read",
  "rds-read",
  "cloudfront-read",
  "waf-read",
  "cloudwatch-read",
  "logs-read",
  "secrets-manager-read",
  "sns-read",
  "budgets-read",
  "iam-read",
  "cloudformation-read-primary",
  "cloudformation-read-edge",
  "postgres-engine",
  "postgres-instance",
  "fargate-capacity-provider",
  "cloudfront-origin-prefix-list",
  "waf-common-rules",
] as const;

export const REQUIRED_QUOTA_CHECK_IDS = [
  "service-quotas",
  "fargate-vcpu-quota",
] as const;

const NUS_SERVICE_QUOTAS_SCP_ARN =
  "arn:aws:organizations::864899849123:policy/o-celk1f6y0n/service_control_policy/p-evk2g3xk";

const REQUIRED_PROVISIONING_ACTIONS = [
  "cloudformation:CreateStack",
  "ec2:CreateVpc",
  "ecs:CreateCluster",
  "ecr:CreateRepository",
  "rds:CreateDBInstance",
  "elasticloadbalancing:CreateLoadBalancer",
  "cloudfront:CreateDistribution",
  "wafv2:CreateWebACL",
  "logs:CreateLogGroup",
  "secretsmanager:CreateSecret",
  "sns:CreateTopic",
  "budgets:CreateBudget",
  "iam:CreateRole",
  "iam:PassRole",
  "ssm:PutParameter",
] as const;

export const systemCommandRunner: CommandRunner = (executable, args) => {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    env: { ...process.env, AWS_PAGER: "" },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.error?.message ?? result.stderr ?? "",
  };
};

interface AwsCommand {
  readonly id: string;
  readonly region: string;
  readonly args: readonly string[];
  readonly detail: string;
  readonly validate?: (stdout: string) => boolean;
  readonly invalidDetail?: string;
}

function summarizeFailure(result: CommandResult): string {
  const text = (result.stderr || result.stdout).replace(/\s+/g, " ").trim();
  return text === "" ? `command exited ${result.status}` : text.slice(0, 500);
}

function isExpectedNusServiceQuotasScpDenial(
  result: CommandResult,
  action: "ListServices" | "GetServiceQuota",
): boolean {
  if (result.status === 0) {
    return false;
  }
  const detail = `${result.stderr} ${result.stdout}`;
  const deniedPolicy =
    /explicit deny in a service control policy:\s*(\S+)/i.exec(detail)?.[1];
  return (
    /\bAccessDeniedException\b/i.test(detail) &&
    new RegExp(`\\bservicequotas:${action}\\b`).test(detail) &&
    deniedPolicy === NUS_SERVICE_QUOTAS_SCP_ARN
  );
}

function awsArgs(
  config: DeploymentConfig,
  region: string,
  args: readonly string[],
): readonly string[] {
  return [
    ...args,
    "--profile",
    config.awsProfile,
    "--region",
    region,
    "--no-cli-pager",
    "--output",
    "json",
  ];
}

function serviceReadCommands(config: DeploymentConfig): readonly AwsCommand[] {
  return [
    {
      id: "vpc-read",
      region: config.primaryRegion,
      args: ["ec2", "describe-vpcs", "--max-results", "5"],
      detail: "EC2/VPC describe API is readable",
    },
    {
      id: "ecs-read",
      region: config.primaryRegion,
      args: ["ecs", "list-clusters", "--max-results", "1"],
      detail: "ECS control plane is readable",
    },
    {
      id: "ecr-read",
      region: config.primaryRegion,
      args: ["ecr", "describe-repositories", "--max-results", "1"],
      detail: "ECR control plane is readable",
    },
    {
      id: "rds-read",
      region: config.primaryRegion,
      args: ["rds", "describe-db-instances", "--max-records", "20"],
      detail: "RDS control plane is readable",
    },
    {
      id: "cloudfront-read",
      region: config.edgeRegion,
      args: ["cloudfront", "list-distributions", "--max-items", "1"],
      detail: "CloudFront control plane is readable",
    },
    {
      id: "waf-read",
      region: config.edgeRegion,
      args: ["wafv2", "list-web-acls", "--scope", "CLOUDFRONT", "--limit", "1"],
      detail: "CloudFront-scope WAF control plane is readable",
    },
    {
      id: "cloudwatch-read",
      region: config.primaryRegion,
      args: ["cloudwatch", "describe-alarms", "--max-records", "1"],
      detail: "CloudWatch alarms are readable",
    },
    {
      id: "logs-read",
      region: config.primaryRegion,
      args: ["logs", "describe-log-groups", "--limit", "1"],
      detail: "CloudWatch Logs is readable",
    },
    {
      id: "secrets-manager-read",
      region: config.primaryRegion,
      args: ["secretsmanager", "list-secrets", "--max-results", "1"],
      detail: "Secrets Manager is readable",
    },
    {
      id: "sns-read",
      region: config.primaryRegion,
      args: ["sns", "list-topics"],
      detail: "SNS is readable",
    },
    {
      id: "budgets-read",
      region: config.edgeRegion,
      args: [
        "budgets",
        "describe-budgets",
        "--account-id",
        config.accountId,
        "--max-results",
        "20",
      ],
      detail: "AWS Budgets is readable",
    },
    {
      id: "iam-read",
      region: config.primaryRegion,
      args: ["iam", "get-account-summary"],
      detail: "IAM account capabilities are readable",
    },
    {
      id: "cloudformation-read-primary",
      region: config.primaryRegion,
      args: ["cloudformation", "describe-account-limits"],
      detail: "CloudFormation is readable in the primary region",
    },
    {
      id: "cloudformation-read-edge",
      region: config.edgeRegion,
      args: ["cloudformation", "describe-account-limits"],
      detail: "CloudFormation is readable in the edge region",
    },
  ];
}

function requiredCapabilityCommands(
  config: DeploymentConfig,
): readonly AwsCommand[] {
  return [
    {
      id: "postgres-engine",
      region: config.primaryRegion,
      args: [
        "rds",
        "describe-db-engine-versions",
        "--engine",
        "postgres",
        "--engine-version",
        "17.11",
      ],
      detail: "PostgreSQL 17.11 is available",
      validate: (stdout) => {
        const value = JSON.parse(stdout) as {
          DBEngineVersions?: readonly unknown[];
        };
        return (value.DBEngineVersions?.length ?? 0) > 0;
      },
      invalidDetail: "PostgreSQL 17.11 was not returned as available",
    },
    {
      id: "postgres-instance",
      region: config.primaryRegion,
      args: [
        "rds",
        "describe-orderable-db-instance-options",
        "--engine",
        "postgres",
        "--engine-version",
        "17.11",
        "--db-instance-class",
        "db.t4g.micro",
      ],
      detail: "PostgreSQL 17.11 on db.t4g.micro is orderable",
      validate: (stdout) => {
        const value = JSON.parse(stdout) as {
          OrderableDBInstanceOptions?: readonly { StorageType?: string }[];
        };
        return (
          value.OrderableDBInstanceOptions?.some(
            ({ StorageType }) => StorageType === "gp3",
          ) ?? false
        );
      },
      invalidDetail:
        "db.t4g.micro with PostgreSQL 17.11 and gp3 was not orderable",
    },
    {
      id: "fargate-capacity-provider",
      region: config.primaryRegion,
      args: [
        "ecs",
        "describe-capacity-providers",
        "--capacity-providers",
        "FARGATE",
        "FARGATE_SPOT",
      ],
      detail: "Fargate capacity providers are available",
      validate: (stdout) => {
        const value = JSON.parse(stdout) as {
          capacityProviders?: readonly { name?: string; status?: string }[];
        };
        return ["FARGATE", "FARGATE_SPOT"].every((name) =>
          value.capacityProviders?.some(
            (provider) =>
              provider.name === name && provider.status === "ACTIVE",
          ),
        );
      },
      invalidDetail: "required Fargate capacity providers were not ACTIVE",
    },
    {
      id: "cloudfront-origin-prefix-list",
      region: config.primaryRegion,
      args: [
        "ec2",
        "describe-managed-prefix-lists",
        "--filters",
        "Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing",
      ],
      detail: "CloudFront origin-facing managed prefix list is available",
      validate: (stdout) => {
        const value = JSON.parse(stdout) as {
          PrefixLists?: readonly unknown[];
        };
        return (value.PrefixLists?.length ?? 0) > 0;
      },
      invalidDetail:
        "CloudFront origin-facing managed prefix list was not found",
    },
    {
      id: "waf-common-rules",
      region: config.edgeRegion,
      args: [
        "wafv2",
        "list-available-managed-rule-groups",
        "--scope",
        "CLOUDFRONT",
        "--limit",
        "100",
      ],
      detail: "CloudFront-scope WAF managed rules are available",
      validate: (stdout) => {
        const value = JSON.parse(stdout) as {
          ManagedRuleGroups?: readonly { VendorName?: string; Name?: string }[];
        };
        return (
          value.ManagedRuleGroups?.some(
            ({ Name, VendorName }) =>
              VendorName === "AWS" && Name === "AWSManagedRulesCommonRuleSet",
          ) ?? false
        );
      },
      invalidDetail:
        "AWSManagedRulesCommonRuleSet was not available for CloudFront",
    },
  ];
}

function parseJson<T>(result: CommandResult): T | undefined {
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return undefined;
  }
}

function resolveSimulationPrincipal(
  config: DeploymentConfig,
  callerArn: string | undefined,
  runner: CommandRunner,
): { readonly arn: string } | { readonly error: string } {
  const assumedRole =
    /^arn:aws:sts::(\d{12}):assumed-role\/([\w+=,.@-]{1,64})\/[^/]+$/.exec(
      callerArn ?? "",
    );
  if (assumedRole === null || assumedRole[1] !== config.accountId) {
    return {
      error:
        "caller must be an assumed IAM role in the approved account for read-only policy simulation",
    };
  }

  const roleName = assumedRole[2];
  if (roleName === undefined) {
    return { error: "caller ARN did not contain an IAM role name" };
  }
  const roleResult = runner(
    "aws",
    awsArgs(config, config.primaryRegion, [
      "iam",
      "get-role",
      "--role-name",
      roleName,
    ]),
  );
  if (roleResult.status !== 0) {
    return {
      error: `could not resolve caller IAM role ${roleName}: ${summarizeFailure(roleResult)}`,
    };
  }
  const role = parseJson<{ Role?: { Arn?: string; RoleName?: string } }>(
    roleResult,
  )?.Role;
  const roleArn = /^arn:aws:iam::(\d{12}):role\/(.+)$/.exec(role?.Arn ?? "");
  if (
    roleArn?.[1] !== config.accountId ||
    roleArn[2]?.split("/").at(-1) !== roleName ||
    role?.RoleName !== roleName ||
    role.Arn === undefined
  ) {
    return {
      error: `IAM get-role did not return the matching caller role ${roleName} in approved account ${config.accountId}`,
    };
  }
  return { arn: role.Arn };
}

const policySimulationSchema = z.object({
  EvaluationResults: z.array(
    z.object({
      EvalActionName: z.string().optional(),
      EvalDecision: z.string().optional(),
      OrganizationsDecisionDetail: z
        .object({
          AllowedByOrganizations: z.boolean().optional(),
        })
        .optional(),
    }),
  ),
});

function simulationProblems(result: CommandResult): readonly string[] {
  const response = policySimulationSchema.safeParse(parseJson<unknown>(result));
  if (!response.success) {
    return ["IAM simulation did not return action evaluations"];
  }

  const requiredActions = new Set<string>(REQUIRED_PROVISIONING_ACTIONS);
  const seenActions = new Set<string>();
  const problems: string[] = [];
  for (const evaluation of response.data.EvaluationResults) {
    const action = evaluation?.EvalActionName;
    if (typeof action !== "string" || !requiredActions.has(action)) {
      problems.push(
        `unexpected action result: ${action ?? "missing action name"}`,
      );
      continue;
    }
    if (seenActions.has(action)) {
      problems.push(`duplicate action result: ${action}`);
    }
    seenActions.add(action);
    if (evaluation.EvalDecision !== "allowed") {
      problems.push(
        `denied action: ${action} (${evaluation.EvalDecision ?? "missing decision"})`,
      );
    } else if (
      evaluation.OrganizationsDecisionDetail?.AllowedByOrganizations === false
    ) {
      problems.push(`denied action: ${action} (Organizations policy)`);
    }
  }
  const missingActions = REQUIRED_PROVISIONING_ACTIONS.filter(
    (action) => !seenActions.has(action),
  );
  if (missingActions.length > 0) {
    problems.push(`missing action results: ${missingActions.join(", ")}`);
  }
  return problems;
}

export function runPreflight(
  config: DeploymentConfig,
  runner: CommandRunner = systemCommandRunner,
  now = new Date(),
): PreflightReport {
  const checks: PreflightCheck[] = [];

  const version = runner("aws", ["--version"]);
  checks.push({
    id: "aws-cli",
    status: version.status === 0 ? "PASS" : "BLOCKED",
    detail:
      version.status === 0
        ? (version.stdout || version.stderr).trim()
        : summarizeFailure(version),
  });

  const identityResult = runner(
    "aws",
    awsArgs(config, config.primaryRegion, ["sts", "get-caller-identity"]),
  );
  const identity = parseJson<{ Account?: string; Arn?: string }>(
    identityResult,
  );
  const identityMatches =
    identityResult.status === 0 && identity?.Account === config.accountId;
  checks.push({
    id: "caller-identity",
    status: identityMatches ? "PASS" : "BLOCKED",
    detail: identityMatches
      ? `authenticated as ${identity?.Arn ?? "unknown ARN"} in approved account ${config.accountId}`
      : identityResult.status === 0
        ? `caller account ${identity?.Account ?? "unknown"} does not match ${config.accountId}`
        : summarizeFailure(identityResult),
  });

  const configuredRegion = runner("aws", [
    "configure",
    "get",
    "region",
    "--profile",
    config.awsProfile,
  ]);
  checks.push({
    id: "configured-region",
    status:
      configuredRegion.status === 0 &&
      configuredRegion.stdout.trim() === config.primaryRegion
        ? "PASS"
        : "BLOCKED",
    detail:
      configuredRegion.status === 0
        ? `profile region is ${configuredRegion.stdout.trim() || "unset"}; required ${config.primaryRegion}`
        : summarizeFailure(configuredRegion),
  });

  for (const command of [
    ...serviceReadCommands(config),
    ...requiredCapabilityCommands(config),
  ]) {
    const result = runner("aws", awsArgs(config, command.region, command.args));
    let contentValid = result.status === 0;
    if (contentValid && command.validate !== undefined) {
      try {
        contentValid = command.validate(result.stdout);
      } catch {
        contentValid = false;
      }
    }
    checks.push({
      id: command.id,
      status: contentValid ? "PASS" : "BLOCKED",
      detail:
        result.status !== 0
          ? summarizeFailure(result)
          : contentValid
            ? command.detail
            : (command.invalidDetail ??
              "capability response was empty or invalid"),
    });
  }

  const quotaResult = runner(
    "aws",
    awsArgs(config, config.primaryRegion, ["service-quotas", "list-services"]),
  );
  const fargateQuota = runner(
    "aws",
    awsArgs(config, config.primaryRegion, [
      "service-quotas",
      "get-service-quota",
      "--service-code",
      "fargate",
      "--quota-code",
      "L-3032A538",
    ]),
  );

  const directCapabilitiesPassed = REQUIRED_DIRECT_CAPABILITY_CHECK_IDS.every(
    (id) => checks.some((check) => check.id === id && check.status === "PASS"),
  );
  const expectedRestrictionObserved =
    isExpectedNusServiceQuotasScpDenial(quotaResult, "ListServices") &&
    isExpectedNusServiceQuotasScpDenial(fargateQuota, "GetServiceQuota");
  const manualFallbackAccepted =
    directCapabilitiesPassed &&
    expectedRestrictionObserved &&
    config.quotaApproval.serviceQuotasApiRestriction ===
      "NUS_ORGANIZATIONS_SCP_EXPLICIT_DENY" &&
    config.quotaApproval.reviewedQuota === "fargate:L-3032A538";
  const manualFallbackDetail =
    `the known NUS Organizations SCP denial was observed; required service and capability reads passed; ` +
    `fargate:L-3032A538 was manually confirmed by ${config.quotaApproval.confirmedBy} ` +
    `with evidence ${config.quotaApproval.evidenceReference}`;

  checks.push({
    id: "service-quotas",
    status:
      quotaResult.status === 0
        ? "PASS"
        : manualFallbackAccepted
          ? "WARNING"
          : "BLOCKED",
    detail:
      quotaResult.status === 0
        ? "Service Quotas APIs are readable"
        : manualFallbackAccepted
          ? manualFallbackDetail
          : summarizeFailure(quotaResult),
  });

  const quotaValue = parseJson<{ Quota?: { Value?: number } }>(fargateQuota)
    ?.Quota?.Value;
  const validQuotaValue =
    fargateQuota.status === 0 &&
    quotaValue !== undefined &&
    Number.isFinite(quotaValue) &&
    quotaValue > 0;
  checks.push({
    id: "fargate-vcpu-quota",
    status: validQuotaValue
      ? "PASS"
      : manualFallbackAccepted
        ? "WARNING"
        : "BLOCKED",
    detail: validQuotaValue
      ? `Fargate On-Demand vCPU quota is ${quotaValue}`
      : manualFallbackAccepted
        ? manualFallbackDetail
        : fargateQuota.status === 0
          ? "Fargate On-Demand vCPU quota response had no positive numeric value"
          : summarizeFailure(fargateQuota),
  });

  for (const region of [config.primaryRegion, config.edgeRegion]) {
    const bootstrap = runner(
      "aws",
      awsArgs(config, region, [
        "cloudformation",
        "describe-stacks",
        "--stack-name",
        "CDKToolkit",
      ]),
    );
    const bootstrapVersion = runner(
      "aws",
      awsArgs(config, region, [
        "ssm",
        "get-parameter",
        "--name",
        "/cdk-bootstrap/hnb659fds/version",
      ]),
    );
    const versionValue = parseJson<{ Parameter?: { Value?: string } }>(
      bootstrapVersion,
    )?.Parameter?.Value;
    const validVersion =
      bootstrapVersion.status === 0 &&
      versionValue !== undefined &&
      Number.isInteger(Number(versionValue)) &&
      Number(versionValue) >= 6;
    checks.push({
      id: `cdk-bootstrap-${region}`,
      status: bootstrap.status === 0 && validVersion ? "PASS" : "BLOCKED",
      detail:
        bootstrap.status !== 0
          ? `CDKToolkit is unavailable in ${region}: ${summarizeFailure(bootstrap)}`
          : validVersion
            ? `CDKToolkit version ${versionValue} exists in ${region}`
            : `CDKToolkit in ${region} has no readable modern bootstrap version: ${summarizeFailure(bootstrapVersion)}`,
    });
  }

  const callerArn = identity?.Arn;
  const principal = resolveSimulationPrincipal(config, callerArn, runner);
  if ("error" in principal) {
    checks.push({
      id: "provisioning-permission-simulation",
      status: "BLOCKED",
      detail: principal.error,
    });
  } else {
    const simulation = runner(
      "aws",
      awsArgs(config, config.primaryRegion, [
        "iam",
        "simulate-principal-policy",
        "--policy-source-arn",
        principal.arn,
        "--action-names",
        ...REQUIRED_PROVISIONING_ACTIONS,
      ]),
    );
    const problems =
      simulation.status === 0 ? simulationProblems(simulation) : [];
    const allAllowed = simulation.status === 0 && problems.length === 0;
    checks.push({
      id: "provisioning-permission-simulation",
      status: allAllowed ? "PASS" : "BLOCKED",
      detail: allAllowed
        ? "read-only IAM simulation allows the representative provisioning actions; live deployment may still be restricted by SCPs or resource conditions"
        : simulation.status === 0
          ? problems.join("; ")
          : summarizeFailure(simulation),
    });
  }

  const generatedAt = now.toISOString();
  const validUntil = new Date(
    now.getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    schemaVersion: 1,
    generatedAt,
    validUntil,
    configFingerprint: configFingerprint(config),
    ...(identity?.Account === undefined ? {} : { accountId: identity.Account }),
    ...(callerArn === undefined ? {} : { callerArn }),
    status: checks.some(({ status }) => status === "BLOCKED")
      ? "BLOCKED"
      : "PASS",
    checks,
  };
}

export function preflightDigest(report: PreflightReport): string {
  return createHash("sha256").update(JSON.stringify(report)).digest("hex");
}
