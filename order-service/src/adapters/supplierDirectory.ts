/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: SupplierDirectory interface (the Order Service's only view of Supplier Service) and a stub
 *        with three fixed suppliers, implementing the approved plan.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: findSupplier with four outcomes and HttpSupplierDirectory, which asks the Supplier
 *        Service's GET /api/v1/suppliers/:id with the caller's token, per the User and Supplier
 *        integration plan.
 * Author review: PENDING
 */
import type { UpstreamConfig } from "../config";
import type { SupplierSnapshot } from "../errands/errand";
import { fetchWithTimeout, readJson, UpstreamContractError, UpstreamUnavailableError } from "./upstream";

export type SupplierLookup =
  | { kind: "active"; supplier: SupplierSnapshot }
  // Supplier shows archived suppliers to administrators only
  | { kind: "archived" }
  | { kind: "unavailable" }
  | { kind: "unauthenticated" };

export interface SupplierDirectory {
  /** Looks the supplier up on behalf of the caller whose Authorization header is given. */
  findSupplier(id: string, authorization: string): Promise<SupplierLookup>;
}

export const STUB_SUPPLIERS: readonly SupplierSnapshot[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Coffee Bean @ COM3",
    buildingCode: "COM3",
    locationDescription: "Ground floor, beside the lift lobby",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Printers @ PC Commons",
    buildingCode: "COM1",
    locationDescription: "PC Commons, Level 2",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "PGP Foyer",
    buildingCode: "PGP",
    locationDescription: "Prince George's Park residences, main foyer",
  },
];

export class StubSupplierDirectory implements SupplierDirectory {
  async findSupplier(id: string, _authorization: string): Promise<SupplierLookup> {
    const supplier = STUB_SUPPLIERS.find((s) => s.id === id);
    return supplier ? { kind: "active", supplier } : { kind: "unavailable" };
  }
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * Forwards the caller's Authorization header to Supplier Service GET /api/v1/suppliers/:id.
 * 404 is unavailable, 401 unauthenticated; 5xx, timeout or network error throws
 * UpstreamUnavailableError (503); any other status or an unexpected body throws
 * UpstreamContractError (500).
 */
export class HttpSupplierDirectory implements SupplierDirectory {
  constructor(private readonly config: UpstreamConfig, private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  async findSupplier(id: string, authorization: string): Promise<SupplierLookup> {
    // Callers pass a validated uuid, so the id needs no escaping
    const url = new URL(`/api/v1/suppliers/${id}`, this.config.baseUrl);
    const res = await fetchWithTimeout(this.fetchImpl, url, { headers: { authorization } }, this.config.timeoutMs, "supplier");
    if (res.status === 404) return { kind: "unavailable" };
    if (res.status === 401) return { kind: "unauthenticated" };
    if (res.status >= 500) throw new UpstreamUnavailableError("supplier", `status ${res.status}`);
    if (res.status !== 200) throw new UpstreamContractError("supplier", `status ${res.status}`);
    const b = (await readJson(res, "supplier")) as Record<string, unknown> | null;
    if (
      !nonEmpty(b?.id) || !nonEmpty(b.name) || !nonEmpty(b.buildingCode) || !nonEmpty(b.locationDescription) ||
      (b.status !== "ACTIVE" && b.status !== "ARCHIVED")
    ) {
      throw new UpstreamContractError("supplier", "supplier body is missing a field or has an unknown status");
    }
    if (b.status === "ARCHIVED") return { kind: "archived" };
    return {
      kind: "active",
      supplier: { id: b.id, name: b.name, buildingCode: b.buildingCode, locationDescription: b.locationDescription },
    };
  }
}
