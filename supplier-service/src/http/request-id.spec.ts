/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested server-owned request identifier generation for issue #17.
 * Author review: Required before merge.
 */
import { assignServerRequestId } from "./request-id";

describe("assignServerRequestId", () => {
  it("generates a UUID and ignores an inbound request identifier", () => {
    const request = { requestId: "client-controlled" };
    const response = { setHeader: jest.fn() };
    const next = jest.fn();

    assignServerRequestId(request, response, next);

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(request.requestId).not.toBe("client-controlled");
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Request-Id",
      request.requestId,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
