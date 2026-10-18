// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: issue #49 server-owned request IDs and non-sensitive completion logs.
// Author review: PENDING.
import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

export const USER_REQUEST_COMPLETED_EVENT = "user.http.request.completed";

export interface UserRequestCompletionLog {
  event: typeof USER_REQUEST_COMPLETED_EVENT;
  requestId: string;
  method: string;
  pathname: string;
  status: number;
  result: "completed" | "aborted";
  durationMs: number;
}

export function createRequestCompletionMiddleware(
  now: () => number = Date.now,
  write: (completion: UserRequestCompletionLog) => void = (completion) =>
    console.info(completion),
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    const startedAt = now();
    const method = req.method;
    const pathname = req.path || "/";
    let logged = false;

    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const logOnce = (result: "completed" | "aborted"): void => {
      if (logged) return;
      logged = true;
      write({
        event: USER_REQUEST_COMPLETED_EVENT,
        requestId,
        method,
        pathname,
        status: res.statusCode,
        result,
        durationMs: Math.max(0, Math.round(now() - startedAt)),
      });
    };

    res.once("finish", () => logOnce("completed"));
    res.once("close", () =>
      logOnce(res.writableFinished ? "completed" : "aborted"),
    );
    next();
  };
}
