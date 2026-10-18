<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Drafted the issue #51 immutable release, operations, recovery, and teardown
runbook from the approved AWS deployment specification. No AWS resource was created,
updated, or deleted while authoring or testing this document.
Author review: Pending pull-request review by @ron.
-->

<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Updated cost-evidence and status instructions after @ron approved the repository's
fingerprinted deterministic estimate in place of a redundant shared Calculator link.
No AWS resource was created, updated, or deleted.
Author review: Decision approved by @ron; wording pending pull-request review.
-->

# FoC demo release and operations runbook

This runbook controls only the four exact FoC demo stacks in the approved AWS account:

| CDK ID               | Physical stack         | Region           |
| -------------------- | ---------------------- | ---------------- |
| `FoCDemoFoundation`  | `foc-demo-foundation`  | `ap-southeast-1` |
| `FoCDemoData`        | `foc-demo-data`        | `ap-southeast-1` |
| `FoCDemoApplication` | `foc-demo-application` | `ap-southeast-1` |
| `FoCDemoEdge`        | `foc-demo-edge`        | `us-east-1`      |

Every mutating command first checks the configured account and the exact stack tags. The
scripts never accept arbitrary stack names or wildcard deletion targets. Evidence is
written with owner-only permissions below the Git-ignored `infrastructure/artifacts/`.

## Before any deployment

1. Ensure issue #46's approved deployment configuration, repository-generated cost
   estimate, preflight, quota evidence, and both-region CDK bootstrap are current.
2. Authenticate with the approved NUS SSO profile.
3. Work from a clean, fully committed revision. Never label a dirty tree with a Git SHA.
4. Install the exact infrastructure dependency graph.

```sh
cd infrastructure
export FOC_DEPLOYMENT_CONFIG="$PWD/config/demo.json"
npm ci
npm run estimate
npm run preflight
npm run gate
```

Do not put passwords, tokens, database URLs, or generated secret values in either config
file. A plan or apply that reports a wrong account, region, owner, stack tag, preflight,
cost approval, or configuration fingerprint must stop until the input is corrected.

## First deployment

Foundation must exist before images can be pushed to its immutable ECR repositories.

```sh
npm run deploy -- plan --phase foundation
npm run deploy -- apply --phase foundation --approve-plan <printed-sha256>
```

Read the complete diff saved under `artifacts/plans/` before copying the token. `apply`
reruns the gate, synth, and template-mode diff and refuses the token if the Git revision,
configuration, templates, stack list, or diff changed.

Prepare the three application images exactly once for the current full Git SHA:

```sh
npm run release:images
export FOC_RELEASE_MANIFEST="$PWD/artifacts/releases/$(git rev-parse HEAD)/release-manifest.json"
```

The command builds Linux/x86-64 images, uses the frontend `cloud` target, pushes only a
missing immutable SHA tag, waits for ECR scanning, resolves immutable digests, and records
scan counts. Existing SHA tags are reused and never overwritten. A scan failure blocks the
release. The approved specification does not define a severity rejection threshold, so
the tool records findings without inventing one; a human must review the evidence.

Plan and apply the remaining release:

```sh
npm run deploy -- plan --phase release
npm run deploy -- apply --phase release --approve-plan <printed-sha256>
```

The wrapper enforces this order:

1. deploy Data only;
2. run database bootstrap, User migration, Supplier migration, and Supplier seed, stopping
   at the first failed or missing exit code;
3. deploy Application only and verify all three ECS primary deployments;
4. deploy Edge only and wait for CloudFront to report deployed; and
5. run the existing Bash API journeys and Playwright browser journeys through CloudFront.

Application is never updated before all four jobs succeed. Migrations are forward-only;
an ECS rollback does not run a down migration. The Supplier seed remains insert-only by
stable ID, so a repeat run preserves administrator edits.

## Routine release

For a later clean commit, Foundation already exists:

```sh
npm run release:images
export FOC_RELEASE_MANIFEST="$PWD/artifacts/releases/$(git rev-parse HEAD)/release-manifest.json"
npm run deploy -- plan --phase release
npm run deploy -- apply --phase release --approve-plan <printed-sha256>
```

`npm run release:jobs` is available for an intentional idempotent rerun of all four data
jobs. It never trusts a local receipt as permission to skip a database job.

## Status, stop, and start

```sh
npm run status
npm run status -- --json
npm run stop
npm run start
```

`stop` first suspends each ECS scalable target at `0..0`, sets all desired counts to zero,
waits for zero running and pending tasks, and stops RDS last. It reports the RDS automatic
restart time when AWS provides one. CloudFront, WAF, ALB, ECR, Secrets Manager, storage,
backups, and retained logs can still cost money while compute is stopped. AWS can restart a
stopped RDS instance after seven days.

`start` starts and waits for RDS when necessary, restores autoscaling to `1..2`, starts
User and Supplier before frontend, verifies ECS rollout state and counts, and runs a small
CloudFront readiness check. It does not rerun migrations.

`status` is read-only. It reports exact stack/RDS/ECS/CloudFront state, digest-qualified
task images, target health, non-OK alarms, pending SNS confirmation, the reproducible
estimate total, approver/timestamp, and exact configuration and pricing fingerprints. It
also reminds the operator that the NUS tracking portal is authoritative for credit.

## Smoke tests

Run the complete cloud smoke suite independently with:

```sh
npm run smoke
```

The tool retrieves the bootstrap password into child-process memory without printing it.
It reuses `supplier-service/scripts/api-demo/run-all.sh` in gateway mode and runs
`frontend`'s existing `test:e2e:browser` suite directly. Gateway mode never treats private
health or Swagger routes as readiness endpoints and verifies that they return controlled
404 responses. Each browser run uses a unique MEMBER and Supplier name; its Supplier is
archived in cleanup. Local Compose defaults and health checks remain unchanged.

## Failure recovery

- **Image build/push/scan:** fix the cause and rerun `release:images`. An existing SHA tag
  is reused; a local/ECR digest mismatch is a hard stop.
- **Bootstrap/migration/seed:** inspect the task ARN and exact log-group command printed by
  the failure. Fix the cause, then rerun the full ordered job sequence. Do not deploy
  Application manually around the controller.
- **Application rollout:** inspect ECS deployment events and service logs. The circuit
  breaker rolls back the task definition, while already-applied compatible schema remains.
- **Smoke failure:** keep the release marked failed. Fix forward or deliberately redeploy a
  prior image manifest; never down-migrate shared demo data automatically.
- **Wrong state or permission:** do not substitute fuzzy discovery or broader IAM. Report
  the exact missing permission or unexpected state.
- **Interrupted stop/start:** rerun the same command. Both state machines are idempotent in
  their supported stable states.

## Permanent teardown

Back up any evidence required for assessment, then run the intentionally awkward command:

```sh
npm run destroy -- \
  --allow-data-loss \
  --confirm foc-demo:DESTROY:656253649128
```

This permanently removes demo User/Supplier data, secrets, images, and retained logs. It
validates every stack before deleting only Edge, Application, Data, and Foundation in that
order. It never falls back to wildcard or tag-based deletion. After CloudFormation reports
completion, read-only checks report any exact repository, cluster, database, distribution,
log group, stack, or tagged-resource residue for manual review. Local evidence is retained.

Complete teardown before **11 December 2026**. If the school account denies a required
delete or inspection capability, preserve the failure evidence and escalate it to the NUS
course administrator rather than broadening the script.
