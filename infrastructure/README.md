<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Drafted the issue #46 infrastructure preflight, configuration, cost-estimate, and
verification instructions. No AWS resources were created or changed.
Author review: Pending pull-request review by @ron.
-->

# FoC AWS infrastructure

This TypeScript AWS CDK package implements the pre-provisioning guardrails from
[`SPEC.md`](SPEC.md). Issue #46 intentionally creates no AWS resources. Foundation
resources begin in issue #47 only after the configuration, cost, capability, quota, and
bootstrap gates pass.

## Prerequisites

- Node.js 20 or newer.
- AWS CLI v2 and a current IAM Identity Center session.
- An AWS profile whose configured region is `ap-southeast-1`.
- Human-reviewed values for every unresolved input in SPEC section 25.

Install exactly the committed dependency graph:

```sh
cd infrastructure
npm ci
```

## Supply deployment inputs

Copy `config/demo.example.json` to the Git-ignored `config/demo.json`, replace every
placeholder, and point the tools to it:

```sh
export FOC_DEPLOYMENT_CONFIG="$PWD/config/demo.json"
```

The file contains no secret values. It does contain environment-specific owner, alert,
administrator, sizing, threshold, usage, budget, and cost-approval data, so it is ignored
until the team deliberately chooses how to preserve its reviewed copy. Passwords and keys
will be generated in Secrets Manager in later increments.

The parser has no deployment defaults for unresolved decisions. It rejects missing fields,
unknown fields, placeholder strings, invalid Fargate sizes, a non-NUS administrator email,
an authentication rate rule that is not stricter than the global rule, and a database
autoscaling cap below its initial storage.

Because the NUS SCP currently hides Service Quotas, the configuration also requires a
named quota confirmation and evidence reference. That manual record does not turn a failed
live quota API check into a pass; both are required unless the spec is explicitly revised.

## Run the gates

```sh
npm run estimate
npm run preflight
npm run gate
npm run synth
```

- `estimate` deterministically prices the reviewed configuration from the committed public
  AWS pricing snapshot. It fails when the estimate is above `monthlyBudgetUsd`.
- `preflight` runs AWS CLI `get`, `list`, `describe`, and IAM simulation calls only. It
  checks identity, account and region, service read access, PostgreSQL/Fargate/CloudFront/WAF
  capabilities, Service Quotas, representative provisioning permissions, and modern CDK
  bootstrap state in Singapore and `us-east-1`.
- `gate` requires matching configuration fingerprints, a matching recalculated estimate,
  named cost approval, a passing preflight, and preflight evidence less than 24 hours old.
- `synth` runs `gate` first and then `cdk synth --strict`. Direct CDK invocation is also
  protected because the CDK entry point calls the same gate.

Generated reports live under ignored `artifacts/` with owner-only file permissions. They
contain hashes and non-secret evidence, never credentials or secret values.

CDK bootstrap is not part of preflight. It creates resources and IAM roles, so it remains
an explicit reviewed mutation. Do not run `cdk bootstrap` or `cdk deploy` until the exact
blockers are resolved and the human review required by the spec is complete.

## Current account evidence

The read-only account survey on 2026-10-18 is recorded in
[`docs/PREFLIGHT-2026-10-18.md`](docs/PREFLIGHT-2026-10-18.md). It found the required
service capabilities but also found two hard blockers: the school SCP denies Service
Quotas APIs, and neither required region has a `CDKToolkit` stack. Missing deployment
inputs and NUS budget approval are separate blockers.

## Development checks

```sh
npm run typecheck
npm test
npm run build
```

The tests cover complete and incomplete configuration, deterministic cost arithmetic,
budget failure, stale/tampered artifacts, wrong-account identity, denied service reads,
quota denial, and missing CDK bootstrap.
