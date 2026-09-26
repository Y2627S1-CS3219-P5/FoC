/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: defined the transactional persistence boundary for Supplier catalogue mutations.
 * Author review: Pending review by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; widened parsed
 * HTTP versions to bigint at the persistence boundary for issue #22.
 * Author review: Required before merge.
 */
import {
  ArchiveSupplierResult,
  CreateSupplierResult,
  RestoreSupplierResult,
  SupplierMutationValues,
  UpdateSupplierResult,
} from "./supplier-mutation.types";

export abstract class SupplierMutationRepository {
  abstract create(
    values: SupplierMutationValues,
  ): Promise<CreateSupplierResult>;

  abstract update(
    supplierId: string,
    expectedVersion: bigint,
    values: SupplierMutationValues,
  ): Promise<UpdateSupplierResult>;

  abstract archive(
    supplierId: string,
    expectedVersion: bigint | null,
  ): Promise<ArchiveSupplierResult>;

  abstract restore(
    supplierId: string,
    expectedVersion: bigint,
  ): Promise<RestoreSupplierResult>;
}
