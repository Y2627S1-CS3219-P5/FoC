// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: issue #49 redacted User request-completion logging tests.
// Author review: PENDING.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { Request, Response } from "express";
import {
  createRequestCompletionMiddleware,
  USER_REQUEST_COMPLETED_EVENT,
  UserRequestCompletionLog,
} from "../src/httpLogging";

test("uses a server-owned ID and logs one redacted completion", () => {
  const events: UserRequestCompletionLog[] = [];
  const times = [1_000, 1_025];
  const middleware = createRequestCompletionMiddleware(
    () => times.shift() ?? 1_025,
    (event) => events.push(event),
  );
  const req = {
    method: "POST",
    path: "/auth/login",
    originalUrl: "/auth/login?token=do-not-log",
    headers: { "x-request-id": "client-controlled" },
  } as unknown as Request;
  const responseEmitter = new EventEmitter();
  const headers = new Map<string, string>();
  const res = Object.assign(responseEmitter, {
    locals: {},
    statusCode: 200,
    writableFinished: true,
    setHeader: (name: string, value: string) => headers.set(name, value),
  }) as unknown as Response;
  let nextCalls = 0;

  middleware(req, res, () => {
    nextCalls += 1;
  });
  responseEmitter.emit("finish");
  responseEmitter.emit("close");

  assert.equal(nextCalls, 1);
  assert.equal(events.length, 1);
  assert.match(headers.get("X-Request-Id") ?? "", /^[0-9a-f-]{36}$/);
  assert.deepEqual(events[0], {
    event: USER_REQUEST_COMPLETED_EVENT,
    requestId: headers.get("X-Request-Id"),
    method: "POST",
    pathname: "/auth/login",
    status: 200,
    result: "completed",
    durationMs: 25,
  });
  assert.doesNotMatch(JSON.stringify(events), /token|do-not-log|client-controlled/);
});

test("marks an early close as aborted", () => {
  const events: UserRequestCompletionLog[] = [];
  const middleware = createRequestCompletionMiddleware(
    (() => {
      let now = 10;
      return () => (now += 5);
    })(),
    (event) => events.push(event),
  );
  const responseEmitter = new EventEmitter();
  const res = Object.assign(responseEmitter, {
    locals: {},
    statusCode: 503,
    writableFinished: false,
    setHeader: () => undefined,
  }) as unknown as Response;

  middleware(
    { method: "GET", path: "/health" } as Request,
    res,
    () => undefined,
  );
  responseEmitter.emit("close");

  assert.equal(events.length, 1);
  assert.equal(events[0]?.result, "aborted");
  assert.equal(events[0]?.pathname, "/health");
});
