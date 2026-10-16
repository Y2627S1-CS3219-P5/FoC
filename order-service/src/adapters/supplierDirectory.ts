/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: SupplierDirectory interface (the Order Service's only view of Supplier Service) and a stub
 *        with three fixed suppliers, implementing the approved plan.
 * Author review: PENDING
 */
import type { SupplierSnapshot } from "../errands/errand";

export interface SupplierDirectory {
  /** The supplier's current details, or null if it doesn't exist or isn't active. */
  getActiveSupplier(id: string): Promise<SupplierSnapshot | null>;
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
  async getActiveSupplier(id: string): Promise<SupplierSnapshot | null> {
    return STUB_SUPPLIERS.find((s) => s.id === id) ?? null;
  }
}
