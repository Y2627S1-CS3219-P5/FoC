<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Documented the Credit Service database and logic as implemented from docs/decision-record.md.
Author review: PENDING
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Documented the Kafka consumer, DLQs, outbox publisher loop and the end-to-end test.
Author review of additional changes: PENDING
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
| Kafka topics, including the two DLQs | Created by the shared `kafka-init` Compose service, see [../kafka/README.md](../kafka/README.md) |
| Kafka consumer, rejection replies, DLQ, outbox publisher loop | Done (`src/consumer.ts`, `src/publisher.ts`, `src/index.ts`) |
| HTTP API, `/health` | Not started: HTTP paths are still open |

## Layout

```
migrations/0001_create_credit_tables.sql  schema and credit_app grants
docker/postgres/init-roles.sh             creates credit_migrator and credit_app on a fresh volume
src/migrate.ts, src/migrations.ts         migration runner (same rules as User Service)
src/messages.ts                           validates incoming Kafka payloads
src/accounts.ts                           account status, initial grant, forfeit, balance
src/reservations.ts                       reserve, capture, release
src/outbox.ts                             outbox insert, publisher batch, cleanup
src/consumer.ts                           Kafka consumer: parse, handle, reply/DLQ, commit offset
src/publisher.ts                          outbox publisher loop and hourly cleanup
src/kafka.ts                              Kafka client and producer (acks=all, idempotent)
src/index.ts                              service entry point
src/db.ts                                 pool and inTransaction()
e2e/                                      end-to-end test in its own Compose stack
```

## How messages are handled

`src/consumer.ts` reads `user.account-status` and `credit.commands` (group `credit-service`), one
message at a time in partition order, and commits a message's offset only after it is fully
handled (decision D7):

| Handler outcome | What the consumer does before committing the offset |
|---|---|
| Message not JSON, or fails validation | Sends it to the topic's DLQ with the reason |
| `applied`, `duplicate`, `reserved` | Nothing more (`CreditReserved` is in the outbox) |
| `rejected` (reserve) | Produces `CreditReservationRejected` to `credit.results` and waits for the ack (decision D5) |
| `invalid` | Sends it to the topic's DLQ with the reason |

DLQs: `user.account-status.dlq` and `credit.commands.dlq`. A message whose handling throws is
retried in place, 5 attempts in total, then sent to the DLQ. When the database or Kafka is
unreachable, attempts are not counted: the message is retried until the outage ends, because
sending it to the DLQ would lose a valid message.

`src/publisher.ts` publishes the outbox (batches back to back, 250 ms pause when empty) and
deletes published rows older than 7 days every hour.

## Running locally

Set `CREDIT_DB_ADMIN_PASSWORD`, `CREDIT_DB_MIGRATION_PASSWORD` and `CREDIT_DB_APP_PASSWORD` in
`.env`, then:

```sh
docker compose up -d --build credit-service   # starts kafka, credit-db, migrations, then the service
docker compose logs -f credit-service          # one JSON line per handled message
```

## Tests

### End-to-end (through Kafka)

```sh
bash credit-service/e2e/run.sh        # or: cd credit-service && npm run test:e2e
```

Starts a separate, throwaway Compose stack (project `foc-credit-e2e`: Kafka, credit-db,
credit-service; no host ports, volumes deleted afterwards), then plays User Service and Order
Service: it sends messages to `user.account-status` and `credit.commands`, and checks the replies
on `credit.results`, the DLQs and the database. It covers the initial grant, accepted and rejected
reserves (each reason code), duplicate deliveries, capture, the three release events, suspension,
closure with forfeit, invalid messages going to the DLQ, and the outbox being fully published.
On failure it prints the credit-service logs; `--keep` leaves the stack running.

### Database tests

The database tests need a disposable PostgreSQL 17 server and a superuser URL. Each test file creates its
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
