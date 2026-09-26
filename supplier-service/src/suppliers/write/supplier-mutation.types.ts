/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: defined the editable Supplier values and persistence outcomes for the approved mutation contract.
 * Author review: Pending review by @ron.
 */
import { SupplierCategory } from "../../database/schema";
import { BuildingCode } from "../../domain/buildings";
import { SupplierReadModel } from "../read/supplier-read.types";

export interface SupplierMutationValues {
  readonly name: string;
  readonly categories: readonly SupplierCategory[];
  readonly buildingCode: BuildingCode;
  readonly floor: string | null;
  readonly locationDescription: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly hoursKind: "UNKNOWN" | "ALL_DAY" | "INTERVAL";
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

export type CreateSupplierResult =
  | {
      readonly kind: "created";
      readonly supplier: SupplierReadModel;
    }
  | {
      readonly kind: "duplicate";
      readonly existingSupplierId: string;
    };

export type UpdateSupplierResult =
  | {
      readonly kind: "updated";
      readonly supplier: SupplierReadModel;
    }
  | {
      readonly kind: "not-found" | "stale";
    };

export type ArchiveSupplierResult =
  | {
      readonly kind: "archived" | "already-archived";
    }
  | {
      readonly kind: "not-found" | "precondition-required" | "stale";
    };

export type RestoreSupplierResult =
  | {
      readonly kind: "restored" | "already-active";
      readonly supplier: SupplierReadModel;
    }
  | {
      readonly kind: "not-found" | "stale";
    };
