#!/usr/bin/env bash
# Contributor: @ron (AI-assisted); implementation review pending.
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
# Scope: opt-in PostgreSQL 17.11 bootstrap/migration/seed/isolation verification for issue #48.
# Author review: PENDING.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
temporary_dir="$(mktemp -d)"
project="foc-data-integration-$$"
compose=(docker compose --project-name "${project}" --file "${script_dir}/compose.yaml")
export FOC_DATA_INTEGRATION_CA="${temporary_dir}/server.crt"

cleanup() {
  "${compose[@]}" down --volumes --remove-orphans --rmi local >/dev/null 2>&1 || true
  rm -rf "${temporary_dir}"
}
trap cleanup EXIT

expect_failure() {
  if "$@" >/dev/null 2>&1; then
    echo "FAIL: command unexpectedly succeeded: $*" >&2
    exit 1
  fi
}

psql_as() {
  local role="$1"
  local password="$2"
  local database="$3"
  local sql="$4"
  "${compose[@]}" exec -T \
    -e "PGPASSWORD=${password}" postgres \
    psql --host=postgres --username="${role}" --dbname="${database}" \
      --set=ON_ERROR_STOP=1 --no-psqlrc --quiet --command="${sql}"
}

"${compose[@]}" build postgres
"${compose[@]}" create postgres >/dev/null
"${compose[@]}" cp postgres:/certs/server.crt "${FOC_DATA_INTEGRATION_CA}"
"${compose[@]}" up --detach --wait postgres
master_flags="$(psql_as focmaster integration-master-password postgres \
  "SELECT 'nonsuperuser-verified' FROM pg_roles WHERE rolname = current_user AND NOT rolsuper AND rolcreatedb AND rolcreaterole;")"
if [[ "${master_flags}" != *"nonsuperuser-verified"* ]]; then
  echo "FAIL: bootstrap fixture must use a NOSUPERUSER CREATEDB CREATEROLE master" >&2
  exit 1
fi
"${compose[@]}" build bootstrap user-migrate supplier-migrate supplier-seed

"${compose[@]}" run --rm bootstrap
"${compose[@]}" run --rm bootstrap
"${compose[@]}" run --rm user-migrate
"${compose[@]}" run --rm supplier-migrate

first_seed_output="$("${compose[@]}" run --rm supplier-seed)"
if [[ "${first_seed_output}" != *"21 inserted, 0 already present"* ]]; then
  echo "FAIL: first Supplier seed did not insert exactly 21 records" >&2
  exit 1
fi

psql_as supplier_app integration-supplier-runtime supplier \
  "UPDATE suppliers SET name = 'Administrator preserved edit' WHERE id = 'bdee8954-e570-58cf-a813-0ab36a084296';"
second_seed_output="$("${compose[@]}" run --rm supplier-seed)"
if [[ "${second_seed_output}" != *"0 inserted, 21 already present"* ]]; then
  echo "FAIL: repeated Supplier seed was not a complete no-op" >&2
  exit 1
fi

preserved_name="$(psql_as supplier_app integration-supplier-runtime supplier \
  "SELECT name FROM suppliers WHERE id = 'bdee8954-e570-58cf-a813-0ab36a084296';")"
if [[ "${preserved_name}" != *"Administrator preserved edit"* ]]; then
  echo "FAIL: repeated Supplier seed overwrote an administrator edit" >&2
  exit 1
fi

psql_as user_app integration-user-runtime users \
  "INSERT INTO users (username,email,password_hash,display_name,status) VALUES ('cloud_check','cloud_check@u.nus.edu','dummy','Cloud Check','ACTIVE'); DELETE FROM users WHERE username = 'cloud_check';"
expect_failure psql_as user_app integration-user-runtime users \
  "CREATE SCHEMA forbidden_user_schema;"
expect_failure psql_as supplier_app integration-supplier-runtime supplier \
  "CREATE TABLE public.forbidden_supplier_table (id integer);"
expect_failure psql_as user_app integration-user-runtime supplier "SELECT 1;"
expect_failure psql_as supplier_app integration-supplier-runtime users "SELECT 1;"
expect_failure psql_as user_migrator integration-user-migrator supplier "SELECT 1;"
expect_failure psql_as supplier_migrator integration-supplier-migrator users "SELECT 1;"
expect_failure psql_as supplier_app integration-supplier-runtime supplier "SET ROLE focmaster;"
expect_failure psql_as user_app integration-user-runtime users "SET ROLE user_migrator;"

"${compose[@]}" exec -T -e PGPASSWORD=integration-user-runtime postgres \
  psql "host=postgres port=5432 dbname=users user=user_app sslmode=verify-full sslrootcert=/certs/server.crt" \
    --no-psqlrc --tuples-only --command="SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid();" \
  | grep --quiet t
expect_failure "${compose[@]}" exec -T -e PGPASSWORD=integration-user-runtime postgres \
  psql "host=postgres port=5432 dbname=users user=user_app sslmode=disable" \
    --no-psqlrc --command="SELECT 1;"

echo "PASS: bootstrap, migrations, repeatable seed, TLS, and role isolation verified."
