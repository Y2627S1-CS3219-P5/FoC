// Contributor: @ron (AI-assisted).
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: Shared byte-preserving canonical JSON for deployment security fingerprints.
// Author review: PENDING.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  const result = JSON.stringify(canonicalize(value));
  if (result === undefined)
    throw new Error("Canonical JSON requires a serializable root value");
  return result;
}
