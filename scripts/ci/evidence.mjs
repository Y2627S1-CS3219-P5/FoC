// AI assistance: OpenAI Codex, 2026-11-09. Scope: required-suite reports and diagnostic redaction. Review: pending.
export function verifyReport(xml, boundary) {
  const count = (xml.match(/<testcase(?:\s|>)/g) || []).length;
  if (!xml.trimEnd().endsWith('</testsuites>') || !count || !xml.includes(boundary) || /<(skipped|failure|error)(?:\s|\/|>)/.test(xml)) {
    throw new Error(`Required messaging coverage did not pass completely: ${boundary}`);
  }
  return count;
}

export function redact(text, secrets = []) {
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) text = text.replaceAll(secret, '<REDACTED>');
  return text.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer <REDACTED>')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<REDACTED>');
}
