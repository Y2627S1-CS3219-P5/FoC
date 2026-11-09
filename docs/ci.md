<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Documented the issue #42 pull-request CI checks, local equivalents,
failure evidence, and manual main-ruleset activation.
Author review: Pending project-author review.
Additional AI assistance: OpenAI Codex, date: 2026-11-09
Scope: Documented the author-approved issue #62 Order/Credit database-backed CI
checks, disposable PostgreSQL prerequisites, and explicit Kafka exclusions.
Author review of this extension: Pending review by @ron.
-->

# Continuous integration

The `PR CI` workflow checks every pull request targeting `main`, every push to
`main`, and every manual run. Its jobs run independently on clean GitHub-hosted
runners, then `CI / gate` combines their results into the single check used for
branch protection.

## Required jobs

| Check | What it proves |
| --- | --- |
| `frontend / static-and-unit` | The React application lints, its Vitest tests pass, TypeScript checks, and Vite produces a production build. |
| `supplier / static-and-unit` | The NestJS service type-checks, its Jest tests pass, and Nest produces a build. |
| `user / build` | The User Service installs reproducibly and compiles. Its separate test suite is not invoked by this job. |
| `order / typecheck-build-and-test` | The Order Service installs reproducibly, type-checks application and test code, builds, and passes its database-backed tests against disposable PostgreSQL. Its real-Kafka suite is explicitly excluded. |
| `credit / typecheck-build-and-test` | The Credit Service installs reproducibly, type-checks, builds, and passes its existing tests against disposable PostgreSQL. Its separate Kafka E2E runner is not invoked. |
| `integration / supplier-stack` | The existing disposable Compose suite passes against the real User Service, Supplier Service, migrations, seed import, and PostgreSQL databases. |
| `e2e / supplier-ui` | The existing Chromium journeys pass against a disposable live stack. |
| `CI / gate` | Every required job above completed successfully. |

Integration and browser jobs run for every pull request initially. This keeps
the merge rule simple and avoids missing cross-service effects. They can become
change-aware later if workflow duration or cost becomes material.

Order and Credit each receive their own PostgreSQL 17.11 service container, matching
their Compose image (`postgres:17.11-alpine3.24`). A `pg_isready` health check gates
startup. The hard-coded `postgres` password is only for the disposable CI instance;
no GitHub secret, local `.env`, shared database, Kafka broker, or AWS account is used.
The test helpers create isolated databases, apply the real migrations, and drop
the test databases afterward. GitHub removes each service container with its job.

This increment does **not** claim live Kafka coverage. Order's
`test/kafka.integration.test.ts` is skipped when `TEST_KAFKA_BROKERS` is unset.
`npm run test:kafka` in Order and `npm run test:e2e` in Credit remain separate,
opt-in checks for a later CI increment. The remaining Order/Credit database tests
require `TEST_DATABASE_URL` and fail if it is missing; they are not skipped.

## Run the same checks locally

Use the same Node.js major version as CI and the application images: Node 22.

Frontend fast checks:

```sh
cd frontend
npm ci
npm run lint
npm test
npm run build
```

Supplier Service fast checks:

```sh
cd supplier-service
npm ci
npm run typecheck
npm test
npm run build
```

User Service build:

```sh
cd user-service
npm ci
npm run build
```

Order and Credit quality checks require a **disposable PostgreSQL server** and a
superuser test login, because their test helpers create databases and roles.
Never use a shared development database or AWS database. In a fresh shell, set
`TEST_DATABASE_URL` to that disposable server, leave `TEST_KAFKA_BROKERS` unset,
then run these commands separately in `order-service/` and `credit-service/`:

```sh
npm ci
npm run typecheck
npm run build
npm test
```

For example, a local disposable server exposed only on loopback port 55432 can
use `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres`.
The workflow provisions its own server automatically; you do not start Compose
before opening a pull request.

The live suites require Docker. Run each command from its application directory:

```sh
cd supplier-service
npm run test:integration
```

```sh
cd frontend
npx playwright install chromium
npm run test:e2e
```

Both live runners use unique Compose project names and remove their containers
and volumes afterward.

## Investigate a failure

1. Open the failed job from the pull request's **Checks** section.
2. Expand the first failed step and read its command output.
3. For browser failures, download the seven-day `supplier-ui-e2e-*` artifact.
   It contains the Playwright HTML report and any retained trace, screenshot, or
   video, plus captured Compose status and relevant service logs. The same
   diagnostics are printed in the job log.
4. Reproduce the failed job with the matching local commands above.

The workflow does not retry failed tests automatically. A failure that disappears
on a later run should be treated as a flaky-test defect rather than ignored.

## Protect `main` after the first successful run

GitHub must see `CI / gate` report once before it can be selected as a required
check. After the workflow first succeeds:

1. Open **Settings → Rules → Rulesets** for the repository.
2. Create or edit the branch ruleset targeting `main`.
3. Require changes through pull requests and one approval from someone other
   than the author.
4. Require approval of the most recent reviewable push and require all review
   conversations to be resolved.
5. Add `CI / gate` as a required status check, with GitHub Actions as its source.
6. Block force pushes and branch deletion, and do not grant a normal bypass.

The workflow can also be started from **Actions → PR CI → Run workflow** or with:

```sh
gh workflow run pr-ci.yml
```
