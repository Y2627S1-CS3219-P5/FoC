/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested Supplier controller delegation and exact strong detail ETag
 * behavior for issue #17.
 * Author review: Required before merge.
 */
import { GUARDS_METADATA } from "@nestjs/common/constants";

import {
  AuthenticatedSupplierRequest,
  SupplierAuthGuard,
} from "../../auth/supplier-auth.guard";
import { VerifiedPrincipal } from "../../auth/session-verifier";
import { SupplierReadModel } from "../read/supplier-read.types";
import { SupplierCatalogueService } from "./supplier-catalogue.service";
import { SupplierController } from "./supplier.controller";

const SUPPLIER_ID = "ac2288df-661c-5d78-bcc1-ac6bca30fe51";
const PRINCIPAL: VerifiedPrincipal = {
  id: "67ef02dc-814d-49e2-b6c2-9bdc433924c0",
  role: "MEMBER",
};

describe("SupplierController", () => {
  it("protects every controller route with the Supplier authentication guard", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SupplierController,
    ) as unknown[];

    expect(guards).toContain(SupplierAuthGuard);
  });

  it("delegates list using the guard-attached principal", async () => {
    const catalogue = createCatalogue();
    const page = { items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 };
    catalogue.list.mockResolvedValue(page);
    const controller = new SupplierController(catalogue);
    const query = { status: "ACTIVE" as const, page: 0, size: 12, sort: "name,asc" as const };

    await expect(controller.list(query, request())).resolves.toBe(page);
    expect(catalogue.list).toHaveBeenCalledWith(query, PRINCIPAL);
  });

  it("returns detail and sets the exact strong version ETag", async () => {
    const catalogue = createCatalogue();
    const supplier = createSupplier();
    catalogue.get.mockResolvedValue(supplier);
    const response = { setHeader: jest.fn() };
    const controller = new SupplierController(catalogue);

    await expect(
      controller.detail(SUPPLIER_ID, request(), response),
    ).resolves.toBe(supplier);
    expect(response.setHeader).toHaveBeenCalledWith("ETag", '"v7"');
  });
});

function createCatalogue(): jest.Mocked<SupplierCatalogueService> {
  return {
    list: jest.fn(),
    get: jest.fn(),
  } as unknown as jest.Mocked<SupplierCatalogueService>;
}

function request(): AuthenticatedSupplierRequest {
  return { headers: {}, principal: PRINCIPAL };
}

function createSupplier(): SupplierReadModel {
  return {
    id: SUPPLIER_ID,
    name: "Printer @ Com 2",
    categories: ["PRINTING"],
    buildingCode: "COM2",
    buildingLabel: "COM2",
    floor: "1",
    locationDescription: "Next to LT19",
    latitude: 1.2938347,
    longitude: 103.7744572,
    hoursKind: "INTERVAL",
    opensAt: "00:00",
    closesAt: "23:59",
    imagePath: "/assets/suppliers/PRINTER_COM2.jpeg",
    status: "ACTIVE",
    version: 7,
    createdAt: "2026-09-24T08:00:00.000Z",
    updatedAt: "2026-09-25T08:00:00.000Z",
    archivedAt: null,
  };
}
