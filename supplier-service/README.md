<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented the implemented Supplier backend foundation, operation, verification, and its future integration with the merged User Service bearer-token contract.
Author review: Required before submission.
-->

# Supplier Service

This increment provides the Supplier Service backend foundation: NestJS with the Express adapter, a private PostgreSQL database accessed through Drizzle, a versioned Supplier schema migration, a database-backed readiness endpoint, and a repeatable import of the repository's 21-row Supplier CSV.

It intentionally does not provide the list/detail/mutation APIs, authentication or `SessionVerifier`, or a frontend. The User Service bearer-token contract implemented in PR #14 is documented in `SPEC.md` for a later Supplier integration increment and does not block this foundation.

## Local development

Use Node.js 22 or newer and a PostgreSQL instance. From this directory:

```sh
npm ci
export DATABASE_URL=postgresql://supplier:YOUR_LOCAL_PASSWORD@localhost:5432/supplier
npm run db:migrate
npm run db:seed
npm run start:dev
```

`GET /health` returns `200 {"status":"ok"}` only after PostgreSQL responds. It returns 503 when the database is unavailable. The single-user URL above is only a concise manual-development example; Compose uses separate database roles as described below.

The default seed source is `../data/csv/supplier-seed-data.csv`. Override it with `SUPPLIER_SEED_CSV_PATH` when needed. The import assigns each source Supplier a deterministic UUID and only inserts an ID that is absent. Repeating it therefore creates no duplicates and never overwrites later administrator edits, including category changes.

The durable identity manifest in `src/database/seed/seed-identities.ts` assigns an explicit UUID to each of the 21 source rows. IDs do not depend on editable names or location descriptions, while guarded source fields outside those editable values make a reordered or unexpectedly changed CSV fail instead of silently attaching an ID to the wrong origin. Coordinates are stored as unconstrained PostgreSQL decimals and imported as strings so source precision is not rounded through JavaScript numbers.

## Compose

From the repository root:

```sh
cp .env.example .env
# Fill the three blank password values with distinct local secrets.
docker compose up --build
```

Compose exposes only the Supplier HTTP port (3000 by default); PostgreSQL remains on the Compose network. On a clean database, PostgreSQL first creates distinct bootstrap, migration-owner, and runtime roles. A one-shot migration service applies committed migrations as the schema owner and grants the runtime role only table DML and sequence use. The Supplier service then imports the seed and starts NestJS with that runtime role. The runtime role has no schema creation privilege. Configuration in `.env.example` is for local development only; blank passwords must be supplied in the untracked `.env` file.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

## AI Use Summary

OpenAI Codex (GPT-6) assisted on 2026-09-25 with implementing this backend increment from the author-approved specification: NestJS/Drizzle setup, PostgreSQL schema and migration, readiness behavior, explicit seed identity mapping/import tests, least-privilege container configuration, and documentation. Strict JSON cannot contain literal comments, so `package.json` and `nest-cli.json` use a leading `"//"` metadata property linked to [AI-DISCLOSURES.md](AI-DISCLOSURES.md#strict-json-files); npm and Nest were checked with that property present. Course-owner approval for this strict-JSON exception and project-author review of all AI-influenced work are still required before submission. The exact prompt and a key-response summary are recorded in `../ai/usage-log.md`.
