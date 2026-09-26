<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented the disclosure convention for strict-JSON Supplier configuration files.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Recorded the third-increment final code-review remediation disclosure.
Author review: Reviewed and approved by @ron.
-->

# Supplier Service AI disclosures

## Strict JSON files

JSON does not permit literal comments. For a strict-JSON file that requires a leading AI disclosure, this project uses a leading `"//"` string-valued metadata property and records the full disclosure in this adjacent sidecar. The property is operational metadata, not JSON comment syntax. Each JSON consumer must be verified to accept it.

This convention is an unavoidable exception to putting a literal disclosure comment at the start of every AI-influenced file. **Course-owner approval for this strict-JSON exception is still required before submission.** Project-author review was completed and approved by @ron.

| JSON file | Tool and date | AI-assisted scope | Consumer verification |
| --- | --- | --- | --- |
| `package.json` | OpenAI Codex (GPT-6), 2026-09-25 | Supplier backend package metadata, scripts, dependencies, test configuration, and isolated Compose integration-check command | `npm ci`, `npm pkg get name`, unit/build scripts, and `npm run test:integration` accepted the leading property |
| `nest-cli.json` | OpenAI Codex (GPT-6), 2026-09-25 | Supplier NestJS compiler configuration | `nest build` accepted the leading property |

If the course owner does not approve this convention, the team must agree on an allowed disclosure mechanism before submission; removing the property without an approved replacement would lose the required per-file attribution.

## Third increment final review remediation

OpenAI Codex (GPT-6) assisted on 2026-09-26 with final review remediation for the administrator Supplier mutation increment. The work clarified the already-approved create-only duplicate contract, centralized the editable mutation-value type and ETag response helper, added focused regression coverage, and refactored the live integration runner into focused scenarios with a shared archive/restore precondition verifier. Full Supplier tests, typecheck, build, and the real-service integration smoke passed, followed by an independent cleanup check.

This remediation changed no frontend, User Service application code, migration, strict-JSON file, or API behavior. Project-author review was completed and approved by @ron; the separate course-owner exception above remains pending.
