import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import type * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type { Construct } from "constructs";
import type { DeploymentConfig } from "./config.js";

const API_ORIGIN_REQUEST_HEADERS = [
  "Content-Type",
  "Origin",
  "Accept",
  "If-Match",
] as const;

const INTERNAL_PATHS = [
  "/healthz",
  "/health",
  "/auth/verify",
  "/api/docs",
  "/api/docs-json",
] as const;

const EXCLUDED_SERVICE_PATHS = [
  "/api/v1/errands",
  "/api/v1/admin/errands",
  "/api/v1/credits",
  "/api/v1/admin/credits",
] as const;

const AUTHENTICATION_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/register",
] as const;

function uriPathMatch(
  path: string,
  positionalConstraint: "EXACTLY" | "STARTS_WITH",
): wafv2.CfnWebACL.StatementProperty {
  return {
    byteMatchStatement: {
      fieldToMatch: { uriPath: {} },
      positionalConstraint,
      searchString: path,
      textTransformations: [{ priority: 0, type: "NONE" }],
    },
  };
}

function protectedPath(path: string): wafv2.CfnWebACL.StatementProperty {
  return {
    orStatement: {
      statements: [
        uriPathMatch(path, "EXACTLY"),
        uriPathMatch(`${path}/`, "STARTS_WITH"),
      ],
    },
  };
}

function visibilityConfig(
  metricName: string,
): wafv2.CfnWebACL.VisibilityConfigProperty {
  return {
    cloudWatchMetricsEnabled: true,
    metricName,
    sampledRequestsEnabled: true,
  };
}

export interface EdgeStackProps extends StackProps {
  readonly config: DeploymentConfig;
  readonly internalLoadBalancer: elbv2.IApplicationLoadBalancer;
}

/**
 * Global browser entry point for the temporary demo environment. The stack is
 * intentionally in us-east-1 because a CloudFront-scope WAF must be created
 * there. Its VPC origin remains the Singapore internal ALB.
 */
export class EdgeStack extends Stack {
  public readonly distribution: cloudfront.IDistribution;
  public readonly webAcl: wafv2.CfnWebACL;

  public constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    this.webAcl = this.createWebAcl(props.config);

    // CloudFront forbids allowlisting Authorization in an origin-request
    // policy. A zero-TTL cache policy is therefore the narrow supported way
    // to forward it without enabling shared API caching.
    const apiCachePolicy = new cloudfront.CachePolicy(this, "ApiCachePolicy", {
      cachePolicyName: "foc-demo-api-no-cache",
      comment: "Disable API caching while forwarding Authorization",
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      defaultTtl: Duration.seconds(0),
      enableAcceptEncodingBrotli: false,
      enableAcceptEncodingGzip: false,
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Authorization"),
      maxTtl: Duration.seconds(0),
      minTtl: Duration.seconds(0),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
    });

    const apiOriginRequestPolicy = new cloudfront.OriginRequestPolicy(
      this,
      "ApiOriginRequestPolicy",
      {
        comment:
          "Forward only FoC identity, content, CORS, and optimistic-concurrency headers",
        cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
        headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
          ...API_ORIGIN_REQUEST_HEADERS,
        ),
        originRequestPolicyName: "foc-demo-api-forwarding",
        queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      },
    );

    const origin = origins.VpcOrigin.withApplicationLoadBalancer(
      props.internalLoadBalancer,
      {
        httpPort: 80,
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        vpcOriginName: "foc-demo-internal-alb",
      },
    );

    const viewerProtocolPolicy =
      cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS;
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "FoC demo generated HTTPS entry point",
      defaultBehavior: {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        compress: true,
        origin,
        viewerProtocolPolicy,
      },
      additionalBehaviors: {
        "/api/*": {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCachePolicy,
          // Compression can weaken a strong origin ETag, making Supplier
          // If-Match preconditions invalid for later mutations.
          compress: false,
          origin,
          originRequestPolicy: apiOriginRequestPolicy,
          viewerProtocolPolicy,
        },
        "/assets/*": {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          origin,
          viewerProtocolPolicy,
        },
      },
      defaultRootObject: "index.html",
      webAclId: this.webAcl.attrArn,
    });

    new CfnOutput(this, "CloudFrontUrl", {
      description: "Generated HTTPS entry point for the FoC demo",
      value: `https://${this.distribution.distributionDomainName}`,
    });
    new CfnOutput(this, "DistributionDomainName", {
      value: this.distribution.distributionDomainName,
    });
    new CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId,
    });
    new CfnOutput(this, "WebAclArn", { value: this.webAcl.attrArn });
  }

  private createWebAcl(config: DeploymentConfig): wafv2.CfnWebACL {
    const rateLimitResponse: wafv2.CfnWebACL.RuleActionProperty = {
      block: {
        customResponse: {
          customResponseBodyKey: "rateLimited",
          responseCode: 429,
        },
      },
    };

    return new wafv2.CfnWebACL(this, "WebAcl", {
      customResponseBodies: {
        notFound: {
          content: JSON.stringify({
            error: "NOT_FOUND",
            message: "No such endpoint",
          }),
          contentType: "APPLICATION_JSON",
        },
        rateLimited: {
          content: JSON.stringify({
            error: "RATE_LIMITED",
            message: "Too many requests",
          }),
          contentType: "APPLICATION_JSON",
        },
      },
      // Sampled WAF requests are useful while managed rules remain count-only,
      // but stored request evidence must never retain bearer credentials.
      dataProtectionConfig: {
        dataProtections: [
          {
            action: "SUBSTITUTION",
            field: {
              fieldKeys: ["authorization"],
              fieldType: "SINGLE_HEADER",
            },
          },
        ],
      },
      defaultAction: { allow: {} },
      description:
        "FoC demo public-surface guard, rate limits, and monitored common protections",
      name: "foc-demo-edge",
      rules: [
        {
          action: {
            block: {
              customResponse: {
                customResponseBodyKey: "notFound",
                responseCode: 404,
              },
            },
          },
          name: "DenyInternalAndExcludedServicePaths",
          priority: 0,
          statement: {
            orStatement: {
              statements: [...INTERNAL_PATHS, ...EXCLUDED_SERVICE_PATHS].map(
                protectedPath,
              ),
            },
          },
          visibilityConfig: visibilityConfig(
            "foc-demo-denied-internal-service-paths",
          ),
        },
        {
          action: rateLimitResponse,
          name: "AuthenticationRateLimit",
          priority: 1,
          statement: {
            rateBasedStatement: {
              aggregateKeyType: "IP",
              evaluationWindowSec:
                config.waf.authentication.evaluationWindowSeconds,
              limit: config.waf.authentication.requestsPerEvaluationWindow,
              scopeDownStatement: {
                orStatement: {
                  statements: AUTHENTICATION_PATHS.map((path) =>
                    uriPathMatch(path, "EXACTLY"),
                  ),
                },
              },
            },
          },
          visibilityConfig: visibilityConfig(
            "foc-demo-authentication-rate-limit",
          ),
        },
        {
          action: rateLimitResponse,
          name: "GlobalRateLimit",
          priority: 2,
          statement: {
            rateBasedStatement: {
              aggregateKeyType: "IP",
              evaluationWindowSec: config.waf.global.evaluationWindowSeconds,
              limit: config.waf.global.requestsPerEvaluationWindow,
            },
          },
          visibilityConfig: visibilityConfig("foc-demo-global-rate-limit"),
        },
        {
          name: "AwsManagedCommonProtections",
          overrideAction: { count: {} },
          priority: 3,
          statement: {
            managedRuleGroupStatement: {
              name: "AWSManagedRulesCommonRuleSet",
              vendorName: "AWS",
            },
          },
          visibilityConfig: visibilityConfig(
            "foc-demo-managed-common-protections",
          ),
        },
      ],
      scope: "CLOUDFRONT",
      visibilityConfig: visibilityConfig("foc-demo-edge-web-acl"),
    });
  }
}
