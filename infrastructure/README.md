<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Drafted the issue #46 infrastructure preflight, configuration, cost-estimate, and
verification instructions. No AWS resources were created or changed.
Author review: Pending pull-request review by @ron.
-->

<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Drafted the issue #47 CDK foundation implementation and verification guidance.
No AWS resources were created or changed.
Author review: Pending pull-request review by @ron.
-->

<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Drafted the issue #48 RDS data stack, database bootstrap, one-shot ECS data-job
definitions, release-manifest validation, tests, and operating guidance. No AWS resources
were created or changed, and no cloud job was run.
Author review: Pending pull-request review by @ron.
-->

<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Drafted the issue #49 ECS application stack, application observability, cloud-only
frontend gateway target, User publisher feature gate, tests, and operating guidance. No
AWS resources were created or changed, and no cloud release was run.
Author review: Pending pull-request review by @ron.
-->

# FoC AWS infrastructure

This TypeScript AWS CDK package implements the pre-provisioning guardrails from
[`SPEC.md`](SPEC.md), the regional Foundation stack, PostgreSQL data stack, and ECS
Application stack.
Provisioning remains blocked until the configuration, cost, capability, quota, and
bootstrap gates pass.

## Foundation stack

`foc-demo-foundation` synthesizes only the shared resources approved in issue #47:

- a two-AZ VPC with two public task subnets, two private isolated ALB subnets, and two
  private isolated RDS subnets;
- an internet gateway for the public task subnets, with no NAT gateway or paid VPC
  endpoint;
- an ECS cluster with Container Insights and the private `foc-demo.local` Service
  Connect namespace; and
- exactly three private ECR repositories for frontend, User Service, and Supplier Service.

The default VPC security group is restricted. The application security-group rules are
added by the Application stack. ECR tags are immutable, basic scanning runs
on push, AES-256 encryption is explicit, and the reviewed image-retention count is required
in `registry.retainedImageCount`. Final stack deletion empties and removes the disposable
repositories; it does not retain course images.

Outputs publish the VPC and subnet IDs, cluster name/ARN, Service Connect namespace
name/ID/ARN, and repository names/ARNs/URIs for later stacks. No Order or Credit resource
is included.

## Data stack and one-shot jobs

`foc-demo-data` defines one encrypted, private, single-AZ PostgreSQL 17.11
`db.t4g.micro` instance with gp3 storage, `rds.force_ssl=1`, a reviewed storage cap and
backup retention, and disposable demo removal behavior. It also creates eight generated
Secrets Manager secrets: the RDS master credential, four fixed service-role credentials,
the shared JWT key, the audit HMAC key, and the bootstrap administrator password. Secret
values are never committed or emitted as stack outputs.

The stack defines four reusable, non-service Fargate task definitions with separate,
least-privilege execution roles and empty task roles:

1. `database-bootstrap` creates or repairs the fixed databases and roles.
2. `user-migration` applies User Service migrations.
3. `supplier-migration` applies Supplier Service migrations.
4. `supplier-seed` imports the repeatable Supplier seed.

A release runner must start these jobs sequentially in that exact order and wait for exit
code zero after each task. A failure stops the release before any application service is
updated. The stack only defines the jobs; it never starts them. Secret JSON-key injection
requires Fargate platform version `1.4.0` or later when the tasks are run.

Local development keeps using the single `DATABASE_URL`. AWS jobs instead inject the six
discrete `DATABASE_*` settings, including `DATABASE_SSL_CA_PATH`; the services reject
mixed or partial configuration and verify the Singapore RDS CA and hostname. See
[`docs/RDS-CA.md`](docs/RDS-CA.md) for the pinned trust-bundle update procedure.

## Application stack

`foc-demo-application` defines exactly three x86-64 Fargate services from the immutable
digests in the reviewed release manifest: frontend, User Service, and Supplier Service.
The Supplier task keeps its explicit `node dist/main.js` runtime command. User and
Supplier publish the private Service Connect aliases `user-service:3001` and
`supplier-service:3000`; the frontend is a Service Connect client only.

The internal ALB lives in the isolated ALB subnets and checks frontend `/healthz`. Its
security group accepts port 80 only from the AWS-managed CloudFront origin-facing prefix
list. Separate frontend, User, and Supplier groups enforce only the approved application
flows: ALB to frontend, frontend to both APIs, Supplier to User session verification, and
each backend to its own database role. Tasks use the public task subnets and public IPs as
the reviewed no-NAT trade-off. No application task role has AWS permissions; separate
execution roles receive only the ECR, log, and specific secret access generated by CDK.

Each service uses a rolling deployment with 100/200 minimum/maximum healthy percentages,
deployment-circuit-breaker rollback, 30-second stop timeout, and CPU and memory target
tracking. Autoscaling has the approved `minCapacity: 0` and `maxCapacity: 2`; all task
sizes and target percentages remain required deployment inputs rather than inferred
defaults. Dedicated CloudWatch log groups retain User logs for 30 days and frontend,
Supplier, and deployment-failure events for 14 days.

The SNS alert topic emails the reviewed address. Alarms cover unhealthy frontend targets,
ALB target 5xx responses, per-service CPU, memory, and desired-minus-running task
shortfalls, RDS storage/CPU/connections, and ECS deployment failures captured through
EventBridge. Missing data is non-breaching so an intentional scale-to-zero service does
not page solely because metrics stop arriving.

The frontend Dockerfile exposes an explicit `cloud` target using `nginx.cloud.conf`. That
gateway has `/healthz` and only the approved User and Supplier public routes; the default
`runtime` target retains the complete local Compose routing. Both nginx configurations
use a redacted completion-log format that omits query strings, bodies, and credentials.
User Service emits server-owned request IDs and redacted completion records. Cloud sets
`ACCOUNT_STATUS_PUBLISHING_ENABLED=false`, so no Kafka producer starts in the deliberately
Kafka-free User+Supplier slice while transactional outbox writes remain durable. Local
Compose explicitly keeps the existing publishing behavior enabled.

The release boundary remains deliberate: run and wait for `database-bootstrap`,
`user-migration`, `supplier-migration`, and `supplier-seed` in that order, stopping on any
non-zero exit, before updating any long-running service. The Application stack depends on
Data and outputs this required order for the later release runner; CloudFormation itself
never starts a migration or seed task.

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
placeholder, then copy the immutable release-manifest example and replace every digest:

```sh
cp config/demo.example.json config/demo.json
cp config/release.example.json config/release.json
```

Point the tools to both reviewed files:

```sh
export FOC_DEPLOYMENT_CONFIG="$PWD/config/demo.json"
export FOC_RELEASE_MANIFEST="$PWD/config/release.json"
```

The file contains no secret values. It does contain environment-specific owner, alert,
administrator, sizing, threshold, usage, budget, and cost-approval data, so it is ignored
until the team deliberately chooses how to preserve its reviewed copy. Passwords and keys
are generated in Secrets Manager by the Data stack and do not belong in either input file.

The parser has no deployment defaults for unresolved decisions. It rejects missing fields,
unknown fields, placeholder strings, invalid Fargate sizes, a non-NUS administrator email,
an authentication rate rule that is not stricter than the global rule, and a database
autoscaling cap below 110% of initial storage. It also requires a positive, reviewed ECR
retention count rather than choosing an unapproved lifecycle value.

The release-manifest parser requires the exact source revision as a lowercase 40-character
Git SHA and each image as a full lowercase `sha256:` digest. Tags such as `latest`, partial
manifests, unknown keys, and mutable image references are rejected. This seam lets the
later release runner use one reviewed set of immutable artifacts across jobs and services.

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
npm run lint
npm test
npm run build
npm run test:data-integration
```

The tests cover complete and incomplete configuration, deterministic cost arithmetic,
budget failure, stale/tampered artifacts, wrong-account identity, denied service reads,
quota denial, missing CDK bootstrap, VPC isolation and routing, the Service Connect
namespace, ECR security/lifecycle/removal behavior, required tags, Foundation outputs,
RDS encryption/TLS/removal settings, isolated database networking, generated secrets,
least-privilege data-job roles, and immutable release manifests. The normal checks
synthesize locally and do not contact or mutate AWS. Application assertions additionally
cover immutable service images, x86-64 task definitions, Service Connect aliases, the
security-group matrix, internal ALB health checks, role separation, rolling rollback,
autoscaling bounds, log retention, the complete alarm set, and the migration-before-
service output.

`test:data-integration` is an opt-in local Docker check. It builds the bootstrap and
service images, starts a disposable TLS-only PostgreSQL 17.11 container, runs the canonical
job sequence, reruns bootstrap and seed, verifies administrator-edit preservation and
database-role isolation, then removes its containers, volume, network, and local images.
It does not use AWS or cloud credentials.
