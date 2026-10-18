import type { DeploymentConfig } from "./config.js";
import { parseJson, runChecked, type CommandRunner } from "./commands.js";
import {
  assertAwsIdentity,
  awsArgs,
  loadValidatedStack,
  requireOutput,
} from "./stack-outputs.js";

interface SecretResponse {
  readonly SecretString?: string;
}

export interface SmokeEvidence {
  readonly baseUrl: string;
  readonly forbiddenRoutes: Readonly<Record<string, number>>;
  readonly apiJourneys: "PASS";
  readonly browserJourneys: "PASS";
}

export function runCloudSmoke(options: {
  readonly config: DeploymentConfig;
  readonly runner: CommandRunner;
  readonly repositoryRoot: string;
}): SmokeEvidence {
  const { config, runner, repositoryRoot } = options;
  assertAwsIdentity(config, runner);
  loadValidatedStack(config, runner, "foundation");
  loadValidatedStack(config, runner, "application");
  const data = loadValidatedStack(config, runner, "data", [
    "BootstrapAdministratorSecretArn",
  ]);
  const edge = loadValidatedStack(config, runner, "edge", [
    "DistributionDomainName",
  ]);
  const baseUrl = `https://${requireOutput(edge, "DistributionDomainName")}`;
  requireStatus(runner, `${baseUrl}/`, 200);
  const forbiddenRoutes = Object.fromEntries(
    [
      "/healthz",
      "/health",
      "/auth/verify",
      "/api/v1/auth/verify",
      "/api/docs",
      "/api/docs-json",
    ].map((path) => [path, requireStatus(runner, `${baseUrl}${path}`, 404)]),
  );
  const password = readSecret(
    config,
    runner,
    requireOutput(data, "BootstrapAdministratorSecretArn"),
  );
  const suffix = `${Date.now()}${process.pid}`.slice(-12);
  const memberUsername = `cloud_member_${suffix}`;
  const environment = {
    API_GATEWAY_BASE_URL: baseUrl,
    API_ADMIN_USERNAME: config.bootstrapAdministrator.username,
    API_ADMIN_PASSWORD: password,
    SUPPLIER_UI_BASE_URL: baseUrl,
    SUPPLIER_UI_ADMIN_USERNAME: config.bootstrapAdministrator.username,
    SUPPLIER_UI_ADMIN_PASSWORD: password,
    SUPPLIER_UI_MEMBER_USERNAME: memberUsername,
    SUPPLIER_UI_MEMBER_EMAIL: `${memberUsername}@u.nus.edu`,
    SUPPLIER_UI_MEMBER_PASSWORD: `CloudMember${suffix}Aa1`,
  };
  runChecked(
    runner,
    {
      executable: "bash",
      args: ["supplier-service/scripts/api-demo/run-all.sh"],
      cwd: repositoryRoot,
      env: environment,
    },
    "CloudFront API journeys",
  );
  runChecked(
    runner,
    {
      executable: "npm",
      args: ["--prefix", "frontend", "run", "test:e2e:browser"],
      cwd: repositoryRoot,
      env: environment,
    },
    "CloudFront browser journeys",
  );
  return {
    baseUrl,
    forbiddenRoutes,
    apiJourneys: "PASS",
    browserJourneys: "PASS",
  };
}

export function runReadinessSmoke(
  runner: CommandRunner,
  domainName: string,
): void {
  requireStatus(runner, `https://${domainName}/`, 200);
  requireStatus(runner, `https://${domainName}/api/v1/whoami`, 401);
}

function requireStatus(
  runner: CommandRunner,
  url: string,
  expected: number,
): number {
  const status = runChecked(
    runner,
    {
      executable: "curl",
      args: [
        "--silent",
        "--show-error",
        "--location",
        "--connect-timeout",
        "10",
        "--max-time",
        "30",
        "--output",
        "/dev/null",
        "--write-out",
        "%{http_code}",
        url,
      ],
    },
    `request ${url}`,
  ).stdout.trim();
  if (status !== String(expected)) {
    throw new Error(`${url} returned HTTP ${status}; expected ${expected}`);
  }
  return expected;
}

function readSecret(
  config: DeploymentConfig,
  runner: CommandRunner,
  secretArn: string,
): string {
  const result = runChecked(
    runner,
    {
      executable: "aws",
      args: awsArgs(config, config.primaryRegion, [
        "secretsmanager",
        "get-secret-value",
        "--secret-id",
        secretArn,
      ]),
    },
    "retrieve bootstrap administrator credential",
  );
  const secret = parseJson<SecretResponse>(result.stdout, "Secrets Manager");
  if (secret.SecretString === undefined || secret.SecretString === "") {
    throw new Error("Bootstrap administrator secret has no SecretString");
  }
  try {
    const parsed = JSON.parse(secret.SecretString) as { password?: unknown };
    if (typeof parsed.password === "string" && parsed.password !== "") {
      return parsed.password;
    }
  } catch {
    // The generated bootstrap password is currently stored as a plain string.
  }
  return secret.SecretString;
}
