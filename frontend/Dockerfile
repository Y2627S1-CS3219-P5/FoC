# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-09-26. Scope: two-stage build
# of the frontend into an nginx gateway image. Author review: Reviewed and approved by @t-leongchuan
# Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18. Scope: issue #49
# cloud-only gateway target and health check. Author review: PENDING.
# Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18. Scope: apply supported
# Alpine OS security patches before building immutable issue #52 release images.
# Author review: PENDING.

# Stage 1: build the website into plain static files (HTML/CSS/JS) in /app/dist
FROM node:22-alpine AS build
RUN apk upgrade --no-cache
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: common static site shared by the full/local and approved AWS gateways.
FROM nginx:1.29-alpine AS gateway-base
RUN apk upgrade --no-cache
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# The AWS slice intentionally contains no Order or Credit service. Release tooling
# builds this target so nginx never resolves excluded service names at startup.
FROM gateway-base AS cloud
COPY nginx.cloud.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/healthz >/dev/null || exit 1

# Keep this last so an ordinary local/Compose build retains the full route set.
FROM gateway-base AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/healthz >/dev/null || exit 1
