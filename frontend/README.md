<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
Scope: Documented how to run the frontend and how requests are routed.
Author review: Reviewed and approved by @t-leongchuan
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the Supplier API foundation and frontend test commands added for issue #28.
Author review: Pending project-author review.
-->

# Frontend

React + TypeScript + Vite, Tailwind, React Router. D2 scope: sign in, create account,
log out, placeholder landing page, and session-expiry toasts (5 and 2 minutes before).

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
npm test
npm run lint
npm run build
```

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
| `src/App.tsx` | URL → page table |

**Adding a logged-in Supplier page:** add a `<Route>` in `App.tsx` wrapped in
`<RequireAuth>`, then use the functions in `src/api/supplierApi.ts`. They keep Supplier
ETags available for conditional writes; the shared client still attaches the token and
logs the user out after an authenticated 401.
