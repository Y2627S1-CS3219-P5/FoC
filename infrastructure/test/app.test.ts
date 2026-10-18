import assert from "node:assert/strict";
import { test } from "node:test";
import { Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { createFocDemoApp } from "../lib/app.js";
import { validConfig } from "./fixtures.js";

function synthesizedTemplate(): {
  readonly stack: Stack;
  readonly template: Template;
} {
  const app = createFocDemoApp(validConfig());
  const stack = app.node.findChild("FoCDemoFoundation");
  assert.ok(stack instanceof Stack);
  return { stack, template: Template.fromStack(stack) };
}

test("synthesizes the regional Foundation stack", () => {
  const { stack, template } = synthesizedTemplate();
  assert.equal(stack.stackName, "foc-demo-foundation");
  assert.equal(stack.account, "656253649128");
  assert.equal(stack.region, "ap-southeast-1");
  template.resourceCountIs("AWS::EC2::VPC", 1);
  template.resourceCountIs("AWS::ECS::Cluster", 1);
  template.resourceCountIs("AWS::ServiceDiscovery::PrivateDnsNamespace", 1);
  template.resourceCountIs("AWS::ECR::Repository", 3);
});

test("creates two-AZ public task and isolated ALB/RDS subnet groups without NAT or endpoints", () => {
  const { template } = synthesizedTemplate();
  template.resourceCountIs("AWS::EC2::Subnet", 6);
  template.resourcePropertiesCountIs(
    "AWS::EC2::Subnet",
    {
      MapPublicIpOnLaunch: true,
      Tags: Match.arrayWith([
        { Key: "aws-cdk:subnet-name", Value: "public-tasks" },
        { Key: "aws-cdk:subnet-type", Value: "Public" },
      ]),
    },
    2,
  );
  template.resourcePropertiesCountIs(
    "AWS::EC2::Subnet",
    {
      MapPublicIpOnLaunch: false,
      Tags: Match.arrayWith([
        { Key: "aws-cdk:subnet-name", Value: "isolated-alb" },
        { Key: "aws-cdk:subnet-type", Value: "Isolated" },
      ]),
    },
    2,
  );
  template.resourcePropertiesCountIs(
    "AWS::EC2::Subnet",
    {
      MapPublicIpOnLaunch: false,
      Tags: Match.arrayWith([
        { Key: "aws-cdk:subnet-name", Value: "isolated-rds" },
        { Key: "aws-cdk:subnet-type", Value: "Isolated" },
      ]),
    },
    2,
  );
  template.resourceCountIs("AWS::EC2::InternetGateway", 1);
  template.resourceCountIs("AWS::EC2::NatGateway", 0);
  template.resourceCountIs("AWS::EC2::VPCEndpoint", 0);
  template.resourceCountIs("Custom::VpcRestrictDefaultSG", 1);
  template.resourcePropertiesCountIs(
    "AWS::EC2::Route",
    { GatewayId: Match.anyValue() },
    2,
  );
});

test("configures the private Service Connect namespace on the ECS cluster", () => {
  const { template } = synthesizedTemplate();
  template.hasResourceProperties("AWS::ServiceDiscovery::PrivateDnsNamespace", {
    Name: "foc-demo.local",
    Vpc: Match.anyValue(),
  });
  template.hasResourceProperties("AWS::ECS::Cluster", {
    ClusterName: "foc-demo-cluster",
    ClusterSettings: [{ Name: "containerInsights", Value: "disabled" }],
    ServiceConnectDefaults: {
      Namespace: Match.anyValue(),
    },
  });
});

test("creates only the three disposable immutable and scanned component repositories", () => {
  const { template } = synthesizedTemplate();
  template.resourceCountIs("AWS::ECR::Repository", 3);
  for (const repositoryName of [
    "foc-demo-frontend",
    "foc-demo-user-service",
    "foc-demo-supplier-service",
  ]) {
    template.hasResourceProperties("AWS::ECR::Repository", {
      EmptyOnDelete: true,
      EncryptionConfiguration: { EncryptionType: "AES256" },
      ImageScanningConfiguration: { ScanOnPush: true },
      ImageTagMutability: "IMMUTABLE",
      LifecyclePolicy: {
        LifecyclePolicyText: Match.stringLikeRegexp(
          '"tagStatus":"any".*"countNumber":10.*"type":"expire"',
        ),
      },
      RepositoryName: repositoryName,
    });
  }
  template.allResources("AWS::ECR::Repository", {
    DeletionPolicy: "Delete",
    UpdateReplacePolicy: "Delete",
  });
  assert.doesNotMatch(JSON.stringify(template.toJSON()), /order|credit/i);
});

test("applies the common resource tags and publishes dependent-stack outputs", () => {
  const { template } = synthesizedTemplate();
  for (const type of [
    "AWS::EC2::VPC",
    "AWS::EC2::Subnet",
    "AWS::EC2::RouteTable",
    "AWS::EC2::InternetGateway",
    "AWS::ECS::Cluster",
    "AWS::ServiceDiscovery::PrivateDnsNamespace",
    "AWS::ECR::Repository",
  ]) {
    template.allResourcesProperties(type, {
      Tags: Match.arrayWith([
        { Key: "Environment", Value: "demo" },
        { Key: "Issue", Value: "44" },
        { Key: "ManagedBy", Value: "CDK" },
        { Key: "Owner", Value: "course-team-owner" },
        { Key: "Project", Value: "FoC" },
      ]),
    });
  }
  template.hasOutput("VpcId", {});
  template.hasOutput("PublicTaskSubnetIds", {});
  template.hasOutput("IsolatedAlbSubnetIds", {});
  template.hasOutput("IsolatedRdsSubnetIds", {});
  template.hasOutput("ClusterName", {});
  template.hasOutput("ClusterArn", {});
  template.hasOutput("ServiceConnectNamespaceName", {});
  template.hasOutput("ServiceConnectNamespaceId", {});
  template.hasOutput("ServiceConnectNamespaceArn", {});
  for (const component of ["Frontend", "UserService", "SupplierService"]) {
    template.hasOutput(`${component}RepositoryName`, {});
    template.hasOutput(`${component}RepositoryArn`, {});
    template.hasOutput(`${component}RepositoryUri`, {});
  }
});
