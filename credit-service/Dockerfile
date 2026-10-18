# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: image built the
# same way as user-service/Dockerfile (two stages, fresh production install, allowlisted
# runtime contents, non-root user, pinned base image). Author review: Reviewed and approved by @phuc
# Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: runs the service
# entry point; added the e2e test stage. Author review: Reviewed and approved by @phuc

# ---- Build stage: all packages + TypeScript compiler -> dist/ -------------------
FROM node:22.23.3-alpine3.24 AS build
WORKDIR /app

# Dependencies first, so this layer is cached until package*.json changes
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- End-to-end test runner (credit-service/e2e/run.sh builds this target) ----------
# Has the dev packages (tsx) and the e2e tests; never deployed.
FROM build AS e2e
USER node
CMD ["node", "--import", "tsx", "--test", "--test-reporter=spec", "--test-concurrency=1", "e2e/credit-flow.test.ts"]

# ---- Runtime stage: only what the service and the migration step run ------------
FROM node:22.23.3-alpine3.24 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Allowlist: compiled code and the SQL migrations, nothing else
COPY --from=build /app/dist ./dist
COPY migrations ./migrations

# The base image's unprivileged user (uid 1000); the app only reads its files
USER node

# The migration step overrides this with: node dist/migrate.js
CMD ["node", "dist/index.js"]
