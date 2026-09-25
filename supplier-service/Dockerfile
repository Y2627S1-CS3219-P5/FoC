# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25. Scope: containerized migration, seed, and Supplier service startup. Author review required before submission.
FROM node:22-alpine AS build

WORKDIR /app

COPY supplier-service/package.json supplier-service/package-lock.json ./
RUN npm ci

COPY supplier-service/ ./
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY supplier-service/package.json supplier-service/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY data/csv /data/csv

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["sh", "-c", "node dist/database/migrate.js && node dist/database/seed/run.js && node dist/main.js"]
