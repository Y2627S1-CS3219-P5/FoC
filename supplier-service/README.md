<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented the implemented Supplier backend foundation, operation, verification, and its future integration with the merged User Service bearer-token contract.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented authenticated catalogue reads and the isolated live integration check for the second Supplier backend increment.
Author review of the second increment: Required before merge.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented and implemented the approved search bound and non-sensitive request completion logging during issue #17 review remediation.
The decisions are author-approved; implementation review is required before merge.
-->

# Supplier Service

The backend currently provides NestJS/Express, a private PostgreSQL database through Drizzle, versioned migrations, database-backed readiness, and a repeatable 21-row Supplier import. Authenticated `GET /api/v1/suppliers` and `GET /api/v1/suppliers/{id}` endpoints use the real User Service `GET /auth/verify` contract for every request.

This increment is backend-only. It does not add Supplier mutations or frontend code, and it does not modify User Service application code.

## Local development

Use Node.js 22 or newer and a PostgreSQL instance. From this directory:

```sh
npm ci
export DATABASE_URL=postgresql://supplier:YOUR_LOCAL_PASSWORD@localhost:5432/supplier
export USER_SERVICE_BASE_URL=http://localhost:3001
export USER_SERVICE_VERIFY_TIMEOUT_MS=1000
npm run db:migrate
npm run db:seed
npm run start:dev
```

`GET /health` is public and returns `200 {"status":"ok"}` only after PostgreSQL responds. Catalogue endpoints require `Authorization: Bearer <access-token>` and forward that header unchanged to User Service. The single-user database URL above is only a concise manual-development example; Compose uses separate database roles.

The default seed source is `../data/csv/supplier-seed-data.csv`. Override it with `SUPPLIER_SEED_CSV_PATH` when needed. The import assigns each source Supplier a deterministic UUID and only inserts an ID that is absent. Repeating it therefore creates no duplicates and never overwrites later administrator edits, including category changes.

The durable identity manifest in `src/database/seed/seed-identities.ts` assigns an explicit UUID to each of the 21 source rows. IDs do not depend on editable names or location descriptions, while guarded source fields outside those editable values make a reordered or unexpectedly changed CSV fail instead of silently attaching an ID to the wrong origin. Coordinates are stored as unconstrained PostgreSQL decimals and imported as strings so source precision is not rounded through JavaScript numbers.

## Compose

From the repository root:

```sh
cp .env.example .env
# Fill the three blank password values with distinct local secrets.
docker compose up --build
```

Supplier listens on port 3000 and User Service on 3001 by default; both host ports are configurable. Their private PostgreSQL ports remain on the Compose network. On a clean Supplier database, PostgreSQL creates distinct bootstrap, migration-owner, and runtime roles. A one-shot migration service applies committed migrations as the schema owner. It grants the runtime role SELECT/INSERT/UPDATE on Suppliers and SELECT/INSERT/DELETE on category memberships, but no permission to delete Supplier rows or create schema objects. Supplier imports the seed before NestJS starts. Configuration in `.env.example` is for local development only; `JWT_SECRET` and the three blank Supplier passwords must be supplied in the untracked `.env` file.

To inspect the loaded Supplier rows and prove the seed is repeatable, run from the repository root:

```sh
docker compose exec -T supplier-db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select id, name, status from suppliers order by name;"'
docker compose run --rm --no-deps supplier-service node dist/database/seed/run.js
```

The second command should report `0 inserted, 21 already present` after startup. Because the importer inserts only missing stable IDs, existing administrator edits and category changes are not overwritten.

## Authenticated read API

- `GET /api/v1/suppliers` defaults to ACTIVE, page 0, size 12, and `name,asc`. It supports `q`, `buildingCode`, `category`, `status`, `page`, `size`, and the sort allowlist in `SPEC.md`. The trimmed free-text `q` searches Supplier name/location and accepts at most 300 Unicode code points; a longer value returns 400 with `fieldErrors.q`.
- `GET /api/v1/suppliers/{id}` returns a strong `ETag`, such as `"v0"`.
- MEMBER can read ACTIVE Suppliers. Only ADMINISTRATOR can list or retrieve ARCHIVED Suppliers; archived detail is concealed from MEMBER as 404.
- Missing or invalid authentication returns 401. User Service verification failure returns 503 while `/health` remains independent.
- Bundled images are public at `/assets/suppliers/<filename>`.
- Every request receives a server-owned `X-Request-Id`. On finish or premature close, Supplier emits one JSON `supplier.http.request.completed` event. Its application `message` payload contains only request ID, method, query-free pathname, status, completion/aborted result, and duration; Nest adds the normal non-sensitive JSON logger envelope (`level`, process ID, timestamp, and logger context). Authorization, tokens, query values, full URLs, bodies, and user identity are not logged.

## Checks

From `supplier-service/`:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:integration
```

`test:integration` builds a fresh disposable Compose project named `foc-supplier-smoke` on ports 3900/3901. It verifies clean migration and the 21-row seed, a second zero-insert seed that preserves an archived fixture, real MEMBER and ADMINISTRATOR login and verification, list/search/filter/stable paging/detail, the search boundary, 401/403/404/503 behavior, correlated query-redacted completion logging, request IDs, ETags, the bundled image, and recovery after User Service restarts. It removes only that project and its volumes when finished; Docker must be running and ports 3900/3901 must be free.

The latest recorded check matrix is in [docs/verification/second-backend-increment.md](docs/verification/second-backend-increment.md).

## AI Use Summary

OpenAI Codex (GPT-6) assisted on 2026-09-25 with implementing the Supplier backend foundation and authenticated catalogue-read increment from the author-approved specification, including the live integration runner and documentation. Strict JSON cannot contain literal comments, so `package.json` and `nest-cli.json` use a leading `"//"` metadata property linked to [AI-DISCLOSURES.md](AI-DISCLOSURES.md#strict-json-files); npm and Nest were checked with that property present. Foundation review was completed and approved by @ron. Author review of the second increment is required before merge, and course-owner approval for the strict-JSON exception is still required before submission. The exact prompts and key-response summaries are recorded in `../ai/usage-log.md`.
