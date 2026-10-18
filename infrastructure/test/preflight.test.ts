// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommandResult, CommandRunner } from "../lib/preflight.js";
import { runPreflight } from "../lib/preflight.js";
import { validConfig } from "./fixtures.js";

const callerRoleName = "AWSReservedSSO_nusisb_IsbUsersPS_f6ff0b4cf288ddb3";
const callerRoleArn = `arn:aws:iam::656253649128:role/aws-reserved/sso.amazonaws.com/ap-southeast-1/${callerRoleName}`;
const recordedScpArn =
  "arn:aws:organizations::864899849123:policy/o-celk1f6y0n/service_control_policy/p-evk2g3xk";
const requestedActions = [
  "cloudformation:CreateStack",
  "ec2:CreateVpc",
  "ecs:CreateCluster",
  "ecr:CreateRepository",
  "rds:CreateDBInstance",
  "elasticloadbalancing:CreateLoadBalancer",
  "cloudfront:CreateDistribution",
  "wafv2:CreateWebACL",
  "logs:CreateLogGroup",
  "logs:PutRetentionPolicy",
  "logs:DeleteLogGroup",
  "lambda:GetFunctionConfiguration",
  "cloudformation:ListStackResources",
  "secretsmanager:CreateSecret",
  "sns:CreateTopic",
  "budgets:CreateBudget",
  "iam:CreateRole",
  "iam:PassRole",
  "ssm:PutParameter",
] as const;

function allowedEvaluations() {
  return requestedActions.map((action) => ({
    EvalActionName: action,
    EvalResourceName: "*",
    EvalDecision: "allowed",
    MatchedStatements: [],
    MissingContextValues: [],
    OrganizationsDecisionDetail: { AllowedByOrganizations: true },
  }));
}

function recordedQuotaDenial(action: "ListServices" | "GetServiceQuota") {
  return (
    `An error occurred (AccessDeniedException) when calling the ${action} operation: ` +
    `User: arn:aws:sts::656253649128:assumed-role/${callerRoleName}/e1156664@u.nus.edu ` +
    `is not authorized to perform: servicequotas:${action} on resource: * ` +
    `with an explicit deny in a service control policy: ${recordedScpArn}`
  );
}

interface FakeOptions {
  readonly accountId?: string;
  readonly bootstrapExists?: boolean;
  readonly quotasReadable?: boolean;
  readonly quotaFailure?: string;
  readonly quotaFailures?: Partial<
    Record<"ListServices" | "GetServiceQuota", string>
  >;
  readonly denyService?: string;
  readonly roleArn?: string;
  readonly roleName?: string;
  readonly evaluations?: readonly {
    readonly EvalActionName?: string;
    readonly EvalDecision?: string;
    readonly OrganizationsDecisionDetail?: {
      readonly AllowedByOrganizations?: boolean;
    };
  }[];
}

function success(stdout = "{}"): CommandResult {
  return { status: 0, stdout, stderr: "" };
}

function failure(message: string): CommandResult {
  return { status: 254, stdout: "", stderr: message };
}

function fakeRunner(
  options: FakeOptions = {},
  calls: string[][] = [],
): CommandRunner {
  return (executable, args) => {
    calls.push([executable, ...args]);
    if (executable === "aws" && args[0] === "--version") {
      return success("aws-cli/2.38.1");
    }
    if (args[0] === "configure") {
      return success("ap-southeast-1\n");
    }
    const operation = `${args[0] ?? ""}:${args[1] ?? ""}`;
    if (options.denyService === operation) {
      return failure(`AccessDenied: ${operation}`);
    }
    if (operation === "sts:get-caller-identity") {
      const account = options.accountId ?? "656253649128";
      return success(
        JSON.stringify({
          Account: account,
          Arn: `arn:aws:sts::${account}:assumed-role/${callerRoleName}/e1156664@u.nus.edu`,
        }),
      );
    }
    if (operation === "rds:describe-db-engine-versions") {
      return success(JSON.stringify({ DBEngineVersions: [{}] }));
    }
    if (operation === "rds:describe-orderable-db-instance-options") {
      return success(
        JSON.stringify({
          OrderableDBInstanceOptions: [{ StorageType: "gp3" }],
        }),
      );
    }
    if (operation === "ecs:describe-capacity-providers") {
      return success(
        JSON.stringify({
          capacityProviders: [
            { name: "FARGATE", status: "ACTIVE" },
            { name: "FARGATE_SPOT", status: "ACTIVE" },
          ],
        }),
      );
    }
    if (operation === "ec2:describe-managed-prefix-lists") {
      return success(JSON.stringify({ PrefixLists: [{}] }));
    }
    if (operation === "wafv2:list-available-managed-rule-groups") {
      return success(
        JSON.stringify({
          ManagedRuleGroups: [
            { VendorName: "AWS", Name: "AWSManagedRulesCommonRuleSet" },
          ],
        }),
      );
    }
    if (
      operation === "service-quotas:list-services" ||
      operation === "service-quotas:get-service-quota"
    ) {
      const action =
        operation === "service-quotas:list-services"
          ? "ListServices"
          : "GetServiceQuota";
      const actionFailure = options.quotaFailures?.[action];
      if (actionFailure !== undefined) {
        return failure(actionFailure);
      }
      if (options.quotaFailure !== undefined) {
        return failure(options.quotaFailure);
      }
      if (options.quotasReadable === false) {
        return failure(recordedQuotaDenial(action));
      }
      return success(JSON.stringify({ Quota: { Value: 6 } }));
    }
    if (operation === "cloudformation:describe-stacks") {
      return options.bootstrapExists === false
        ? failure("ValidationError: Stack with id CDKToolkit does not exist")
        : success(
            JSON.stringify({ Stacks: [{ StackStatus: "CREATE_COMPLETE" }] }),
          );
    }
    if (operation === "ssm:get-parameter") {
      return options.bootstrapExists === false
        ? failure("ParameterNotFound")
        : success(JSON.stringify({ Parameter: { Value: "27" } }));
    }
    if (operation === "iam:get-role") {
      return success(
        JSON.stringify({
          Role: {
            Path: "/aws-reserved/sso.amazonaws.com/ap-southeast-1/",
            RoleName: options.roleName ?? callerRoleName,
            RoleId: "AROATESTCALLERROLE",
            Arn: options.roleArn ?? callerRoleArn,
          },
        }),
      );
    }
    if (operation === "iam:simulate-principal-policy") {
      return success(
        JSON.stringify({
          EvaluationResults: options.evaluations ?? allowedEvaluations(),
          IsTruncated: false,
        }),
      );
    }
    return success();
  };
}

test("passes when all required read-only capabilities and bootstrap stacks are present", () => {
  const calls: string[][] = [];
  const report = runPreflight(
    validConfig(),
    fakeRunner({}, calls),
    new Date("2026-10-18T08:00:00.000Z"),
  );
  assert.equal(report.status, "PASS");
  assert.equal(report.validUntil, "2026-10-19T08:00:00.000Z");
  assert.ok(report.checks.length >= 20);
  const getRole = calls.find((call) => call.includes("get-role"));
  assert.equal(getRole?.[getRole.indexOf("--role-name") + 1], callerRoleName);
  const simulation = calls.find((call) =>
    call.includes("simulate-principal-policy"),
  );
  assert.equal(
    simulation?.[simulation.indexOf("--policy-source-arn") + 1],
    callerRoleArn,
    "IAM Identity Center role paths must be resolved rather than guessed from STS",
  );
  assert.deepEqual(
    simulation?.slice(
      simulation.indexOf("--action-names") + 1,
      simulation.indexOf("--profile"),
    ),
    requestedActions,
  );
  assert.equal(
    calls.some((call) => call.includes("create-stack")),
    false,
    "preflight must not execute mutating AWS operations",
  );
});

test("requires direct Lambda and exact stack-inventory reads in both provider regions", () => {
  const calls: string[][] = [];
  const report = runPreflight(validConfig(), fakeRunner({}, calls));
  assert.equal(report.status, "PASS");
  assert.match(report.requirementsFingerprint, /^[0-9a-f]{64}$/);
  for (const region of ["ap-southeast-1", "us-east-1"]) {
    assert.ok(
      calls.some(
        (call) =>
          call.includes("list-functions") &&
          call[call.indexOf("--region") + 1] === region,
      ),
    );
    assert.ok(
      calls.some(
        (call) =>
          call.includes("list-stack-resources") &&
          call[call.indexOf("--region") + 1] === region,
      ),
    );
  }
  assert.equal(
    runPreflight(
      validConfig(),
      fakeRunner({ denyService: "lambda:list-functions" }),
    ).status,
    "BLOCKED",
  );
});

test("blocks a caller authenticated to the wrong AWS account", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({ accountId: "111122223333" }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.equal(
    report.checks.find(({ id }) => id === "caller-identity")?.status,
    "BLOCKED",
  );
});

test("accepts only the recorded school SCP denial with direct capability evidence", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({ quotasReadable: false }),
  );
  assert.equal(report.status, "PASS");
  assert.equal(
    report.checks.find(({ id }) => id === "service-quotas")?.status,
    "WARNING",
  );
  assert.equal(
    report.checks.find(({ id }) => id === "fargate-vcpu-quota")?.status,
    "WARNING",
  );
  assert.match(
    report.checks.find(({ id }) => id === "service-quotas")?.detail ?? "",
    /manually confirmed by course-team-leader/,
  );
});

test("blocks an unrecognized Service Quotas access denial", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({ quotaFailure: "AccessDeniedException: denied by policy" }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.equal(
    report.checks.find(({ id }) => id === "service-quotas")?.status,
    "BLOCKED",
  );
});

test("rejects generic Organizations SCP text without the recorded policy ARN", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({
      quotasReadable: false,
      quotaFailure:
        "An error occurred (AccessDeniedException): servicequotas:ListServices servicequotas:GetServiceQuota denied with an explicit deny in Organizations SCP",
    }),
  );
  assert.equal(
    report.checks.find(({ id }) => id === "service-quotas")?.status,
    "BLOCKED",
  );
});

test("rejects a different SCP even when its denial shape matches AWS", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({
      quotasReadable: false,
      quotaFailures: {
        ListServices: recordedQuotaDenial("ListServices").replace(
          "p-evk2g3xk",
          "p-otherpolicy",
        ),
        GetServiceQuota: recordedQuotaDenial("GetServiceQuota").replace(
          "p-evk2g3xk",
          "p-otherpolicy",
        ),
      },
    }),
  );
  assert.equal(
    report.checks.find(({ id }) => id === "service-quotas")?.status,
    "BLOCKED",
  );
});

test("rejects mismatched quota actions and a mixed readable/denied API result", () => {
  for (const options of [
    {
      quotasReadable: false,
      quotaFailures: { GetServiceQuota: recordedQuotaDenial("ListServices") },
    },
    { quotaFailures: { ListServices: recordedQuotaDenial("ListServices") } },
  ]) {
    const report = runPreflight(validConfig(), fakeRunner(options));
    assert.equal(
      report.checks.find(({ id }) => id === "service-quotas")?.status,
      "BLOCKED",
    );
  }
});

test("reports the actual denied provisioning action from AWS simulation", () => {
  const evaluations = allowedEvaluations().map((evaluation) =>
    evaluation.EvalActionName === "iam:PassRole"
      ? { ...evaluation, EvalDecision: "implicitDeny" }
      : evaluation,
  );
  const report = runPreflight(validConfig(), fakeRunner({ evaluations }));
  const check = report.checks.find(
    ({ id }) => id === "provisioning-permission-simulation",
  );
  assert.equal(check?.status, "BLOCKED");
  assert.match(
    check?.detail ?? "",
    /denied action: iam:PassRole \(implicitDeny\)/,
  );
});

test("rejects missing, duplicate, unexpected, and unnamed action evaluations", () => {
  const all = allowedEvaluations();
  for (const [evaluations, expected] of [
    [all.slice(0, -1), /missing action results: ssm:PutParameter/],
    [
      [
        ...all.slice(0, -1),
        {
          EvalActionName: "cloudformation:CreateStack",
          EvalDecision: "allowed",
        },
      ],
      /duplicate action result: cloudformation:CreateStack/,
    ],
    [
      [
        ...all.slice(0, -1),
        { EvalActionName: "iam:DeleteRole", EvalDecision: "allowed" },
      ],
      /unexpected action result: iam:DeleteRole/,
    ],
    [
      [...all.slice(0, -1), { EvalDecision: "allowed" }],
      /unexpected action result: missing action name/,
    ],
  ] as const) {
    const report = runPreflight(validConfig(), fakeRunner({ evaluations }));
    const check = report.checks.find(
      ({ id }) => id === "provisioning-permission-simulation",
    );
    assert.equal(check?.status, "BLOCKED");
    assert.match(check?.detail ?? "", expected);
  }
});

test("blocks an explicit Organizations denial in a simulation result", () => {
  const evaluations = allowedEvaluations().map((evaluation) =>
    evaluation.EvalActionName === "ec2:CreateVpc"
      ? {
          ...evaluation,
          OrganizationsDecisionDetail: { AllowedByOrganizations: false },
        }
      : evaluation,
  );
  const report = runPreflight(validConfig(), fakeRunner({ evaluations }));
  const check = report.checks.find(
    ({ id }) => id === "provisioning-permission-simulation",
  );
  assert.equal(check?.status, "BLOCKED");
  assert.match(
    check?.detail ?? "",
    /denied action: ec2:CreateVpc \(Organizations policy\)/,
  );
});

test("does not simulate an unresolved or mismatched caller role", () => {
  for (const options of [
    { denyService: "iam:get-role" },
    { roleArn: callerRoleArn.replace("656253649128", "111122223333") },
    { roleArn: callerRoleArn.replace(callerRoleName, "DifferentRole") },
    { roleName: "DifferentRole" },
    { accountId: "111122223333" },
  ]) {
    const calls: string[][] = [];
    const report = runPreflight(validConfig(), fakeRunner(options, calls));
    assert.equal(
      report.checks.find(
        ({ id }) => id === "provisioning-permission-simulation",
      )?.status,
      "BLOCKED",
    );
    assert.equal(
      calls.some((call) => call.includes("simulate-principal-policy")),
      false,
    );
  }
});

test("does not accept the SCP fallback when a required capability is denied", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({
      quotasReadable: false,
      denyService: "secretsmanager:list-secrets",
    }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.equal(
    report.checks.find(({ id }) => id === "service-quotas")?.status,
    "BLOCKED",
  );
});

test("blocks missing CDK bootstrap in either required region", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({ bootstrapExists: false }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.equal(
    report.checks.filter(
      ({ id, status }) =>
        id.startsWith("cdk-bootstrap-") && status === "BLOCKED",
    ).length,
    2,
  );
});

test("blocks a required service read denial", () => {
  const report = runPreflight(
    validConfig(),
    fakeRunner({ denyService: "secretsmanager:list-secrets" }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.equal(
    report.checks.find(({ id }) => id === "secrets-manager-read")?.status,
    "BLOCKED",
  );
});
