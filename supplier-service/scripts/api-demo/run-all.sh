#!/usr/bin/env bash
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
# Scope: added a one-command runner for every isolated endpoint check and API
# user journey. Author review: Reviewed and approved by @ron.
# Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18.
# Scope: omitted private health endpoints in CloudFront gateway mode for issue
# #51 while retaining the complete local run. Author review: PENDING.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

endpoints=(
  register
  login
  whoami
  change-role
  metadata
  list
  get
  create
  update
  archive
  restore
)

if [[ -z "${API_GATEWAY_BASE_URL:-}" ]]; then
  endpoints=(user-health supplier-health "${endpoints[@]}")
fi

journeys=(
  member-read.sh
  member-authorization.sh
  admin-crud.sh
  admin-validation.sh
  visibility.sh
  admin-concurrency.sh
)

printf 'Running isolated endpoint checks...\n\n\n'
printf -- '------------------------------------------------------------------\n'
for endpoint in "${endpoints[@]}"; do
  "${script_dir}/tests/run-endpoint.sh" "${endpoint}"
done

printf '\nRunning user journeys...\n'
for journey in "${journeys[@]}"; do
  "${script_dir}/journeys/${journey}"
done
printf -- '\n---------------------------------\n'
printf '\nPASS: all Supplier API endpoint checks and journeys\n'
