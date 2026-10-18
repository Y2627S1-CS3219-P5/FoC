#!/bin/sh
# Test-only equivalent of RDS rds.force_ssl=1. Prepend the rejection so the
# image's broader host rules cannot accept a plaintext connection first.
set -eu

temporary_hba="$(mktemp)"
printf '%s\n' 'hostnossl all all all reject' > "${temporary_hba}"
cat "${PGDATA}/pg_hba.conf" >> "${temporary_hba}"
mv "${temporary_hba}" "${PGDATA}/pg_hba.conf"
chown postgres:postgres "${PGDATA}/pg_hba.conf"
