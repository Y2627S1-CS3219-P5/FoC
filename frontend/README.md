<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
Scope: Documented how to run the frontend and how requests are routed.
Author review: Reviewed and approved by @t-leongchuan
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
| `src/auth/tokenStorage.ts` | The only place the token is stored (sessionStorage) |
| `src/auth/AuthProvider.tsx` | Who is logged in, login/logout, expiry notices |
| `src/components/RequireAuth.tsx` | Wrap a page in `<RequireAuth>` to make it members-only |
| `src/App.tsx` | URL → page table |

**Adding a logged-in page (e.g. suppliers):** add a `<Route>` in `App.tsx` wrapped in
`<RequireAuth>`, and call the backend with `apiRequest('/suppliers?...')`. The token is
attached automatically, and a 401 logs the user out.
