/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added server-generated request identifiers for Supplier HTTP responses
 * and error correlation in issue #17.
 * Author review: Required before merge.
 */
import { randomUUID } from "node:crypto";

export interface RequestWithRequestId {
  requestId?: string;
}

interface ResponseWithHeaders {
  setHeader(name: string, value: string): void;
}

type Next = () => void;

export function assignServerRequestId(
  request: RequestWithRequestId,
  response: ResponseWithHeaders,
  next: Next,
): void {
  const requestId = randomUUID();
  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
}
