<!--
Contributor: @ron (AI-assisted); implementation review pending.
AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
Scope: issue #52 minimized real-Nginx logging diagnosis and regression evidence.
Author review: PENDING.
-->

# Gateway log-redaction regression

The coordinator's bounded live log check found a dummy query marker in the frontend's
default nginx access format after the `7a29b973` release. No raw live log message or
credential was copied into this note. API and browser acceptance had already passed;
this was a separate logging acceptance failure.

## Local RED

`check-nginx-runtime.mjs --image <existing-7a-cloud-image> --bundled-cloud-only`
used the exact already-local amd64 cloud image, digest
`sha256:48b647eb1cf995f51868170f8177f17e4ff225cd2149f34818ac93a12f48e06f`.
With networking disabled and no published port, a dummy SPA GET produced:

```text
bundled cloud: query marker leaked into stdout/stderr; default-main-format=true
```

Mounting the unchanged source config also failed with the same signal. The image's
effective configuration showed both `main` and `foc_safe` access loggers at HTTP scope.
The base image includes `conf.d` in that scope; adding another `access_log` there does
not replace the original logger. An error logger or source/image mismatch was not the
cause of this reproduced successful-GET leak.

## Minimal fix and GREEN

Keep `log_format foc_safe` at HTTP scope and move its single `access_log` into the
server in both gateway configs. Server configuration overrides the inherited access
logger, while the health location still uses `access_log off`. No route, request ID,
error-log policy, dependency, image base, or business behavior changed.

The same existing image, mounting only the corrected configs read-only, reports:

```text
PASS: cloud Nginx emits one redacted completion, no query/header markers, and no health access log
PASS: local Nginx emits one redacted completion, no query/header markers, and no health access log
```

The test resolves the requested local image to an immutable ID and never pulls it. It
passes dummy Authorization/Cookie values, inspects stdout/stderr only in memory, reports
counts/booleans instead of raw logs, and removes only its exact uniquely named containers.
The existing disposable Compose browser workflow runs this regression against its built
image; the static nginx check also rejects the original HTTP-level logger placement.

The old packaged image remains unfixed: a new cloud frontend image and reviewed release
are required. Local GREEN does not claim the coordinator's subsequent live log check
has passed. See [nginx access-log documentation](https://nginx.org/en/docs/http/ngx_http_log_module.html#access_log).

Local verification also passed the frontend's 32 tests, static gateway assertions,
lint, production TypeScript/Vite build, and the infrastructure's 141-test check and
build (including strict four-stack offline CLI synthesis). Both offline audits
reported zero vulnerabilities. Full Compose/browser orchestration was not rerun in
this diagnosis; the new runtime check is wired into that existing CI workflow.
