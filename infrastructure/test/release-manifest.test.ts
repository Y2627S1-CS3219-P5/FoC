// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigurationError } from "../lib/config.js";
import { parseReleaseManifest } from "../lib/release-manifest.js";
import { validReleaseManifest } from "./fixtures.js";

test("accepts only a full source revision and immutable image digests", () => {
  assert.deepEqual(
    parseReleaseManifest(validReleaseManifest()),
    validReleaseManifest(),
  );
});

test("rejects tags, latest, short SHAs, malformed digests, and unknown fields", () => {
  for (const input of [
    {
      ...validReleaseManifest(),
      sourceRevision: "abcdef1",
    },
    {
      ...validReleaseManifest(),
      images: {
        ...validReleaseManifest().images,
        userService: {
          ...validReleaseManifest().images.userService,
          digest: "latest",
        },
      },
    },
    {
      ...validReleaseManifest(),
      images: {
        ...validReleaseManifest().images,
        supplierService: {
          ...validReleaseManifest().images.supplierService,
          digest: "sha256:not-a-digest",
        },
      },
    },
    { ...validReleaseManifest(), extra: true },
  ]) {
    assert.throws(() => parseReleaseManifest(input), ConfigurationError);
  }
});
