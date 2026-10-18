# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-09. Scope: rewrote the
# image as the author decided (two stages, fresh production install, allowlisted runtime
# contents, non-root user, pinned base image, NODE_ENV in the runtime stage only).
# Author review: Reviewed and approved by @t-leongchuan
# Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18. Scope: included the
# pinned Singapore RDS trust bundle for verified TLS in issue #48. Author review: PENDING.
# Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18. Scope: apply supported
# Alpine OS security patches before building immutable issue #52 release images.
# Author review: PENDING.

# ---- Build stage: all packages + TypeScript compiler -> dist/ -------------------
FROM node:22.23.3-alpine3.24 AS build
RUN apk upgrade --no-cache
WORKDIR /app

# Dependencies first, so this layer is cached until package*.json changes
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage: only what the service and the migration step run ------------
FROM node:22.23.3-alpine3.24 AS runtime
RUN apk upgrade --no-cache
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Allowlist: compiled code and the SQL migrations, nothing else
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY certs/ap-southeast-1-bundle.pem ./certs/ap-southeast-1-bundle.pem

# The base image's unprivileged user (uid 1000); the app only reads its files
USER node

EXPOSE 3001
CMD ["node", "dist/index.js"]
