/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: enforced MEMBER and ADMINISTRATOR catalogue visibility for Supplier
 * list and detail reads in issue #17.
 * Author review: Required before merge.
 */
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import { VerifiedPrincipal } from "../../auth/session-verifier";
import { SupplierReadService } from "../read/supplier-read.service";
import {
  SupplierListPage,
  SupplierListQuery,
  SupplierReadModel,
} from "../read/supplier-read.types";

@Injectable()
export class SupplierCatalogueService {
  constructor(private readonly reads: SupplierReadService) {}

  list(
    query: SupplierListQuery,
    principal: VerifiedPrincipal,
  ): Promise<SupplierListPage> {
    if (query.status === "ARCHIVED" && principal.role !== "ADMINISTRATOR") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Only administrators may browse archived Suppliers.",
      });
    }
    return this.reads.list(query);
  }

  async get(
    supplierId: string,
    principal: VerifiedPrincipal,
  ): Promise<SupplierReadModel> {
    const active = await this.reads.findById(supplierId, "ACTIVE");
    if (active !== null) {
      return active;
    }

    if (principal.role === "ADMINISTRATOR") {
      const archived = await this.reads.findById(supplierId, "ARCHIVED");
      if (archived !== null) {
        return archived;
      }
    }

    throw supplierNotFound();
  }
}

function supplierNotFound(): NotFoundException {
  return new NotFoundException({
    code: "SUPPLIER_NOT_FOUND",
    message: "The Supplier was not found.",
  });
}
