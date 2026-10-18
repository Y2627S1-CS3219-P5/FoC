// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import type { DeploymentConfig } from "./config.js";
import { parseJson, runChecked, type CommandRunner } from "./commands.js";
import { DEPLOYMENT_TAGS, STACKS, type StackKey } from "./deployment-names.js";

interface StackResponse {
  readonly Stacks?: readonly {
    readonly StackName?: string;
    readonly StackStatus?: string;
    readonly Outputs?: readonly {
      readonly OutputKey?: string;
      readonly OutputValue?: string;
    }[];
    readonly Tags?: readonly {
      readonly Key?: string;
      readonly Value?: string;
    }[];
  }[];
}

interface IdentityResponse {
  readonly Account?: string;
  readonly Arn?: string;
}

export interface ValidatedStack {
  readonly key: StackKey;
  readonly name: string;
  readonly region: string;
  readonly status: string;
  readonly outputs: Readonly<Record<string, string>>;
}

export function awsArgs(
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

export function assertAwsIdentity(
  config: DeploymentConfig,
  runner: CommandRunner,
): { readonly accountId: string; readonly arn: string } {
  const result = runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.primaryRegion, [
        "sts",
        "get-caller-identity",
      ]),
    },
    "AWS identity validation",
  );
  const identity = parseJson<IdentityResponse>(result.stdout, "STS");
  if (identity.Account !== config.accountId || identity.Arn === undefined) {
    throw new Error(
      `AWS caller account ${identity.Account ?? "<missing>"} does not match approved account ${config.accountId}`,
    );
  }
  return { accountId: identity.Account, arn: identity.Arn };
}

export function loadValidatedStack(
  config: DeploymentConfig,
  runner: CommandRunner,
  key: StackKey,
  requiredOutputs: readonly string[] = [],
): ValidatedStack {
  const definition = STACKS[key];
  const region =
    definition.region === "primary" ? config.primaryRegion : config.edgeRegion;
  const result = runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, region, [
        "cloudformation",
        "describe-stacks",
        "--stack-name",
        definition.name,
      ]),
    },
    `read exact stack ${definition.name}`,
  );
  const response = parseJson<StackResponse>(result.stdout, "CloudFormation");
  const stack = response.Stacks?.[0];
  if (stack?.StackName !== definition.name || stack.StackStatus === undefined) {
    throw new Error(
      `CloudFormation did not return exact stack ${definition.name}`,
    );
  }
  const tags = Object.fromEntries(
    (stack.Tags ?? []).flatMap(({ Key, Value }) =>
      Key === undefined || Value === undefined ? [] : [[Key, Value]],
    ),
  );
  const expectedTags = { ...DEPLOYMENT_TAGS, Owner: config.owner };
  for (const [tag, expected] of Object.entries(expectedTags)) {
    if (tags[tag] !== expected) {
      throw new Error(
        `Stack ${definition.name} tag ${tag} must be ${expected}; received ${tags[tag] ?? "<missing>"}`,
      );
    }
  }
  const outputs = Object.fromEntries(
    (stack.Outputs ?? []).flatMap(({ OutputKey, OutputValue }) =>
      OutputKey === undefined || OutputValue === undefined
        ? []
        : [[OutputKey, OutputValue]],
    ),
  );
  for (const output of requiredOutputs) {
    if (outputs[output] === undefined || outputs[output] === "") {
      throw new Error(
        `Stack ${definition.name} is missing required output ${output}`,
      );
    }
  }
  return {
    key,
    name: definition.name,
    region,
    status: stack.StackStatus,
    outputs,
  };
}

export function requireOutput(stack: ValidatedStack, key: string): string {
  const value = stack.outputs[key];
  if (value === undefined || value === "") {
    throw new Error(`Stack ${stack.name} is missing required output ${key}`);
  }
  return value;
}
