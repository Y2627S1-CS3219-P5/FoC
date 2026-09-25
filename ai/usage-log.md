<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Recorded the exact Supplier backend implementation prompt and key response.
Author review: Required before submission.
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
- **Author review:** Required before submission.

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
- **Author review:** Required before submission.

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
- **Repository files affected:** `README.md`, `.dockerignore`, `.env.example`, `.gitignore`, `compose.yaml`, `ai/usage-log.md`, and the backend/configuration files under `supplier-service/`
- **Author review:** Required before submission.

### Exact prompt

> I want to implement a spec using $implement-spec . THIS SHOULD ONLY IMPLEMENT THE BACKEND PORTION REMEMBER, we'll do frontend another day. Read `AGENTS.md`, `supplier-service/SPEC.md`. The team has approved archive in place of the D1 deletion restriction and `locationDescription` as the only Supplier description. Ensure the spec records those approvals accurately.
>
> Implement the **first Supplier backend increment only**: NestJS setup, PostgreSQL connection through Drizzle, schema and migrations from the spec, `/health`, and a repeatable seed import that preserves administrator edits. Work mainly in `supplier-service/`; make only necessary Compose changes. Do not build the frontend or change other services.
>
> Our proposed User Service contract is the Supplier workstream contract to build against later through `SessionVerifier`; do not wait for User Service to start this increment. Do not invent design decisions where the spec is unclear—report the specific blocker. Run relevant checks, show the changed files and results, and record AI assistance as the course policy requires.
> The spec.md was finetuned and edited and draws from sources like the 3 pdfs in supplier-service/docs/references

### Key response

Codex recorded archive and the single `locationDescription` field as team-approved changes while retaining the note that the D1 text still needs alignment. It implemented only the requested backend foundation: NestJS/Express, a private PostgreSQL connection through Drizzle, constrained Supplier/category schema and generated migration, database-backed `GET /health`, and a deterministic 21-row CSV importer that inserts absent stable IDs without overwriting administrator-edited records or categories. It added focused mapping/idempotency/readiness tests and the necessary Docker Compose, container, environment-example, and operational documentation changes; it did not add frontend, catalogue APIs, mutations, authentication, or changes to other services.
