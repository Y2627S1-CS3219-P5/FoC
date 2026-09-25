<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented the disclosure convention for strict-JSON Supplier configuration files.
Author review: Required before submission.
-->

# Supplier Service AI disclosures

## Strict JSON files

JSON does not permit literal comments. For a strict-JSON file that requires a leading AI disclosure, this project uses a leading `"//"` string-valued metadata property and records the full disclosure in this adjacent sidecar. The property is operational metadata, not JSON comment syntax. Each JSON consumer must be verified to accept it.

This convention is an unavoidable exception to putting a literal disclosure comment at the start of every AI-influenced file. **Course-owner approval for this strict-JSON exception is still required before submission.** Project-author review is also required.

| JSON file | Tool and date | AI-assisted scope | Consumer verification |
| --- | --- | --- | --- |
| `package.json` | OpenAI Codex (GPT-6), 2026-09-25 | Supplier backend package metadata, scripts, dependencies, and test configuration | `npm ci`, `npm pkg get name`, scripts, and production audit accepted the leading property |
| `nest-cli.json` | OpenAI Codex (GPT-6), 2026-09-25 | Supplier NestJS compiler configuration | `nest build` accepted the leading property |

If the course owner does not approve this convention, the team must agree on an allowed disclosure mechanism before submission; removing the property without an approved replacement would lose the required per-file attribution.
