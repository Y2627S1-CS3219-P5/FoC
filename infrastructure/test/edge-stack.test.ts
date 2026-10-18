import assert from "node:assert/strict";
import { test } from "node:test";
import { Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { createFocDemoApp } from "../lib/app.js";
import { validConfig, validReleaseManifest } from "./fixtures.js";

type Resource = {
  readonly Type: string;
  readonly Properties: Record<string, unknown>;
};

function synthesizedEdge(): {
  readonly applicationStack: Stack;
  readonly applicationTemplate: Template;
  readonly edgeStack: Stack;
  readonly edgeTemplate: Template;
} {
  const app = createFocDemoApp(validConfig(), validReleaseManifest());
  const applicationStack = app.node.findChild("FoCDemoApplication");
  const edgeStack = app.node.findChild("FoCDemoEdge");
  assert.ok(applicationStack instanceof Stack);
  assert.ok(edgeStack instanceof Stack);
  return {
    applicationStack,
    applicationTemplate: Template.fromStack(applicationStack),
    edgeStack,
    edgeTemplate: Template.fromStack(edgeStack),
  };
}

function onlyResource(template: Template, type: string): Resource {
  const resources = Object.values(template.findResources(type)) as Resource[];
  assert.equal(resources.length, 1, `expected one ${type}`);
  const resource = resources[0];
  assert.ok(resource);
  return resource;
}

function rule(webAcl: Resource, name: string): Record<string, unknown> {
  const rules = webAcl.Properties.Rules as Record<string, unknown>[];
  const found = rules.find((candidate) => candidate.Name === name);
  assert.ok(found, `expected WAF rule ${name}`);
  return found;
}

function searchStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(searchStrings);
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      key === "SearchString" && typeof child === "string"
        ? [child]
        : searchStrings(child),
    );
  }
  return [];
}

test("creates an explicit cross-region Edge dependency without copied ALB identifiers", () => {
  const { applicationStack, applicationTemplate, edgeStack, edgeTemplate } =
    synthesizedEdge();
  assert.equal(applicationStack.region, "ap-southeast-1");
  assert.equal(edgeStack.region, "us-east-1");
  assert.equal(applicationStack._crossRegionReferences, true);
  assert.equal(edgeStack._crossRegionReferences, true);
  assert.ok(edgeStack.dependencies.includes(applicationStack));

  applicationTemplate.resourceCountIs("Custom::CrossRegionExportWriter", 1);
  edgeTemplate.resourceCountIs("Custom::CrossRegionExportReader", 1);
  applicationTemplate.hasResourceProperties("Custom::CrossRegionExportWriter", {
    WriterProps: Match.objectLike({ region: "us-east-1" }),
  });
  edgeTemplate.hasResourceProperties("Custom::CrossRegionExportReader", {
    ReaderProps: Match.objectLike({
      prefix: "foc-demo-edge",
      region: "us-east-1",
    }),
  });

  const vpcOrigin = onlyResource(edgeTemplate, "AWS::CloudFront::VpcOrigin");
  const endpoint = vpcOrigin.Properties.VpcOriginEndpointConfig as Record<
    string,
    unknown
  >;
  const endpointArn = endpoint.Arn as {
    readonly "Fn::GetAtt": readonly [string, string];
  };
  assert.match(endpointArn["Fn::GetAtt"][0], /^ExportsReader/);
  assert.match(
    endpointArn["Fn::GetAtt"][1],
    /^\/cdk\/exports\/foc-demo-edge\//,
  );
  assert.doesNotMatch(JSON.stringify(endpoint), /arn:aws:elasticloadbalancing/);
});

test("uses a private Singapore ALB VPC origin over HTTP only", () => {
  const { edgeTemplate } = synthesizedEdge();
  edgeTemplate.hasResourceProperties("AWS::CloudFront::VpcOrigin", {
    VpcOriginEndpointConfig: {
      Arn: Match.objectLike({ "Fn::GetAtt": Match.anyValue() }),
      HTTPPort: 80,
      Name: "foc-demo-internal-alb",
      OriginProtocolPolicy: "http-only",
      OriginSSLProtocols: ["TLSv1.2"],
    },
  });
  const distribution = onlyResource(
    edgeTemplate,
    "AWS::CloudFront::Distribution",
  );
  const config = distribution.Properties.DistributionConfig as Record<
    string,
    unknown
  >;
  const origins = config.Origins as Record<string, unknown>[];
  assert.equal(origins.length, 1);
  assert.ok(origins[0]?.VpcOriginConfig);
  assert.equal(origins[0]?.CustomOriginConfig, undefined);
  assert.equal(origins[0]?.S3OriginConfig, undefined);
});

test("uses the generated HTTPS hostname and redirects every behavior", () => {
  const { edgeTemplate } = synthesizedEdge();
  const distribution = onlyResource(
    edgeTemplate,
    "AWS::CloudFront::Distribution",
  );
  const config = distribution.Properties.DistributionConfig as Record<
    string,
    unknown
  >;
  assert.equal(config.DefaultRootObject, "index.html");
  assert.equal(config.Aliases, undefined);
  assert.equal(config.ViewerCertificate, undefined);
  const defaultBehavior = config.DefaultCacheBehavior as Record<
    string,
    unknown
  >;
  const behaviors = config.CacheBehaviors as Record<string, unknown>[];
  assert.equal(defaultBehavior.ViewerProtocolPolicy, "redirect-to-https");
  assert.ok(
    behaviors.every(
      (behavior) => behavior.ViewerProtocolPolicy === "redirect-to-https",
    ),
  );

  edgeTemplate.hasOutput("CloudFrontUrl", {
    Value: Match.objectLike({ "Fn::Join": Match.anyValue() }),
  });
  const outputs = edgeTemplate.toJSON().Outputs as Record<string, unknown>;
  assert.deepEqual(Object.keys(outputs).sort(), [
    "CloudFrontUrl",
    "DistributionDomainName",
    "DistributionId",
    "WebAclArn",
  ]);
  assert.doesNotMatch(JSON.stringify(outputs), /alb|loadbalancer/i);
});

test("forwards the exact API contract with zero caching and no compression", () => {
  const { edgeTemplate } = synthesizedEdge();
  edgeTemplate.hasResourceProperties("AWS::CloudFront::CachePolicy", {
    CachePolicyConfig: {
      DefaultTTL: 0,
      MaxTTL: 0,
      MinTTL: 0,
      Name: "foc-demo-api-no-cache",
      ParametersInCacheKeyAndForwardedToOrigin: {
        CookiesConfig: { CookieBehavior: "none" },
        EnableAcceptEncodingBrotli: false,
        EnableAcceptEncodingGzip: false,
        HeadersConfig: {
          HeaderBehavior: "whitelist",
          Headers: ["Authorization"],
        },
        QueryStringsConfig: { QueryStringBehavior: "none" },
      },
    },
  });
  edgeTemplate.hasResourceProperties("AWS::CloudFront::OriginRequestPolicy", {
    OriginRequestPolicyConfig: {
      CookiesConfig: { CookieBehavior: "none" },
      HeadersConfig: {
        HeaderBehavior: "whitelist",
        Headers: ["Content-Type", "Origin", "Accept", "If-Match"],
      },
      Name: "foc-demo-api-forwarding",
      QueryStringsConfig: { QueryStringBehavior: "all" },
    },
  });

  const distribution = onlyResource(
    edgeTemplate,
    "AWS::CloudFront::Distribution",
  );
  const config = distribution.Properties.DistributionConfig as Record<
    string,
    unknown
  >;
  const behaviors = config.CacheBehaviors as Record<string, unknown>[];
  const api = behaviors.find((behavior) => behavior.PathPattern === "/api/*");
  assert.ok(api);
  assert.deepEqual(api.AllowedMethods, [
    "GET",
    "HEAD",
    "OPTIONS",
    "PUT",
    "PATCH",
    "POST",
    "DELETE",
  ]);
  assert.equal(api.Compress, false);
  assert.ok(api.CachePolicyId);
  assert.ok(api.OriginRequestPolicyId);
  assert.equal(api.ResponseHeadersPolicyId, undefined);

  const cachePolicy = onlyResource(
    edgeTemplate,
    "AWS::CloudFront::CachePolicy",
  );
  const cacheConfig = cachePolicy.Properties.CachePolicyConfig as {
    readonly ParametersInCacheKeyAndForwardedToOrigin: {
      readonly HeadersConfig: { readonly Headers: readonly string[] };
    };
  };
  const originPolicy = onlyResource(
    edgeTemplate,
    "AWS::CloudFront::OriginRequestPolicy",
  );
  const originConfig = originPolicy.Properties.OriginRequestPolicyConfig as {
    readonly HeadersConfig: { readonly Headers: readonly string[] };
  };
  assert.deepEqual(
    new Set([
      ...cacheConfig.ParametersInCacheKeyAndForwardedToOrigin.HeadersConfig
        .Headers,
      ...originConfig.HeadersConfig.Headers,
    ]),
    new Set(["Authorization", "Content-Type", "Origin", "Accept", "If-Match"]),
  );
});

test("caches immutable assets while leaving SPA routes uncached", () => {
  const { edgeTemplate } = synthesizedEdge();
  const distribution = onlyResource(
    edgeTemplate,
    "AWS::CloudFront::Distribution",
  );
  const config = distribution.Properties.DistributionConfig as Record<
    string,
    unknown
  >;
  const behaviors = config.CacheBehaviors as Record<string, unknown>[];
  const assets = behaviors.find(
    (behavior) => behavior.PathPattern === "/assets/*",
  );
  assert.ok(assets);
  assert.equal(assets.CachePolicyId, "658327ea-f89d-4fab-a63d-7e88639e58f6");
  assert.equal(assets.Compress, true);
  assert.deepEqual(assets.AllowedMethods, ["GET", "HEAD", "OPTIONS"]);

  const defaultBehavior = config.DefaultCacheBehavior as Record<
    string,
    unknown
  >;
  assert.equal(
    defaultBehavior.CachePolicyId,
    "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
  );
  assert.equal(defaultBehavior.Compress, true);
  assert.deepEqual(defaultBehavior.AllowedMethods, ["GET", "HEAD", "OPTIONS"]);
});

test("attaches the CloudFront-scope WAF and denies internal and excluded routes", () => {
  const { edgeTemplate } = synthesizedEdge();
  const webAcl = onlyResource(edgeTemplate, "AWS::WAFv2::WebACL");
  assert.equal(webAcl.Properties.Scope, "CLOUDFRONT");
  assert.deepEqual(webAcl.Properties.DefaultAction, { Allow: {} });

  const denied = rule(webAcl, "DenyInternalAndExcludedServicePaths");
  assert.equal(denied.Priority, 0);
  assert.deepEqual(denied.Action, {
    Block: {
      CustomResponse: {
        CustomResponseBodyKey: "notFound",
        ResponseCode: 404,
      },
    },
  });
  const paths = new Set(searchStrings(denied.Statement));
  for (const path of [
    "/healthz",
    "/health",
    "/auth/verify",
    "/api/docs",
    "/api/docs-json",
    "/api/v1/errands",
    "/api/v1/admin/errands",
    "/api/v1/credits",
    "/api/v1/admin/credits",
  ]) {
    assert.ok(paths.has(path), `missing public denial for ${path}`);
    assert.ok(paths.has(`${path}/`), `missing child-path denial for ${path}`);
  }

  const distribution = onlyResource(
    edgeTemplate,
    "AWS::CloudFront::Distribution",
  );
  const config = distribution.Properties.DistributionConfig as Record<
    string,
    unknown
  >;
  assert.deepEqual(config.WebACLId, {
    "Fn::GetAtt": ["WebAcl", "Arn"],
  });
});

test("applies reviewed authentication and global rate rules with controlled 429s", () => {
  const { edgeTemplate } = synthesizedEdge();
  const webAcl = onlyResource(edgeTemplate, "AWS::WAFv2::WebACL");
  const auth = rule(webAcl, "AuthenticationRateLimit");
  const global = rule(webAcl, "GlobalRateLimit");
  assert.equal(auth.Priority, 1);
  assert.equal(global.Priority, 2);
  assert.deepEqual(auth.Action, global.Action);
  assert.deepEqual(auth.Action, {
    Block: {
      CustomResponse: {
        CustomResponseBodyKey: "rateLimited",
        ResponseCode: 429,
      },
    },
  });

  const authStatement = auth.Statement as {
    readonly RateBasedStatement: Record<string, unknown>;
  };
  const globalStatement = global.Statement as {
    readonly RateBasedStatement: Record<string, unknown>;
  };
  assert.equal(authStatement.RateBasedStatement.Limit, 200);
  assert.equal(authStatement.RateBasedStatement.EvaluationWindowSec, 300);
  assert.deepEqual(
    new Set(searchStrings(authStatement)),
    new Set(["/api/v1/auth/login", "/api/v1/auth/register"]),
  );
  assert.equal(globalStatement.RateBasedStatement.Limit, 2000);
  assert.equal(globalStatement.RateBasedStatement.EvaluationWindowSec, 300);
  assert.equal(
    globalStatement.RateBasedStatement.ScopeDownStatement,
    undefined,
  );

  const bodies = webAcl.Properties.CustomResponseBodies as Record<
    string,
    unknown
  >;
  assert.match(JSON.stringify(bodies.rateLimited), /RATE_LIMITED/);
});

test("keeps common managed protections in monitored count-only mode", () => {
  const { edgeTemplate } = synthesizedEdge();
  const webAcl = onlyResource(edgeTemplate, "AWS::WAFv2::WebACL");
  const managed = rule(webAcl, "AwsManagedCommonProtections");
  assert.equal(managed.Priority, 3);
  assert.deepEqual(managed.OverrideAction, { Count: {} });
  assert.deepEqual(managed.Statement, {
    ManagedRuleGroupStatement: {
      Name: "AWSManagedRulesCommonRuleSet",
      VendorName: "AWS",
    },
  });

  const metrics = (webAcl.Properties.Rules as Record<string, unknown>[]).map(
    (candidate) =>
      (candidate.VisibilityConfig as Record<string, unknown>).MetricName,
  );
  assert.equal(new Set(metrics).size, metrics.length);
  assert.ok(
    (webAcl.Properties.Rules as Record<string, unknown>[]).every(
      (candidate) => {
        const visibility = candidate.VisibilityConfig as Record<
          string,
          unknown
        >;
        return (
          visibility.CloudWatchMetricsEnabled === true &&
          visibility.SampledRequestsEnabled === true
        );
      },
    ),
  );
  assert.deepEqual(webAcl.Properties.DataProtectionConfig, {
    DataProtections: [
      {
        Action: "SUBSTITUTION",
        Field: {
          FieldKeys: ["authorization"],
          FieldType: "SINGLE_HEADER",
        },
      },
    ],
  });
});

test("bounds synthesized cross-region IAM to CDK export parameters", () => {
  const { applicationTemplate, edgeTemplate } = synthesizedEdge();
  for (const [template, customType, bootstrapRegion, actions] of [
    [
      applicationTemplate,
      "Custom::CrossRegionExportWriter",
      "ap-southeast-1",
      [
        "ssm:DeleteParameters",
        "ssm:ListTagsForResource",
        "ssm:GetParameters",
        "ssm:PutParameter",
      ],
    ],
    [
      edgeTemplate,
      "Custom::CrossRegionExportReader",
      "us-east-1",
      [
        "ssm:AddTagsToResource",
        "ssm:RemoveTagsFromResource",
        "ssm:GetParameters",
      ],
    ],
  ] as const) {
    template.resourceCountIs(customType, 1);
    const providerKind = customType.endsWith("Writer")
      ? "CrossRegionExportWriter"
      : "CrossRegionExportReader";
    const functions = template.findResources("AWS::Lambda::Function") as Record<
      string,
      Resource
    >;
    const providerFunction = Object.entries(functions).find(([logicalId]) =>
      logicalId.includes(providerKind),
    );
    assert.ok(providerFunction);
    const code = providerFunction[1].Properties.Code as Record<string, unknown>;
    assert.equal(
      code.S3Bucket,
      `cdk-hnb659fds-assets-656253649128-${bootstrapRegion}`,
    );
    assert.match(String(code.S3Key), /^[a-f0-9]{64}\.zip$/);
    const roles = template.findResources("AWS::IAM::Role") as Record<
      string,
      Resource
    >;
    const providerRole = Object.entries(roles).find(([logicalId]) =>
      logicalId.includes(providerKind),
    );
    assert.ok(providerRole);
    const policies = providerRole[1].Properties.Policies as {
      readonly PolicyDocument: {
        readonly Statement: readonly {
          readonly Action: readonly string[];
          readonly Resource: unknown;
        }[];
      };
    }[];
    assert.equal(policies.length, 1);
    const statement = policies[0]?.PolicyDocument.Statement[0];
    assert.ok(statement);
    assert.deepEqual(statement.Action, actions);
    assert.doesNotMatch(JSON.stringify(statement.Resource), /^"\*"$/);
    assert.match(JSON.stringify(statement.Resource), /ssm:us-east-1/);
    assert.match(JSON.stringify(statement.Resource), /cdk\/exports/);
  }
});

test("applies the approved common tags to taggable Edge resources", () => {
  const { edgeTemplate } = synthesizedEdge();
  for (const type of [
    "AWS::CloudFront::VpcOrigin",
    "AWS::CloudFront::Distribution",
    "AWS::WAFv2::WebACL",
  ]) {
    edgeTemplate.allResourcesProperties(type, {
      Tags: Match.arrayWith([
        { Key: "Environment", Value: "demo" },
        { Key: "Issue", Value: "44" },
        { Key: "ManagedBy", Value: "CDK" },
        { Key: "Owner", Value: "course-team-owner" },
        { Key: "Project", Value: "FoC" },
      ]),
    });
  }
});

test("contains no plaintext secrets or public application ingress", () => {
  const { edgeTemplate } = synthesizedEdge();
  const rendered = JSON.stringify(edgeTemplate.toJSON());
  assert.doesNotMatch(rendered, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(rendered, /password|jwt_secret|audit_hmac_key/i);
  assert.doesNotMatch(rendered, /0\.0\.0\.0\/0/);
  edgeTemplate.resourceCountIs("AWS::EC2::SecurityGroupIngress", 0);
  edgeTemplate.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
});
