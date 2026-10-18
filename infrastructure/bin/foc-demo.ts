import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFocDemoApp } from "../lib/app.js";
import { loadDeploymentConfig } from "../lib/config.js";
import { assertDeploymentGate, defaultGatePaths } from "../lib/gate.js";
import { loadReleaseManifest } from "../lib/release-manifest.js";

const infrastructureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const { config } = loadDeploymentConfig();
const { manifest } = loadReleaseManifest();
assertDeploymentGate(config, defaultGatePaths(infrastructureRoot));
createFocDemoApp(config, manifest);
