/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: implemented transactional Supplier create, update, archive, and restore persistence with optimistic concurrency.
 * Author review: Pending review by @ron.
 */
import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../database/database.service";
import { SupplierCategory } from "../../database/schema";
import { mapSupplierReadModel } from "../read/supplier-read.mapper";
import {
  buildDuplicateIdentityLockQuery,
  buildDuplicateSupplierQuery,
  buildSupplierArchiveQuery,
  buildSupplierCategoriesDeleteQuery,
  buildSupplierCategoriesForUpdateQuery,
  buildSupplierCategoriesInsertQuery,
  buildSupplierInsertQuery,
  buildSupplierLockQuery,
  buildSupplierRestoreQuery,
  buildSupplierUpdateQuery,
  SupplierMutationDatabase,
} from "./drizzle-supplier-mutation.queries";
import { SupplierMutationRepository } from "./supplier-mutation.repository";
import {
  ArchiveSupplierResult,
  CreateSupplierResult,
  RestoreSupplierResult,
  SupplierMutationValues,
  UpdateSupplierResult,
} from "./supplier-mutation.types";

@Injectable()
export class DrizzleSupplierMutationRepository extends SupplierMutationRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async create(
    values: SupplierMutationValues,
  ): Promise<CreateSupplierResult> {
    return this.database.client.transaction(async (transaction) => {
      await buildDuplicateIdentityLockQuery(transaction, values);

      const [duplicate] = await buildDuplicateSupplierQuery(
        transaction,
        values,
      );
      if (duplicate !== undefined) {
        return {
          kind: "duplicate",
          existingSupplierId: duplicate.id,
        };
      }

      const [inserted] = await buildSupplierInsertQuery(transaction, values);
      if (inserted === undefined) {
        throw new Error("Supplier insert returned no committed row");
      }

      const categories = await this.insertCategories(
        transaction,
        inserted.id,
        values.categories,
      );

      return {
        kind: "created",
        supplier: mapSupplierReadModel(inserted, categories),
      };
    });
  }

  async update(
    supplierId: string,
    expectedVersion: number,
    values: SupplierMutationValues,
  ): Promise<UpdateSupplierResult> {
    return this.database.client.transaction(async (transaction) => {
      const [current] = await buildSupplierLockQuery(
        transaction,
        supplierId,
      );
      if (current === undefined) {
        return { kind: "not-found" };
      }
      if (current.version !== expectedVersion) {
        return { kind: "stale" };
      }

      const [updated] = await buildSupplierUpdateQuery(
        transaction,
        supplierId,
        expectedVersion,
        current.status,
        values,
      );
      if (updated === undefined) {
        return { kind: "stale" };
      }

      await buildSupplierCategoriesDeleteQuery(transaction, supplierId);
      const categories = await this.insertCategories(
        transaction,
        supplierId,
        values.categories,
      );

      return {
        kind: "updated",
        supplier: mapSupplierReadModel(updated, categories),
      };
    });
  }

  async archive(
    supplierId: string,
    expectedVersion: number | null,
  ): Promise<ArchiveSupplierResult> {
    return this.database.client.transaction(async (transaction) => {
      const [current] = await buildSupplierLockQuery(
        transaction,
        supplierId,
      );
      if (current === undefined) {
        return { kind: "not-found" };
      }
      if (current.status === "ARCHIVED") {
        return { kind: "already-archived" };
      }
      if (expectedVersion === null) {
        return { kind: "precondition-required" };
      }
      if (current.version !== expectedVersion) {
        return { kind: "stale" };
      }

      const [archived] = await buildSupplierArchiveQuery(
        transaction,
        supplierId,
        expectedVersion,
      );
      if (archived === undefined) {
        return { kind: "stale" };
      }

      return { kind: "archived" };
    });
  }

  async restore(
    supplierId: string,
    expectedVersion: number,
  ): Promise<RestoreSupplierResult> {
    return this.database.client.transaction(async (transaction) => {
      const [current] = await buildSupplierLockQuery(
        transaction,
        supplierId,
      );
      if (current === undefined) {
        return { kind: "not-found" };
      }
      if (current.version !== expectedVersion) {
        return { kind: "stale" };
      }

      if (current.status === "ACTIVE") {
        const categories = await this.loadCategories(
          transaction,
          supplierId,
        );
        return {
          kind: "already-active",
          supplier: mapSupplierReadModel(current, categories),
        };
      }

      const [restored] = await buildSupplierRestoreQuery(
        transaction,
        supplierId,
        expectedVersion,
      );
      if (restored === undefined) {
        return { kind: "stale" };
      }

      const categories = await this.loadCategories(
        transaction,
        supplierId,
      );
      return {
        kind: "restored",
        supplier: mapSupplierReadModel(restored, categories),
      };
    });
  }

  private async insertCategories(
    database: SupplierMutationDatabase,
    supplierId: string,
    categories: readonly SupplierCategory[],
  ): Promise<readonly SupplierCategory[]> {
    const inserted = await buildSupplierCategoriesInsertQuery(
      database,
      supplierId,
      categories,
    );
    return inserted.map(({ category }) => category).sort();
  }

  private async loadCategories(
    database: SupplierMutationDatabase,
    supplierId: string,
  ): Promise<readonly SupplierCategory[]> {
    const rows = await buildSupplierCategoriesForUpdateQuery(
      database,
      supplierId,
    );
    return rows.map(({ category }) => category);
  }
}
