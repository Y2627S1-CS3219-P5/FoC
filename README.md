<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Added the consolidated project AI Use Summary for the Supplier backend foundation and its integration with the merged User Service contract.
Author review: Required before submission.
-->

# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## Friend on Campus (FoC)

**Friend on Campus (FoC)** is a peer-to-peer campus errand platform where
students can request items to be collected from stores or facilities on
campus, and other students can fulfil (and deliver) those requests. The
platform runs on a closed credit economy — credits cannot be bought,
withdrawn, or exchanged for money, and only circulate within the platform.

---

## Team Members

| Name | Role |
| ----- | ----- |
| Your Name | Your ownership |
| Your Name | Your ownership |
| Your Name | Your ownership |
| Your Name | Your ownership |
| Your Name | Your ownership |

---

## Repository Structure

This repository follows a **one-service-per-folder** structure: each
microservice (`user-service/`, `supplier-service/`, `order-service/`,
`credit-service/`) lives in its own top-level folder.

```text
.
├── user-service/
├── supplier-service/
├── order-service/
├── credit-service/
├── <n2h-service>/
└── README.md
```

- Any **nice-to-have (N2H)** feature that warrants its own service should
  be added as an **additional folder** at the same level, following the
  same per-service structure.
- Files for agentic coding tools (e.g. agent configs, prompts, skills)
  may be added as needed, but must still **respect the
  one-service-per-folder skeleton** for core implementation.

## AI Use Summary

OpenAI Codex (GPT-6) assisted on 2026-09-25 with implementing the first Supplier backend increment from the author-approved specification: recording the approved description/archive decisions; NestJS/Drizzle setup; the PostgreSQL schema and versioned migrations; database readiness; explicit, guarded, edit-preserving seed identities and tests; least-privilege Compose/container setup; and implementation documentation. It also resolved the post-PR-#14 integration conflicts by preserving both services' Compose/environment configuration and documenting the User Service's implemented bearer-token verification contract in the Supplier specification. The project author must review all AI-influenced work before submission. [Strict-JSON disclosure details](supplier-service/AI-DISCLOSURES.md#strict-json-files) record the pending course-owner exception approval; the exact prompts and key-response summaries are recorded in `ai/usage-log.md`.
