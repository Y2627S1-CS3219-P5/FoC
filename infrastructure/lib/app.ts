import { App, Stack, Tags, Validations } from "aws-cdk-lib";
import type { DeploymentConfig } from "./config.js";

/**
 * Creates only the initial stack boundary. Ticket #47 adds the Foundation resources;
 * later tickets add Data, Application, and Edge stacks after their blockers clear.
 */
export function createFocDemoApp(config: DeploymentConfig): App {
  const app = new App();
  const foundation = new Stack(app, "FoCDemoFoundation", {
    stackName: "foc-demo-foundation",
    description:
      "FoC demo foundation resources (implementation tracked by issue #47)",
    env: { account: config.accountId, region: config.primaryRegion },
  });
  Validations.of(foundation).acknowledge({
    id: "CloudFormation-Validate::F0001",
    reason:
      "Issue #46 establishes only the guarded stack boundary; issue #47 adds resources.",
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
