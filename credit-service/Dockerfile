# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: image built the
# same way as user-service/Dockerfile (two stages, fresh production install, allowlisted
# runtime contents, non-root user, pinned base image). Author review: PENDING

# ---- Build stage: all packages + TypeScript compiler -> dist/ -------------------
FROM node:22.23.3-alpine3.24 AS build
WORKDIR /app

# Dependencies first, so this layer is cached until package*.json changes
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

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

# The service entry point (Kafka consumers, HTTP API) is not written yet, so the image
# currently runs only the migration step.
CMD ["node", "dist/migrate.js"]
