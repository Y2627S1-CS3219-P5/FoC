/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested stable, request-correlated Supplier HTTP error formatting for
 * issue #17.
 * Author review: Reviewed and approved by @ron.
 */
import { ArgumentsHost, BadRequestException } from "@nestjs/common";

import { SupplierHttpExceptionFilter } from "./supplier-http-exception.filter";

describe("SupplierHttpExceptionFilter", () => {
  it("adds the server request ID while retaining useful validation fields", () => {
    const response = {
      status: jest.fn(),
      json: jest.fn(),
    };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: "server-generated-id" }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const exception = new BadRequestException({
      code: "SUPPLIER_VALIDATION_FAILED",
      message: "Please correct the query parameters.",
      fieldErrors: { size: "Provide an integer from 1 to 100." },
    });

    new SupplierHttpExceptionFilter().catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      code: "SUPPLIER_VALIDATION_FAILED",
      message: "Please correct the query parameters.",
      fieldErrors: { size: "Provide an integer from 1 to 100." },
      requestId: "server-generated-id",
    });
  });
});
