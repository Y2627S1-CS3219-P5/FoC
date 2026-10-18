-- AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
-- Scope: test-only RDS-like master privileges, deliberately without SUPERUSER.
-- Author review: PENDING.
CREATE ROLE focmaster LOGIN NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'integration-master-password';
