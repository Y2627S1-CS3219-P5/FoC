import { App, Tags } from "aws-cdk-lib";
import type { DeploymentConfig } from "./config.js";
import { DataStack } from "./data-stack.js";
import { FoundationStack } from "./foundation-stack.js";
import type { ReleaseManifest } from "./release-manifest.js";

/** Creates the gated Foundation and Data stacks without running database jobs. */
export function createFocDemoApp(
  config: DeploymentConfig,
  releaseManifest: ReleaseManifest,
): App {
  const app = new App();
  const foundation = new FoundationStack(app, "FoCDemoFoundation", {
    stackName: "foc-demo-foundation",
    description: "FoC demo network, registry, and ECS foundation resources",
    env: { account: config.accountId, region: config.primaryRegion },
    retainedImageCount: config.registry.retainedImageCount,
  });
  const data = new DataStack(app, "FoCDemoData", {
    stackName: "foc-demo-data",
    description:
      "FoC demo RDS, generated secrets, and database job definitions",
    env: { account: config.accountId, region: config.primaryRegion },
    config,
    releaseManifest,
    vpc: foundation.vpc,
    userServiceRepository: foundation.userServiceRepository,
    supplierServiceRepository: foundation.supplierServiceRepository,
  });

  for (const [key, value] of Object.entries({
    Project: "FoC",
    Environment: "demo",
    ManagedBy: "CDK",
    Owner: config.owner,
    Issue: "44",
  })) {
    Tags.of(foundation).add(key, value);
    Tags.of(data).add(key, value);
  }
  return app;
}
