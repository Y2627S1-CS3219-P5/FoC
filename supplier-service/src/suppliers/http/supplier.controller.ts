/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: exposed authenticated Supplier catalogue list and detail endpoints with
 * strong detail ETags for issue #17.
 * Author review: Reviewed and approved by @ron.
 */
import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";

import {
  AuthenticatedSupplierRequest,
  RequireAuthentication,
} from "../../auth/supplier-auth.guard";
import {
  SupplierListPage,
  SupplierListQuery,
  SupplierReadModel,
} from "../read/supplier-read.types";
import { SupplierCatalogueService } from "./supplier-catalogue.service";
import { SupplierIdentifierPipe } from "./supplier-identifier.pipe";
import { SupplierListQueryPipe } from "./supplier-list-query.pipe";

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

@Controller("api/v1/suppliers")
@RequireAuthentication()
export class SupplierController {
  constructor(private readonly catalogue: SupplierCatalogueService) {}

  @Get()
  list(
    @Query(SupplierListQueryPipe) query: SupplierListQuery,
    @Req() request: AuthenticatedSupplierRequest,
  ): Promise<SupplierListPage> {
    return this.catalogue.list(query, request.principal);
  }

  @Get(":id")
  async detail(
    @Param("id", SupplierIdentifierPipe) supplierId: string,
    @Req() request: AuthenticatedSupplierRequest,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<SupplierReadModel> {
    const supplier = await this.catalogue.get(supplierId, request.principal);
    response.setHeader("ETag", `"v${supplier.version}"`);
    return supplier;
  }
}
