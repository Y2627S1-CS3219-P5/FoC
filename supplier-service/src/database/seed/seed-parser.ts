/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: implemented deterministic parsing and approved value mappings for the repository Supplier CSV.
 * Author review required before submission.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { parse } from "csv-parse/sync";

import {
  BuildingCode,
  NewSupplier,
  SupplierCategory,
} from "../schema";

export const EXPECTED_SEED_ROW_COUNT = 21;

const SEED_ID_NAMESPACE = "5b834adc-f6ea-5e0f-994c-8c247c102f5c";

const BUILDING_CODE_BY_ALIAS: Readonly<Record<string, BuildingCode>> = {
  "Com 2": "COM2",
  Com2: "COM2",
  COM3: "COM3",
  "Central Library": "CENTRAL_LIBRARY",
  "Engineering Block E3": "ENG_E3",
  "Engineering Block E4": "ENG_E4",
  "Engineering Block EA": "ENG_EA",
  Frontier: "FRONTIER",
  Terrace: "TERRACE",
  "The Ridge": "THE_RIDGE",
  "Yusof Ishak House": "YIH",
  "Prince George's Park": "PGP",
  "Hon Sui Sen Memorial Library": "HSSML",
  "Medicine+Science Library": "MED_SCI_LIBRARY",
  "Blk AS8": "AS8",
  "innovation4.0": "INNOVATION_4_0",
};

const CATEGORY_MAPPINGS: Readonly<
  Record<string, readonly SupplierCategory[]>
> = {
  Food: ["FOOD"],
  "Food/Coffee": ["FOOD", "COFFEE"],
  Printing: ["PRINTING"],
  Shopping: ["SHOPPING"],
};

const BUNDLED_IMAGE_NAMES = new Set([
  "ANNA.jpeg",
  "COOL_SPOT.jpeg",
  "INSTACHEF.jpeg",
  "NUS_COOP.jpeg",
  "PRINTER_COM2.jpeg",
  "ROBOT_CAFE.jpeg",
]);

interface CsvSupplierRow {
  Name: string;
  Type: string;
  Building: string;
  Floor: string;
  "Location Description": string;
  Latitude: string;
  Longitude: string;
  StartingTime: string;
  ClosingTime: string;
  ImageURL: string;
}

export interface SeedSupplier {
  supplier: NewSupplier & { id: string };
  categories: readonly SupplierCategory[];
}

export interface SeedPhysicalOrigin {
  name: string;
  buildingCode: BuildingCode;
  floor: string | null;
  locationDescription: string;
}

export function decodeSupplierSeedCsv(csv: Uint8Array): string {
  return new TextDecoder("windows-1252", { fatal: true }).decode(csv);
}

export function parseSupplierSeedCsv(csv: string): SeedSupplier[] {
  const rows = parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  }) as CsvSupplierRow[];
  const seenIds = new Set<string>();

  return rows.map((row, index) => {
    const name = requiredText(row.Name, "Name", index);
    const buildingCode = mapBuildingCode(row.Building, index);
    const categories = mapCategories(row.Type, index);
    const locationDescription = requiredText(
      row["Location Description"],
      "Location Description",
      index,
    );
    const floor = optionalText(row.Floor);
    const coordinates = parseCoordinates(row, index);
    const opensAt = parseSourceTime(row.StartingTime, "StartingTime", index);
    const closesAt = parseSourceTime(row.ClosingTime, "ClosingTime", index);

    if (opensAt === closesAt) {
      throw rowError(index, "opening and closing times must differ");
    }

    const id = createStableSeedId({
      name,
      buildingCode,
      floor,
      locationDescription,
    });
    if (seenIds.has(id)) {
      throw rowError(index, `duplicate seed identity for ${name}`);
    }
    seenIds.add(id);

    return {
      supplier: {
        id,
        name,
        buildingCode,
        floor,
        locationDescription,
        ...coordinates,
        hoursKind: "INTERVAL",
        opensAt,
        closesAt,
        imagePath: mapImagePath(row.ImageURL, index),
        status: "ACTIVE",
        version: 0,
      },
      categories,
    };
  });
}

export function createStableSeedId(origin: SeedPhysicalOrigin): string {
  const namespaceBytes = Buffer.from(SEED_ID_NAMESPACE.replaceAll("-", ""), "hex");
  const digest = createHash("sha1")
    .update(namespaceBytes)
    .update(
      Buffer.from(
        JSON.stringify([
          origin.name,
          origin.buildingCode,
          origin.floor,
          origin.locationDescription,
        ]),
        "utf8",
      ),
    )
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function mapBuildingCode(value: string, index: number): BuildingCode {
  const normalizedAlias = requiredText(value, "Building", index).replaceAll(
    "’",
    "'",
  );
  const buildingCode = BUILDING_CODE_BY_ALIAS[normalizedAlias];
  if (!buildingCode) {
    throw rowError(index, `unknown building alias: ${value}`);
  }

  return buildingCode;
}

function mapCategories(
  value: string,
  index: number,
): readonly SupplierCategory[] {
  const normalizedType = requiredText(value, "Type", index);
  const categories = CATEGORY_MAPPINGS[normalizedType];
  if (!categories) {
    throw rowError(index, `unknown Supplier type: ${value}`);
  }

  return categories;
}

function parseCoordinates(
  row: CsvSupplierRow,
  index: number,
): Pick<NewSupplier, "latitude" | "longitude"> {
  const latitudeText = optionalText(row.Latitude);
  const longitudeText = optionalText(row.Longitude);

  if ((latitudeText === null) !== (longitudeText === null)) {
    throw rowError(index, "latitude and longitude must both be present or absent");
  }
  if (latitudeText === null || longitudeText === null) {
    return { latitude: null, longitude: null };
  }

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw rowError(index, `invalid latitude: ${latitudeText}`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw rowError(index, `invalid longitude: ${longitudeText}`);
  }

  return { latitude: latitudeText, longitude: longitudeText };
}

function parseSourceTime(value: string, field: string, index: number): string {
  const match = /^(\d{2})(\d{2})hrs$/.exec(requiredText(value, field, index));
  if (!match) {
    throw rowError(index, `${field} must use HHMMhrs`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw rowError(index, `${field} is outside clock bounds`);
  }

  return `${match[1]}:${match[2]}`;
}

function mapImagePath(value: string, index: number): string | null {
  const imageUrl = optionalText(value);
  if (imageUrl === null) {
    return null;
  }

  let imageName: string;
  try {
    imageName = path.posix.basename(new URL(imageUrl).pathname);
  } catch {
    throw rowError(index, "ImageURL must be an absolute URL");
  }

  return BUNDLED_IMAGE_NAMES.has(imageName)
    ? `/assets/suppliers/${imageName}`
    : null;
}

function requiredText(value: string, field: string, index: number): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw rowError(index, `${field} is required`);
  }

  return trimmed;
}

function optionalText(value: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function rowError(index: number, message: string): Error {
  return new Error(`Supplier seed row ${index + 2}: ${message}`);
}
