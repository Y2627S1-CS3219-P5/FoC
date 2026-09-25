/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added bounded Supplier runtime environment parsing.
 * Author review required before submission.
 */
export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}

export function getPort(): number {
  const configuredPort = process.env.PORT ?? "3000";
  if (!/^\d+$/.test(configuredPort)) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const port = Number(configuredPort);
  if (port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}
