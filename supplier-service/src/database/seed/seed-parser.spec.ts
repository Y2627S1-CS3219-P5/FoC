/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested deterministic parsing and approved mappings against the repository Supplier CSV.
 * Author review required before submission.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createStableSeedId,
  decodeSupplierSeedCsv,
  EXPECTED_SEED_ROW_COUNT,
  parseSupplierSeedCsv,
} from "./seed-parser";

describe("Supplier seed parser", () => {
  const csvPath = path.resolve(
    process.cwd(),
    "../data/csv/supplier-seed-data.csv",
  );
  const seeds = parseSupplierSeedCsv(
    decodeSupplierSeedCsv(readFileSync(csvPath)),
  );

  it("maps all 21 source rows to stable, unique IDs", () => {
    expect(seeds).toHaveLength(EXPECTED_SEED_ROW_COUNT);
    expect(new Set(seeds.map(({ supplier }) => supplier.id)).size).toBe(
      EXPECTED_SEED_ROW_COUNT,
    );
    expect(createStableSeedId("Printer @ Com 2")).toBe(
      createStableSeedId("Printer @ Com 2"),
    );
    expect(createStableSeedId("Printer @ Com 2")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("normalizes buildings, categories, times, and bundled image paths", () => {
    const printer = findSeed("Printer @ Com 2");
    expect(printer.supplier).toMatchObject({
      buildingCode: "COM2",
      hoursKind: "INTERVAL",
      opensAt: "00:00",
      closesAt: "23:59",
      imagePath: "/assets/suppliers/PRINTER_COM2.jpeg",
    });
    expect(printer.categories).toEqual(["PRINTING"]);

    const robotCafe = findSeed("Cafe+ Robot Cafe");
    expect(robotCafe.categories).toEqual(["FOOD", "COFFEE"]);

    const octobox = findSeed("Octobox");
    expect(octobox.supplier.buildingCode).toBe("PGP");

    const supersnacks = findSeed("Supersnacks");
    expect(supersnacks.supplier).toMatchObject({
      opensAt: "11:00",
      closesAt: "02:00",
    });
  });

  function findSeed(name: string) {
    const seed = seeds.find(({ supplier }) => supplier.name === name);
    if (!seed) {
      throw new Error(`Missing test seed: ${name}`);
    }
    return seed;
  }
});
