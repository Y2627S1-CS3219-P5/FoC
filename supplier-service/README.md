<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented the implemented Supplier backend foundation, operation, verification, and its future integration with the merged User Service bearer-token contract.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented authenticated catalogue reads and the isolated live integration check for the second Supplier backend increment.
Author review of the second increment: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented and implemented the approved search bound and non-sensitive request completion logging during issue #17 review remediation.
The decisions and implementation were reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Documented the implemented administrator mutation API and the expanded
real-service, PostgreSQL-backed verification for issue #23.
Author review of the third increment: Required before merge.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Added and documented a one-command wrapper for the existing isolated
Supplier backend integration demonstration.
Author review: Required before merge.
-->

# Supplier Service

The backend currently provides NestJS/Express, a private PostgreSQL database through Drizzle, versioned migrations, database-backed readiness, a repeatable 21-row Supplier import, authenticated catalogue reads, and administrator create/update/archive/restore operations. Every business request uses the real User Service `GET /auth/verify` contract.

This increment remains backend-only. It adds no frontend code and does not modify User Service application code.

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

## Administrator mutation API

Only a verified `ADMINISTRATOR` may mutate Suppliers. A verified `MEMBER` receives 403 before body or precondition processing, with no database change.

- `POST /api/v1/suppliers` creates an ACTIVE version-zero Supplier and returns 201 with its representation, `Location`, and strong `ETag: "v0"` headers.
- `PUT /api/v1/suppliers/{id}` fully replaces the editable fields of either an ACTIVE or ARCHIVED Supplier. It preserves lifecycle state and returns the incremented version and ETag.
- `DELETE /api/v1/suppliers/{id}` archives rather than deletes. The row, ID, editable fields, and categories remain stored. Repeating archive on an ARCHIVED Supplier returns an empty 204 and ignores a missing, malformed, or stale `If-Match` without changing timestamps or version.
- `POST /api/v1/suppliers/{id}/restore` restores the same row and ID. Repeating restore with the current ETag returns the unchanged representation; a stale ETag still returns 412.

Create and full update accept only the editable fields documented in `SPEC.md`. Unknown/server-owned keys, duplicate categories, invalid building/category values, unpaired coordinates, and contradictory hours are rejected with 400 and `fieldErrors`. Optional floor and coordinates may be omitted or set to `null`; blank floor becomes `null`.

PUT, restore, and archive of an ACTIVE Supplier require exactly one canonical strong `If-Match` such as `"v3"`. Missing preconditions return 428, malformed/weak/list/wildcard/leading-zero tags return 400, and a well-formed stale tag returns 412; rejected calls do not mutate the row. Unknown Supplier IDs return 404.

Create rejects an exact normalized duplicate across both ACTIVE and ARCHIVED rows with 409 `SUPPLIER_ALREADY_EXISTS` and `existingSupplierId`. The duplicate key uses trimmed, Unicode-NFC, case-insensitive name/floor/location text plus the canonical Building Code, treats blank floor as null, and preserves meaningful internal spaces. PostgreSQL advisory transaction locking makes concurrent equivalent creates resolve to one 201 and one 409.

## Checks

From `supplier-service/`:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:integration
```

For the complete demonstration—including the locked dependency install—run
this one command from anywhere in the repository:

```sh
./supplier-service/scripts/run-integration-demo.sh
```

`test:integration` builds a fresh disposable Compose project with a unique `foc-supplier-smoke-...` name on ports 3900/3901. It verifies clean migration and the 21-row seed; real MEMBER and ADMINISTRATOR login/verification; catalogue reads, logging, assets, and request correlation; mutation authorization and validation; concurrent and ACTIVE/ARCHIVED duplicate rejection; concurrent same-version update exclusion and ETag preconditions; archive/restore visibility, retention, and no-ops; SQL state; no-op migration plus zero-insert seed reruns preserving administrator edits/categories; and 503 with no write while User Service is stopped followed by recovery. It removes only that unique project and its volumes when finished; Docker must be running and ports 3900/3901 must be free. A concurrent run can fail safely on those fixed host ports but cannot remove the other run's project or data.

The latest recorded check matrix is in [docs/verification/third-backend-increment.md](docs/verification/third-backend-increment.md).

## AI Use Summary

OpenAI Codex (GPT-6) assisted on 2026-09-25 and 2026-09-26 with implementing the Supplier backend foundation, authenticated catalogue reads, administrator mutations, live integration runner, and documentation from the author-approved specification. The third-increment live check exposed and fixed a PostgreSQL advisory-lock parameter typing defect that mocked query tests did not reveal. Strict JSON cannot contain literal comments, so `package.json` and `nest-cli.json` use a leading `"//"` metadata property linked to [AI-DISCLOSURES.md](AI-DISCLOSURES.md#strict-json-files); npm and Nest were checked with that property present. Foundation and second-increment review were completed and approved by @ron. Project-author review of the third increment is required before merge, and course-owner approval for the strict-JSON exception remains required before submission. The exact prompts and key-response summaries are recorded in `../ai/usage-log.md`.
