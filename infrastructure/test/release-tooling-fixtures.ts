// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import type { CommandRequest, CommandResult } from "../lib/commands.js";
import { DEPLOYMENT_TAGS } from "../lib/deployment-names.js";
import type { DeploymentConfig } from "../lib/config.js";

export function success(stdout = "{}"): CommandResult {
  return { status: 0, stdout, stderr: "" };
}

export function failure(stderr: string, status = 254): CommandResult {
  return { status, stdout: "", stderr };
}

export function argumentAfter(
  request: CommandRequest,
  name: string,
): string | undefined {
  const index = request.args.indexOf(name);
  return index < 0 ? undefined : request.args[index + 1];
}

export function stackResponse(
  config: DeploymentConfig,
  name: string,
  outputs: Readonly<Record<string, string>>,
  status = "CREATE_COMPLETE",
): CommandResult {
  return success(
    JSON.stringify({
      Stacks: [
        {
          StackName: name,
          StackId: `arn:aws:cloudformation:${name === "foc-demo-edge" ? config.edgeRegion : config.primaryRegion}:${config.accountId}:stack/${name}/exact-stack-id`,
          StackStatus: status,
          Tags: Object.entries({ ...DEPLOYMENT_TAGS, Owner: config.owner }).map(
            ([Key, Value]) => ({ Key, Value }),
          ),
          Outputs: Object.entries(outputs).map(([OutputKey, OutputValue]) => ({
            OutputKey,
            OutputValue,
          })),
        },
      ],
    }),
  );
}

export const DIGESTS = {
  frontend:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  userService:
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  supplierService:
    "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
} as const;
