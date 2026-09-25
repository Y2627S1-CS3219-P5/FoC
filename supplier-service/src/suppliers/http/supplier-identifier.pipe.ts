/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added Supplier Identifier validation that accepts durable UUIDv5 seed
 * identifiers for issue #17.
 * Author review: Required before merge.
 */
import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class SupplierIdentifierPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException({
        code: "SUPPLIER_VALIDATION_FAILED",
        message: "Please correct the Supplier Identifier.",
        fieldErrors: { id: "Supplier Identifier must be a UUID." },
      });
    }
    return value;
  }
}
