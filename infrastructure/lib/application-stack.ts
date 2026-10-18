// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as events from "aws-cdk-lib/aws-events";
import * as eventTargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";
import type { Construct } from "constructs";
import type { DeploymentConfig } from "./config.js";
import { DATABASE_JOB_ORDER } from "./database-jobs.js";
import type { ReleaseManifest } from "./release-manifest.js";

const FRONTEND_PORT = 80;
const USER_PORT = 3001;
const SUPPLIER_PORT = 3000;
const DATABASE_PORT = 5432;
const DATABASE_CA_PATH = "/app/certs/ap-southeast-1-bundle.pem";
const HEALTH_GRACE_PERIOD = Duration.seconds(60);
const STOP_TIMEOUT = Duration.seconds(30);
const CLOUD_FRONT_ORIGIN_PREFIX_LIST =
  "com.amazonaws.global.cloudfront.origin-facing";

type ComponentName = "frontend" | "userService" | "supplierService";

interface ServiceRuntime {
  readonly component: ComponentName;
  readonly id: "Frontend" | "UserService" | "SupplierService";
  readonly serviceName: string;
  readonly containerName: string;
  readonly portName: string;
  readonly port: number;
  readonly repository: ecr.IRepository;
  readonly imageDigest: string;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly logRetention: logs.RetentionDays;
  readonly environment?: Record<string, string>;
  readonly secrets?: Record<string, ecs.Secret>;
  readonly command?: string[];
  readonly healthCommand: string;
  readonly readonlyRootFilesystem: boolean;
  readonly serviceConnect?: ecs.ServiceConnectService;
}

type CreatedService = {
  readonly service: ecs.FargateService;
  readonly container: ecs.ContainerDefinition;
  readonly logGroup: logs.ILogGroup;
};

export interface ApplicationStackProps extends StackProps {
  readonly config: DeploymentConfig;
  readonly releaseManifest: ReleaseManifest;
  readonly vpc: ec2.IVpc;
  readonly cluster: ecs.ICluster;
  readonly serviceConnectNamespace: servicediscovery.INamespace;
  readonly frontendRepository: ecr.IRepository;
  readonly userServiceRepository: ecr.IRepository;
  readonly supplierServiceRepository: ecr.IRepository;
  readonly database: rds.IDatabaseInstance;
  readonly databaseSecurityGroup: ec2.ISecurityGroup;
  readonly userRuntimeSecret: secretsmanager.ISecret;
  readonly supplierRuntimeSecret: secretsmanager.ISecret;
  readonly jwtSecret: secretsmanager.ISecret;
  readonly auditHmacSecret: secretsmanager.ISecret;
  readonly bootstrapAdministratorPasswordSecret: secretsmanager.ISecret;
}

/**
 * Long-running application resources, deliberately separate from the Data
 * stack. Release tooling must run every DATABASE_JOB_ORDER task successfully
 * before deploying this stack; CloudFormation never runs migrations itself.
 */
export class ApplicationStack extends Stack {
  public readonly internalLoadBalancer: elbv2.IApplicationLoadBalancer;
  public readonly frontendTargetGroup: elbv2.IApplicationTargetGroup;
  public readonly frontendService: ecs.IBaseService;
  public readonly userService: ecs.IBaseService;
  public readonly supplierService: ecs.IBaseService;
  public readonly alertTopic: sns.ITopic;

  public constructor(
    scope: Construct,
    id: string,
    props: ApplicationStackProps,
  ) {
    super(scope, id, props);

    const securityGroups = this.createSecurityGroups(props);
    const databaseEnvironment = (
      databaseName: "users" | "supplier",
      databaseUser: "user_app" | "supplier_app",
    ): Record<string, string> => ({
      DATABASE_HOST: props.database.dbInstanceEndpointAddress,
      DATABASE_NAME: databaseName,
      DATABASE_PORT: props.database.dbInstanceEndpointPort,
      DATABASE_SSL_CA_PATH: DATABASE_CA_PATH,
      DATABASE_USER: databaseUser,
    });

    const user = this.createService(props, {
      component: "userService",
      id: "UserService",
      serviceName: "foc-demo-user-service",
      containerName: "user-service",
      portName: "user-http",
      port: USER_PORT,
      repository: props.userServiceRepository,
      imageDigest: props.releaseManifest.images.userService.digest,
      securityGroup: securityGroups.user,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        ...databaseEnvironment("users", "user_app"),
        ACCOUNT_STATUS_PUBLISHING_ENABLED: "false",
        ALLOWED_EMAIL_DOMAIN: "u.nus.edu",
        BOOTSTRAP_ADMIN_EMAIL: props.config.bootstrapAdministrator.email,
        BOOTSTRAP_ADMIN_USERNAME: props.config.bootstrapAdministrator.username,
        CORS_ORIGINS: "",
        JWT_ACCESS_TOKEN_TTL: "1800",
        PORT: String(USER_PORT),
      },
      secrets: {
        AUDIT_HMAC_KEY: ecs.Secret.fromSecretsManager(props.auditHmacSecret),
        BOOTSTRAP_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(
          props.bootstrapAdministratorPasswordSecret,
        ),
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
          props.userRuntimeSecret,
          "password",
        ),
        JWT_SECRET: ecs.Secret.fromSecretsManager(props.jwtSecret),
      },
      healthCommand:
        "node -e \"fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
      readonlyRootFilesystem: true,
      serviceConnect: {
        discoveryName: "user-service",
        dnsName: "user-service",
        port: USER_PORT,
        portMappingName: "user-http",
      },
    });
    this.userService = user.service;

    const supplier = this.createService(props, {
      component: "supplierService",
      id: "SupplierService",
      serviceName: "foc-demo-supplier-service",
      containerName: "supplier-service",
      portName: "supplier-http",
      port: SUPPLIER_PORT,
      repository: props.supplierServiceRepository,
      imageDigest: props.releaseManifest.images.supplierService.digest,
      securityGroup: securityGroups.supplier,
      logRetention: logs.RetentionDays.TWO_WEEKS,
      command: ["node", "dist/main.js"],
      environment: {
        ...databaseEnvironment("supplier", "supplier_app"),
        PORT: String(SUPPLIER_PORT),
        USER_SERVICE_BASE_URL: `http://user-service:${USER_PORT}`,
        USER_SERVICE_VERIFY_TIMEOUT_MS: "1000",
      },
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
          props.supplierRuntimeSecret,
          "password",
        ),
      },
      healthCommand:
        "node -e \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
      readonlyRootFilesystem: true,
      serviceConnect: {
        discoveryName: "supplier-service",
        dnsName: "supplier-service",
        port: SUPPLIER_PORT,
        portMappingName: "supplier-http",
      },
    });
    this.supplierService = supplier.service;

    const frontend = this.createService(props, {
      component: "frontend",
      id: "Frontend",
      serviceName: "foc-demo-frontend",
      containerName: "frontend",
      portName: "frontend-http",
      port: FRONTEND_PORT,
      repository: props.frontendRepository,
      imageDigest: props.releaseManifest.images.frontend.digest,
      securityGroup: securityGroups.frontend,
      logRetention: logs.RetentionDays.TWO_WEEKS,
      healthCommand:
        "wget -q -O - http://127.0.0.1/healthz >/dev/null || exit 1",
      readonlyRootFilesystem: false,
    });
    this.frontendService = frontend.service;

    supplier.service.node.addDependency(user.service);
    frontend.service.node.addDependency(user.service, supplier.service);

    const loadBalancing = this.createLoadBalancer(
      props,
      securityGroups.alb,
      frontend,
    );
    this.internalLoadBalancer = loadBalancing.loadBalancer;
    this.frontendTargetGroup = loadBalancing.targetGroup;

    this.alertTopic = this.createObservability(props, {
      frontend,
      supplier,
      user,
      targetGroup: loadBalancing.targetGroup,
      loadBalancer: loadBalancing.loadBalancer,
    });

    this.addOutputs({ frontend, supplier, user });
  }

  private createSecurityGroups(props: ApplicationStackProps): {
    readonly alb: ec2.ISecurityGroup;
    readonly frontend: ec2.ISecurityGroup;
    readonly user: ec2.ISecurityGroup;
    readonly supplier: ec2.ISecurityGroup;
  } {
    const create = (id: string, description: string): ec2.SecurityGroup =>
      new ec2.SecurityGroup(this, id, {
        allowAllOutbound: false,
        description,
        vpc: props.vpc,
      });
    const alb = create(
      "AlbSecurityGroup",
      "CloudFront to internal frontend ALB",
    );
    const frontend = create(
      "FrontendSecurityGroup",
      "Frontend gateway task traffic",
    );
    const user = create(
      "UserServiceSecurityGroup",
      "User Service task traffic",
    );
    const supplier = create(
      "SupplierServiceSecurityGroup",
      "Supplier Service task traffic",
    );

    const cloudFrontOrigins = ec2.PrefixList.fromLookup(
      this,
      "CloudFrontOriginFacingPrefixList",
      { prefixListName: CLOUD_FRONT_ORIGIN_PREFIX_LIST },
    );
    alb.addIngressRule(
      ec2.Peer.prefixList(cloudFrontOrigins.prefixListId),
      ec2.Port.tcp(FRONTEND_PORT),
      "HTTP only from the AWS-managed CloudFront origin-facing prefix list",
    );
    frontend.addIngressRule(
      alb,
      ec2.Port.tcp(FRONTEND_PORT),
      "HTTP only from the internal ALB",
    );
    user.addIngressRule(
      frontend,
      ec2.Port.tcp(USER_PORT),
      "User API from the frontend gateway",
    );
    user.addIngressRule(
      supplier,
      ec2.Port.tcp(USER_PORT),
      "Session verification from Supplier Service",
    );
    supplier.addIngressRule(
      frontend,
      ec2.Port.tcp(SUPPLIER_PORT),
      "Supplier API from the frontend gateway",
    );

    alb.addEgressRule(
      frontend,
      ec2.Port.tcp(FRONTEND_PORT),
      "Forward requests to frontend targets",
    );
    frontend.addEgressRule(
      user,
      ec2.Port.tcp(USER_PORT),
      "Forward User API requests",
    );
    frontend.addEgressRule(
      supplier,
      ec2.Port.tcp(SUPPLIER_PORT),
      "Forward Supplier API requests",
    );
    supplier.addEgressRule(
      user,
      ec2.Port.tcp(USER_PORT),
      "Verify Supplier sessions with User Service",
    );
    user.addEgressRule(
      props.databaseSecurityGroup,
      ec2.Port.tcp(DATABASE_PORT),
      "User database traffic",
    );
    supplier.addEgressRule(
      props.databaseSecurityGroup,
      ec2.Port.tcp(DATABASE_PORT),
      "Supplier database traffic",
    );

    for (const [id, taskSecurityGroup] of [
      ["Frontend", frontend],
      ["UserService", user],
      ["SupplierService", supplier],
    ] as const) {
      taskSecurityGroup.addEgressRule(
        ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
        ec2.Port.udp(53),
        "VPC DNS for Service Connect and AWS endpoints",
      );
      taskSecurityGroup.addEgressRule(
        ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
        ec2.Port.tcp(53),
        "TCP fallback for VPC DNS",
      );
      taskSecurityGroup.addEgressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(443),
        `${id} image, log, and secret control-plane access without NAT`,
      );
    }

    // Keep these rules in Application so Data never depends back on this stack.
    for (const [id, source] of [
      ["UserDatabaseIngress", user],
      ["SupplierDatabaseIngress", supplier],
    ] as const) {
      new ec2.CfnSecurityGroupIngress(this, id, {
        description: `${id.replace("DatabaseIngress", "")} runtime PostgreSQL`,
        fromPort: DATABASE_PORT,
        groupId: props.databaseSecurityGroup.securityGroupId,
        ipProtocol: "tcp",
        sourceSecurityGroupId: source.securityGroupId,
        toPort: DATABASE_PORT,
      });
    }

    return { alb, frontend, user, supplier };
  }

  private createService(
    props: ApplicationStackProps,
    runtime: ServiceRuntime,
  ): CreatedService {
    const logGroup = new logs.LogGroup(this, `${runtime.id}LogGroup`, {
      logGroupName: `/foc/demo/services/${runtime.serviceName.replace("foc-demo-", "")}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: runtime.logRetention,
    });
    const executionRole = new iam.Role(this, `${runtime.id}ExecutionRole`, {
      assumedBy: this.ecsTaskPrincipal(),
      description: `Pull, log, and secret access for ${runtime.serviceName}`,
    });
    const taskRole = new iam.Role(this, `${runtime.id}TaskRole`, {
      assumedBy: this.ecsTaskPrincipal(),
      description: `Empty application role for ${runtime.serviceName}`,
    });
    const sizing = props.config.services[runtime.component];
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      `${runtime.id}TaskDefinition`,
      {
        cpu: sizing.cpu,
        executionRole,
        family: runtime.serviceName,
        memoryLimitMiB: sizing.memoryMiB,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        taskRole,
      },
    );
    const container = taskDefinition.addContainer(`${runtime.id}Container`, {
      ...(runtime.command === undefined ? {} : { command: runtime.command }),
      environment: runtime.environment ?? {},
      healthCheck: {
        command: ["CMD-SHELL", runtime.healthCommand],
        interval: Duration.seconds(30),
        retries: 3,
        startPeriod: HEALTH_GRACE_PERIOD,
        timeout: Duration.seconds(5),
      },
      image: ecs.ContainerImage.fromEcrRepository(
        runtime.repository,
        runtime.imageDigest,
      ),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: runtime.containerName,
      }),
      readonlyRootFilesystem: runtime.readonlyRootFilesystem,
      secrets: runtime.secrets ?? {},
      stopTimeout: STOP_TIMEOUT,
    });
    container.addPortMappings({
      appProtocol: ecs.AppProtocol.http,
      containerPort: runtime.port,
      name: runtime.portName,
      protocol: ecs.Protocol.TCP,
    });

    const service = new ecs.FargateService(this, `${runtime.id}Service`, {
      assignPublicIp: true,
      circuitBreaker: { rollback: true },
      cluster: props.cluster,
      deploymentController: { type: ecs.DeploymentControllerType.ECS },
      desiredCount: 1,
      enableECSManagedTags: true,
      healthCheckGracePeriod: HEALTH_GRACE_PERIOD,
      maxHealthyPercent: 200,
      minHealthyPercent: 100,
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
      securityGroups: [runtime.securityGroup],
      serviceConnectConfiguration: {
        namespace: props.serviceConnectNamespace.namespaceName,
        ...(runtime.serviceConnect === undefined
          ? {}
          : { services: [runtime.serviceConnect] }),
      },
      serviceName: runtime.serviceName,
      taskDefinition,
      vpcSubnets: { subnetGroupName: "public-tasks" },
    });
    const scaling = service.autoScaleTaskCount({
      // Active mode always retains one task. The separate stop operation
      // suspends scaling and explicitly sets desired count to zero.
      minCapacity: 1,
      maxCapacity: 2,
    });
    scaling.scaleOnCpuUtilization(`${runtime.id}CpuScaling`, {
      scaleInCooldown: Duration.seconds(300),
      scaleOutCooldown: Duration.seconds(60),
      targetUtilizationPercent: sizing.cpuTargetPercent,
    });
    scaling.scaleOnMemoryUtilization(`${runtime.id}MemoryScaling`, {
      scaleInCooldown: Duration.seconds(300),
      scaleOutCooldown: Duration.seconds(60),
      targetUtilizationPercent: sizing.memoryTargetPercent,
    });

    return { service, container, logGroup };
  }

  private createLoadBalancer(
    props: ApplicationStackProps,
    albSecurityGroup: ec2.ISecurityGroup,
    frontend: CreatedService,
  ): {
    readonly loadBalancer: elbv2.ApplicationLoadBalancer;
    readonly targetGroup: elbv2.ApplicationTargetGroup;
  } {
    const loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "InternalLoadBalancer",
      {
        internetFacing: false,
        loadBalancerName: "foc-demo-internal",
        securityGroup: albSecurityGroup,
        vpc: props.vpc,
        vpcSubnets: { subnetGroupName: "isolated-alb" },
      },
    );
    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "FrontendTargetGroup",
      {
        deregistrationDelay: Duration.seconds(30),
        healthCheck: {
          healthyHttpCodes: "200",
          healthyThresholdCount: 2,
          interval: Duration.seconds(30),
          path: "/healthz",
          timeout: Duration.seconds(5),
          unhealthyThresholdCount: 3,
        },
        port: FRONTEND_PORT,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetGroupName: "foc-demo-frontend",
        targetType: elbv2.TargetType.IP,
        vpc: props.vpc,
      },
    );
    const listener = loadBalancer.addListener("HttpListener", {
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
      open: false,
      port: FRONTEND_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });
    targetGroup.addTarget(
      frontend.service.loadBalancerTarget({
        containerName: frontend.container.containerName,
        containerPort: FRONTEND_PORT,
      }),
    );

    new CfnOutput(this, "InternalAlbListenerArn", {
      value: listener.listenerArn,
    });
    return { loadBalancer, targetGroup };
  }

  private createObservability(
    props: ApplicationStackProps,
    resources: {
      readonly frontend: CreatedService;
      readonly user: CreatedService;
      readonly supplier: CreatedService;
      readonly targetGroup: elbv2.ApplicationTargetGroup;
      readonly loadBalancer: elbv2.ApplicationLoadBalancer;
    },
  ): sns.ITopic {
    const topic = new sns.Topic(this, "AlertTopic", {
      displayName: "FoC demo operational alerts",
      topicName: "foc-demo-alerts",
    });
    topic.addSubscription(
      new subscriptions.EmailSubscription(props.config.alertEmail),
    );
    const action = new cloudwatchActions.SnsAction(topic);
    const alarms: cloudwatch.Alarm[] = [];
    const addAlarm = (
      id: string,
      name: string,
      metric: cloudwatch.IMetric,
      config: DeploymentConfig["alarms"][keyof DeploymentConfig["alarms"]],
      comparisonOperator: cloudwatch.ComparisonOperator,
    ): cloudwatch.Alarm => {
      const alarm = new cloudwatch.Alarm(this, id, {
        alarmName: name,
        comparisonOperator,
        datapointsToAlarm: config.evaluationPeriods,
        evaluationPeriods: config.evaluationPeriods,
        metric,
        threshold: config.threshold,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(action);
      alarms.push(alarm);
      return alarm;
    };
    const configuredMetric = (
      metric: cloudwatch.Metric,
      config: DeploymentConfig["alarms"][keyof DeploymentConfig["alarms"]],
      statistic: string,
    ): cloudwatch.IMetric =>
      metric.with({
        period: Duration.seconds(config.periodSeconds),
        statistic,
      });

    addAlarm(
      "UnhealthyFrontendTargetsAlarm",
      "foc-demo-unhealthy-frontend-targets",
      configuredMetric(
        resources.targetGroup.metrics.unhealthyHostCount(),
        props.config.alarms.unhealthyFrontendTargets,
        "Maximum",
      ),
      props.config.alarms.unhealthyFrontendTargets,
      cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    );
    addAlarm(
      "ApplicationServerErrorsAlarm",
      "foc-demo-application-server-errors",
      configuredMetric(
        resources.loadBalancer.metrics.httpCodeTarget(
          elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
        ),
        props.config.alarms.applicationServerErrors,
        "Sum",
      ),
      props.config.alarms.applicationServerErrors,
      cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    );

    for (const runtime of [
      { id: "Frontend", component: "frontend", resource: resources.frontend },
      { id: "UserService", component: "userService", resource: resources.user },
      {
        id: "SupplierService",
        component: "supplierService",
        resource: resources.supplier,
      },
    ] as const) {
      const cpuConfig = props.config.alarms.ecsCpuPercent;
      const memoryConfig = props.config.alarms.ecsMemoryPercent;
      addAlarm(
        `${runtime.id}CpuAlarm`,
        `foc-demo-${runtime.component}-high-cpu`,
        configuredMetric(
          runtime.resource.service.metricCpuUtilization(),
          cpuConfig,
          "Average",
        ),
        cpuConfig,
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      );
      addAlarm(
        `${runtime.id}MemoryAlarm`,
        `foc-demo-${runtime.component}-high-memory`,
        configuredMetric(
          runtime.resource.service.metricMemoryUtilization(),
          memoryConfig,
          "Average",
        ),
        memoryConfig,
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      );
      const countConfig = props.config.alarms.ecsRunningTaskShortfall;
      const dimensions = {
        ClusterName: props.cluster.clusterName,
        ServiceName: runtime.resource.service.serviceName,
      };
      addAlarm(
        `${runtime.id}RunningTaskShortfallAlarm`,
        `foc-demo-${runtime.component}-running-task-shortfall`,
        new cloudwatch.MathExpression({
          expression: "IF(desired > running, desired - running, 0)",
          label: "Desired minus running tasks",
          period: Duration.seconds(countConfig.periodSeconds),
          usingMetrics: {
            desired: new cloudwatch.Metric({
              dimensionsMap: dimensions,
              metricName: "DesiredTaskCount",
              namespace: "ECS/ContainerInsights",
              period: Duration.seconds(countConfig.periodSeconds),
              statistic: "Average",
            }),
            running: new cloudwatch.Metric({
              dimensionsMap: dimensions,
              metricName: "RunningTaskCount",
              namespace: "ECS/ContainerInsights",
              period: Duration.seconds(countConfig.periodSeconds),
              statistic: "Average",
            }),
          },
        }),
        countConfig,
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      );
    }

    const rdsAlarms = [
      {
        id: "DatabaseFreeStorageAlarm",
        name: "foc-demo-rds-low-free-storage",
        metric: props.database.metricFreeStorageSpace(),
        config: props.config.alarms.rdsFreeStorageBytes,
        statistic: "Minimum",
        comparison: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      },
      {
        id: "DatabaseCpuAlarm",
        name: "foc-demo-rds-high-cpu",
        metric: props.database.metricCPUUtilization(),
        config: props.config.alarms.rdsCpuPercent,
        statistic: "Average",
        comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      },
      {
        id: "DatabaseConnectionsAlarm",
        name: "foc-demo-rds-high-connections",
        metric: props.database.metricDatabaseConnections(),
        config: props.config.alarms.rdsConnections,
        statistic: "Maximum",
        comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      },
    ] as const;
    for (const alarm of rdsAlarms) {
      addAlarm(
        alarm.id,
        alarm.name,
        configuredMetric(alarm.metric, alarm.config, alarm.statistic),
        alarm.config,
        alarm.comparison,
      );
    }

    const failureLogGroup = new logs.LogGroup(
      this,
      "DeploymentFailureEventLogGroup",
      {
        logGroupName: "/foc/demo/events/ecs-deployment-failures",
        removalPolicy: RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.TWO_WEEKS,
      },
    );
    const failureRule = new events.Rule(this, "DeploymentFailureEventRule", {
      description: "Capture ECS circuit-breaker deployment failures",
      eventPattern: {
        detail: {
          clusterArn: [props.cluster.clusterArn],
          eventName: ["SERVICE_DEPLOYMENT_FAILED"],
        },
        detailType: ["ECS Deployment State Change"],
        source: ["aws.ecs"],
      },
      ruleName: "foc-demo-ecs-deployment-failures",
    });
    failureRule.addTarget(new eventTargets.CloudWatchLogGroup(failureLogGroup));
    const failureConfig = props.config.alarms.ecsDeploymentFailures;
    const failureMetric = failureLogGroup
      .addMetricFilter("DeploymentFailureMetricFilter", {
        defaultValue: 0,
        filterPattern: logs.FilterPattern.allEvents(),
        metricName: "EcsDeploymentFailures",
        metricNamespace: "FoC/Demo",
        metricValue: "1",
      })
      .metric({
        period: Duration.seconds(failureConfig.periodSeconds),
        statistic: "Sum",
      });
    addAlarm(
      "DeploymentFailureAlarm",
      "foc-demo-ecs-deployment-failures",
      failureMetric,
      failureConfig,
      cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    );

    new CfnOutput(this, "AlarmCount", { value: String(alarms.length) });
    return topic;
  }

  private ecsTaskPrincipal(): iam.ServicePrincipal {
    return new iam.ServicePrincipal("ecs-tasks.amazonaws.com", {
      conditions: {
        ArnLike: {
          "aws:SourceArn": `arn:${this.partition}:ecs:${this.region}:${this.account}:*`,
        },
        StringEquals: { "aws:SourceAccount": this.account },
      },
    });
  }

  private addOutputs(services: {
    readonly frontend: CreatedService;
    readonly user: CreatedService;
    readonly supplier: CreatedService;
  }): void {
    new CfnOutput(this, "InternalAlbArn", {
      value: this.internalLoadBalancer.loadBalancerArn,
    });
    new CfnOutput(this, "InternalAlbDnsName", {
      value: this.internalLoadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, "FrontendTargetGroupArn", {
      value: this.frontendTargetGroup.targetGroupArn,
    });
    new CfnOutput(this, "ClusterName", {
      value: this.frontendService.cluster.clusterName,
    });
    new CfnOutput(this, "AlertTopicArn", { value: this.alertTopic.topicArn });
    new CfnOutput(this, "RequiredDatabaseJobOrder", {
      description:
        "Release tooling must complete these jobs before deploying this stack",
      value: DATABASE_JOB_ORDER.join(","),
    });
    for (const [id, service] of [
      ["Frontend", this.frontendService],
      ["UserService", this.userService],
      ["SupplierService", this.supplierService],
    ] as const) {
      new CfnOutput(this, `${id}ServiceName`, { value: service.serviceName });
      new CfnOutput(this, `${id}ServiceArn`, { value: service.serviceArn });
    }
    for (const [id, service] of [
      ["Frontend", services.frontend],
      ["UserService", services.user],
      ["SupplierService", services.supplier],
    ] as const) {
      new CfnOutput(this, `${id}LogGroupName`, {
        value: service.logGroup.logGroupName,
      });
    }
  }
}
