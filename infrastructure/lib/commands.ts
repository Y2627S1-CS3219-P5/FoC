// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import { spawnSync } from "node:child_process";

export interface CommandRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly input?: string;
}

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (request: CommandRequest) => CommandResult;

export class CommandError extends Error {
  public constructor(
    message: string,
    public readonly request: CommandRequest,
    public readonly result: CommandResult,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export const systemCommandRunner: CommandRunner = (request) => {
  const result = spawnSync(request.executable, [...request.args], {
    cwd: request.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      AWS_CLI_AUTO_PROMPT: "off",
      AWS_PAGER: "",
      ...request.env,
    },
    input: request.input,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.error?.message ?? result.stderr ?? "",
  };
};

export function runChecked(
  runner: CommandRunner,
  request: CommandRequest,
  label: string,
): CommandResult {
  const result = runner(request);
  if (result.status !== 0) {
    const detail = safeCommandFailure(result);
    throw new CommandError(`${label} failed: ${detail}`, request, result);
  }
  return result;
}

export function safeCommandFailure(result: CommandResult): string {
  const text = (result.stderr || result.stdout).replace(/\s+/g, " ").trim();
  return text === "" ? `command exited ${result.status}` : text.slice(0, 500);
}

export function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} returned invalid JSON: ${reason}`, {
      cause: error,
    });
  }
}
