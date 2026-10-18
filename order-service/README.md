<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Order Service README: status, state table, API and error tables, design calls, how to run and test.
Author review: Reviewed and approved by @mattis.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Documented the pickup-timeout re-listing deviation, the single-publisher requirement and the typecheck script.
Author review: Reviewed and approved by @mattis.
-->

# Order Service

Owns the errand lifecycle: a requester posts an errand, a courier accepts and delivers it, and the
requester confirms. It keeps each errand's history and tells Credit Service, through an outbox, when to
hold and when to settle credits.

## Status

The core is done: the database, state machine, HTTP API, deadline sweeper, outbox publisher, container and
gateway routes. The three neighbours are still **stubs**, chosen by `AUTH_MODE`, `SUPPLIER_MODE` and
`CREDIT_MODE` (only `stub` is accepted today):

| Neighbour | Stub | Follow-up |
|---|---|---|
| User Service sessions | `Authorization: Bearer stub.<uuid>.MEMBER` or `.ADMINISTRATOR` | call `/auth/verify` |
| Supplier Service | three fixed suppliers (`STUB_SUPPLIERS`) | `GET /api/v1/suppliers/:id` |
| Credit Service | in memory, replies to `ReserveRequested`, checks every message against the contract | Kafka producer and consumer |

Not done yet: the real adapters above, Credit Service support for `ReservationTimedOut`, reacting to
account suspensions (OS-F6), and the frontend pages.

Message contract with Credit Service: [docs/order-credit-contract.md](docs/order-credit-contract.md).

## States and transitions

States: `PENDING_RESERVATION`, `RESERVATION_REJECTED`\*, `RESERVATION_TIMED_OUT`\*, `OPEN`, `ACCEPTED`, `PICKED_UP`,
`DELIVERED`, `DISPUTED`, `COMPLETED`\*, `CANCELLED`\*, `EXPIRED`\*, `FAILED`\* (\* = terminal).

| Action | From | To | Who | Deadline check | Credit message |
|---|---|---|---|---|---|
| (create) | none | `PENDING_RESERVATION` | member | none | `ReserveRequested` |
| `CreditReserved` reply | `PENDING_RESERVATION` | `OPEN` | Credit | none | none |
| `CreditReservationRejected` reply | `PENDING_RESERVATION` | `RESERVATION_REJECTED` | Credit | none | none |
| `reservationTimeout` | `PENDING_RESERVATION` | `RESERVATION_TIMED_OUT` | sweeper | `reservation_deadline` passed | `ReservationTimedOut` |
| `accept` | `OPEN` | `ACCEPTED` | any member except the requester | before `listing_deadline` | none |
| `withdraw` | `ACCEPTED` | `OPEN` (see [Known deviations](#known-deviations)) | the courier | none | none |
| `pickup` | `ACCEPTED` | `PICKED_UP` | the courier | before `pickup_deadline` | none |
| `deliver` | `PICKED_UP` | `DELIVERED` | the courier | before `delivery_deadline` | none |
| `confirm` | `DELIVERED` | `COMPLETED` | the requester | none | `OrderCompleted` |
| `reject` | `DELIVERED` | `DISPUTED` | the requester | before `confirm_deadline` | none |
| `cancel` | `OPEN`, `ACCEPTED` | `CANCELLED` | the requester | none | `OrderCancelled` |
| `resolve` (COURIER) | `DISPUTED` | `COMPLETED` | administrator | none | `OrderCompleted` |
| `resolve` (REQUESTER) | `DISPUTED` | `FAILED` | administrator | none | `OrderFailed` |
| `expire` | `OPEN` | `EXPIRED` | sweeper | `listing_deadline` passed | `OrderExpired` |
| `pickupTimeout` | `ACCEPTED` | `OPEN` (courier cleared; see [Known deviations](#known-deviations)) | sweeper | `pickup_deadline` passed | none |
| `deliveryTimeout` | `PICKED_UP` | `DISPUTED` | sweeper | `delivery_deadline` passed | none |
| `confirmTimeout` | `DELIVERED` | `COMPLETED` | sweeper | `confirm_deadline` passed | `OrderCompleted` |

Every transition is one database transaction that locks the errand row, checks state, party and deadline,
updates the row, appends to `errand_history` and, where a credit message is due, inserts the outbox row.
Concurrent accepts therefore have one winner.

## API

Paths are as the service sees them. The gateway maps `/api/v1/errands` to `/errands` and
`/api/v1/admin/errands` to `/admin/errands`. All routes except `/health` need `Authorization: Bearer <token>`.

| Method and path | Who | Success | Notes |
|---|---|---|---|
| `GET /health` | anyone | 200 | 503 when the database is unreachable |
| `POST /errands` | member | 202 | errand in `PENDING_RESERVATION`; body: `supplierId`, `items`, `dropoffLocation`, `notes?`, `creditAmount`, `listingDeadline`, `pickupDeadline`, `deliveryDeadline` |
| `GET /errands/open?page&size` | member | 200 | `OPEN` errands of other people, soonest listing deadline first |
| `GET /errands/mine?as=requester\|courier&state&page&size` | member | 200 | your own errands, in either role |
| `GET /errands/:id` | requester, courier, administrator, or any member while `OPEN` | 200 | includes `history`; anyone else gets 404 |
| `POST /errands/:id/accept` | member | 200 | |
| `POST /errands/:id/withdraw` | courier | 200 | |
| `POST /errands/:id/pickup` | courier | 200 | |
| `POST /errands/:id/deliver` | courier | 200 | |
| `POST /errands/:id/confirm` | requester | 200 | |
| `POST /errands/:id/reject` | requester | 200 | optional body `{ "reason" }` |
| `POST /errands/:id/cancel` | requester | 200 | |
| `POST /admin/errands/:id/resolve` | administrator | 200 | body `{ "outcome": "COURIER"\|"REQUESTER", "reason" }` |
| `GET /admin/errands?state&requesterId&courierId&page&size` | administrator | 200 | |

Errors are `{ "error": "<CODE>", "message": "<text>" }`. 409 responses also carry `currentState`; 400
responses carry `details` (one entry per bad field).

| Status | `error` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | bad body, query or JSON; unknown fields |
| 401 | `UNAUTHENTICATED` | missing or invalid token |
| 403 | `FORBIDDEN` | wrong party for the action, or a non-administrator on `/admin` |
| 403 | `CANNOT_ACCEPT_OWN_ERRAND` | the requester tries to accept |
| 404 | `NOT_FOUND` | no such errand, or you may not see it, or no such route |
| 409 | `ERRAND_NO_LONGER_AVAILABLE` | accept on an errand that is not `OPEN` (lost the race, cancelled, expired) |
| 409 | `INVALID_STATE` | any other action from the wrong state, including repeats |
| 409 | `DEADLINE_PASSED` | the step's deadline has passed |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | body problems |
| 422 | `SUPPLIER_UNAVAILABLE` | the supplier does not exist or is not active |
| 503 | `SERVICE_UNAVAILABLE` | the database is unreachable |
| 500 | `INTERNAL_ERROR` | anything else |

## Design calls (decided: accepted by the author on 2026-10-16)

1. **Database: PostgreSQL 17, own `order-db`.** Row locks and conditional updates give single-winner accepts, and the outbox row is written in the same transaction as the errand change.
2. **A state before `OPEN`.** `PENDING_RESERVATION` is hidden from couriers. It becomes `OPEN` on `CreditReserved`, or `RESERVATION_REJECTED` (terminal, reason stored) on `CreditReservationRejected`.
3. **The first outcome is final, and a reply has a time limit.** With no reply by `reservation_deadline` (`RESERVATION_TIMEOUT_SECONDS`, default 30) the sweeper moves the errand to `RESERVATION_TIMED_OUT` and sends `ReservationTimedOut`, which releases a hold if one exists. A late `CreditReserved` for a rejected errand writes an `OrderCancelled` to release the hold. Other late replies are ignored.
4. **Duplicates are caught by the state guards.** A repeated credit reply finds the errand already moved, so there is no `processed_messages` table.
5. **Supplier snapshot.** The errand copies the supplier's name, building code and location at creation. New errands need an `ACTIVE` supplier.
6. **Users are referenced by ID only.** The frontend looks up usernames.
7. **Confirmation deadline** is `delivered_at + CONFIRMATION_WINDOW_MINUTES` (default 1440).
8. **Deadlines are enforced twice.** At the moment of the action, and by the sweeper.
9. **Repeated actions return an error.** A second `confirm` is `409 INVALID_STATE` with `currentState: "COMPLETED"`; only the first produces `OrderCompleted`.
10. **Admins cannot resolve a dispute they are part of** (as requester or courier).
11. **Creation returns `202 Accepted`**, because the reservation is asynchronous.
12. **Limits.** `creditAmount` 1 to 1000. 1 to 20 items of `{ name: 1 to 100 chars, quantity: 1 to 99 }`. `dropoffLocation` 1 to 200 chars. `notes` at most 500 chars. Unknown fields are rejected.
13. **No cancel while `PENDING_RESERVATION`.** There is no hold to release yet.
14. **Port 3002, paths without a prefix**, like User Service. The gateway strips `/api/v1`.

## Known deviations

- **Re-listing after a pickup timeout does not work yet (open question for the author).** The schema enforces
  `listing_deadline <= pickup_deadline`, so an errand that `pickupTimeout` returns to `OPEN` (or that a courier
  `withdraw`s after the listing deadline) is already past its listing deadline. No other courier can accept it,
  and the sweeper expires it in the same tick, releasing the credits through `OrderExpired`. OS-F2.2.2 promises
  re-listing for another courier. The behaviour is kept for now and the author decides whether to change it.
- **One outbox publisher.** Contract rule 5 (messages for one errand arrive in order) relies on a single outbox
  publisher (one replica), or on per-key serialisation once the Kafka adapter exists.

## Run

From the repository root, with a `.env` made from `.env.example` (the three `ORDER_DB_*` passwords are required):

```sh
docker compose up -d --build order-service frontend
docker compose ps          # order-db healthy, order-migrate exited 0, order-service healthy
bash order-service/scripts/demo.sh
```

`scripts/demo.sh` (needs `curl` and `jq`) walks through the whole lifecycle through the gateway at
`http://localhost:8080/api/v1` (override with `BASE`) and exits non-zero at the first unexpected status.
It takes about a minute because step 10b waits for the reservation timeout (`RESERVATION_TIMEOUT_SECONDS + 10`
seconds; set the same variable in the shell if you changed it for the service).

Settings (all read in `src/config.ts`):

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none, required | connection string for the `order_app` role |
| `PORT` | 3002 | HTTP port |
| `CONFIRMATION_WINDOW_MINUTES` | 1440 | time to confirm a delivery |
| `RESERVATION_TIMEOUT_SECONDS` | 30 | time for Credit to answer |
| `AUTH_MODE`, `SUPPLIER_MODE`, `CREDIT_MODE` | `stub` | adapter choice (only `stub` exists) |
| `STUB_CREDIT_LIMIT` | 100 | the stub rejects larger amounts |
| `STUB_CREDIT_DELAY_MS` | 500 | the stub's reply delay |
| `STUB_CREDIT_SILENT_AMOUNT` | 999 | an amount the stub never answers, to show the timeout |

Without Docker: `npm ci`, `npm run build`, then `DATABASE_URL=... npm run migrate` and `npm start`.

## Test

The DB tests need a disposable PostgreSQL superuser URL:

```sh
docker run --rm -d --name order-test-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17.11-alpine3.24
cd order-service
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres npm test
npm run typecheck   # src and test
```
