// AI assistance: OpenAI Codex, 2026-11-09. Scope: required-suite execution safeguards. Review: pending.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyReport, redact } from './evidence.mjs';

test('required reports must contain executed cases and the named messaging boundary', () => {
  assert.equal(verifyReport('<testsuites><testcase name="Kafka integration works"/></testsuites>', 'Kafka integration'), 1);
  for (const xml of ['', '<testsuites></testsuites>', '<testsuites><testcase name="unrelated"/></testsuites>']) {
    assert.throws(() => verifyReport(xml, 'Kafka integration'));
  }
});

test('skipped, failed, and truncated reports cannot satisfy a required messaging check', () => {
  for (const body of ['<skipped/>', '<failure/>', '<error/>']) {
    assert.throws(() => verifyReport(`<testsuites><testcase name="Kafka integration">${body}</testcase></testsuites>`, 'Kafka integration'));
  }
  assert.throws(() => verifyReport('<testsuites><testcase name="Kafka integration"/>', 'Kafka integration'));
});

test('captured diagnostics remove known credentials and bearer tokens', () => {
  assert.equal(redact('password=secret Bearer eyJ.abc.def', ['secret']), 'password=<REDACTED> Bearer <REDACTED>');
});
