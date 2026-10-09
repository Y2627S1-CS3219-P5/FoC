<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Recorded the exact Supplier backend implementation prompt and key response.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Recorded the exact second Supplier backend increment prompt, the author's follow-up approval, and the implementation/check summary.
Author review of the second increment: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Recorded the author's approved `q` bound and request-logging follow-up prompts, plus the issue #17 review-remediation summary.
The decisions and implementation were reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Recorded the project author's explicit review approval for PR #19 across the relevant second-increment disclosures.
Author review: Approval explicitly supplied by @ron; the separate course-owner strict-JSON exception remains pending.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Planned and implemented the third Supplier backend increment for administrator mutations from the repository specification and ticket graph; no frontend or User Service application changes.
Author review of the third increment: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Added a one-command shell wrapper for the existing Supplier integration demonstration.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Recorded the project author's explicit review approval for PR #24 across the relevant third-increment disclosures.
Author review: Approval explicitly supplied by @ron; the separate course-owner strict-JSON exception remains pending.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Researched, implemented, documented, and verified issue #25 Supplier OpenAPI/Swagger documentation; no frontend or User Service application changes.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Recorded the project author's explicit review approval for PR #26 across the relevant Supplier OpenAPI disclosures.
Author review: Approval explicitly supplied by @ron; the separate course-owner strict-JSON exception remains pending.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-09-26
Scope: Drafted the User Service author's three entries below from the author's prompts; the author edited and approved them.
Author review: Reviewed and approved by @t-leongchuan
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Implemented the shared Supplier frontend API and test foundation for issue #28 from the approved specification and ticket.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Implemented and tested the Supplier member catalogue and detail UI for issue #29 from the approved specification and ticket.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Implemented and tested the Supplier administrator management UI for issue #30 from the approved specification and ticket.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Added and ran isolated real-browser Supplier UI verification for issue #31, updated evidence and implementation-status documentation, and preserved API-only verification.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Resolved Supplier UI final-review findings for issue #34 and expanded
real-service validation, concurrency, precondition, and mobile evidence.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Removed repeated exact-prompt quotations while preserving canonical prompt copies,
distinct work entries, and their review records.
Author review: Pending project-author review.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Implemented and verified the standalone Supplier API Bash endpoint collection,
self-contained endpoint checks, and MEMBER/ADMINISTRATOR journeys.
Author review: Reviewed and approved by @ron.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
Scope: Drafted the User Service author's migrations entry below from the author's prompts; the author edited and approved it.
Author review: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
Scope: Drafted the User Service author's Dockerfile entry below from the author's prompts; the author edited and approved it.
Author review: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
Scope: Drafted the User Service author's outage-resilience entry below from the author's prompts; the author edited and approved it.
Author review: Reviewed and approved by @t-leongchuan
-->

# AI Usage Log

The Supplier UI entries for issues #29, #30, #31, and #34 continue the same workstream.
To avoid duplicating prompt text, their initiating implementation request is quoted once
under [Supplier frontend API and test foundation](#2026-09-27--supplier-frontend-api-and-test-foundation),
and the approved metadata follow-up is quoted once under
[Supplier Building Code metadata endpoint](#2026-09-27--supplier-building-code-metadata-endpoint).

## 2026-09-27 — Supplier administrator management UI

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Implementing and testing GitHub issue #30 from the approved
  Supplier UI specification.
- **Repository files affected:** Supplier frontend administrator routes, navigation,
  metadata API/types, management/form/concurrency components, focused tests, frontend
  documentation, and this usage log.
- **Author review:** Reviewed and approved by @ron.

### Key response

Codex implemented the administrator Supplier UI on the dedicated Supplier UI workstream:
live ACTIVE/ARCHIVED management, metadata-backed create/full-edit forms, detail ETag use
for every conditional mutation, accessible archive/restore confirmation, refresh and
success feedback, duplicate navigation, and stale-draft compare/reload recovery. Focused
tests cover the exact mutation body, duplicate creation, 412 draft preservation, current-
ETag archive, and member exclusion. It did not implement physical deletion, mock Supplier
data, Order Service functionality, or User/Supplier backend application changes.

## 2026-09-27 — Supplier frontend API and test foundation

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Implementing code, tests, and documentation from the approved
  Supplier UI specification and GitHub issue #28.
- **Repository files affected:** Frontend API client and Supplier modules, frontend test
  setup and focused tests, nginx gateway parity, dependency metadata, frontend docs, and
  this usage log.
- **Author review:** Reviewed and approved by @ron.

### Exact prompt

> `$implement-spec Lets implemetn the Supplier UI as a separate branch`

### Key response

Codex implemented the shared typed foundation required before Supplier screens: list,
detail, create, full update, archive, and restore API helpers; ETag propagation;
Supplier field-error, request-ID, and duplicate-ID metadata; shared category and typical-
hours formatting; and Vitest/Testing Library setup with focused contract tests. The nginx
gateway now handles the bare `/assets/suppliers` path consistently with Vite. This ticket
did not add UI screens, duplicate the backend-owned building-label mapping, or modify
Supplier/User Service application code.

## 2026-09-25 — Supplier specification requirements review

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Discovering and interpreting requirements from the supplied project, D1, and D2 PDFs; asking the project author to resolve ambiguities; formatting decisions supplied by the author.
- **Repository files affected:** `supplier-service/SPEC.md`, `CONTEXT.md`, `ai/usage-log.md`
- **Author review:** I validated design decisions and approved it.

### Prompts

> `$grill-with-docs I am trying to plan out the spec for the supplier service and have already written out a base SPEC.md can we go through it and clarify it in depth before i move to implementation`

> `currently im working on milestone d2 before i answer your questions till q13, please read pdfs in supplier-service/docs/reference to get more context of this project and milestone im currently working on, im in particualr working on supplier service, and then come back to me with the questions if you still have any unaswered`

> `Q8 — We are targeting a near-complete Supplier Service, including the responsive management UI. We also plan a near-complete User Service.`
>
> `Q9 — We want archive instead of physical deletion. We will seek team approval and update D1 before treating this change as approved. Until then, mark it as a proposed change.`
>
> `Q10 — Keep general description as a required Supplier field for D2, including create/update validation and detail display. This follows the current D1 requirement.`
>
> `Q11 — Proceed with our proposed contract: a same-origin opaque session cookie; Supplier calls User Service’s authenticated POST /internal/sessions/validate with the session token and receives active, id, and role. Use a development verifier while building Supplier, then give the documented contract to the User Service owner for agreement and implementation. The integrated D2 demo must use real sessions.`
>
> `Q12 — A Supplier ID represents a physical errand origin. A move to another building creates a new Supplier record and archives the old one. A correction to directions within the same location keeps the ID.`
>
> `Q13 — Use canonical building codes and normalize aliases during import. Distinguish unknown hours from 24-hour operation explicitly; opening and closing times can represent ordinary and overnight hours. The team will document the exact values before implementation.`
>
> `Q14 — Define the test workload as 100 suppliers, 20 concurrent clients, approximately 10 requests per second for five minutes, with 80% list and 20% detail requests. Include User Service validation in response time and measure list/detail p95 against D1’s two-second target.`

### Key response

Codex compared the three supplied PDFs with the specification, identified contradictions involving the required general description and deletion behavior, surfaced requirements that remained undecided, and formatted the project author's answers into the specification and glossary. Codex did not select the recorded architecture, schema, interface, or performance decisions in this edit.

An earlier interview round contained suggested design answers before the PDF's AI policy was reviewed. Repository design text created from those suggestions was reverted after discovering the policy.

## 2026-09-25 — Supplier value contracts and D1 description reversal

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Formatting value mappings and decisions supplied by the project author; identifying the resulting D1 conflict.
- **Repository files affected:** `supplier-service/SPEC.md`, `CONTEXT.md`, `ai/usage-log.md`
- **Author review:** Reviewed and approved by @ron.

### Prompt

> `no for 15 lets just stick to the location description that is already provided as general description For Q16, my proposed mapping is:`
>
> `Stored code Display label Seed aliases`
>
> `COM2 COM2 Com 2, Com2`
>
> `COM3 COM3 COM3`
>
> `CENTRAL_LIBRARY Central Library Central Library`
>
> `ENG_E3, ENG_E4, ENG_EA Engineering Block E3/E4/EA respectively Each corresponding seed value`
>
> `FRONTIER Frontier Frontier`
>
> `TERRACE Terrace Terrace`
>
> `THE_RIDGE The Ridge The Ridge`
>
> `YIH Yusof Ishak House Yusof Ishak House`
>
> `PGP Prince George’s Park Straight or curly apostrophe`
>
> `HSSML Hon Sui Sen Memorial Library Same`
>
> `MED_SCI_LIBRARY Medicine + Science Library Medicine+Science Library`
>
> `AS8 Block AS8 Blk AS8`
>
> `INNOVATION_4_0 innovation4.0 innovation4.0`
>
> `Q16 buildings: Use the code/label mapping below. Reject an unknown code with 400 for D2; add new buildings to the controlled mapping deliberately.`
>
> `Q17 categories: Categories describe what the errand origin offers: FOOD, COFFEE, PRINTING, SHOPPING, PICKUP_POINT. Permit multiple; map Food/Coffee to FOOD + COFFEE. A foyer used only for pickup is PICKUP_POINT, regardless of whether it is also a landmark.`
>
> `Q18 hours: Use hoursKind: UNKNOWN | ALL_DAY | INTERVAL. Only INTERVAL has opensAt/closesAt (HH:mm); closing before opening means next day. Interpret times in Asia/Singapore. Keep the seed’s 0000hrs–2359hrs as an interval until someone verifies that it means 24 hours.`
>
> `Q20 images: Treat images as optional seed-managed display assets for D2. Show a fallback; omit imagePath from administrator create/update until image management is designed.`
>
> `want one locationDescription field, also displayed as the supplier’s description, with no separate general-description field. That reverses the Q10 answer I gave you`

### Key response

Codex formatted the supplied building mapping, category values, hours discriminator, image scope, and description reversal into the specification and glossary. The specification marks the description reversal as a proposed D1 change because the current approved D1 backlog still requires a separate general description.

## 2026-09-25 — Duplicate, building response, hours validation, and approval fallback

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Formatting decisions supplied by the project author and checking their consistency against the existing specification.
- **Repository files affected:** `supplier-service/SPEC.md`, `CONTEXT.md`, `ai/usage-log.md`
- **Author review:** Reviewed and approved by @ron.

### Prompt

> `for 19 Return 409 for an exact match on normalized name, building code, floor, and location description, including an archived match; direct admins to the existing record. Allow the same name at a genuinely different location.`
>
> `Q21: Requests send buildingCode only. Responses return both buildingCode and buildingLabel, so the UI can display “Central Library” without maintaining its own code-to-label list.`
>
> `Q22: Require hoursKind on create and full update. UNKNOWN and ALL_DAY must have no times; INTERVAL requires both times. Equal opening and closing times are invalid, while closing earlier than opening means overnight. Reject contradictory fields rather than silently ignoring them.`
>
> `Q23: Start work unaffected by the pending changes. If approval still has not arrived when description or deletion must be implemented, follow current D1 and mark any unfinished active-errand deletion check honestly. Do not demonstrate unconditional archive as an approved requirement.`
>
> `by the way why are there so many questions, can we finalise soon`

### Key response

Codex formatted the supplied duplicate rule, building request/response fields, hours validation rules, and approval contingency into the specification and glossary, then performed a final consistency audit.

## 2026-09-25 — First Supplier backend increment

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Implementing code and tests from the author-approved Supplier specification; recording the two approvals supplied by the author; documenting and checking the result.
- **Repository files affected:** `README.md`, `.dockerignore`, `.env.example`, `.gitignore`, `compose.yaml`, `ai/usage-log.md`, and the implementation, configuration, and documentation files under `supplier-service/`, including `supplier-service/AI-DISCLOSURES.md`
- **Author review:** Reviewed and approved by @ron.

### Exact prompt

> I want to implement a spec using $implement-spec . THIS SHOULD ONLY IMPLEMENT THE BACKEND PORTION REMEMBER, we'll do frontend another day. Read `AGENTS.md`, `supplier-service/SPEC.md`. The team has approved archive in place of the D1 deletion restriction and `locationDescription` as the only Supplier description. Ensure the spec records those approvals accurately.
>
> Implement the **first Supplier backend increment only**: NestJS setup, PostgreSQL connection through Drizzle, schema and migrations from the spec, `/health`, and a repeatable seed import that preserves administrator edits. Work mainly in `supplier-service/`; make only necessary Compose changes. Do not build the frontend or change other services.
>
> Our proposed User Service contract is the Supplier workstream contract to build against later through `SessionVerifier`; do not wait for User Service to start this increment. Do not invent design decisions where the spec is unclear—report the specific blocker. Run relevant checks, show the changed files and results, and record AI assistance as the course policy requires.
> The spec.md was finetuned and edited and draws from sources like the 3 pdfs in supplier-service/docs/references

### Key response

Codex recorded archive and the single `locationDescription` field as team-approved changes while retaining the note that the D1 text still needs alignment. It implemented only the requested backend foundation: NestJS/Express, a private PostgreSQL connection through Drizzle, constrained Supplier/category schema and generated migrations, database-backed `GET /health`, and a repeatable 21-row CSV importer that uses an explicit durable identity manifest without overwriting administrator-edited records or categories. Review remediation added guarded fixed seed IDs independent of editable name/location text, the database building-code allowlist, lossless unconstrained decimal coordinates, centralized connection cleanup, and distinct bootstrap, migration-owner, and least-privilege runtime Compose roles. It added focused mapping/idempotency/readiness tests and the necessary Docker Compose, container, environment-example, and operational documentation changes; it did not add frontend, catalogue APIs, mutations, authentication, or changes to other services.

Strict JSON cannot contain literal comments. To keep the required disclosure as the first JSON member without making the files invalid, `supplier-service/package.json` and `supplier-service/nest-cli.json` use a leading `"//"` metadata property linked to the adjacent [Supplier disclosure sidecar](../supplier-service/AI-DISCLOSURES.md#strict-json-files). Codex verified that npm and the Nest CLI accept the property. Project-author review was completed and approved by @ron; course-owner approval for this unavoidable strict-JSON exception is still required before submission. Markdown, TypeScript, YAML, shell, and Docker files retain ordinary leading comments where their formats permit them.

## 2026-09-25 — User/Supplier integration conflict resolution

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Comparing the merged User Service implementation with the previously author-approved Supplier proposal; formatting the implementation facts into the Supplier specification at the author's explicit direction; resolving Git conflicts without changing User Service application code.
- **Repository files affected:** `.env.example`, `compose.yaml`, `README.md`, `supplier-service/README.md`, `supplier-service/SPEC.md`, and `ai/usage-log.md`
- **Author review:** Reviewed and approved by @ron.

### Exact prompt

> `$resolving-merge-conflicts https://github.com/Y2627S1-CS3219-P5/FoC/pull/14 the person in charge of user service just implemented it, can you check if it aligns with our contract if not modify SPEC, also there seems to be merge conflict so resolve it`

### Key response

Codex found that PR #14 implements an HS256 bearer access token and `GET /auth/verify`, rather than the Supplier proposal's opaque cookie and `POST /internal/sessions/validate`. At the author's direction, it documented the implemented request/response and error semantics, retained `SessionVerifier` as the future Supplier integration seam, and left frontend token storage, refresh/logout, final routing, and verification timeout/TLS as explicit remaining decisions. It merged both services' environment and Compose definitions, preserved their private databases and startup dependencies, made Compose honor the User Service's documented `ALLOWED_EMAIL_DOMAIN` variable, ran both services' available checks, and completed the merge without changing User Service application code.

## 2026-09-25 — Supplier foundation approval fixes

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Applying the project author's requested PR review fixes and recording the author's explicit approval.
- **Repository files affected:** Supplier building-domain/schema/seed files, database privilege setup and tests, ignore/configuration disclosures, `CONTEXT.md`, Supplier documentation, and `ai/usage-log.md`
- **Author review:** Reviewed and approved by @ron; the separate strict-JSON course-owner exception remains pending.

### Exact prompt

> `make the fix then, also add my approval to the docstrings where needed we can proceed to merge after that`

### Key response

Codex removed runtime permission to delete Supplier rows while retaining the narrowly required ability to replace category memberships, including revoking earlier broad grants when migrations rerun. It renamed the raw CSV `Type` concept to `sourceCategoryValue`, consolidated building codes, display labels, and seed aliases into one registry, removed the duplicate `node_modules/` ignore entry, added a least-privilege regression test, and recorded @ron's project-author approval without claiming the still-pending course-owner approval for strict-JSON disclosure metadata.

## 2026-09-25 — Second Supplier backend increment

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Implementing and verifying only the authenticated Supplier backend read increment from the author-approved specification and the implemented User Service contract; recording the author's supplied deployment and API decisions; no frontend, Supplier mutations, or User Service application changes.
- **Repository files affected:** `README.md`, `.env.example`, `compose.yaml`, `ai/usage-log.md`, `supplier-service/README.md`, `supplier-service/AI-DISCLOSURES.md`, `supplier-service/package.json`, and the authentication, read-model, HTTP, configuration, tests, and integration runner under `supplier-service/`
- **Author review:** Reviewed and approved by @ron.

### Exact prompt

> `lets ignore that for now i checkout to main, pull the remote changes we made and then $implement-spec use this to start the implementatoin for second Supplier backend increment based on the spec, now it should be easier since user service is already well defined right, remember we are only working wiht supplier service backend for now and should not edit user service`

### Exact follow-up approval

> `yes assets/suppliers is the standard place to serve image assets, and yes server should be in charge of generating IDs instead of client, proceed`

The follow-up approved the proposed backend defaults presented for this increment: omitted sort defaults to `name,asc`; list size has minimum 1; User Service base URL is configurable and Compose uses `http://user-service:3001`; verification timeout is 1,000 ms; bundled Supplier images are served from `/assets/suppliers`; and Supplier generates request IDs rather than trusting a client-supplied ID.

### Key response

Codex implemented the second Supplier backend increment without changing User Service application code: a bounded `SessionVerifier` implementation that forwards the bearer header unchanged to User Service, a NestJS guard and role policy, PostgreSQL-backed Supplier list/detail reads with approved query defaults and stable pagination, archived visibility rules, strong detail ETags, server-generated request IDs, consistent error responses, and bundled image serving. It added focused unit/contract tests and an isolated Compose integration runner. The live runner verified a clean 21-row migration/seed and zero-insert repeat seed preserving an archived fixture, real MEMBER and ADMINISTRATOR registration/login/verification, search/filter/stable paging/detail, 401/403/404/503 behavior, ETags, request correlation, image serving, and recovery after User Service restart. An integration finding also bounded page/size combinations so their database offset remains a safe JavaScript integer. Project-author review was completed and approved by @ron; the separate strict-JSON course-owner exception remains pending for submission.

## 2026-09-25 — Supplier search bound and completion logging approval

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Explaining the implemented list-query term, formatting the author's 300-character approval into the Supplier specification, selecting the smallest Nest-native request-completion logging mechanism consistent with the author's request and official Nest guidance, and implementing issue #17 code-review remediation.
- **Repository files affected:** `supplier-service/SPEC.md`, `supplier-service/README.md`, `supplier-service/docs/verification/second-backend-increment.md`, `supplier-service/scripts/compose-smoke.mjs`, Supplier HTTP/authentication source and tests under `supplier-service/src/`, and `ai/usage-log.md`
- **Author review:** The 300-character `q` decision, request-completion logging direction, and implementation were reviewed and approved by @ron.

### Exact prompts

> `can i check what does q represent here and why 300 chars for length specifically? also how will non-sensitive request completion logging be done`

> `makes sense that works, also for hte server geenrated request ID are we using the nestjs observability/microservice sdk for this implementation, feel free to search the web or use best practices, if so implement it`

### Key response

Codex clarified that `q` is the trimmed free-text term used for case-insensitive Supplier name and location-description search. The author approved a maximum of 300 characters because `location_description varchar(300)` is the longer searched field; the implementation counts Unicode code points, accepts 300, and returns the existing 400 validation body with `fieldErrors.q` at 301.

For completion logging, Codex used the existing HTTP middleware lifecycle and a dedicated Nest built-in `ConsoleLogger` in JSON mode rather than adding `@nestjs/observe`, a microservices SDK, `AsyncLocalStorage`, Pino, tracing/APM, or an exporter. Each request produces at most one machine-readable completion line correlated to the server-generated UUID. The application `message` payload contains only the stable event name, request ID, method, query-free pathname, status, completed/aborted result, and duration; Nest adds its normal non-sensitive JSON logger envelope (`level`, process ID, timestamp, and context). It never records authorization/token data, query values (including `q`), full URLs, bodies, or user identity. Review remediation also centralized public Supplier HTTP error definitions/factories and shared UUID syntax validation while preserving the existing 400 and fail-closed 503 mappings.

## 2026-09-26 — PR #19 project-author approval

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Recording the project author's explicit approval of the already-reviewed second Supplier backend increment; no implementation or design changes.
- **Repository files affected:** AI disclosure comments and summaries in the files changed by PR #19, plus `ai/usage-log.md`
- **Author review:** Reviewed and approved by @ron. The separate course-owner approval for the strict-JSON disclosure convention remains pending before submission.

### Exact prompt

> `okay i looked through the implementation for PR 19 add my approval to the relevant files`

### Key response

Codex changed the second-increment disclosure status from review-required to reviewed and approved by @ron, retained the separate pending course-owner strict-JSON exception, and made no application-behaviour changes.

## 2026-09-26 — Third Supplier backend increment

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Implementing and verifying only the administrator Supplier mutation backend increment from `supplier-service/SPEC.md`; creating and coordinating its GitHub ticket graph and draft PR; fixing an in-scope PostgreSQL defect found by live verification; no frontend or User Service application changes.
- **Repository files affected:** `README.md`, `ai/usage-log.md`, `supplier-service/README.md`, `supplier-service/SPEC.md`, `supplier-service/docs/verification/third-backend-increment.md`, `supplier-service/scripts/compose-smoke.mjs`, and the Supplier mutation query implementation/test under `supplier-service/src/suppliers/write/`
- **Author review:** Reviewed and approved by @ron.

### Exact prompt

> `ok i merged pr 19, checked out main locally and git pull origin main $implement-spec use this skill if neeeded for third increment implementation`

### Exact contract-clarification follow-ups

> `what do you mean by repeated archives explain simply, also what do you mean by canonical strong ETags, explain simply and give few examples of weak versions/etags`

> `admin archives it with DELETE and the correct if-match, waht do you mean by correct if match explain simply and keep it short`

> `got it, rest of the defaults look good, proceed with implementation`

> `seems like conversation was interrupted? continue`

### Key response

Codex created the issue #20–#23 task graph and draft PR #24, recorded the author's approved mutation defaults, and coordinated validation, persistence, HTTP, and integration work on separate branches/worktrees. The completed backend provides ADMINISTRATOR-only create, full update of ACTIVE or ARCHIVED rows, archive, and restore; strict editable-field bodies; stable 400/404/409/412/428 errors; canonical strong ETags; atomic version checks; normalized duplicate detection across lifecycle states; and harmless archive/restore repeats. MEMBER calls are rejected before mutation and every protected request uses the real User Service verifier.

The issue #23 Compose runner was expanded from read-only fixtures into a full public-API mutation proof backed by SQL snapshots. It verified real MEMBER/ADMINISTRATOR sessions; authorization with no writes; representative validation; create headers/body/database/list visibility; unknown, missing, malformed, stale, and extremely large preconditions; one-201/one-409 concurrent duplicate creation; ACTIVE and ARCHIVED duplicates; exactly one successful update from two concurrent same-version administrator-session requests; full update and category replacement; archive retention/visibility and repeat no-ops; archived editing; restore and repeat restore; no-op migration and repeat seed preserving administrator edits/categories; and User Service outage returning 503 without mutation. Existing catalogue, request-correlation, redacted-log, asset, and recovery checks remain covered. The final live smoke passed and removed only its unique per-run Compose project and volumes.

The first live concurrent-create run found that PostgreSQL could not infer the Building Code placeholder type inside the advisory-lock `jsonb_build_array`, although mocked SQL tests passed. Codex added an explicit `::text` cast and regression assertion; the rerun produced exactly one 201 and one 409. Final checks passed: Supplier dependency install, typecheck, 24 suites/205 tests, production build, no migration drift, strict JSON parsing, Compose validation, User Service compatibility install/build, and the live integration smoke. No frontend, User Service application code, Order Service integration, physical Supplier deletion, migration, or strict-JSON file was added or changed. Project-author review was completed and approved by @ron; the separate course-owner approval for the existing strict-JSON disclosure convention remains pending.

## 2026-09-26 — Third Supplier backend increment final review remediation

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Fixing every final code-review finding on the isolated remediation branch without changing the approved API behavior, frontend, or User Service application.
- **Repository files affected:** Supplier specification/evidence, root summary, this usage log, the Supplier mutation value/ETag/controller/persistence types and tests, and the Supplier Compose smoke runner.
- **Author review:** Reviewed and approved by @ron.

### Prompt context

This remediation continued the approval and resume prompts already recorded under
[Third Supplier backend increment](#2026-09-26--third-supplier-backend-increment).

### Key response

Codex corrected GitHub wayfinder issue #11 so closed tickets #20–#22 are checked while open verification ticket #23 remains pending. It clarified that PostgreSQL serialization protects concurrent same-normalized-key POST creation across ACTIVE and ARCHIVED rows and does not add duplicate rejection to PUT, preserving the approved 409 contract. The implementation now has one neutral editable mutation-value type and one Supplier ETag formatter/header writer. A focused persistence assertion proves update bypasses the create-only duplicate lookup, and focused ETag tests cover canonical formatting and header output.

The live runner was split into focused scenario functions, with archive and restore rejection matrices sharing one parameterized precondition verifier. Final checks passed: focused 6 suites/97 tests, full 24 suites/208 tests, typecheck, production build, and the full real-service integration smoke. The unique smoke project's `finally` cleanup passed, and an independent Docker label query found no remaining containers, volumes, or network. No frontend, User Service application file, API behavior, migration, or strict-JSON file changed; the local `supplier-service/node_modules` symlink remains untracked and excluded from the commit.

## 2026-09-26 — One-command Supplier integration demonstration

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Wrapping the already-verified dependency install and isolated Supplier integration suite in one executable shell command; no application or test-behaviour changes.
- **Repository files affected:** `supplier-service/scripts/run-integration-demo.sh`, `supplier-service/README.md`, and `ai/usage-log.md`
- **Author review:** Reviewed and approved by @ron.

### Exact prompt

> `could we write a bash script for this so that i can just invoke this instead of runnng 3 separate commadnds`

### Key response

Codex added an executable Bash wrapper that resolves `supplier-service/` relative to its own location, verifies that npm and a running Docker daemon are available, installs exactly the dependencies in `package-lock.json` with `npm ci`, and invokes the existing isolated `npm run test:integration` demonstration. The wrapper adds no new credentials, services, application behavior, or test logic.

## 2026-09-26 — PR #24 project-author approval

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Recording the project author's explicit approval of the reviewed third Supplier backend increment and its integration-demo wrapper; no implementation or design changes.
- **Repository files affected:** AI disclosure comments and summaries in the files changed by PR #24, plus `ai/usage-log.md`
- **Author review:** Reviewed and approved by @ron. The separate course-owner approval for the strict-JSON disclosure convention remains pending before submission.

### Exact prompt

> `add my approval for related files in this PR, PR #24 right`

### Key response

Codex changed the third-increment and integration-wrapper disclosure status from review-required to reviewed and approved by @ron, retained the separate pending course-owner strict-JSON exception, and made no application-behaviour changes.

## 2026-09-26 — Supplier OpenAPI documentation

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Consulting official NestJS documentation, implementing and testing developer-facing OpenAPI documentation for the existing Supplier backend contract, updating Supplier operating guidance and live verification, and creating issue #25 plus its pull request; no frontend or User Service application changes.
- **Repository files affected:** Supplier package metadata/lockfile, bootstrap, health and Supplier HTTP annotations, OpenAPI DTO/configuration/tests under `supplier-service/src/openapi/`, live Compose verification, `supplier-service/README.md`, `supplier-service/AI-DISCLOSURES.md`, and `ai/usage-log.md`
- **Author review:** Reviewed and approved by @ron. The separate course-owner approval for the strict-JSON disclosure convention remains pending before submission.

### Exact prompt

> `does nestjs support swagger or like an api docs so other devs can refer to it, feel free to search the web and then lets create a PR for it once ure done`

### Key response

Codex confirmed from the official NestJS documentation that `@nestjs/swagger` generates OpenAPI documents from Nest metadata and can serve both an interactive Swagger UI and JSON specification. It added `/api/docs` and `/api/docs-json`, a bearer-token security scheme, explicit schemas for the existing interface/custom-pipe contract, operation documentation for health and every Supplier read/mutation route, focused generated-document tests, live Compose coverage, and usage guidance. The implementation changes no Supplier business behavior, frontend, User Service application code, database schema, or migration.

## 2026-09-26 — PR #26 project-author approval

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Recording the project author's explicit approval of the reviewed Supplier OpenAPI documentation; no implementation or design changes.
- **Repository files affected:** AI disclosure comments and summaries in the files changed by PR #26, plus `ai/usage-log.md`
- **Author review:** Reviewed and approved by @ron. The separate course-owner approval for the strict-JSON disclosure convention remains pending before submission.

### Exact prompt

> `add my approval to the relevant files and push the changes`

### Key response

Codex changed the Supplier OpenAPI disclosure status from review-required to reviewed and approved by @ron, retained the separate pending course-owner strict-JSON exception, and made no application-behaviour changes.

## 2026-09-26 — User Service requirements review and frontend authentication planning

- **Tool:** Claude Code (Claude Opus 5.5)
- **Allowed-use scope:**
  - Interpreting requirements from the project, D1 and D2 documents
  - Comparing the existing User Service against the D1 backlog
  - Learning support: general explanations of JWT access tokens, browser token storage,
    CORS and reverse proxies, REST naming conventions, and check-then-act race conditions
- **Repository files affected:** none (planning only)
- **Author review:** Reviewed and approved by @t-leongchuan

### Prompts

> "[...] tasked with the authentication pages for frontend. [...] tell me what's going on, what I actually need to do on my own"

> "[...] refresh on what the token actually is for before i make the decision. [...] what is CORS to make a sensible decision"

> [Token storage] "I am thinking something like sessionStorage [...] Refreshing the page logs us out just feels ridiculous from a UX perspective [...] closing the tab is already some form of intention that user is done with our application."

> [Routing] "the way I think about it is more on [a reverse proxy], since [...] (it was mentioned in lecture 5 [...]) microservices are reasonably done [...] This gives us more fine control than CORS"

> [URL layout] "Is there a way of approach that allows both at the same time? [clear endpoints for developers while hiding services from clients]"

> [URL layout] "uniformity, use v1, and rewrite public paths as necessary"

### Key response

Claude summarised the D2 rubric against the implemented User Service and identified the
missing items. On request, it explained general concepts and presented standard
alternatives with brief, neutral trade-offs:
- in-memory vs sessionStorage vs localStorage for the token
- CORS vs a reverse proxy
- service-named vs data-named URL paths
- check-then-act races

The author chose:
- sessionStorage
- a reverse proxy
- data-named `/api/v1` paths with gateway rewrites

The reasoning quoted above is the author's own. Claude did not select any option.

## 2026-09-26 — Frontend authentication pages, gateway, and User Service `/whoami`

- **Tool:** Claude Code (Claude Opus 5.5)
- **Allowed-use scope:** Implementation code and boilerplate after the author finalised the design:
  - Vite project scaffolding
  - React pages and components
  - dev-proxy and nginx gateway configuration
  - Dockerfile and compose entry
  - User Service authentication middleware and the `GET /whoami` handler
- **Repository files affected:**
  - `frontend/**` (new)
  - `user-service/src/authenticate.ts` and `user-service/src/profile.ts` (new)
  - `user-service/src/auth.ts` and `user-service/src/index.ts` (small edits)
  - `compose.yaml`, `.env.example`
- **Author review:** Reviewed and approved by @t-leongchuan

### Prompts

> "[...] tasked with the authentication pages for frontend. [...] respect AI usage policies."

> [Top bar] "It should show name [...] A main display name, and perhaps a 'handle' for the actual user name. [...] Only if you are Admin does it have a little UI thingy [...] (ADMIN). My thinking is just to show what we want to show: Members do not need to know that an admin role exists"

> [Expiry warnings] "Toast for Each." / "one at 5 minutes for gentle alert, and at 2 minutes the warning"

> [Tooling] "name is frontend/. [...] Let's use Tailwind [...] React Router, yes."

> [Gateway] "don't expose what clients dont need to know. /auth/verify should only be meant for those that need to see and access it."

> [Current-user endpoint] "i like to use whoami actually. it's a common unix command"

> [After sign-up, option selected from Claude's multiple-choice question] "Go to Login page" / [After login, option selected] "WIP landing page"

### Key response

Claude implemented the author's decisions:
- a React + TypeScript + Vite frontend with Tailwind and React Router, following the D1 mockup
- sessionStorage token handling isolated in one module
- expiry toasts at 5 and 2 minutes, and a redirect to login on expiry, logout or a 401
- a Vite dev proxy and an nginx gateway that forward only the public `/api/v1` paths and
  do not expose `/auth/verify`
- in the User Service, an `authenticate` middleware, reused by `/auth/verify` with
  unchanged responses, and `GET /whoami` returning `username`, `displayName` and `role`

Verification:
- type-checked, built and linted
- run on the full Docker Compose stack
- API routing and gateway exposure checked
- 13 browser checks: registration and login errors, member vs admin top bar,
  refresh/new-tab behaviour, logout, expiry toasts

## 2026-09-26 — User Service profile update and administrator role changes (D2 points 5 and 6)

- **Tool:** Claude Code (Claude Opus 5.5)
- **Allowed-use scope:**
  - Implementation code after the author decided the endpoint behaviour, status codes and
    concurrency approach
  - Learning support: PATCH vs PUT, idempotency, transaction isolation vs locking
  - Endpoint documentation
- **Repository files affected:**
  - `user-service/src/profile.ts`, `roles.ts` (new), `users.ts` (new), `authenticate.ts`,
    `index.ts`, `README.md`
  - Gateway rules in `frontend/vite.config.ts`, `frontend/nginx.conf`, `frontend/README.md`
- **Author review:** Reviewed and approved by @t-leongchuan

### Prompts

> "Let's work on point 5 and 6 then."

> [Profile update method] "[PATCH] seems to be the most intuitive"

> [Extra fields in a profile update] "we should only do what we allow it to do so if they mess around and send protected fields, we do want to provide the capability they want to do [...] ([...] change their displayName ONLY [...]), but we also want to ignore the other fields"

> [Identifying the target of a role change] "by account id for now for D2 purposes, though i imagine this might be incovenient later on so make it to be extensible."

> [Concurrency] "Thinking [lock-then-check] is the most obvious, but would like you to expand on what [serializable isolation] means [...] would this affect other operations to be slower?"

> [Lock-then-check] "yes" / [Profile update without displayName] "do nothing? [...] it's the idea of a contract: I allow you to change displayName and provided you the UI and code for it [...] there should be no expectation by you for your request to suceed if it doesn't follow what we hae specified."

> [HTTP status codes: admin changing own role; change leaving no active admin] "a) 403 b) 409" / [Changing to the same role] "Harmless success [...] We just allow you to do it but if it is already an admin we are not going to change things"

### Key response

For each open question, Claude presented standard alternatives with brief, neutral
trade-offs:
- PATCH vs PUT
- rejecting vs ignoring extra fields
- identifying the target by username vs account id
- a database lock vs serializable isolation

On request, it explained what each option means (isolation levels apply per transaction;
an advisory lock only delays other role changes). The author chose each option, with the
reasoning quoted above.

Claude then implemented:
- `requireRole` RBAC middleware
- `PATCH /whoami` (displayName 1–50 characters)
- `changeRole()`, separate from the HTTP route: a transaction that takes an advisory lock,
  re-checks the acting admin, and enforces the last-admin rule
- `PUT /users/:id/role` and the gateway rules

Verified on the Docker stack with 26 API checks, including:
- ignored protected fields
- member 403 and self-change 403
- role changes taking effect immediately in the Supplier Service
- 20 rounds of two admins demoting each other at the same time, where both never succeed

Claude noted that the 409 rule cannot be triggered in D2, because self-changes are forbidden.

## 2026-09-27 — Supplier Building Code metadata endpoint

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Implementing the project-author-approved authenticated runtime metadata contract for issue #33, documenting it, and adding focused verification; no Supplier CRUD behavior, database state, frontend files, or User Service application code changes.
- **Repository files affected:** `supplier-service/SPEC.md`, `supplier-service/AI-DISCLOSURES.md`, `supplier-service/src/domain/buildings.ts`, Supplier controller/OpenAPI source and tests, `supplier-service/scripts/compose-smoke.mjs`, and `ai/usage-log.md`
- **Author review:** The metadata-endpoint contract decision and implementation were reviewed and approved by @ron on 2026-09-27.

### Exact prompt

> `yes for long-term consistency lets add metadata endpoitn`

### Key response

Codex implemented authenticated `GET /api/v1/suppliers/metadata` with the approved extensible response shape `{ "buildingCodes": [{ "code", "label" }] }`. The endpoint serves the complete stable option set directly from the backend-owned building registry to both MEMBER and ADMINISTRATOR callers, without exposing seed aliases or introducing database state. It is covered by focused controller and generated OpenAPI tests plus the real-service Compose integration check, including unauthenticated rejection and exact MEMBER/ADMINISTRATOR responses. No existing Supplier CRUD behavior, frontend file, or User Service application code was changed.

## 2026-09-27 — Supplier member catalogue and detail UI

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Implementing and testing GitHub issue #29 from the approved
  Supplier UI specification; no administrator mutations, backend, or User Service changes.
- **Repository files affected:** `frontend/src/App.tsx`, Supplier frontend API/types and
  UI components/tests under `frontend/src/suppliers/`, frontend test setup, README and
  `frontend/AI-DISCLOSURES.md`.
- **Author review:** Reviewed and approved by @ron.

### Key response

Codex implemented the authenticated member catalogue and detail experience using live
Supplier APIs. Search, metadata-backed building/category filters, sorting, page size and
pagination are URL-backed; new requests cancel and ignore stale responses. Responsive
cards and detail show backend labels, Location Description, typical hours, coordinates
and accessible image fallback, with loading, empty, not-found, service/network and retry
states. Focused tests verify live-data rendering at the API boundary, member-only controls,
query behavior, stale-response protection, image fallback and detail concealment. No
administrator management UI or future Order Service action was added.

## 2026-09-27 — Integrated responsive Supplier UI verification

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Implementing GitHub issue #31 from the approved Supplier UI
  specification: real-browser/Compose verification, responsive evidence, current docs,
  and course disclosure records. No User Service application changes or Order integration.
- **Repository files affected:** Playwright test/configuration and orchestration under
  `frontend/`, frontend dependency/test metadata and documentation,
  `supplier-service/SPEC.md`, Supplier README/verification evidence, and this log.
- **Author review:** Reviewed and approved by @ron.

### Key response

Codex added a repeatable isolated Chromium verification against the production nginx
frontend, real User and Supplier services, migrations/seed, and fresh PostgreSQL volumes.
It demonstrates a MEMBER using live search, building/category filters, sorting, pagination,
and detail without administrator controls, plus an ADMINISTRATOR creating, editing,
archiving, inspecting, and restoring one stable Supplier ID. Desktop and 390-pixel mobile
views assert that neither the document nor body overflows horizontally. The orchestration
uses available ports, a unique Compose project, non-secret test-only credentials, ignored
failure artifacts, and unconditional project/volume cleanup.

The evidence records that representative UI error/concurrency behavior is covered by
focused component/API tests and the existing API-only real-service integration suite,
rather than overstating the two-browser-journey scope. The API-only runner remains usable
without the frontend. No User Service application file or Order Service integration was
changed or claimed.

## 2026-09-27 — Supplier UI final review remediation

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Resolving GitHub issue #34 findings on the Supplier UI branch;
  no approved product-behavior change and no User/Order Service application changes.
- **Repository files affected:** Supplier frontend types and tests, shared administrator
  layout, Playwright journey, Supplier specification/evidence, frontend documentation,
  and this usage log.
- **Author review:** Reviewed and approved by @ron.

### Key response

Codex replaced the duplicated frontend Building Code allowlist with a named string domain
type whose valid options remain supplied by authenticated backend metadata, and added a
future-code contract fixture. It extracted the shared administrator page shell. The live
Chromium workflow now performs create/edit forms and archive/restore confirmations at 390
pixels, surfaces a genuine backend 400 while preserving form values, proves two editor tabs
loaded the same original ETag before one succeeds and the stale one visibly receives 412
with draft-preserving compare/reload, and calls the gateway without `If-Match` to prove 428.
It corrected stale specification language about implemented `sessionStorage`, client-side
logout, and same-origin routing, and updated observed verification evidence. Frontend
tests/lint/build, focused Supplier compatibility checks, and the disposable live workflow
passed, with filtered Docker cleanup empty afterward.

## 2026-09-27 — Supplier UI layout corrections

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Diagnose, implement, test, and push the two visual corrections
  requested for Supplier UI PR #32.
- **Repository files affected:** Shared frontend navigation, Supplier administrator form,
  focused component tests, Playwright regression coverage, frontend disclosure records,
  and this usage log.
- **Author review:** Reviewed and approved by @ron.

### Exact prompt

> `two small issues, the opens and closes at is not aligned, and the nav bar should be sticky so that as user scrolls vertically up and down nav bar should be visble, make the fixes and push changes to PR`

### Key response

Codex reproduced both issues with focused failing tests. The closing-time guidance occupied
extra vertical space above its control, while the opening-time field had no corresponding
space; shared field groups now use flex growth to bottom-align their controls. The shared
authenticated header now uses sticky top positioning with a stacking layer. Component
regressions and live Chromium assertions verify the form positions and header position
after scrolling. No backend or other service was changed.

## 2026-09-27 — AI usage-log prompt deduplication

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Removing repeated prompt quotations from this log without
  deleting distinct work, result, or approval records.
- **Repository files affected:** `ai/usage-log.md`
- **Author review:** Pending project-author review.

### Exact prompt

> `in usage-log.md there are some duplicates check and remove them and push changes to PR`

### Key response

Codex confirmed that the similarly named Supplier UI records describe separate issues and
kept them. It retained one canonical quotation of each shared Supplier UI prompt, replaced
the repeated third-increment remediation quotations with a link to their original entry,
and added a single cross-reference explaining which Supplier UI entries share the canonical
prompts. No implementation, specification, or earlier approval record changed.

## 2026-09-27 — Supplier API Bash endpoint collection and journeys

- **Tool:** OpenAI Codex (GPT-6)
- **Allowed-use scope:** Adding standalone Bash demonstrations for the already-implemented
  User authentication and Supplier APIs without changing application behavior, database
  schema, Compose configuration, frontend, or User Service code.
- **Repository files affected:** `supplier-service/scripts/api-demo/`, Supplier documentation,
  Supplier AI disclosure records, and this usage log.
- **Author review:** Reviewed and approved by @ron.

### Exact prompts

> `merged to main, remember the postman api test suite i asked you about, can we do it with simple bash scripts instead to test each API or like a user journye flow, eg user creates account, user logs in, user views a supplier as one flow, dont implemetn anything yet`

> `for member journeys it should also contain other journeys like member tries to access a protected api admin side, admin-jouney should also include other journeys now we only have create we should also have update, archive, restore right? also does it make sense to have a bash script for each of the api endpoitns (kind like postman api collection) so that we can run each endpoitn in isolation? show me the udpated structure`

> `so if some of them need administrator tokens and other prerequisites whats the workaroudn, do we run som prerequsitie before that script such as udpate.sh or is there another mechanism which you recommend`

> `ok i checkout to main and pull from origin main to update our local main with the supplier UI changes, lets proceed with the implementation in a separate branch, making incremental commits and once you are done create a PR, no need for tracking gtihub issue for this`

### Key response

Codex added thin Postman-like commands for User health/register/login/profile/role and every
Supplier health/metadata/list/detail/create/update/archive/restore endpoint. One isolated
endpoint runner automatically establishes each selected operation's public-API prerequisites.
Six complete journeys cover MEMBER reads and local sign-out, MEMBER mutation rejection,
administrator CRUD, validation and ETag preconditions, lifecycle visibility by role, and
concurrent administrator updates. Shared helpers read ignored local configuration without
executing it, keep tokens in memory, capture responses in temporary files, redact tokens
from assertion failures, and archive successful mutation fixtures. Live Compose runs passed
for every endpoint and journey; no frontend or service implementation file changed.

---

## 2026-10-09 — User Service schema migrations, database roles and reset script

- **Tool:** Claude Code (Claude Opus 5.5)
- **Allowed-use scope:**
  - Requirements interpretation: mapping the D1 backlog and D3 instructions to remaining User Service work
  - Learning support:
    - schema migrations
    - the Postgres image's superuser, database roles vs application roles, table ownership and grants
    - the `_FILE` secrets convention
    - Compose volume scope
  - Implementation code after the author decided the migration and privilege design
  - Documentation
- **Repository files affected:**
  - `user-service/src/config.ts` (new), `migrate.ts` (new)
  - `user-service/src/db.ts`, `token.ts`, `accounts.ts`, `bootstrap.ts`, `index.ts`
  - `user-service/src/schema.ts` (removed)
  - `user-service/migrations/0001_create_users.sql` (new)
  - `user-service/docker/postgres/init-roles.sh` (new)
  - `user-service/scripts/reset-db.sh` (new)
  - `user-service/package.json`, `user-service/README.md` (including a Troubleshooting table)
  - `compose.yaml`, `.env.example`
- **Author review:** Reviewed and approved by @t-leongchuan

### Prompts

> [Planning] "I want to look at the requirements not yet completed for the user service side that can be done independently [...] as well as what needs to be done in D3 for user service."

> [Where migrations run] "Separate one-off container, as supplier does. I think consistency is good here. [...] having containers make me think that we can 'script it' somehow"

> [Tooling] "I think hand-written is better: We own the service and gives us explicit control with low overhead [...] ORM is overhead feels too high and too much for a microservice."

> [Format and direction] "we can try doing it with sql first." / "Roll forward. [...] we don't risk having a state with mixed data."

> [Concurrency, failure, privileges] "I think locks." / "Refuse to start." / "Absolutely nope. this leads to a superadmin 'antipattern'. Principle of least privilege should be applied here."

> [Existing databases, app privileges, roles, secrets] "Q5: Wipe [...] 8 a) [...] SELECT/INSERT/UPDATE/DELETE on tables and USAGE on sequences, with no DDL. [...] grant only INSERT, SELECT on the audit table. [...] b) An init script, matching Supplier. [...] c) Move them to .env, with a committed .env.example holding placeholder values"

> [Superuser credentials, ownership, grants] "Narrow who receives it. [...] premature optimization." / "Migration role owns the table, and that's acceptable?" / "have the migration grant right for the table it creates"

> [Runner details] "(b) [...] Role names: Fixed. Role names aren't secret? [checksums] Yes [...] Sequence Numbers."

> [Reset script] "Only user service, in line with microservice arch [...] Check and print only [...] Ask first. Default to no, perhaps a --yes [...] bash script [...] Reusable [...] Stop after resetting, and print a next-step line."

> [Troubleshooting docs] "let's do b), I think they will use AI to help them as well so it would be great"

> [Reset script hint for other services] "(a)"

### Key response

Claude explained the concepts and the consequences of each option without choosing. It
pointed out that `docker compose down -v` would also wipe the Supplier database, and that
database roles are separate from FoC's MEMBER/ADMINISTRATOR roles.

It then implemented the author's decisions:
- **Config:** all configuration read in `src/config.ts`.
- **Migrate step:** a one-off `user-migrate` Compose step running hand-written, numbered,
  forward-only SQL migrations:
  - each file in its own transaction, under an advisory lock
  - stored checksums, so editing an applied file is refused
  - a clear message on a pre-migration database
  - `user-service` starts only after it succeeds
- **Roles:** an init script creating a migration role (owner) and an app role (row access
  only). The superuser credentials go only to the database container, and all passwords
  come from `.env`.
- **Reset script:** `user-service/scripts/reset-db.sh` resets only the User Service's local
  database. It checks `.env` and only reports problems, and asks before deleting. Its last
  lines point to `docker compose up -d` for any other service left stopped by an earlier
  failed `up`.
- **README:** a Troubleshooting table matching each exact error message to its cause and fix.

Verification (isolated Compose project, 2026-10-09):
- type-checked and built
- **fresh start:** roles, migration and first admin all came up on the first `up`
- **re-run:** "database is up to date"
- **app role:** can read and write rows; cannot create, alter or drop tables or read the tracking table
- **broken migration folders:** edited, missing, misnamed, duplicate and failing files were all refused (the failing one was rolled back) and `user-service` stayed stopped
- **CRLF:** a Windows line-ending copy is accepted
- **old D2-style database:** a clear message naming the reset script
- **reset script:** the missing-setting, No, yes and `--yes` paths all worked; it wiped only the user database (the Supplier volume and its 21 rows were untouched); login and supplier reads through the gateway worked afterwards
- **D2 demo kit:** 36/36 checks passed, and the race demo still had exactly 1 winner

## 2026-10-09 — User Service container image (two-stage build, non-root, pinned versions)

- **Tool:** Claude Code (Claude Opus 5.5)
- **Allowed-use scope:**
  - Learning support: multi-stage builds, production-only installs, `.dockerignore` vs `COPY` allowlists, non-root users, image tag pinning, `NODE_ENV`
  - Implementation code after the author decided the image design
- **Repository files affected:**
  - `user-service/Dockerfile`, `user-service/.dockerignore`
  - `compose.yaml` (the `user-db` image tag)
- **Author review:** Reviewed and approved by @t-leongchuan

### Prompts

> [Stages, packages, contents] "Multiple Stages (2 stage [...]). My justification is that runtime image contains no build tools or source [...] it doesn't need [...] Fresh install. Simpler to explain [...] an 'allow list' of sorts in the runtime stage, plus a '.dockerignore' for the build stage"

> [User, versions, environment, context] "node user, PoLP? [...] full version tag, for both images [...] Yes, but only in runtime stage? [...] Keep ./user-service 'Independent Deployment' fits nicely with a build that can only see its service."

> [Alpine pinning] "Use the form with the alpine version..? I feel like this is arbitrary and i do not have the nuance to answer this with confidence."

### Key response

Claude described the current image (347 MB, about 30 MB of compiler, source files included,
running as root) and the general options, without choosing. It explained the trade-off
behind pinning the Alpine version: reproducibility versus automatic OS updates.

It then implemented the author's decisions:
- **Build stage:** builds the TypeScript.
- **Runtime stage:**
  - `NODE_ENV=production`
  - a fresh `npm ci --omit=dev`
  - copies in only `dist/` and `migrations/`
  - runs as the built-in `node` user
- **Pinned images:** `node:22.23.3-alpine3.24` and `postgres:17.11-alpine3.24`.
- **`.dockerignore`:** extended so the build can't see scripts, docs or Docker files.

Verification (isolated Compose project):
- **image:** 347 MB → 248 MB; `node_modules` 52 MB → 6.2 MB (the five production packages only)
- **image contents:** only `dist/`, `migrations/`, `node_modules/` and the package files
- **user:** the process runs as uid 1000 (`node`)
- **migrations:** "up to date" on a re-run; the app role still can't change the schema
- **reset script:** worked
- **D2 demo kit:** 36/36 checks passed, and the race demo had exactly 1 winner

## 2026-10-09 — User Service: surviving database outages

- **Tool:** Claude Code (Claude Opus 5.5)
- **Allowed-use scope:**
  - Learning support: restart policies, liveness vs readiness, exponential backoff, graceful shutdown, pool timeouts, how Node's event loop interacts with CPU-heavy work
  - Measurements of the current behaviour
  - Implementation code after the author decided the behaviour and every timing
  - Documentation
- **Repository files affected:**
  - `user-service/src/dbAvailability.ts` (new)
  - `user-service/src/config.ts`, `db.ts`, `index.ts`, `migrate.ts`
  - `user-service/README.md`
  - `compose.yaml` (`user-service` restart policy and healthcheck)
- **Author review:** Reviewed and approved by @t-leongchuan

### Prompts

> [Behaviour] "Survive expected failures, but restart on unexpected failures [...] unless-stopped for user-service, and no for user-migrate [...] 503 matters [...] /auth/verify should never return 401 [...] Retry with a limit (exponential backoff) [...] must not retry a failed migration [...] Shut down gracefully [...] Log the first failure, each retry with its delay, recovery and give up [...] never print the full database URL"

> [Timings] "retrying forever through docker is fine [...] we need to probably note it somewhere [...] First delay: 500ms, multiplier: x2, cap 5 second, give up 60 seconds [...] wait before listening [...] /health/ready [...] Timeout: 1-2 seconds [...] pool connection timeout: about 2-3 seconds [...] around 8 seconds [...] Service unavailable."

> [Matching Supplier] "b) match supplier. easier to explain. However, /health now returns 503 during an outage so help me make sure nothing relies on it always answering 200 [...] Copy supplier's value, for consistency again" / "500ms, so we give half of supplier's second for everything else?"

> [Login-burst finding] "i think it'd be best to do e) [...] can you run additional tests to be more conclusive? Try and run /auth/verify during a login burst. And also, a cheap check before thinking of d). are we using sync or async bcrypt? [...] Worth documenting though [...] b) is out, since it's a rule given up that made 503 meaningful."

### Key response

Claude measured the existing behaviour: a database drop crashed `user-service` (an unhandled
pool error) with no restart; startup with the database down exited at once; `/health` always
said ok. It explained the general options without choosing. It checked that nothing relies
on `/health` always answering 200, and found that Supplier's `/auth/verify` timeout is 1000 ms.

It then implemented the author's decisions:
- **Expected vs other errors:** connection failures are expected and answered with
  `503 SERVICE_UNAVAILABLE` (never 401); other errors stay 500.
- **Pool:** connection timeout 500 ms, and an error listener so a dropped connection no
  longer crashes the process.
- **Startup retries** before listening: 0.5 s ×2, capped at 5 s, giving up after 60 s. Shared
  with the migration runner, which never re-runs a failed migration.
- **`/health` as readiness**, like Supplier: `SELECT 1` within 1 s; 200 `ok` / 503 `not_ready`.
- **Graceful shutdown** on SIGTERM, with an 8 s limit.
- **Logging:** only state changes, with no secrets.
- **Compose:** `restart: unless-stopped` and a healthcheck with Supplier's timings, plus a
  documented "retries forever, revisit before cloud deployment" note.

Testing found that bursts of simultaneous logins on a cold pool produce some 503s. Claude
traced this to bcryptjs hashing on Node's main thread (the code already used the async
functions), and compared it with the code before the change: `/auth/verify` calls slower
than 1 s already happened during login bursts. Per the author's choice, timeouts are now
logged as "database down, or this service busy", and the limitation and future options
are documented in the README.

Verification (isolated Compose project):
- **database stops while running:** no crash or restart; 503 in about 0.5 s from `/health`,
  `/auth/verify`, login and Supplier; recovers on its own; one log line each way
- **startup with the database down:** retries, then starts once it's back
- **outage longer than 60 s:** gives up, Docker restarts it, it recovers
- **migration runner:** retries its connection; a wrong password isn't retried
- **shutdown:** clean, in 3.5 s
- **logs:** no secrets
- **demo kit:** 36/36, and the race demo had exactly 1 winner

