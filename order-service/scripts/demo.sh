#!/usr/bin/env bash
# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: curl walkthrough of
# the Order Service lifecycle for the D3 demo (stub tokens, stub Credit). Author review: PENDING
# Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: step 11 now checks
# that all five credit event types were sent and the stub logged no contract violation. Author review: PENDING
#
# Usage:  docker compose up -d --build order-service frontend && bash order-service/scripts/demo.sh
# Needs curl and jq. BASE is the gateway; RESERVATION_TIMEOUT_SECONDS must match the service's value.
# Exits non-zero at the first step whose HTTP status or state differs from what is expected.
set -euo pipefail

BASE=${BASE:-http://localhost:8080/api/v1}
TIMEOUT_SECONDS=${RESERVATION_TIMEOUT_SECONDS:-30}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)

for tool in curl jq; do
  command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 2; }
done

# Stub identities: A requests, B and C are couriers, D is an administrator
A=11111111-1111-4111-8111-111111111111
B=22222222-2222-4222-8222-222222222222
C=33333333-3333-4333-8333-333333333333
D=44444444-4444-4444-8444-444444444444
TOKEN_A="stub.$A.MEMBER"
TOKEN_B="stub.$B.MEMBER"
TOKEN_C="stub.$C.MEMBER"
TOKEN_D="stub.$D.ADMINISTRATOR"
SUPPLIER=00000000-0000-4000-8000-000000000001

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# UTC timestamp N hours from now (GNU date, then BSD date)
in_hours() {
  date -u -d "+$1 hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+"$1"H +%Y-%m-%dT%H:%M:%SZ
}

# call METHOD PATH TOKEN [JSON]  ->  sets STATUS and BODY
call() {
  local method=$1 path=$2 token=$3 data=${4-}
  local args=(-sS -X "$method" -H "Authorization: Bearer $token" -o "$WORK/body" -w '%{http_code}')
  [[ -n "$data" ]] && args+=(-H 'Content-Type: application/json' -d "$data")
  STATUS=$(curl "${args[@]}" "$BASE$path")
  BODY=$(cat "$WORK/body")
}

fail() { echo "FAIL: $*" >&2; exit 1; }

# expect STATUS: stop unless the last call returned the expected status
expect() {
  [[ "$STATUS" == "$1" ]] || fail "expected HTTP $1 but got $STATUS: $BODY"
}

heading() { printf '\n== %s\n' "$*"; }
show() { echo "HTTP $STATUS  $(jq -c "$1" <<<"$BODY")"; }

create_body() {
  jq -nc --arg s "$SUPPLIER" --argjson amount "$1" \
    --arg l "$(in_hours 1)" --arg p "$(in_hours 2)" --arg d "$(in_hours 3)" \
    '{supplierId:$s, items:[{name:"Iced latte",quantity:2}], dropoffLocation:"COM1 level 2",
      notes:"Demo errand", creditAmount:$amount, listingDeadline:$l, pickupDeadline:$p, deliveryDeadline:$d}'
}

# create_errand AMOUNT -> sets ID
create_errand() {
  call POST /errands "$TOKEN_A" "$(create_body "$1")"
  expect 202
  ID=$(jq -r .id <<<"$BODY")
}

# wait_state TOKEN ID STATE TRIES: poll once a second until the errand reaches STATE
wait_state() {
  local token=$1 id=$2 want=$3 tries=$4 state=""
  for ((i = 0; i < tries; i++)); do
    call GET "/errands/$id" "$token"
    state=$(jq -r .state <<<"$BODY")
    [[ "$state" == "$want" ]] && return 0
    sleep 1
  done
  fail "errand $id is $state, expected $want after $tries s"
}

# act TOKEN ID ACTION [JSON]
act() { call POST "/errands/$2/$3" "$1" "${4-}"; }

heading "1. A creates an errand (202, PENDING_RESERVATION)"
create_errand 20
E1=$ID
show '{id, state, creditAmount, requesterId, supplierName}'
[[ $(jq -r .state <<<"$BODY") == PENDING_RESERVATION ]] || fail "unexpected state"

heading "2. Credit reserves, the errand becomes OPEN"
wait_state "$TOKEN_A" "$E1" OPEN 20
expect 200
show '{id, state}'

heading "3. A tries to accept their own errand (403)"
act "$TOKEN_A" "$E1" accept
expect 403
show '.'

heading "4. B and C accept at the same time (one 200, one 409)"
act_bg() { # TOKEN FILE: writes "<status>" to FILE.status and the body to FILE.body
  curl -sS -X POST -H "Authorization: Bearer $1" -o "$2.body" -w '%{http_code}' "$BASE/errands/$E1/accept" >"$2.status"
}
act_bg "$TOKEN_B" "$WORK/b" &
act_bg "$TOKEN_C" "$WORK/c" &
wait
SB=$(cat "$WORK/b.status") SC=$(cat "$WORK/c.status")
echo "B: HTTP $SB  $(jq -c '{state, courierId, error}' "$WORK/b.body")"
echo "C: HTTP $SC  $(jq -c '{state, courierId, error}' "$WORK/c.body")"
if [[ "$SB" == 200 && "$SC" == 409 ]]; then WINNER=$TOKEN_B
elif [[ "$SB" == 409 && "$SC" == 200 ]]; then WINNER=$TOKEN_C
else fail "expected one 200 and one 409, got B=$SB C=$SC"; fi

heading "5. The winner picks up and delivers (200, 200)"
act "$WINNER" "$E1" pickup
expect 200
show '{state, courierId}'
act "$WINNER" "$E1" deliver
expect 200
show '{state, confirmDeadline}'

heading "6. A confirms twice (200 COMPLETED, then 409 INVALID_STATE)"
act "$TOKEN_A" "$E1" confirm
expect 200
show '{state}'
act "$TOKEN_A" "$E1" confirm
expect 409
show '{error, currentState}'

heading "7. History of the first errand"
call GET "/errands/$E1" "$TOKEN_A"
expect 200
jq -r '.history[] | "\(.at)  \(.fromState // "-") -> \(.toState)  \(.action)  by \(.actorType)"' <<<"$BODY"

heading "8. Amount 150 is over the stub limit: RESERVATION_REJECTED"
create_errand 150
E2=$ID
wait_state "$TOKEN_A" "$E2" RESERVATION_REJECTED 20
expect 200
show '{id, state, rejectionReason}'

heading "9. A creates a third errand and cancels it (200 CANCELLED)"
create_errand 30
E3=$ID
wait_state "$TOKEN_A" "$E3" OPEN 20
act "$TOKEN_A" "$E3" cancel
expect 200
show '{id, state}'

heading "10. Fourth errand: delivered, A rejects (DISPUTED), D resolves for the requester (FAILED)"
create_errand 40
E4=$ID
wait_state "$TOKEN_A" "$E4" OPEN 20
act "$TOKEN_B" "$E4" accept; expect 200
act "$TOKEN_B" "$E4" pickup; expect 200
act "$TOKEN_B" "$E4" deliver; expect 200
act "$TOKEN_A" "$E4" reject '{"reason":"Wrong drink"}'
expect 200
show '{id, state}'
call POST "/admin/errands/$E4/resolve" "$TOKEN_D" '{"outcome":"REQUESTER","reason":"Wrong item delivered"}'
expect 200
show '{id, state}'

heading "10b. Amount $((${STUB_CREDIT_SILENT_AMOUNT:-999})) gets no Credit reply: RESERVATION_TIMED_OUT after $((TIMEOUT_SECONDS + 10)) s"
create_errand "${STUB_CREDIT_SILENT_AMOUNT:-999}"
E5=$ID
show '{id, state, reservationDeadline}'
sleep $((TIMEOUT_SECONDS + 10))
call GET "/errands/$E5" "$TOKEN_A"
expect 200
show '{id, state}'
[[ $(jq -r .state <<<"$BODY") == RESERVATION_TIMED_OUT ]] || fail "errand $E5 did not time out"

heading "11. Outbox: every credit message and whether it was published"
OUTBOX_SQL="select event_type, payload->>'order_id' as order_id, published_at is not null as published from outbox order by created_at"
for ((i = 0; i < 20; i++)); do
  PENDING=$(docker compose -f "$ROOT/compose.yaml" exec -T order-db psql -U order_bootstrap -d orders -Atc \
    "select count(*) from outbox where published_at is null")
  [[ "$PENDING" == 0 ]] && break
  sleep 1
done
docker compose -f "$ROOT/compose.yaml" exec -T order-db psql -U order_bootstrap -d orders -c "$OUTBOX_SQL"
[[ "$PENDING" == 0 ]] || fail "$PENDING outbox rows are still unpublished"

for type in ReserveRequested OrderCompleted OrderCancelled OrderFailed ReservationTimedOut; do
  N=$(docker compose -f "$ROOT/compose.yaml" exec -T order-db psql -U order_bootstrap -d orders -Atc \
    "select count(*) from outbox where event_type = '$type' and published_at is not null")
  [[ "$N" -ge 1 ]] || fail "no published $type event in the outbox"
done
echo "All five event types were published."

# grep -c exits 1 on zero matches, which must not trip set -e
VIOLATIONS=$(docker compose -f "$ROOT/compose.yaml" logs order-service | grep -c credit.stub.contract_violation || true)
echo "Stub contract violations in the service log: $VIOLATIONS"
[[ "$VIOLATIONS" == 0 ]] || fail "$VIOLATIONS credit.stub.contract_violation log lines"

printf '\nDemo passed: every step returned the expected status.\n'
