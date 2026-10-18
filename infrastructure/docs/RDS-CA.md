<!-- Contributor: @ron (AI-assisted); implementation review pending. -->
<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Recorded the provenance and integrity check for the vendored Singapore RDS CA bundle.
Author review: Pending pull-request review by @ron.
-->

# Singapore RDS CA bundle

The database bootstrap, User Service, and Supplier Service images contain the official
Amazon RDS root bundle for `ap-southeast-1`. It was downloaded on 2026-10-18 from:

```text
https://truststore.pki.rds.amazonaws.com/ap-southeast-1/ap-southeast-1-bundle.pem
```

Expected SHA-256:

```text
3c696020a3b7c6721085d182211c28024ab01873ade35dcc7eeebb89c20ee979
```

Verify every copy after an intentional certificate update:

```sh
shasum -a 256 \
  database-bootstrap/certs/ap-southeast-1-bundle.pem \
  ../user-service/certs/ap-southeast-1-bundle.pem \
  ../supplier-service/certs/ap-southeast-1-bundle.pem
```

The RDS instance is pinned to `rds-ca-rsa2048-g1`. Application clients load this bundle,
set `rejectUnauthorized: true`, and set the TLS `servername` to the RDS endpoint. The
custom RDS parameter group independently sets `rds.force_ssl=1` so plaintext clients are
also rejected server-side.
