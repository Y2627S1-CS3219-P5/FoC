<!--
AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
Scope: Per-file attribution manifest for schema-strict AWS configuration and upstream assets.
Author review: PENDING.
-->

# Infrastructure AI disclosures

OpenAI Codex (GPT-6) assisted with every new infrastructure source, test, script, Docker,
YAML, and Markdown file on 2026-10-18. These formats retain leading disclosure comments.
Project-author review is pending; design approvals recorded in the specification do not
constitute approval of all implementation files.

## Strict JSON and generated files

The following exact files were created or modified with AI assistance on 2026-10-18.
They remain valid strict JSON. CDK, Zod, pricing hashes, and npm lockfile consumers require
their existing schema, so this dedicated per-file manifest supplies attribution without
adding schema-breaking comment properties. This follows the repository's disclosure
sidecar convention; the separate course-owner exception remains pending before submission.

| File                                                  | AI-assisted scope                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| `infrastructure/package.json`                         | CDK dependencies, checks, and deployment commands                 |
| `infrastructure/package-lock.json`                    | npm-generated dependency resolutions                              |
| `infrastructure/cdk.json`                             | CDK entry point and context                                       |
| `infrastructure/cdk.context.json`                     | Explicit AWS lookup context                                       |
| `infrastructure/tsconfig.json`                        | Strict TypeScript build configuration                             |
| `infrastructure/config/demo.example.json`             | Deployment-input template and proposed budget-alert percentages   |
| `infrastructure/config/release.example.json`          | Immutable-image release and scanned-digest manifest template      |
| `infrastructure/cost/pricing-snapshot.json`           | Official public-rate snapshot used by the deterministic estimator |
| `infrastructure/database-bootstrap/package.json`      | PostgreSQL bootstrap runtime and test scripts                     |
| `infrastructure/database-bootstrap/package-lock.json` | npm-generated bootstrap runtime dependency resolutions            |
| `frontend/package.json`                               | Gateway verification script added to the test command             |

Ignored deployment config and generated evidence JSON files are also AI-assisted operator
artifacts; they are not committed. The example templates and usage log describe their origin.

## Upstream certificate assets

`infrastructure/database-bootstrap/certs/ap-southeast-1-bundle.pem`,
`supplier-service/certs/ap-southeast-1-bundle.pem`, and
`user-service/certs/ap-southeast-1-bundle.pem` are unmodified official AWS RDS CA bundles,
downloaded and checksum-verified by Codex. Attribution and provenance belong in this
manifest and [RDS-CA.md](docs/RDS-CA.md), rather than inside the certificate bytes.
