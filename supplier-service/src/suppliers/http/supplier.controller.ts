/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: exposed authenticated Supplier catalogue list and detail endpoints with
 * strong detail ETags for issue #17.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; exposed the
 * administrator mutation routes, statuses, and headers for issue #22.
 * Author review: Required before merge.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";

import {
  AuthenticatedSupplierRequest,
  RequireAuthentication,
  RequireSupplierRoles,
} from "../../auth/supplier-auth.guard";
import {
  SupplierListPage,
  SupplierListQuery,
  SupplierReadModel,
} from "../read/supplier-read.types";
import { SupplierAdministrationService } from "./supplier-administration.service";
import { SupplierCatalogueService } from "./supplier-catalogue.service";
import { SupplierIdentifierPipe } from "./supplier-identifier.pipe";
import { SupplierListQueryPipe } from "./supplier-list-query.pipe";
import {
  SupplierMutationBodyPipe,
  SupplierMutationInput,
} from "./supplier-mutation-body.pipe";

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

@Controller("api/v1/suppliers")
@RequireAuthentication()
export class SupplierController {
  constructor(
    private readonly catalogue: SupplierCatalogueService,
    private readonly administration: SupplierAdministrationService,
  ) {}

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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireSupplierRoles("ADMINISTRATOR")
  async create(
    @Body(SupplierMutationBodyPipe) values: SupplierMutationInput,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<SupplierReadModel> {
    const supplier = await this.administration.create(values);
    response.setHeader("Location", `/api/v1/suppliers/${supplier.id}`);
    response.setHeader("ETag", `"v${supplier.version}"`);
    return supplier;
  }

  @Put(":id")
  @RequireSupplierRoles("ADMINISTRATOR")
  async update(
    @Param("id", SupplierIdentifierPipe) supplierId: string,
    @Headers("if-match") ifMatch: unknown,
    @Body(SupplierMutationBodyPipe) values: SupplierMutationInput,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<SupplierReadModel> {
    const supplier = await this.administration.update(
      supplierId,
      ifMatch,
      values,
    );
    response.setHeader("ETag", `"v${supplier.version}"`);
    return supplier;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireSupplierRoles("ADMINISTRATOR")
  archive(
    @Param("id", SupplierIdentifierPipe) supplierId: string,
    @Headers("if-match") ifMatch: unknown,
  ): Promise<void> {
    return this.administration.archive(supplierId, ifMatch);
  }

  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  @RequireSupplierRoles("ADMINISTRATOR")
  async restore(
    @Param("id", SupplierIdentifierPipe) supplierId: string,
    @Headers("if-match") ifMatch: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<SupplierReadModel> {
    const supplier = await this.administration.restore(supplierId, ifMatch);
    response.setHeader("ETag", `"v${supplier.version}"`);
    return supplier;
  }
}
