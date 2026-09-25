/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added non-sensitive, request-correlated Supplier HTTP error responses
 * for issue #17.
 * Author review: Required before merge.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { RequestWithRequestId } from "./request-id";

interface ErrorResponse {
  status(statusCode: number): ErrorResponse;
  json(body: SupplierErrorBody): void;
}

interface SupplierErrorBody {
  code: string;
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
  requestId: string;
}

interface ErrorPayload {
  code?: unknown;
  message?: unknown;
  fieldErrors?: unknown;
}

const DEFAULT_ERRORS: Readonly<
  Record<number, Pick<SupplierErrorBody, "code" | "message">>
> = {
  [HttpStatus.BAD_REQUEST]: {
    code: "SUPPLIER_VALIDATION_FAILED",
    message: "The request is invalid.",
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: "UNAUTHENTICATED",
    message: "A valid bearer token is required.",
  },
  [HttpStatus.FORBIDDEN]: {
    code: "FORBIDDEN",
    message: "You do not have permission to perform this action.",
  },
  [HttpStatus.NOT_FOUND]: {
    code: "SUPPLIER_NOT_FOUND",
    message: "The Supplier was not found.",
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: "SERVICE_UNAVAILABLE",
    message: "The service is temporarily unavailable.",
  },
};

@Catch()
export class SupplierHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithRequestId>();
    const response = http.getResponse<ErrorResponse>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const fallback = DEFAULT_ERRORS[status] ?? {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    };
    const payload = this.getPayload(exception);

    const body: SupplierErrorBody = {
      code: typeof payload.code === "string" ? payload.code : fallback.code,
      message:
        typeof payload.message === "string"
          ? payload.message
          : fallback.message,
      requestId: request.requestId ?? randomFallbackRequestId(),
    };
    if (isFieldErrors(payload.fieldErrors)) {
      body.fieldErrors = payload.fieldErrors;
    }

    response.status(status).json(body);
  }

  private getPayload(exception: unknown): ErrorPayload {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    if (typeof response !== "object" || response === null || Array.isArray(response)) {
      return typeof response === "string" ? { message: response } : {};
    }
    return response as ErrorPayload;
  }
}

function isFieldErrors(
  value: unknown,
): value is Readonly<Record<string, string>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((error) => typeof error === "string")
  );
}

function randomFallbackRequestId(): string {
  // The middleware normally owns ID creation. Avoid reflecting any inbound ID
  // if an adapter invokes the filter without running middleware first.
  return randomUUID();
}
