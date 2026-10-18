// Contributor: @ron (AI-assisted).
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: Canonical serialization and pre-extraction fingerprint regressions.
// Author review: PENDING.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson } from "../lib/canonical-json.js";
import { configFingerprint } from "../lib/config.js";
import { releaseManifestHash } from "../lib/release-manifest.js";
import { validConfig, validReleaseManifest } from "./fixtures.js";

test("sorts nested object keys without changing ordered arrays or scalar JSON", () => {
  assert.equal(
    canonicalJson({ z: [{ b: 2, a: 1 }, null, "x"], a: true }),
    '{"a":true,"z":[{"a":1,"b":2},null,"x"]}',
  );
});

test("retains the exact configuration and release fingerprints captured before extraction", () => {
  assert.equal(
    configFingerprint(validConfig()),
    "231db4f15fddc266420cbac72e00aafe69aef52f578700da8b1db9661d97154a",
  );
  assert.equal(
    releaseManifestHash(validReleaseManifest()),
    "065ca4376e53a7c8b015ae4d60efa2ffd717c98e0cbd46c41ddcbfe70e72c259",
  );
});
