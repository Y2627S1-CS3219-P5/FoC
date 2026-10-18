import assert from "node:assert/strict";
import { test } from "node:test";
import { createFocDemoApp } from "../lib/app.js";
import { validConfig } from "./fixtures.js";

test("synthesizes the gated Foundation stack boundary without resources", () => {
  const assembly = createFocDemoApp(validConfig()).synth();
  const stack = assembly.getStackArtifact("FoCDemoFoundation");
  const template = stack.template as {
    readonly Resources?: Readonly<Record<string, unknown>>;
    readonly Description?: string;
  };
  assert.equal(stack.stackName, "foc-demo-foundation");
  assert.deepEqual(template.Resources ?? {}, {});
  assert.match(template.Description ?? "", /issue #47/);
});
