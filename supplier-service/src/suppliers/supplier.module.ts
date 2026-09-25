/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: composed existing Supplier authentication and read-model seams behind
 * the catalogue HTTP API for issue #17.
 * Author review: Required before merge.
 */
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { SupplierCatalogueService } from "./http/supplier-catalogue.service";
import { SupplierController } from "./http/supplier.controller";
import { SupplierIdentifierPipe } from "./http/supplier-identifier.pipe";
import { SupplierListQueryPipe } from "./http/supplier-list-query.pipe";
import { SupplierReadModule } from "./read/supplier-read.module";

@Module({
  imports: [AuthModule, SupplierReadModule],
  controllers: [SupplierController],
  providers: [
    SupplierCatalogueService,
    SupplierIdentifierPipe,
    SupplierListQueryPipe,
  ],
})
export class SupplierModule {}
