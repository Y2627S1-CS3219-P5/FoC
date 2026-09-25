/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: translated the approved Supplier data model into Drizzle schema constraints and indexes.
 * Author review required before submission.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  time,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const supplierCategory = pgEnum("supplier_category", [
  "FOOD",
  "COFFEE",
  "PRINTING",
  "SHOPPING",
  "PICKUP_POINT",
]);

export const hoursKind = pgEnum("hours_kind", [
  "UNKNOWN",
  "ALL_DAY",
  "INTERVAL",
]);

export const supplierStatus = pgEnum("supplier_status", [
  "ACTIVE",
  "ARCHIVED",
]);

export const BUILDING_CODES = [
  "COM2",
  "COM3",
  "CENTRAL_LIBRARY",
  "ENG_E3",
  "ENG_E4",
  "ENG_EA",
  "FRONTIER",
  "TERRACE",
  "THE_RIDGE",
  "YIH",
  "PGP",
  "HSSML",
  "MED_SCI_LIBRARY",
  "AS8",
  "INNOVATION_4_0",
] as const;

export type BuildingCode = (typeof BUILDING_CODES)[number];

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    buildingCode: varchar("building_code", { length: 120 })
      .$type<BuildingCode>()
      .notNull(),
    floor: varchar("floor", { length: 20 }),
    locationDescription: varchar("location_description", {
      length: 300,
    }).notNull(),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    hoursKind: hoursKind("hours_kind").notNull(),
    opensAt: time("opens_at", { withTimezone: false }),
    closesAt: time("closes_at", { withTimezone: false }),
    imagePath: varchar("image_path", { length: 500 }),
    status: supplierStatus("status").notNull().default("ACTIVE"),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("suppliers_status_building_code_idx").on(
      table.status,
      table.buildingCode,
    ),
    check("suppliers_name_nonblank", sql`btrim(${table.name}) <> ''`),
    check(
      "suppliers_building_code_nonblank",
      sql`btrim(${table.buildingCode}) <> ''`,
    ),
    check(
      "suppliers_building_code_allowed",
      sql`${table.buildingCode} in (${sql.join(
        BUILDING_CODES.map((code) => sql.raw(`'${code}'`)),
        sql.raw(", "),
      )})`,
    ),
    check(
      "suppliers_location_description_nonblank",
      sql`btrim(${table.locationDescription}) <> ''`,
    ),
    check(
      "suppliers_coordinates_paired",
      sql`(${table.latitude} is null) = (${table.longitude} is null)`,
    ),
    check(
      "suppliers_latitude_range",
      sql`${table.latitude} is null or ${table.latitude} between -90 and 90`,
    ),
    check(
      "suppliers_longitude_range",
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
    ),
    check(
      "suppliers_hours_consistent",
      sql`(
        ${table.hoursKind} in ('UNKNOWN', 'ALL_DAY')
        and ${table.opensAt} is null
        and ${table.closesAt} is null
      ) or (
        ${table.hoursKind} = 'INTERVAL'
        and ${table.opensAt} is not null
        and ${table.closesAt} is not null
        and ${table.opensAt} <> ${table.closesAt}
      )`,
    ),
    check("suppliers_version_nonnegative", sql`${table.version} >= 0`),
    check(
      "suppliers_archive_state_consistent",
      sql`(
        ${table.status} = 'ACTIVE' and ${table.archivedAt} is null
      ) or (
        ${table.status} = 'ARCHIVED' and ${table.archivedAt} is not null
      )`,
    ),
  ],
);

export const supplierCategories = pgTable(
  "supplier_categories",
  {
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    category: supplierCategory("category").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.supplierId, table.category] }),
    index("supplier_categories_category_idx").on(table.category),
  ],
);

export type NewSupplier = typeof suppliers.$inferInsert;
export type SupplierCategory =
  (typeof supplierCategory.enumValues)[number];
