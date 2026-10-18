import { App, Tags } from "aws-cdk-lib";
import type { DeploymentConfig } from "./config.js";
import { FoundationStack } from "./foundation-stack.js";

/** Creates the gated Foundation stack; later tickets add dependent stacks. */
export function createFocDemoApp(config: DeploymentConfig): App {
  const app = new App();
  const foundation = new FoundationStack(app, "FoCDemoFoundation", {
    stackName: "foc-demo-foundation",
    description: "FoC demo network, registry, and ECS foundation resources",
    env: { account: config.accountId, region: config.primaryRegion },
    retainedImageCount: config.registry.retainedImageCount,
  });

  for (const [key, value] of Object.entries({
    Project: "FoC",
    Environment: "demo",
    ManagedBy: "CDK",
    Owner: config.owner,
    Issue: "44",
  })) {
    Tags.of(foundation).add(key, value);
  }
  return app;
}
