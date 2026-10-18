# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
# Scope: dedicated non-root, immutable-base database bootstrap image for issue #48.
# Additional scope: apply supported Alpine OS security patches for issue #52;
# the deployed release is pinned to its built image digest, not a future rebuild.
# Author review: PENDING.
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS dependencies
RUN apk upgrade --no-cache
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
RUN apk upgrade --no-cache
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src
COPY certs/ap-southeast-1-bundle.pem ./certs/ap-southeast-1-bundle.pem
USER node
ENTRYPOINT ["node", "src/index.js"]
