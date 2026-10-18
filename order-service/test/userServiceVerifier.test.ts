/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Tests for UserServiceSessionVerifier against a real HTTP server standing in for User
 *        Service, the 503 answer when sessions can't be checked, and the startup check that
 *        refuses real credits with stub sessions.
 * Author review: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, describe, it } from "node:test";
import type { Pool } from "pg";
import { StubSupplierDirectory } from "../src/adapters/supplierDirectory";
import { SessionVerificationUnavailableError, UserServiceSessionVerifier } from "../src/adapters/sessionVerifier";
import { loadAdapterConfig, loadUserServiceConfig } from "../src/config";
import { createApp } from "../src/http/app";

const USER_ID = "A1111111-1111-4111-8111-111111111111";

// What the fake User Service does with the next /auth/verify request
let respond: (req: IncomingMessage, res: ServerResponse) => void;
let seenAuthorization: string | undefined;
let calls = 0;
let userService: Server;
let baseUrl: string;

before(async () => {
  userService = createServer((req, res) => {
    calls++;
    seenAuthorization = req.headers.authorization;
    assert.equal(req.url, "/auth/verify");
    respond(req, res);
  });
  await new Promise<void>((r) => userService.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(userService.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((r) => userService.close(() => r())));

const json = (status: number, body: unknown) => (_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

function verifier(timeoutMs = 1000) {
  return new UserServiceSessionVerifier({ baseUrl, timeoutMs });
}

describe("UserServiceSessionVerifier", () => {
  it("returns User Service's principal, forwarding the Authorization header unchanged", async () => {
    respond = json(200, { id: USER_ID, role: "ADMINISTRATOR" });
    assert.deepEqual(await verifier().verify("Bearer real.jwt.token"), { id: USER_ID.toLowerCase(), role: "ADMINISTRATOR" });
    assert.equal(seenAuthorization, "Bearer real.jwt.token");
  });

  it("treats 401 as not logged in, and a missing header without asking", async () => {
    respond = json(401, { error: "UNAUTHENTICATED" });
    assert.equal(await verifier().verify("Bearer expired"), null);
    const before = calls;
    assert.equal(await verifier().verify(undefined), null);
    assert.equal(calls, before);
  });

  it("does not believe a forged stub token: User Service rejects it", async () => {
    respond = json(401, { error: "UNAUTHENTICATED", message: "Invalid or expired token" });
    assert.equal(await verifier().verify(`Bearer stub.${USER_ID}.MEMBER`), null);
  });

  it("fails closed (unavailable, never a principal) on errors, redirects and malformed answers", async () => {
    const cases: [string, (req: IncomingMessage, res: ServerResponse) => void][] = [
      ["503", json(503, { error: "SERVICE_UNAVAILABLE" })],
      ["500", json(500, {})],
      ["redirect", (_q, res) => { res.writeHead(302, { Location: "http://example.com/" }); res.end(); }],
      ["not JSON", (_q, res) => { res.writeHead(200); res.end("<html>"); }],
      ["id not a UUID", json(200, { id: "1", role: "MEMBER" })],
      ["unknown role", json(200, { id: USER_ID, role: "ROOT" })],
      ["array", json(200, [])],
    ];
    for (const [name, handler] of cases) {
      respond = handler;
      await assert.rejects(verifier().verify("Bearer x"), SessionVerificationUnavailableError, name);
    }
  });

  it("fails closed when User Service is too slow or unreachable", async () => {
    respond = (_q, res) => setTimeout(() => json(200, { id: USER_ID, role: "MEMBER" })(_q, res), 300);
    await assert.rejects(verifier(50).verify("Bearer x"), SessionVerificationUnavailableError);
    const unreachable = new UserServiceSessionVerifier({ baseUrl: "http://127.0.0.1:1", timeoutMs: 500 });
    await assert.rejects(unreachable.verify("Bearer x"), SessionVerificationUnavailableError);
  });
});

describe("authentication in the HTTP app", () => {
  it("answers 503, not 401, when User Service can't be asked; 401 when it says no", async () => {
    const app = createApp({ pool: {} as Pool, verifier: verifier(), suppliers: new StubSupplierDirectory() }).listen(0);
    const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/errands/mine`;
    try {
      respond = json(503, {});
      const down = await fetch(url, { headers: { Authorization: "Bearer x" } });
      assert.equal(down.status, 503);
      assert.equal((await down.json()).error, "SERVICE_UNAVAILABLE");

      respond = json(401, {});
      assert.equal((await fetch(url, { headers: { Authorization: `Bearer stub.${USER_ID}.MEMBER` } })).status, 401);
    } finally {
      app.close();
    }
  });
});

describe("auth and credit mode config", () => {
  const KEYS = ["AUTH_MODE", "CREDIT_MODE", "USER_SERVICE_BASE_URL", "USER_SERVICE_VERIFY_TIMEOUT_MS"];
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("refuses real Kafka credits with stub sessions", () => {
    process.env.CREDIT_MODE = "kafka";
    for (const auth of ["stub", ""]) {
      process.env.AUTH_MODE = auth;
      assert.throws(() => loadAdapterConfig(), /CREDIT_MODE=kafka moves real credits, so it needs AUTH_MODE=user-service/);
    }
  });

  it("allows Kafka credits with User Service sessions, and stub sessions with stub credits", () => {
    process.env.CREDIT_MODE = "kafka";
    process.env.AUTH_MODE = "user-service";
    assert.equal(loadAdapterConfig().authMode, "user-service");
    process.env.CREDIT_MODE = "stub";
    process.env.AUTH_MODE = "stub";
    assert.equal(loadAdapterConfig().creditMode, "stub");
  });

  it("needs an absolute USER_SERVICE_BASE_URL; the timeout defaults to 1000 ms", () => {
    delete process.env.USER_SERVICE_BASE_URL;
    assert.throws(() => loadUserServiceConfig(), /USER_SERVICE_BASE_URL is not set/);
    process.env.USER_SERVICE_BASE_URL = "user-service:3001";
    assert.throws(() => loadUserServiceConfig(), /must be an absolute http\(s\) URL/);
    process.env.USER_SERVICE_BASE_URL = "http://user-service:3001";
    delete process.env.USER_SERVICE_VERIFY_TIMEOUT_MS;
    assert.deepEqual(loadUserServiceConfig(), { baseUrl: "http://user-service:3001", timeoutMs: 1000 });
  });

  it("rejects an unknown AUTH_MODE", () => {
    process.env.AUTH_MODE = "jwt";
    process.env.CREDIT_MODE = "stub";
    assert.throws(() => loadAdapterConfig(), /AUTH_MODE must be stub or user-service, not jwt/);
  });
});
