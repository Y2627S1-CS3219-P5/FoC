<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Documented the Credit Service database and logic as implemented from docs/decision-record.md.
Author review: PENDING
-->

# Credit Service

Owns every credit balance on the platform. The design is in
[docs/implementation-proposal.md](docs/implementation-proposal.md) and the decisions behind it in
[docs/decision-record.md](docs/decision-record.md).

## Status

| Part | State |
|---|---|
| Database: roles, schema (decision D1), migration runner | Done |
| Message handling: account status, initial grant, reserve, capture, release, forfeit | Done |
| Outbox: insert, publish batch, retention cleanup | Done |
| Balance read (`getBalance`) | Done; no HTTP route yet |
| Kafka topics | Created by the shared `kafka-init` Compose service, see [../kafka/README.md](../kafka/README.md) |
| Kafka consumers and producer, DLQ, HTTP API, `/health` | Not started: client library, DLQ topics and HTTP paths are still open |

## Layout

```
migrations/0001_create_credit_tables.sql  schema and credit_app grants
docker/postgres/init-roles.sh             creates credit_migrator and credit_app on a fresh volume
src/migrate.ts, src/migrations.ts         migration runner (same rules as User Service)
src/messages.ts                           validates incoming Kafka payloads
src/accounts.ts                           account status, initial grant, forfeit, balance
src/reservations.ts                       reserve, capture, release
src/outbox.ts                             outbox insert, publisher batch, cleanup
src/db.ts                                 pool and inTransaction()
```

## What the Kafka layer must do with each outcome

Each handler runs in its own database transaction and returns an outcome. The consumer commits
the Kafka offset only after acting on it (decision D7):

| Handler | Outcome | Consumer action before committing the offset |
|---|---|---|
| `parse*` | `ok: false` | Send to the DLQ with `reason` |
| `handleAccountStatus` | `applied`, `duplicate` | Nothing |
| | `invalid` | Send to the DLQ with `reason` |
| `handleReserveRequested` | `reserved`, `duplicate` | Nothing (`CreditReserved` is in the outbox) |
| | `rejected` | Produce `reply` (topic, key, payload) with `acks=all` and wait for the ack (decision D5) |
| `handleTerminalEvent` | `applied`, `duplicate` | Nothing |
| | `invalid` | Send to the DLQ with `reason` |

A thrown error means nothing was committed: retry the message (decision-record §9: retry count
not yet decided).

`publishOutboxBatch(pool, produce)` sends unpublished events; `produce` must resolve only after
Kafka acknowledges every message. Run `deletePublishedOutboxEvents(pool)` periodically.

## Running locally

Set `CREDIT_DB_ADMIN_PASSWORD`, `CREDIT_DB_MIGRATION_PASSWORD` and `CREDIT_DB_APP_PASSWORD` in
`.env`, then:

```sh
docker compose up --build credit-migrate   # starts credit-db, applies migrations, exits
```

## Tests

The tests need a disposable PostgreSQL 17 server and a superuser URL. Each test file creates its
own database, applies the migrations, and drops the database afterwards.

```sh
cd credit-service
npm install
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
```

They cover the verification plan in implementation-proposal.md §12, including concurrent
duplicate deliveries, concurrent reserves from one user, capture/cancel races, deferred forfeit,
two outbox publishers at once, and that `credit_app` cannot change `credit_transactions`. After
every database test, each balance is checked against the sum of its ledger deltas and its `HELD`
reservations.
