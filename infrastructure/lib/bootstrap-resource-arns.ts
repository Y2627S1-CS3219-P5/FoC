// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: Exclude only proven shared CDKToolkit inventory from tagged residue.
// Author review: PENDING.
import { z } from "zod";
import type { DeploymentConfig } from "./config.js";
import {
  parseJson,
  runChecked,
  safeCommandFailure,
  type CommandRunner,
} from "./commands.js";
import { awsArgs } from "./stack-outputs.js";

/** This inventory is read-only; shared bootstrap resources are never deleted. */
export function readBootstrapResourceArns(
  config: DeploymentConfig,
  runner: CommandRunner,
  region: string,
): ReadonlySet<string> {
  const description = runner({
    executable: "aws",
    args: awsArgs(config, region, [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      "CDKToolkit",
    ]),
  });
  if (
    description.status !== 0 &&
    /ValidationError.*does not exist/i.test(
      description.stderr || description.stdout,
    )
  )
    return new Set();
  if (description.status !== 0)
    throw new Error(
      `Cannot read exact shared bootstrap stack: ${safeCommandFailure(description)}`,
    );
  const stacks = z
    .object({
      Stacks: z
        .array(
          z.object({ StackName: z.literal("CDKToolkit"), StackId: z.string() }),
        )
        .length(1),
    })
    .parse(parseJson<unknown>(description.stdout, "bootstrap stack identity"));
  const stackId = stacks.Stacks[0]!.StackId;
  if (
    !stackId.startsWith(
      `arn:aws:cloudformation:${region}:${config.accountId}:stack/CDKToolkit/`,
    )
  ) {
    throw new Error(
      "Shared bootstrap stack identity does not match the approved account/region",
    );
  }
  const resources = runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, region, [
        "cloudformation",
        "list-stack-resources",
        "--stack-name",
        "CDKToolkit",
      ]),
    },
    "read exact shared bootstrap resources",
  );
  const parsed = z
    .object({
      StackResourceSummaries: z.array(
        z.object({
          ResourceType: z.string(),
          PhysicalResourceId: z.string().optional(),
        }),
      ),
    })
    .parse(parseJson<unknown>(resources.stdout, "shared bootstrap inventory"));
  const arns = new Set([stackId]);
  for (const resource of parsed.StackResourceSummaries) {
    const id = resource.PhysicalResourceId;
    if (id === undefined) continue;
    switch (resource.ResourceType) {
      case "AWS::S3::Bucket":
        arns.add(`arn:aws:s3:::${id}`);
        break;
      case "AWS::ECR::Repository":
        arns.add(`arn:aws:ecr:${region}:${config.accountId}:repository/${id}`);
        break;
      case "AWS::IAM::Role":
        arns.add(`arn:aws:iam::${config.accountId}:role/${id}`);
        break;
      case "AWS::SSM::Parameter":
        arns.add(
          `arn:aws:ssm:${region}:${config.accountId}:parameter/${id.replace(/^\//, "")}`,
        );
        break;
    }
  }
  return arns;
}
