<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Recorded the exact Supplier backend implementation prompt and key response.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Recorded the exact second Supplier backend increment prompt, the author's follow-up approval, and the implementation/check summary.
Author review of the second increment: Required before merge.
-->

# AI Usage Log

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
- **Author review:** Required before merge.

### Exact prompt

> `lets ignore that for now i checkout to main, pull the remote changes we made and then $implement-spec use this to start the implementatoin for second Supplier backend increment based on the spec, now it should be easier since user service is already well defined right, remember we are only working wiht supplier service backend for now and should not edit user service`

### Exact follow-up approval

> `yes assets/suppliers is the standard place to serve image assets, and yes server should be in charge of generating IDs instead of client, proceed`

The follow-up approved the proposed backend defaults presented for this increment: omitted sort defaults to `name,asc`; list size has minimum 1; User Service base URL is configurable and Compose uses `http://user-service:3001`; verification timeout is 1,000 ms; bundled Supplier images are served from `/assets/suppliers`; and Supplier generates request IDs rather than trusting a client-supplied ID.

### Key response

Codex implemented the second Supplier backend increment without changing User Service application code: a bounded `SessionVerifier` implementation that forwards the bearer header unchanged to User Service, a NestJS guard and role policy, PostgreSQL-backed Supplier list/detail reads with approved query defaults and stable pagination, archived visibility rules, strong detail ETags, server-generated request IDs, consistent error responses, and bundled image serving. It added focused unit/contract tests and an isolated Compose integration runner. The live runner verified a clean 21-row migration/seed and zero-insert repeat seed preserving an archived fixture, real MEMBER and ADMINISTRATOR registration/login/verification, search/filter/stable paging/detail, 401/403/404/503 behavior, ETags, request correlation, image serving, and recovery after User Service restart. An integration finding also bounded page/size combinations so their database offset remains a safe JavaScript integer. Author review remains required before merge; the separate strict-JSON course-owner exception remains pending for submission.
