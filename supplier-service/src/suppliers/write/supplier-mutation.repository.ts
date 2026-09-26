/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: defined the transactional persistence boundary for Supplier catalogue mutations.
 * Author review: Pending review by @ron.
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
    expectedVersion: number,
    values: SupplierMutationValues,
  ): Promise<UpdateSupplierResult>;

  abstract archive(
    supplierId: string,
    expectedVersion: number | null,
  ): Promise<ArchiveSupplierResult>;

  abstract restore(
    supplierId: string,
    expectedVersion: number,
  ): Promise<RestoreSupplierResult>;
}
