// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { createFocDemoApp } from "../lib/app.js";
import { validConfig, validReleaseManifest } from "./fixtures.js";

function synthesizedApplication(): {
  readonly stack: Stack;
  readonly template: Template;
} {
  const app = createFocDemoApp(validConfig(), validReleaseManifest());
  const stack = app.node.findChild("FoCDemoApplication");
  assert.ok(stack instanceof Stack);
  return { stack, template: Template.fromStack(stack) };
}

test("creates exactly the approved three immutable x86-64 services", () => {
  const { stack, template } = synthesizedApplication();
  assert.equal(stack.stackName, "foc-demo-application");
  assert.equal(stack.region, "ap-southeast-1");
  template.resourceCountIs("AWS::ECS::TaskDefinition", 3);
  template.resourceCountIs("AWS::ECS::Service", 3);

  for (const [family, digest] of [
    ["foc-demo-frontend", "a"],
    ["foc-demo-user-service", "b"],
    ["foc-demo-supplier-service", "c"],
  ] as const) {
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      Family: family,
      NetworkMode: "awsvpc",
      RequiresCompatibilities: ["FARGATE"],
      RuntimePlatform: {
        CpuArchitecture: "X86_64",
        OperatingSystemFamily: "LINUX",
      },
    });
    assert.match(
      JSON.stringify(template.toJSON()),
      new RegExp(`@sha256:${digest.repeat(64)}`),
    );
  }
  const rendered = JSON.stringify(template.toJSON());
  assert.doesNotMatch(rendered, /:latest/);
  assert.doesNotMatch(rendered, /order-service|credit-service|errands/i);
});

test("injects only runtime settings and secret references", () => {
  const { template } = synthesizedApplication();
  const tasks = Object.values(
    template.findResources("AWS::ECS::TaskDefinition"),
  ) as {
    readonly Properties: {
      readonly Family: string;
      readonly ContainerDefinitions: readonly {
        readonly Environment: readonly {
          readonly Name: string;
          readonly Value: unknown;
        }[];
        readonly Secrets?: readonly { readonly Name: string }[];
      }[];
    };
  }[];
  const user = tasks.find(
    ({ Properties }) => Properties.Family === "foc-demo-user-service",
  );
  assert.ok(user);
  const userContainer = user.Properties.ContainerDefinitions[0];
  assert.ok(userContainer);
  const userEnvironment = new Map(
    userContainer.Environment.map(({ Name, Value }) => [Name, Value]),
  );
  assert.equal(
    userEnvironment.get("ACCOUNT_STATUS_PUBLISHING_ENABLED"),
    "false",
  );
  assert.equal(userEnvironment.get("CORS_ORIGINS"), "");
  assert.equal(userEnvironment.get("DATABASE_NAME"), "users");
  assert.equal(userEnvironment.get("DATABASE_USER"), "user_app");
  assert.equal(
    userEnvironment.get("DATABASE_SSL_CA_PATH"),
    "/app/certs/ap-southeast-1-bundle.pem",
  );
  assert.deepEqual(
    new Set(userContainer.Secrets?.map(({ Name }) => Name)),
    new Set([
      "AUDIT_HMAC_KEY",
      "BOOTSTRAP_ADMIN_PASSWORD",
      "DATABASE_PASSWORD",
      "JWT_SECRET",
    ]),
  );
  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    Family: "foc-demo-user-service",
    ContainerDefinitions: [
      Match.objectLike({
        PortMappings: [
          {
            AppProtocol: "http",
            ContainerPort: 3001,
            Name: "user-http",
            Protocol: "tcp",
          },
        ],
        StopTimeout: 30,
      }),
    ],
  });
  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    Family: "foc-demo-supplier-service",
    ContainerDefinitions: [
      Match.objectLike({
        Command: ["node", "dist/main.js"],
        Environment: Match.arrayWith([
          { Name: "DATABASE_NAME", Value: "supplier" },
          { Name: "DATABASE_USER", Value: "supplier_app" },
          {
            Name: "USER_SERVICE_BASE_URL",
            Value: "http://user-service:3001",
          },
        ]),
        PortMappings: [
          Match.objectLike({ ContainerPort: 3000, Name: "supplier-http" }),
        ],
      }),
    ],
  });
  const rendered = JSON.stringify(template.toJSON());
  assert.doesNotMatch(rendered, /DATABASE_URL|postgres(?:ql)?:\/\//);
  assert.doesNotMatch(rendered, /KAFKA_BROKERS/);
});

test("uses Service Connect, public task subnets, safe rolling deploys, and active scaling bounds", () => {
  const { template } = synthesizedApplication();
  for (const serviceName of [
    "foc-demo-frontend",
    "foc-demo-user-service",
    "foc-demo-supplier-service",
  ]) {
    template.hasResourceProperties("AWS::ECS::Service", {
      DeploymentConfiguration: Match.objectLike({
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
        MaximumPercent: 200,
        MinimumHealthyPercent: 100,
      }),
      DesiredCount: 1,
      EnableECSManagedTags: true,
      LaunchType: "FARGATE",
      NetworkConfiguration: {
        AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: "ENABLED" }),
      },
      PlatformVersion: "1.4.0",
      ServiceName: serviceName,
    });
  }
  template.hasResourceProperties("AWS::ECS::Service", {
    ServiceName: "foc-demo-frontend",
    ServiceConnectConfiguration: {
      Enabled: true,
      Namespace: "foc-demo.local",
    },
  });
  for (const [serviceName, dnsName, port, portName] of [
    ["foc-demo-user-service", "user-service", 3001, "user-http"],
    ["foc-demo-supplier-service", "supplier-service", 3000, "supplier-http"],
  ] as const) {
    template.hasResourceProperties("AWS::ECS::Service", {
      ServiceConnectConfiguration: {
        Enabled: true,
        Namespace: "foc-demo.local",
        Services: [
          {
            ClientAliases: [{ DnsName: dnsName, Port: port }],
            DiscoveryName: dnsName,
            PortName: portName,
          },
        ],
      },
      ServiceName: serviceName,
    });
  }
  template.resourcePropertiesCountIs(
    "AWS::ApplicationAutoScaling::ScalableTarget",
    { MaxCapacity: 2, MinCapacity: 1 },
    3,
  );
  template.resourceCountIs("AWS::ApplicationAutoScaling::ScalingPolicy", 6);
});

test("implements the exact source-security-group and prefix-list ingress matrix", () => {
  const { template } = synthesizedApplication();
  template.resourceCountIs("AWS::EC2::SecurityGroup", 4);
  template.resourceCountIs("AWS::EC2::SecurityGroupIngress", 7);
  template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
    FromPort: 80,
    IpProtocol: "tcp",
    SourcePrefixListId: Match.stringLikeRegexp("^pl-"),
    ToPort: 80,
  });
  for (const [port, count] of [
    [80, 2],
    [3000, 1],
    [3001, 2],
    [5432, 2],
  ] as const) {
    template.resourcePropertiesCountIs(
      "AWS::EC2::SecurityGroupIngress",
      { FromPort: port, IpProtocol: "tcp", ToPort: port },
      count,
    );
  }
  const ingress = template.findResources("AWS::EC2::SecurityGroupIngress");
  assert.doesNotMatch(JSON.stringify(ingress), /0\.0\.0\.0\/0/);

  const context = JSON.parse(
    readFileSync("cdk.context.json", "utf8"),
  ) as Record<string, unknown>;
  assert.match(JSON.stringify(context), /pl-31a34658/);
});

test("keeps the ALB internal and checks only frontend healthz", () => {
  const { template } = synthesizedApplication();
  template.hasResourceProperties("AWS::ElasticLoadBalancingV2::LoadBalancer", {
    Name: "foc-demo-internal",
    Scheme: "internal",
    Type: "application",
  });
  template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
    HealthCheckPath: "/healthz",
    Matcher: { HttpCode: "200" },
    Port: 80,
    Protocol: "HTTP",
    TargetType: "ip",
  });
  template.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 1);
});

test("uses separate least-privilege execution/task roles and bounded service logs", () => {
  const { template } = synthesizedApplication();
  for (const family of [
    "foc-demo-frontend",
    "foc-demo-user-service",
    "foc-demo-supplier-service",
  ]) {
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ExecutionRoleArn: Match.anyValue(),
      Family: family,
      TaskRoleArn: Match.anyValue(),
    });
  }
  const policies = template.findResources("AWS::IAM::Policy") as Record<
    string,
    {
      readonly Properties: {
        readonly Roles?: readonly { readonly Ref: string }[];
      };
    }
  >;
  for (const policy of Object.values(policies)) {
    for (const role of policy.Properties.Roles ?? []) {
      assert.doesNotMatch(role.Ref, /TaskRole/);
    }
  }
  const roles = template.findResources("AWS::IAM::Role");
  const applicationRoles = Object.entries(roles).filter(([logicalId]) =>
    /(?:Frontend|UserService|SupplierService)(?:Execution|Task)Role/.test(
      logicalId,
    ),
  );
  assert.equal(applicationRoles.length, 6);
  for (const [, role] of applicationRoles) {
    assert.match(JSON.stringify(role), /aws:SourceAccount/);
    assert.match(JSON.stringify(role), /aws:SourceArn/);
  }

  template.resourcePropertiesCountIs(
    "AWS::Logs::LogGroup",
    { RetentionInDays: 14 },
    3,
  );
  template.resourcePropertiesCountIs(
    "AWS::Logs::LogGroup",
    { LogGroupName: "/foc/demo/services/user-service", RetentionInDays: 30 },
    1,
  );
  template.allResources("AWS::Logs::LogGroup", {
    DeletionPolicy: "Delete",
    UpdateReplacePolicy: "Delete",
  });
});

test("creates stop-safe alarms, SNS email, and deployment-failure event handling", () => {
  const { template } = synthesizedApplication();
  template.resourceCountIs("AWS::CloudWatch::Alarm", 15);
  template.resourceCountIs("AWS::SNS::Topic", 1);
  template.hasResourceProperties("AWS::SNS::Subscription", {
    Endpoint: "alerts@u.nus.edu",
    Protocol: "email",
  });
  template.resourcePropertiesCountIs(
    "AWS::CloudWatch::Alarm",
    {
      ComparisonOperator: "GreaterThanOrEqualToThreshold",
      Metrics: Match.arrayWith([
        Match.objectLike({
          Expression: "IF(desired > running, desired - running, 0)",
        }),
      ]),
      Threshold: 1,
      TreatMissingData: "notBreaching",
    },
    3,
  );
  template.hasResourceProperties("AWS::Events::Rule", {
    EventPattern: {
      detail: {
        clusterArn: Match.anyValue(),
        eventName: ["SERVICE_DEPLOYMENT_FAILED"],
      },
      "detail-type": ["ECS Deployment State Change"],
      source: ["aws.ecs"],
    },
  });
  template.hasResourceProperties("AWS::Logs::MetricFilter", {
    MetricTransformations: [
      Match.objectLike({
        MetricName: "EcsDeploymentFailures",
        MetricNamespace: "FoC/Demo",
        MetricValue: "1",
      }),
    ],
  });
});

test("publishes the explicit migrations-before-services release boundary", () => {
  const { stack, template } = synthesizedApplication();
  assert.ok(
    stack.dependencies.some(
      (dependency) =>
        dependency instanceof Stack && dependency.stackName === "foc-demo-data",
    ),
  );
  template.hasOutput("RequiredDatabaseJobOrder", {
    Value: "database-bootstrap,user-migration,supplier-migration,supplier-seed",
  });
  for (const output of [
    "InternalAlbArn",
    "InternalAlbDnsName",
    "FrontendTargetGroupArn",
    "FrontendServiceName",
    "UserServiceServiceName",
    "SupplierServiceServiceName",
    "FrontendLogGroupName",
    "UserServiceLogGroupName",
    "SupplierServiceLogGroupName",
    "AlertTopicArn",
  ]) {
    template.hasOutput(output, {});
  }
});
