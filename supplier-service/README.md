<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented the implemented Supplier backend foundation, operation, and verification.
Author review: Required before submission.
-->

# Supplier Service

This increment provides the Supplier Service backend foundation: NestJS with the Express adapter, a private PostgreSQL database accessed through Drizzle, a versioned Supplier schema migration, a database-backed readiness endpoint, and a repeatable import of the repository's 21-row Supplier CSV.

It intentionally does not provide the list/detail/mutation APIs, authentication or `SessionVerifier`, CSRF handling, or a frontend. The proposed User Service contract in `SPEC.md` remains the contract for a later increment and does not block this foundation.

## Local development

Use Node.js 22 or newer and a PostgreSQL instance. From this directory:

```sh
npm ci
export DATABASE_URL=postgresql://supplier:supplier_dev@localhost:5432/supplier
npm run db:migrate
npm run db:seed
npm run start:dev
```

`GET /health` returns `200 {"status":"ok"}` only after PostgreSQL responds. It returns 503 when the database is unavailable.

The default seed source is `../data/csv/supplier-seed-data.csv`. Override it with `SUPPLIER_SEED_CSV_PATH` when needed. The import assigns each source Supplier a deterministic UUID and only inserts an ID that is absent. Repeating it therefore creates no duplicates and never overwrites later administrator edits, including category changes.

## Compose

From the repository root:

```sh
cp .env.example .env
docker compose up --build
```

Compose exposes only the Supplier HTTP port (3000 by default); PostgreSQL remains on the Compose network. The service waits for PostgreSQL readiness, applies committed migrations, imports the seed, and then starts NestJS. Configuration in `.env.example` is for local development only.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

## AI Use Summary

OpenAI Codex (GPT-6) assisted on 2026-09-25 with implementing this backend increment from the author-approved specification: NestJS/Drizzle setup, PostgreSQL schema and migration, readiness behavior, deterministic seed mapping/import tests, container configuration, and documentation. The project author must review all AI-influenced work before submission. The exact prompt and a key-response summary are recorded in `../ai/usage-log.md`.
