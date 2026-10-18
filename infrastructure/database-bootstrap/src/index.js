// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: safe executable wrapper for the issue #48 database bootstrap.
// Author review: PENDING.
import { loadBootstrapConfig, runBootstrap } from "./bootstrap.js";

try {
  await runBootstrap(loadBootstrapConfig());
} catch (error) {
  // Never render database configuration, SQL, or an exception that could carry a
  // password. Detailed infrastructure diagnostics come from RDS/ECS event codes.
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? ` (${error.code})`
      : "";
  console.error(`Database bootstrap failed${code}.`);
  process.exitCode = 1;
}
