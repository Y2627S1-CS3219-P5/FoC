# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
# Scope: pinned TLS-enabled PostgreSQL fixture for the opt-in issue #48 data integration test.
# Author review: PENDING.
FROM postgres:17.11-alpine3.24@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24

RUN apk add --no-cache openssl \
  && mkdir -p /certs \
  && openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 2 \
     -subj "/CN=postgres" -addext "subjectAltName=DNS:postgres" \
     -keyout /certs/server.key -out /certs/server.crt \
  && chown -R postgres:postgres /certs \
  && chmod 600 /certs/server.key \
  && chmod 644 /certs/server.crt

COPY require-ssl.sh /docker-entrypoint-initdb.d/010-require-ssl.sh
RUN chmod 755 /docker-entrypoint-initdb.d/010-require-ssl.sh

CMD ["postgres", "-c", "ssl=on", "-c", "ssl_cert_file=/certs/server.crt", "-c", "ssl_key_file=/certs/server.key"]
