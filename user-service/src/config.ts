/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: Moved every environment variable read into this one module, per the author's
 *        decision that all configuration (including secrets) is read in one place.
 * Author review: Reviewed and approved by @t-leongchuan
 */

// The only file that reads process.env. Each part loads only what it needs, so the
// migration runner (which needs just DATABASE_URL) does not require JWT_SECRET etc.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function loadDatabaseConfig() {
  return { databaseUrl: required("DATABASE_URL") };
}

export function loadAppConfig() {
  return {
    port: Number(process.env.PORT) || 3001,
    jwtSecret: required("JWT_SECRET"),
    accessTokenTtlSeconds: Number(process.env.JWT_ACCESS_TOKEN_TTL) || 1800,
    allowedEmailDomain: required("ALLOWED_EMAIL_DOMAIN").toLowerCase(),
    // Browsers may only call this service from these origins
    corsOrigins: (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    bootstrapAdmin: {
      username: process.env.BOOTSTRAP_ADMIN_USERNAME,
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    },
  };
}
