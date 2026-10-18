// Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: verified-TLS RDS configuration regression tests. Author review: PENDING.
/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested required, bounded User Service verification runtime
 * configuration for issue #16.
 * Author review: Reviewed and approved by @ron.
 */
import { getSessionVerificationConfiguration } from "./environment";
import { getDatabaseConfig } from "./environment";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_BASE_URL = process.env.USER_SERVICE_BASE_URL;
const ORIGINAL_TIMEOUT = process.env.USER_SERVICE_VERIFY_TIMEOUT_MS;

function restoreEnvironmentVariable(
  name: "USER_SERVICE_BASE_URL" | "USER_SERVICE_VERIFY_TIMEOUT_MS",
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("getSessionVerificationConfiguration", () => {
  afterEach(() => {
    restoreEnvironmentVariable("USER_SERVICE_BASE_URL", ORIGINAL_BASE_URL);
    restoreEnvironmentVariable(
      "USER_SERVICE_VERIFY_TIMEOUT_MS",
      ORIGINAL_TIMEOUT,
    );
  });

  it("parses an HTTP(S) base URL and positive timeout", () => {
    process.env.USER_SERVICE_BASE_URL = "http://user-service:3001";
    process.env.USER_SERVICE_VERIFY_TIMEOUT_MS = "750";

    expect(getSessionVerificationConfiguration()).toEqual({
      userServiceBaseUrl: "http://user-service:3001/",
      timeoutMs: 750,
    });
  });

  it.each([undefined, "", "ftp://user-service", "not a URL"])(
    "rejects invalid base URL %p",
    (baseUrl) => {
      restoreEnvironmentVariable("USER_SERVICE_BASE_URL", baseUrl);
      process.env.USER_SERVICE_VERIFY_TIMEOUT_MS = "750";

      expect(() => getSessionVerificationConfiguration()).toThrow(
        /USER_SERVICE_BASE_URL/,
      );
    },
  );

  it.each([undefined, "", "0", "1.5", "-1", "2147483648"])(
    "rejects invalid timeout %p",
    (timeout) => {
      process.env.USER_SERVICE_BASE_URL = "https://users.example.test";
      restoreEnvironmentVariable("USER_SERVICE_VERIFY_TIMEOUT_MS", timeout);

      expect(() => getSessionVerificationConfiguration()).toThrow(
        /USER_SERVICE_VERIFY_TIMEOUT_MS/,
      );
    },
  );
});

describe("getDatabaseConfig", () => {
  const names = [
    "DATABASE_URL",
    "DATABASE_HOST",
    "DATABASE_PORT",
    "DATABASE_NAME",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "DATABASE_SSL_CA_PATH",
  ] as const;
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  let directory: string;

  beforeEach(() => {
    names.forEach((name) => delete process.env[name]);
    directory = mkdtempSync(join(tmpdir(), "foc-supplier-db-config-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    for (const name of names) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("retains the local DATABASE_URL path", () => {
    process.env.DATABASE_URL = "postgres://local@localhost/supplier";
    expect(getDatabaseConfig()).toEqual({
      connectionString: "postgres://local@localhost/supplier",
    });
  });

  it("builds verified TLS configuration from complete cloud settings", () => {
    const caPath = join(directory, "rds.pem");
    writeFileSync(caPath, "TEST CA\n");
    Object.assign(process.env, {
      DATABASE_HOST: "foc.example.ap-southeast-1.rds.amazonaws.com",
      DATABASE_PORT: "5432",
      DATABASE_NAME: "supplier",
      DATABASE_USER: "supplier_app",
      DATABASE_PASSWORD: "never-render-me",
      DATABASE_SSL_CA_PATH: caPath,
    });

    expect(getDatabaseConfig()).toEqual({
      host: "foc.example.ap-southeast-1.rds.amazonaws.com",
      port: 5432,
      database: "supplier",
      user: "supplier_app",
      password: "never-render-me",
      ssl: {
        ca: "TEST CA\n",
        rejectUnauthorized: true,
        servername: "foc.example.ap-southeast-1.rds.amazonaws.com",
      },
    });
  });

  it("fails closed without exposing a password", () => {
    Object.assign(process.env, {
      DATABASE_HOST: "db.example.test",
      DATABASE_PORT: "bad",
      DATABASE_NAME: "supplier",
      DATABASE_USER: "supplier_app",
      DATABASE_PASSWORD: "never-render-me",
      DATABASE_SSL_CA_PATH: join(directory, "missing.pem"),
    });
    expect(() => getDatabaseConfig()).toThrow(/DATABASE_PORT/);
    try {
      getDatabaseConfig();
    } catch (error) {
      expect(String(error)).not.toContain("never-render-me");
    }

    process.env.DATABASE_PORT = "5432";
    expect(() => getDatabaseConfig()).toThrow(/cannot be read/);
    process.env.DATABASE_URL = "postgres://secret@localhost/supplier";
    expect(() => getDatabaseConfig()).toThrow(/cannot be combined/);
  });
});
