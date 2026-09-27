<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
Scope: Documented how to run the frontend and how requests are routed.
Author review: Reviewed and approved by @t-leongchuan
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the Supplier API foundation and frontend test commands added for issue #28.
Author review: Pending project-author review.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the responsive live member Supplier catalogue and detail routes added for
issue #29. Author review: Pending project-author review.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the Supplier administrator routes and lifecycle/form boundaries for issue #30.
Author review: Pending project-author review.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the isolated real-browser Supplier UI verification and D2 rehearsal for issue #31.
Author review: Pending project-author review.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the expanded live validation, concurrency, and mobile administrator checks for
issue #34. Author review: Pending project-author review.
-->

# Frontend

React + TypeScript + Vite, Tailwind, React Router. D2 scope includes sign in,
create account, log out, session-expiry toasts, and live Supplier catalogue and
detail screens for authenticated members, plus administrator Supplier management.

## Running it

**Everything in Docker** (from the repository root):

```bash
docker compose up --build
# open http://localhost:8080   (FRONTEND_PORT in .env)
```

**Frontend with live reload** (backends running, e.g. via Docker Compose):

```bash
cd frontend
npm install
npm run dev
# open http://localhost:5173
```

## Checking it

```bash
cd frontend
npm ci
npm test
npm run lint
npm run build
```

For the repeatable integrated browser check, install its Chromium once and run:

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

Or run the dependency install, browser setup, lint, component tests, production build,
and live browser workflow together from anywhere in the repository:

```bash
./frontend/scripts/run-supplier-ui-demo.sh
```

`test:e2e` chooses available host ports and creates a uniquely named disposable
Compose project. It starts the real nginx frontend, User Service, Supplier Service,
and both PostgreSQL databases with non-secret test-only credentials. Chromium then
checks the MEMBER catalogue/detail journey and the ADMINISTRATOR
create/edit/archive/restore journey at desktop and mobile widths. It also exercises a
real backend 400 in the form, two stale editor tabs with 412 recovery, missing `If-Match`
428, mobile confirmations, and horizontal overflow assertions. The project and its
volumes are removed after success or failure.
Failure traces, screenshots, and videos are written under the ignored `test-results/`;
an HTML report is written under ignored `playwright-report/`.

This browser check complements, rather than replaces, the API-only verification:

```bash
cd supplier-service
npm run test:integration
```

That command remains usable with the frontend stopped and covers direct MEMBER 403s,
ETag races/preconditions, database state, repeatable seed behavior, and service outages.

For a presentation rehearsal, start the ordinary stack with `docker compose up --build`,
open `http://localhost:8080`, and follow the MEMBER then ADMINISTRATOR flow in
`supplier-service/SPEC.md` section 9.2. Use Archive as the approved delete behavior;
do not claim physical deletion or Order Service integration.

## How requests reach the services

The browser only talks to one origin: the Vite dev server in development, or nginx in
Docker. It forwards API calls:

| Browser calls | Goes to |
| --- | --- |
| `POST /api/v1/auth/login` | user-service `POST /auth/login` |
| `POST /api/v1/auth/register` | user-service `POST /auth/register` |
| `GET`/`PATCH /api/v1/whoami` | user-service `GET`/`PATCH /whoami` |
| `PUT /api/v1/users/{id}/role` | user-service `PUT /users/{id}/role` |
| `/api/v1/suppliers...` | supplier-service (same path) |
| `/assets/suppliers/...` | supplier-service (same path) |

`/auth/verify` is not exposed. Rules live in `vite.config.ts` and `nginx.conf`; keep them in sync.

## Where things are

| Path | What it does |
| --- | --- |
| `src/api/client.ts` | `apiRequest()`: every backend call. Adds the login token and turns error replies into `ApiError` |
| `src/api/supplierApi.ts` | Typed Supplier list/detail/mutation calls, including ETag handling |
| `src/auth/tokenStorage.ts` | The only place the token is stored (sessionStorage) |
| `src/auth/AuthProvider.tsx` | Who is logged in, login/logout, expiry notices |
| `src/components/RequireAuth.tsx` | Wrap a page in `<RequireAuth>` to make it members-only |
| `src/suppliers/types.ts` | Supplier API models and controlled values |
| `src/suppliers/presentation.ts` | Shared category and typical-hours formatting |
| `src/suppliers/SupplierListPage.tsx` | URL-backed live search, filters, sorting, pagination, loading, empty and retry states |
| `src/suppliers/SupplierDetailPage.tsx` | Live Supplier detail, coordinates, typical hours and image fallback |
| `src/suppliers/admin/SupplierAdminPage.tsx` | Administrator ACTIVE/ARCHIVED management, archive and restore |
| `src/suppliers/admin/SupplierFormPage.tsx` | Metadata-backed create/edit and stale-ETag recovery |
| `src/App.tsx` | URL → page table |

Authenticated users land on `/suppliers`; `/suppliers/:id` shows detail. Catalogue
query state stays in the URL so refresh and browser navigation preserve it. The UI
gets building labels from the authenticated Supplier metadata endpoint and reads all
catalogue records from live Supplier APIs.

Administrator routes are `/suppliers/admin`, `/suppliers/new`, and
`/suppliers/:id/edit`. Forms intentionally do not accept `imagePath`, `status`, `version`,
or timestamps because those fields are server-owned. Archive retains the Supplier record
and ID; there is no physical-delete control. Conditional writes use the ETags retained by
`src/api/supplierApi.ts`. The shared client attaches the token and logs the user out after
an authenticated 401.
