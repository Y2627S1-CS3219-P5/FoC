// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: issue #49 static gateway route/target verification.
// Author review: PENDING.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const local = readFileSync(new URL("../nginx.conf", import.meta.url), "utf8");
const cloud = readFileSync(
  new URL("../nginx.cloud.conf", import.meta.url),
  "utf8",
);
const dockerfile = readFileSync(
  new URL("../Dockerfile", import.meta.url),
  "utf8",
);

for (const [name, config] of Object.entries({ local, cloud })) {
  assert.match(
    config,
    /location = \/healthz/,
    `${name} gateway must expose the internal health endpoint`,
  );
  assert.match(
    config,
    /return 200 '\{"status":"ok"\}'/,
    `${name} health endpoint must be lightweight and deterministic`,
  );
  assert.doesNotMatch(
    config,
    /location[^\n]*\/auth\/verify/,
    `${name} gateway must not expose session verification`,
  );
  assert.doesNotMatch(
    config,
    /proxy_pass[^\n]*(?:\/health|\/api\/docs)/,
    `${name} gateway must not proxy backend health or Swagger`,
  );
  assert.match(
    config,
    /log_format foc_safe/,
    `${name} gateway must use the redacted access-log format`,
  );
  assert.doesNotMatch(
    config,
    /log_format[^;]*(?:\$request(?:\s|')|\$request_uri|\$args|http_authorization)/s,
    `${name} gateway access logs must omit query strings and credentials`,
  );
}

for (const route of [
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/whoami",
  "/api/v1/users/",
  "/api/v1/admin/audit",
  "/api/v1/suppliers",
  "/assets/suppliers",
]) {
  assert.ok(cloud.includes(route), `cloud gateway is missing ${route}`);
}
assert.doesNotMatch(
  cloud,
  /order-service|credit-service|errands/i,
  "cloud gateway must not depend on excluded Order or Credit services",
);
assert.match(
  local,
  /order-service/,
  "ordinary local gateway must retain the existing Order route",
);
assert.match(
  dockerfile,
  /FROM gateway-base AS cloud/,
  "Dockerfile must publish an explicit cloud target",
);
assert.match(
  dockerfile,
  /FROM gateway-base AS runtime/,
  "ordinary local builds must retain the full gateway target",
);

console.log("PASS: nginx local/cloud route contracts are explicit");
