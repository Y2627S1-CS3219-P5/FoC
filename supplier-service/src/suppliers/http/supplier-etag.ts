/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: implemented the author-approved canonical strong Supplier ETag parser
 * for issue #20.
 * Author review: Required before merge.
 */
import { supplierValidationException } from "../../http/supplier-http-errors";

const CANONICAL_SUPPLIER_ETAG = /^"v(0|[1-9]\d*)"$/;

export function parseSupplierIfMatch(value: unknown): bigint {
  const match =
    typeof value === "string" ? CANONICAL_SUPPLIER_ETAG.exec(value) : null;
  if (!match) {
    throw supplierValidationException("Please correct the If-Match header.", {
      ifMatch:
        'If-Match must contain one canonical strong Supplier ETag, such as "v3".',
    });
  }
  return BigInt(match[1]);
}
