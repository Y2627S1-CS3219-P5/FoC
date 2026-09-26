<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
Scope: Documented the User Service endpoints and error responses.
Author review: Reviewed and approved by @t-leongchuan
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
