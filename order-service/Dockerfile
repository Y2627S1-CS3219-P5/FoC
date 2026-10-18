# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: Order Service image,
# copied from user-service/Dockerfile (two stages, fresh production install, allowlisted
# runtime contents, non-root user) with the port changed. Author review: Reviewed and approved by @mattis.

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

EXPOSE 3002
CMD ["node", "dist/index.js"]
