<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Interpreted the supplied project, D1, and D2 reference documents and formatted decisions explicitly supplied by the Supplier workstream author, including the team's archive and single-description approvals. This edit does not add new architecture or design decisions.
Author review: Required before submission.
-->

# FoC Supplier Service — D2 Specification

## 1. Scope

Supplier Service owns the catalogue of physical errand origins. A store, facility, landmark, or pickup location qualifies when a requester can select it as the origin of an errand. Its private database and independently callable HTTP APIs support authenticated member browsing and administrator management. A responsive frontend uses those APIs.

### 1.1 D2 outcome

The team is targeting a near-complete Supplier Service and a near-complete User Service for D2. The Supplier demonstration includes: a justified database and schema; working list, name/location search, building/category filters, sorting, pagination, and detail; database-backed create and update APIs; the approved deletion behavior; APIs callable with the UI stopped; authenticated requests using real User Service identity and role checks; and a responsive live frontend for members and administrators. Seed the catalogue from the repository CSV and add useful errand origins for a rich listing.

### 1.2 Out of scope

Supplier Service does not own user credentials or roles, orders, credits, payment, menus, inventory, or checkout, and never accesses another service's database. Geospatial nearest-neighbour search, image upload, and recurring opening schedules are deferred. Order Service integration is outside D2.

## 2. Decisions at a glance

| Area | D2 choice | Status |
| --- | --- | --- |
| Backend | NestJS + TypeScript with default Express adapter | Selected |
| Database | PostgreSQL, private to Supplier Service, instantiated in a Docker Instance | Selected |
| Database access | Drizzle ORM and versioned migrations | Selected |
| Frontend | Shared React + TypeScript app using Vite | Selected for D2 |
| User credential | Opaque session in a same-origin, `HttpOnly` cookie | Proposed shared contract; User owner to confirm |
| User validation | Private, authenticated User Service call per protected request | Proposed shared contract; User owner to confirm |
| Roles | MEMBER browses; ADMINISTRATOR browses and manages | Selected |
| Description | Use `locationDescription` as the only displayed Supplier description | Approved by team; replaces the separate D1 general-description field |
| Removal | Archive, retain record, allow administrator restoration | Approved by team; replaces the D1 deletion restriction |
| Edit conflicts | DB integer version exposed as ETag; `If-Match` and 412/428 | Selected |
| Order integration | Deferred | Outside D2 |

## 3. Ownership and boundaries

Supplier Service owns supplier metadata and ACTIVE/ARCHIVED state under the approved archive model. User Service owns identity, role, account status, and session validity. The browser UI is a client: hiding an administrator control cannot substitute for backend access control. Supplier Service does not need public-profile lookup or User status events in D2.

A Supplier ID identifies one physical errand origin. Moving an outlet to another building creates a new Supplier record and archives the old record. Correcting directions within the same physical location retains the ID.

For the browser demo, serve the built Vite app and proxy Supplier and User routes under one origin. Use a Vite development proxy locally and equivalent integrated routing in Compose. The proxy forwards the User-owned session cookie, so frontend JavaScript never needs to read it. Agree on the final origin and routes with the User/frontend owners.

## 4. Data model and seed data

### 4.1 Schema

**`suppliers`**

| Column | Type / rule | Purpose |
| --- | --- | --- |
| `id` | UUID primary key, generated once | Stable reference; never reused |
| `name` | varchar(120), nonblank | Display/search |
| `building_code` | varchar(120), nonblank; controlled canonical code | Location filter/display |
| `floor` | varchar(20), nullable | Floor or named level |
| `location_description` | varchar(300), nonblank | Only displayed Supplier description; includes directions within the location |
| `latitude`, `longitude` | decimals, nullable together; valid ranges | Optional map coordinates |
| `hours_kind` | `UNKNOWN`, `ALL_DAY`, or `INTERVAL`, not null | Explicit hours interpretation |
| `opens_at`, `closes_at` | times, nullable together | Required only for `INTERVAL`; closing before opening means next day |
| `image_path` | varchar(500), nullable | Optional seed-managed display asset |
| `status` | ACTIVE or ARCHIVED, not null | Archive state and catalogue visibility |
| `version` | nonnegative integer/bigint, not null | Optimistic concurrency |
| `created_at`, `updated_at` | timestamptz, not null | Audit/sorting |
| `archived_at` | timestamptz, nullable | Current archive time; cleared on restoration |

**`supplier_categories`** has `supplier_id` (UUID FK to `suppliers.id`) and controlled `category` (`FOOD`, `COFFEE`, `PRINTING`, `SHOPPING`, or `PICKUP_POINT`), with composite primary key (`supplier_id`, `category`). A category describes what the errand origin offers. Application validation requires at least one category and stores category changes in the same transaction as supplier edits. A Supplier can have multiple categories; map the seed's `Food/Coffee` value to `FOOD` and `COFFEE`. A foyer used only for pickup is `PICKUP_POINT`, irrespective of whether it is also a landmark.

**Controlled buildings**

| Stored code | Display label | Accepted seed aliases |
| --- | --- | --- |
| `COM2` | COM2 | `Com 2`, `Com2` |
| `COM3` | COM3 | `COM3` |
| `CENTRAL_LIBRARY` | Central Library | `Central Library` |
| `ENG_E3` | Engineering Block E3 | `Engineering Block E3` |
| `ENG_E4` | Engineering Block E4 | `Engineering Block E4` |
| `ENG_EA` | Engineering Block EA | `Engineering Block EA` |
| `FRONTIER` | Frontier | `Frontier` |
| `TERRACE` | Terrace | `Terrace` |
| `THE_RIDGE` | The Ridge | `The Ridge` |
| `YIH` | Yusof Ishak House | `Yusof Ishak House` |
| `PGP` | Prince George's Park | `Prince George's Park`, `Prince George’s Park` |
| `HSSML` | Hon Sui Sen Memorial Library | `Hon Sui Sen Memorial Library` |
| `MED_SCI_LIBRARY` | Medicine + Science Library | `Medicine+Science Library` |
| `AS8` | Block AS8 | `Blk AS8` |
| `INNOVATION_4_0` | innovation4.0 | `innovation4.0` |

Reject an unknown building code with 400 for D2. Add a new building to this controlled mapping deliberately rather than accepting free text.

Requests identify a building using `buildingCode` only. Responses return both `buildingCode` and the corresponding `buildingLabel`; clients do not maintain their own code-to-label mapping.

Index the primary key, status/building code, and category membership. Sort names with ID as a stable tiebreaker. Use ordinary case-insensitive substring search over the small catalogue; measure before adding specialist indexes. Do not create cross-service foreign keys.

Keep archived records for future restoration with the same ID. Physical purging and any long-term retention policy are beyond D2.

The API requires `hoursKind: UNKNOWN | ALL_DAY | INTERVAL` on create and full update. `UNKNOWN` and `ALL_DAY` require `opensAt` and `closesAt` to be absent. `INTERVAL` requires both times in `HH:mm`. Equal opening and closing times are invalid; a closing time before its opening time means the interval ends the next day. Reject contradictory fields rather than ignoring them. Interpret all clock values in `Asia/Singapore`.

Reject creation with 409 when an existing ACTIVE or ARCHIVED Supplier is an exact match on normalized name, building code, floor, and location description. Direct the administrator to the existing record. The same name remains valid at a genuinely different location.

### 4.2 Seed import

The repository contains `data/csv/supplier-seed-data.csv` with 21 rows and six image files. Create a repeatable seed process using stable seed IDs or guarded upsert; restarts must not duplicate suppliers. APIs must query PostgreSQL, not hard-coded arrays.

- Map the CSV's **Location Description** to `location_description` and display it as the Supplier's only description.
- Normalize building aliases to the controlled codes above during import, including straight and curly apostrophes in `Prince George's Park`; map `Food/Coffee` to `FOOD` and `COFFEE`.
- Parse `0900hrs` as an `INTERVAL` starting at `09:00`. `11:00`–`02:00` crosses midnight. Keep `0000hrs`–`2359hrs` as `INTERVAL` from `00:00` to `23:59` until the source is verified as meaning 24-hour operation. Label these *typical hours*; weekdays are not specified.
- Serve bundled images through actual asset paths, rather than GitHub `blob` pages; show a fallback when missing.
- Review suspect coordinates and add useful facilities/landmarks. Attribute externally sourced text/images.

### 4.3 Approved D1 description change

The team approved using the required `locationDescription` as the Supplier's only displayed description, with no separate general-description field. This replaces the separate general `description` required by the earlier D1 SS-F1.1.2 and SS-F2.1.1 text. The D1 requirements and their acceptance criteria must record this approved revision before the team claims the documents are aligned.

Supplier schema and APIs therefore use `locationDescription` only and do not add a `description` field.

## 5. Supplier lifecycle — approved D1 change

The team approved archive in place of the deletion restriction in the earlier D1 SS-F2.2.3 text. The D1 requirement and its acceptance criteria must record this approved revision before the team claims the documents are aligned.

An administrator can archive a supplier after a confirmation modal. Archive hides it from ordinary member list/detail results while retaining its record and ID. Administrator management can inspect archived records and restore them to ACTIVE; the UI shows an actionable success/error result.

`DELETE /api/v1/suppliers/{id}` archives an ACTIVE row, sets `archived_at`, and increments `version`. Repeating archive on an ARCHIVED row returns 204 without changing its archive time/version. `POST /api/v1/suppliers/{id}/restore` returns an ARCHIVED row to ACTIVE, clears `archived_at`, and increments `version`. Repeating restore on an ACTIVE row with the current `If-Match` returns its current representation without changing its version; a stale `If-Match` still returns 412. All these actions require ADMINISTRATOR.

This revises D1 SS-F2.2.3, which blocks deletion while an active errand exists. The approved product rule is that archiving prevents new errand selection while existing errands keep the pickup details they need. Order Service behaviour is **not implemented or tested in D2**. Demonstrate catalogue visibility, retention, and restoration without claiming Order Service integration.

## 6. Authentication and authorisation

### 6.1 Permissions

| Caller | ACTIVE list/detail | Create/edit/archive/restore | ARCHIVED list/detail |
| --- | --- | --- | --- |
| Missing/invalid session | 401 | 401 | 401 |
| Active MEMBER | Allowed | 403 | 403 for explicit archive query; archived detail concealed as 404 |
| Active ADMINISTRATOR | Allowed | Allowed | Allowed |
| Revoked/expired/suspended/closed | 401 | 401 | 401 |

**401** means no valid user session. **403** means a valid user lacks permission. Never trust a client-supplied role header or body value. Apply backend role checks before every mutation.

### 6.2 Proposed User Service contract

This is a **FoC-specific JSON contract inspired by token introspection**, not an implementation of the RFC 7662 wire format.

1. After login, User Service issues an opaque, high-entropy session identifier in `Set-Cookie: __Host-foc_session=<opaque>; Path=/; Secure; HttpOnly; SameSite=Lax`, with no `Domain` attribute. Deployed environments use HTTPS. User Service owns session creation, expiry, logout, role changes, suspension, and revocation.
2. The browser automatically sends the cookie on same-origin Supplier requests. Supplier extracts the session value server-side. The frontend does not read or put it in `localStorage`.
3. For every protected request in D2, Supplier calls `POST /internal/sessions/validate` on the private User Service route. The request is JSON `{ "sessionToken": "<opaque>" }`. Authenticate Supplier independently, for example using `Authorization: Bearer <supplier-service-credential>` configured as a service secret. Never use the end-user session as the service credential or place either credential in a URL. Use TLS for service traffic outside a trusted local development network.
4. User Service returns HTTP 200 `{ "active": true, "id": "<user-uuid>", "role": "MEMBER" }` (or `ADMINISTRATOR`), or HTTP 200 `{ "active": false }` for invalid/expired/revoked sessions. Internal 401/403 means the *Supplier Service's* credential was rejected; Supplier treats this as an integration failure, not as user logout.
5. Supplier maps inactive to client 401, active with wrong role to 403, and timeout/unavailable/malformed User Service response to fail-closed 503. Use a bounded timeout, do not log credentials, and do not cache validation for D2. User Service decides whether validation refreshes the D1 idle timer and enforces its session lifetime.

Encapsulate the call in a NestJS guard plus a `SessionVerifier` interface. Use a **development-only verifier stub** until User Service is ready; integrated tests and the D2 demo use the real User Service. Do not deploy a bypass in the integrated environment.

Supplier work may proceed against the development verifier while the User Service owner reviews the proposed contract. The integrated D2 acceptance gate requires the same flows to use real User Service sessions.

Cookie-authenticated POST/PUT/DELETE/Restore operations need CSRF protection. Use a CSRF token passed in a custom request header and validated server-side (or an equivalent agreed framework mechanism). SameSite complements this check. The proxy must forward the cookie and CSRF header; do not allow arbitrary credentialed CORS origins.

**Confirm with User Service owner:** cookie name/attributes, shared origin and login routes, exact endpoint and fields, internal service-credential provisioning, timeout, response semantics, session idle refresh, and CSRF-token issuance/verification. Record the agreed contract in the repository before integration. Supplier does not consume AccountActivated events or call `GET /users/{id}/public` in D2.

## 7. HTTP API contract (proposed v1)

Base path: `/api/v1/suppliers`. All business endpoints require an active session. JSON bodies; UTC ISO 8601 timestamps; UUID string IDs. Server controls IDs, timestamps, status, and versions. Commit successful mutations before responding.

| Method and path | Behaviour | Success |
| --- | --- | --- |
| `GET /api/v1/suppliers` | Search/filter/sort/page; ACTIVE by default; admin can request ARCHIVED | 200 page |
| `GET /api/v1/suppliers/{id}` | Detail; archived detail for admin only | 200 body and `ETag` |
| `POST /api/v1/suppliers` | Validate and create ACTIVE row | 201 body, `Location`, `ETag` |
| `PUT /api/v1/suppliers/{id}` | Replace editable fields, require `If-Match` | 200 body, new `ETag` |
| `DELETE /api/v1/suppliers/{id}` | Archive; require `If-Match` when ACTIVE | 204; repeat archive 204 |
| `POST /api/v1/suppliers/{id}/restore` | Restore; always require `If-Match` | 200 body and `ETag`; repeat restore with current tag returns unchanged body/tag |
| `GET /health` | Non-sensitive container readiness | 200 when ready |

**List query:** `q` searches `name` and `locationDescription` case-insensitively; `buildingCode` accepts a controlled building code; `category` is controlled text; `status=ARCHIVED` is admin-only; `page` is zero-based (default 0); `size` defaults to 12 (maximum 100); `sort` allowlist: `name,asc`, `name,desc`, `updatedAt,desc`. Trim `q`; blank means no search. Reject invalid values with 400. Filter before pagination; break ties by ID. Admins can request ACTIVE or ARCHIVED explicitly, not an unspecified all-status view.

Example list response (illustrative values only):

```json
{
  "items": [
    {
      "id": "c9b17a24-0400-43c6-9d0b-40368f1884cf",
      "name": "Printer @ Com 2",
      "categories": ["PRINTING"],
      "buildingCode": "COM2",
      "buildingLabel": "COM2",
      "floor": "1",
      "locationDescription": "Next to LT19",
      "latitude": 1.2938347,
      "longitude": 103.7744572,
      "hoursKind": "INTERVAL",
      "opensAt": "00:00",
      "closesAt": "23:59",
      "imagePath": "/assets/suppliers/PRINTER_COM2.jpeg",
      "status": "ACTIVE",
      "version": 0,
      "createdAt": "2026-09-24T08:00:00Z",
      "updatedAt": "2026-09-24T08:00:00Z",
      "archivedAt": null
    }
  ],
  "page": 0,
  "size": 12,
  "totalItems": 21,
  "totalPages": 2
}
```

**Create/update body:** editable fields only: `name`, nonempty `categories`, `buildingCode`, optional `floor`, required `locationDescription`, optional paired coordinates, and required `hoursKind` with its conditional interval fields. `buildingLabel` is response-only. `imagePath` is not administrator-editable in D2. Trim text; reject missing/blank required fields, invalid categories, unknown building codes, out-of-range coordinates, one-sided coordinates, inconsistent hours fields, and oversized values.

**Concurrency:** DB `version` is an integer. Detail/create/update/restore responses return a strong quoted `ETag`, e.g. `ETag: "v3"`. An admin sends that ETag in `If-Match` for PUT and restore, and for archive of an ACTIVE record. The server atomically updates with `WHERE id = ? AND version = ? AND status = ?` and increments the version in the same transaction. Only one edit of a stale screen commits. Missing `If-Match` on a state-changing operation returns **428**; stale returns **412** with no mutation. `If-Match: *` does not substitute for a specific version. Repeating archive on an already ARCHIVED row is a no-op returning 204 after authorisation, even without `If-Match`. Repeating restore requires the current `If-Match` and returns 200 without changing the row. Fetch detail before editing a list item to obtain its ETag. Mutation bodies have no version field.

**Error response:**

```json
{
  "code": "SUPPLIER_VALIDATION_FAILED",
  "message": "Please correct the highlighted fields.",
  "fieldErrors": { "name": "Name is required." },
  "requestId": "trace-or-request-id"
}
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid payload/query, malformed ETag, or unsupported sort/category |
| 401 | Missing/invalid/expired user session |
| 403 | Valid user lacks permission |
| 404 | Unknown supplier; archived detail hidden from members |
| 409 | Exact normalized Supplier duplicate, including an archived match |
| 412 | Stale `If-Match`, no mutation |
| 428 | Required `If-Match` missing |
| 503 | User Service validation unavailable/invalid; no mutation |

There is no alternate version-in-request-body concurrency contract. Status 409 is reserved for exact duplicate creation; stale writes use 412.

## 8. Responsive UI specification

React + Vite follows the D1 prototype's shared navigation while using live APIs.

### 8.1 Member view

Show name, category, building label/floor, `locationDescription`, typical hours, and the seed-managed image or fallback. Search, filters, sort, and pagination call the API. Detail uses `locationDescription` as the displayed Supplier description and shows coordinates where present. A Request Errand action appears only when connected to a future Order Service. Show useful loading, empty, network-error, and expired-session states. Mobile controls/cards stack without horizontal overflow; desktop may use a denser layout. Keep keyboard focus and controls usable.

### 8.2 Administrator view

Show Add/Edit/Archive to admins; an ARCHIVED management view includes Restore. Forms guide users, while the API is the final validation authority. Refresh server data after a successful action. Archive/Restore show confirmation and actionable result feedback. On 412 preserve unsaved edits and offer reload/compare; distinguish 401, 403, and 503 feedback.

## 9. Operations, quality, and verification

- **Deployment:** Compose runs NestJS Supplier and its private PostgreSQL container with health checks and secret-free environment examples. The integrated demo includes React/Vite and User Service.
- **Migrations/seed:** clean checkout applies versioned Drizzle migrations and seeds once; restart creates no duplicates.
- **Performance:** Measure D1's p95 under two seconds using 100 Suppliers, 20 concurrent clients, approximately 10 requests per second for five minutes, with an 80% list and 20% detail mix. Include synchronous User Service validation in the measured response time.
- **Security:** parameterized Drizzle queries, sort allowlist, bounded input, CSRF protection, least-privilege DB user, User timeout, no credential logging.
- **Observability:** request ID, action/result logs without tokens, and non-sensitive `/health`.

### 9.1 Acceptance scenarios

| ID | Expected result |
| --- | --- |
| A1 | Clean deployment serves seeded PostgreSQL catalogue, not hard-coded arrays. |
| A2 | Member can search name/location, filter building/category, sort, page, and view detail on mobile/desktop. |
| A3 | Member's direct create/edit/archive/restore calls return 403 without mutations. |
| A4 | Missing/revoked session returns 401; unavailable User Service returns 503 without mutation. |
| A5 | Admin creates a valid ACTIVE supplier visible in the list. |
| A6 | Invalid input returns useful 400 and preserves prior values. |
| A7 | Admin edit appears in refreshed list/detail. |
| A8 | Two admins edit version N; one succeeds, other receives 412; missing If-Match receives 428. |
| A9 | Archive hides from member list/detail but retains same ID and admin ARCHIVED visibility. |
| A10 | Restore returns same ID to member catalogue and increments version; repeats are harmless. |
| A11 | API works while frontend process is stopped. |
| A12 | Real login, role checks, mutation, database state, and responsive UI appear in integrated demo. |
| A13 | Creating an exact normalized duplicate of an ACTIVE or ARCHIVED Supplier returns 409 and identifies the existing record without mutation. |

### 9.2 D2 demo

1. Start clean containers and show seeded suppliers.
2. Log in as MEMBER: demonstrate search, filters, sort, pagination, detail, mobile UI, and direct mutation rejection.
3. Log in as ADMINISTRATOR: create and edit; if the D1 change is approved, archive, inspect ARCHIVED, and restore; inspect API/database effects.
4. Show validation error, stale edit 412, missing If-Match 428; stop frontend and call API independently.
5. Explain User validation, private Supplier DB, and D1 backlog revisions. Do not claim Order integration.

## 10. Coordination and implementation sequence

**External decisions remaining:** publish the team's approved description and archive revisions in the D1 requirements and acceptance criteria; obtain User Service owner agreement on the cookie/login/proxy, validation endpoint and service credential, timeout and idle-refresh rules, and CSRF issuance/validation. Publish the shared auth contract in the repository. NestJS/Express, PostgreSQL/Drizzle, Vite React, and ETag/If-Match are selected for the Supplier workstream.

**Suggested increments:** (1) NestJS/Drizzle schema, migrations, repeatable seed, list/detail; (2) admin create/edit/archive/restore and atomic version checks; (3) verifier interface and dev stub, real User validation/role guard/CSRF, Vite screens; (4) same-origin Compose integration, contract tests, acceptance demo.

### Sources

- `CS3219-ProjectDocument-FoC.pdf`, pp. 2–3 and 9–10; `CS3219-Instructions-MilestoneD2.pdf`, pp. 3–4; `Project-D1-Group-5.pdf`, pp. 12–14 and 25–26.
- Team template and seed data: <https://github.com/Y2627S1-CS3219-P5/FoC>.
- HTTP conditional requests: <https://www.rfc-editor.org/rfc/rfc9110.html>; precondition-required status: <https://www.rfc-editor.org/rfc/rfc6585.html>.
- Token introspection inspiration: <https://www.rfc-editor.org/rfc/rfc7662.html> (FoC session endpoint is custom JSON).
- Session and CSRF guidance: <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html> and <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>.
- NestJS and Drizzle: <https://docs.nestjs.com/first-steps>, <https://docs.nestjs.com/security/csrf>, <https://orm.drizzle.team/docs/update>.
