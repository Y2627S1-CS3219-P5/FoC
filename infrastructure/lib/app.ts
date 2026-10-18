import { App, Tags } from "aws-cdk-lib";
import { ApplicationStack } from "./application-stack.js";
import type { DeploymentConfig } from "./config.js";
import { DataStack } from "./data-stack.js";
import { EdgeStack } from "./edge-stack.js";
import { FoundationStack } from "./foundation-stack.js";
import type { ReleaseManifest } from "./release-manifest.js";

/** Creates gated stack definitions without running or deploying any resource. */
export function createFocDemoApp(
  config: DeploymentConfig,
  releaseManifest?: ReleaseManifest,
  phase: "foundation" | "release" = "release",
): App {
  const app = new App();
  const foundation = new FoundationStack(app, "FoCDemoFoundation", {
    stackName: "foc-demo-foundation",
    description: "FoC demo network, registry, and ECS foundation resources",
    env: { account: config.accountId, region: config.primaryRegion },
    retainedImageCount: config.registry.retainedImageCount,
  });
  const tags = {
    Project: "FoC",
    Environment: "demo",
    ManagedBy: "CDK",
    Owner: config.owner,
    Issue: "44",
  } as const;
  for (const [key, value] of Object.entries(tags)) {
    Tags.of(foundation).add(key, value);
  }
  if (phase === "foundation") return app;
  if (releaseManifest === undefined) {
    throw new Error(
      "A release manifest is required for Data, Application, and Edge",
    );
  }
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
  const application = new ApplicationStack(app, "FoCDemoApplication", {
    stackName: "foc-demo-application",
    description:
      "FoC demo frontend, User, and Supplier ECS application resources",
    env: { account: config.accountId, region: config.primaryRegion },
    crossRegionReferences: true,
    config,
    releaseManifest,
    vpc: foundation.vpc,
    cluster: foundation.cluster,
    serviceConnectNamespace: foundation.serviceConnectNamespace,
    frontendRepository: foundation.frontendRepository,
    userServiceRepository: foundation.userServiceRepository,
    supplierServiceRepository: foundation.supplierServiceRepository,
    database: data.database,
    databaseSecurityGroup: data.databaseSecurityGroup,
    userRuntimeSecret: data.userRuntimeSecret,
    supplierRuntimeSecret: data.supplierRuntimeSecret,
    jwtSecret: data.jwtSecret,
    auditHmacSecret: data.auditHmacSecret,
    bootstrapAdministratorPasswordSecret:
      data.bootstrapAdministratorPasswordSecret,
  });
  // This is a resource boundary only: it guarantees job definitions exist but
  // intentionally cannot execute them. The release controller in issue #51
  // must run and verify the canonical jobs before deploying Application.
  application.addStackDependency(data);

  const edge = new EdgeStack(app, "FoCDemoEdge", {
    stackName: "foc-demo-edge",
    description: "FoC demo CloudFront VPC origin and WAF edge resources",
    env: { account: config.accountId, region: config.edgeRegion },
    crossRegionReferences: true,
    config,
    internalLoadBalancer: application.internalLoadBalancer,
  });
  edge.addStackDependency(
    application,
    "CloudFront VPC origin requires the fully deployed Singapore internal ALB",
  );

  for (const [key, value] of Object.entries(tags)) {
    Tags.of(data).add(key, value);
    Tags.of(application).add(key, value);
    Tags.of(edge).add(key, value);
  }
  return app;
}
