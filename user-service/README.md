<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
Scope: Documented the User Service endpoints and error responses.
Author review: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
Scope: Documented the database roles, migrations and the reset script.
Author review of additional changes: Reviewed and approved by @t-leongchuan
-->

# User Service

Accounts, login, profiles and roles for FoC. Express + TypeScript + PostgreSQL.

## Endpoints

Paths below are the **public** paths through the gateway (`http://localhost:8080`).
The gateway strips `/api/v1` before forwarding.

| Method and path | Who | What |
| --- | --- | --- |
| `POST /api/v1/auth/register` | anyone | `{ username, email, password }` → new MEMBER account |
| `POST /api/v1/auth/login` | anyone | `{ identifier, password }` (username or email) → `{ accessToken, tokenType, expiresIn }` |
| `GET /api/v1/whoami` | logged in | → `{ username, displayName, role }` of the caller |
| `PATCH /api/v1/whoami` | logged in | `{ displayName }` (1–50 chars). Other fields are ignored. Missing displayName → no change |
| `PUT /api/v1/users/{id}/role` | ADMINISTRATOR | `{ role: "MEMBER" \| "ADMINISTRATOR" }`. Same role → no change |
| `GET /auth/verify` | **other services only** (not exposed by the gateway) | → `{ id, role }` for the bearer token |

"Logged in" = `Authorization: Bearer <accessToken>`. Roles are re-read from the database on
every request, so role changes apply immediately. Concurrent role changes are serialised
with a database lock (`src/roles.ts`).

### Error responses

All errors look like `{ "error": "CODE", "message": "...", "details"?: { field: reason } }`.

| Status | When |
| --- | --- |
| 400 `VALIDATION_FAILED` | Bad input; `details` says which field |
| 401 `UNAUTHENTICATED` / `INVALID_CREDENTIALS` | No or invalid or expired token, account not active, wrong login |
| 403 `FORBIDDEN` | Logged in but not allowed (e.g. a member calling an admin route) |
| 403 `CANNOT_CHANGE_OWN_ROLE` | An admin tried to change their own role |
| 403 `ACCOUNT_SUSPENDED` / `ACCOUNT_PENDING_VERIFICATION` | Correct password but the account can't log in |
| 404 `USER_NOT_FOUND` | No account with that id |
| 409 `USERNAME_TAKEN` / `EMAIL_TAKEN` | Registration clashes with an existing account |
| 409 `LAST_ADMINISTRATOR` | The change would leave no ACTIVE administrator |

## Configuration

See the repository `.env.example`. The first administrator is created at startup from
`BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`, and only
if no administrator exists yet.
All settings are read in one place, `src/config.ts`.

## Database

PostgreSQL in the `user-db` container, data in the `user-db-data` volume (kept across
`docker compose down`/`up`; deleted only by the reset script or `down -v`).

| Role | Used by | Can do |
| --- | --- | --- |
| `user_bootstrap` | the init script (`docker/postgres/init-roles.sh`), once, on a new volume | Superuser. No service connects as it |
| `user_migrator` | `user-migrate` (`src/migrate.ts`) | Owns the database and tables; creates and changes them |
| `user_app` | `user-service` | Only the row access each migration grants it |

The passwords come from `.env` (`USER_DB_ADMIN_PASSWORD`, `USER_DB_MIGRATION_PASSWORD`,
`USER_DB_APP_PASSWORD`).

### Migrations

`docker compose up` runs `user-migrate` first. It applies the new files in `migrations/`
in number order, each in its own transaction, then exits. `user-service` starts only if
it succeeded.

To change the schema, **add a new file**, e.g. `migrations/0002_add_audit_log.sql`:
- Number it one higher than the last file; lowercase name with underscores.
- Grant `user_app` exactly the access it needs on any table you create (it gets nothing by default).
- **Never edit or delete a file after it is merged.** The runner stores each applied
  file's checksum and refuses to run if one changes. Fix mistakes with a new migration.

### Resetting your local database

```bash
bash user-service/scripts/reset-db.sh        # asks first; --yes to skip the question
```

Deletes only the User Service's data and starts it again. Use this, **not**
`docker compose down -v`, which also deletes every other service's data.
You need it once after pulling the change that introduced migrations: the service will
refuse to start on an older database and tell you to run it.

### Troubleshooting

`docker compose up` only says that a step failed. The reason is in that step's log:

```bash
docker compose logs user-migrate
```

| You see (in `docker compose up` or the log) | Cause | Fix |
| --- | --- | --- |
| `service "user-migrate" didn't complete successfully: exit 1` | The migration step failed; `user-service` is not started | Read `docker compose logs user-migrate` and match the line below |
| `Could not log in as the migration role` / `This database was created before migrations were introduced` | Your local user database is from before migrations (the D2 setup) | `bash user-service/scripts/reset-db.sh` (deletes local User Service accounts only) |
| `required variable USER_DB_..._PASSWORD is missing a value` | `.env` lacks the User Service database passwords | Add the three `USER_DB_*_PASSWORD` lines from `.env.example` with random values (`openssl rand -hex 16`) |
| `Applied migration ... has been edited` | A merged migration file was changed | Undo the edit (`git checkout -- user-service/migrations/`) and put the change in a new numbered file |
| `Applied migration ... is missing` / `Two migrations share the number` / `Unexpected file in migrations/` | A migration was deleted, two branches used the same number, or a non-migration file is in `migrations/` | Restore the deleted file, renumber your new file, or move the extra file out |
| `<file> failed and was rolled back: ...` | The SQL in a new migration has an error; nothing from that file was applied | Fix the SQL in that (not yet merged) file and run `docker compose up -d` again |
| `permission denied for table ...` in `docker compose logs user-service` | A migration created a table without granting `user_app` access | Add a new migration with the needed `GRANT ... TO user_app` |
