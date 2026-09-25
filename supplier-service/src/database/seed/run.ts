/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added the executable PostgreSQL Supplier seed import.
 * Author review required before submission.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

import { getDatabaseUrl } from "../../config/environment";
import * as schema from "../schema";
import {
  importSeedSuppliers,
  PostgresSeedStore,
  SeedImportResult,
} from "./seed-importer";
import {
  decodeSupplierSeedCsv,
  EXPECTED_SEED_ROW_COUNT,
  parseSupplierSeedCsv,
} from "./seed-parser";

export async function runSeedImport(): Promise<SeedImportResult> {
  const csvPath = path.resolve(
    process.cwd(),
    process.env.SUPPLIER_SEED_CSV_PATH ?? "../data/csv/supplier-seed-data.csv",
  );
  const source = decodeSupplierSeedCsv(await readFile(csvPath));
  const seeds = parseSupplierSeedCsv(source);

  if (seeds.length !== EXPECTED_SEED_ROW_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_SEED_ROW_COUNT} Supplier seed rows, found ${seeds.length}.`,
    );
  }

  const pool = new Pool({ connectionString: getDatabaseUrl() });
  try {
    const database = drizzle(pool, { schema });
    return await importSeedSuppliers(seeds, new PostgresSeedStore(database));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void runSeedImport()
    .then(({ inserted, skipped }) => {
      console.info(
        `Supplier seed completed: ${inserted} inserted, ${skipped} already present.`,
      );
    })
    .catch((error: unknown) => {
      console.error("Supplier seed failed.", error);
      process.exitCode = 1;
    });
}
