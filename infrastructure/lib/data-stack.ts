import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { DeploymentConfig } from "./config.js";
import {
  DATABASE_JOB_ORDER,
  type DatabaseJobName,
  type DatabaseReleaseBoundary,
} from "./database-jobs.js";
import type { ReleaseManifest } from "./release-manifest.js";

const DATABASE_PORT = 5432;
const DATABASE_CA_PATH = "/app/certs/ap-southeast-1-bundle.pem";

interface DatabaseIdentity {
  readonly database: "postgres" | "users" | "supplier";
  readonly username:
    | "focmaster"
    | "user_migrator"
    | "user_app"
    | "supplier_migrator"
    | "supplier_app";
}

export interface DataStackProps extends StackProps {
  readonly config: DeploymentConfig;
  readonly releaseManifest: ReleaseManifest;
  readonly vpc: ec2.IVpc;
  readonly userServiceRepository: ecr.IRepository;
  readonly supplierServiceRepository: ecr.IRepository;
}

/** Stateful database, generated secrets, and non-executing one-off job definitions. */
export class DataStack extends Stack {
  public readonly database: rds.IDatabaseInstance;
  public readonly databaseSecurityGroup: ec2.ISecurityGroup;
  public readonly databaseJobsSecurityGroup: ec2.ISecurityGroup;
  public readonly databaseJobs: DatabaseReleaseBoundary;
  public readonly userRuntimeSecret: secretsmanager.ISecret;
  public readonly supplierRuntimeSecret: secretsmanager.ISecret;
  public readonly jwtSecret: secretsmanager.ISecret;
  public readonly auditHmacSecret: secretsmanager.ISecret;
  public readonly bootstrapAdministratorPasswordSecret: secretsmanager.ISecret;

  public constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const masterSecret = this.createDatabaseSecret("MasterSecret", {
      database: "postgres",
      username: "focmaster",
    });
    const userMigratorSecret = this.createDatabaseSecret("UserMigratorSecret", {
      database: "users",
      username: "user_migrator",
    });
    this.userRuntimeSecret = this.createDatabaseSecret("UserRuntimeSecret", {
      database: "users",
      username: "user_app",
    }) as secretsmanager.ISecret;
    const supplierMigratorSecret = this.createDatabaseSecret(
      "SupplierMigratorSecret",
      { database: "supplier", username: "supplier_migrator" },
    );
    this.supplierRuntimeSecret = this.createDatabaseSecret(
      "SupplierRuntimeSecret",
      { database: "supplier", username: "supplier_app" },
    ) as secretsmanager.ISecret;
    this.jwtSecret = this.createGeneratedSecret("JwtSecret", {
      passwordLength: 64,
      excludePunctuation: true,
    }) as secretsmanager.ISecret;
    this.auditHmacSecret = this.createGeneratedSecret("AuditHmacSecret", {
      passwordLength: 64,
      excludeCharacters: "ghijklmnopqrstuvwxyz",
      excludeUppercase: true,
      excludePunctuation: true,
      includeSpace: false,
      requireEachIncludedType: false,
    }) as secretsmanager.ISecret;
    this.bootstrapAdministratorPasswordSecret = this.createGeneratedSecret(
      "BootstrapAdministratorPasswordSecret",
      { passwordLength: 32, includeSpace: false },
    ) as secretsmanager.ISecret;

    this.databaseSecurityGroup = new ec2.SecurityGroup(
      this,
      "DatabaseSecurityGroup",
      {
        allowAllOutbound: false,
        description: "Accept PostgreSQL only from approved FoC tasks",
        vpc: props.vpc,
      },
    );
    this.databaseJobsSecurityGroup = new ec2.SecurityGroup(
      this,
      "DatabaseJobsSecurityGroup",
      {
        allowAllOutbound: false,
        description: "Restricted egress for one-off database jobs",
        vpc: props.vpc,
      },
    );
    this.databaseSecurityGroup.addIngressRule(
      this.databaseJobsSecurityGroup,
      ec2.Port.tcp(DATABASE_PORT),
      "PostgreSQL from database jobs only",
    );
    this.databaseJobsSecurityGroup.addEgressRule(
      this.databaseSecurityGroup,
      ec2.Port.tcp(DATABASE_PORT),
      "PostgreSQL to the private RDS instance",
    );
    this.databaseJobsSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "AWS APIs and ECR layers through the public task subnet",
    );

    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.of("17.11", "17"),
    });
    const parameterGroup = new rds.ParameterGroup(this, "PostgresParameters", {
      engine,
      parameters: { "rds.force_ssl": "1" },
    });
    const database = new rds.DatabaseInstance(this, "Database", {
      allocatedStorage: props.config.database.allocatedStorageGiB,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: false,
      backupRetention: Duration.days(props.config.database.backupRetentionDays),
      caCertificate: rds.CaCertificate.RDS_CA_RSA2048_G1,
      credentials: rds.Credentials.fromSecret(
        masterSecret as secretsmanager.ISecret,
      ),
      deleteAutomatedBackups: true,
      deletionProtection: false,
      engine,
      engineLifecycleSupport:
        rds.EngineLifecycleSupport.OPEN_SOURCE_RDS_EXTENDED_SUPPORT_DISABLED,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        ec2.InstanceSize.MICRO,
      ),
      maxAllocatedStorage: props.config.database.maximumStorageGiB,
      multiAz: false,
      parameterGroup,
      publiclyAccessible: false,
      removalPolicy: RemovalPolicy.DESTROY,
      securityGroups: [this.databaseSecurityGroup],
      storageEncrypted: true,
      storageType: rds.StorageType.GP3,
      vpc: props.vpc,
      vpcSubnets: { subnetGroupName: "isolated-rds" },
    });
    this.database = database;

    const databaseEnvironment = (
      databaseName: string,
      databaseUser: string,
    ): Record<string, string> => ({
      DATABASE_HOST: database.dbInstanceEndpointAddress,
      DATABASE_NAME: databaseName,
      DATABASE_PORT: database.dbInstanceEndpointPort,
      DATABASE_SSL_CA_PATH: DATABASE_CA_PATH,
      DATABASE_USER: databaseUser,
    });

    const bootstrapTask = this.createJobTask({
      name: "database-bootstrap",
      cpu: 256,
      memoryMiB: 512,
      image: ecs.ContainerImage.fromAsset(
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          "../database-bootstrap",
        ),
        { platform: ecrAssets.Platform.LINUX_AMD64 },
      ),
      environment: {
        DATABASE_HOST: database.dbInstanceEndpointAddress,
        DATABASE_PORT: database.dbInstanceEndpointPort,
        DATABASE_SSL_CA_PATH: DATABASE_CA_PATH,
      },
      secrets: {
        MASTER_PASSWORD: ecs.Secret.fromSecretsManager(
          masterSecret as secretsmanager.ISecret,
          "password",
        ),
        USER_MIGRATOR_PASSWORD: ecs.Secret.fromSecretsManager(
          userMigratorSecret as secretsmanager.ISecret,
          "password",
        ),
        USER_RUNTIME_PASSWORD: ecs.Secret.fromSecretsManager(
          this.userRuntimeSecret,
          "password",
        ),
        SUPPLIER_MIGRATOR_PASSWORD: ecs.Secret.fromSecretsManager(
          supplierMigratorSecret as secretsmanager.ISecret,
          "password",
        ),
        SUPPLIER_RUNTIME_PASSWORD: ecs.Secret.fromSecretsManager(
          this.supplierRuntimeSecret,
          "password",
        ),
      },
    });
    const userMigrationTask = this.createJobTask({
      name: "user-migration",
      cpu: props.config.services.userService.cpu,
      memoryMiB: props.config.services.userService.memoryMiB,
      image: ecs.ContainerImage.fromEcrRepository(
        props.userServiceRepository,
        props.releaseManifest.images.userService,
      ),
      command: ["node", "dist/migrate.js"],
      environment: databaseEnvironment("users", "user_migrator"),
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
          userMigratorSecret as secretsmanager.ISecret,
          "password",
        ),
      },
    });
    const supplierMigrationTask = this.createJobTask({
      name: "supplier-migration",
      cpu: props.config.services.supplierService.cpu,
      memoryMiB: props.config.services.supplierService.memoryMiB,
      image: ecs.ContainerImage.fromEcrRepository(
        props.supplierServiceRepository,
        props.releaseManifest.images.supplierService,
      ),
      command: ["node", "dist/database/migrate.js"],
      environment: {
        ...databaseEnvironment("supplier", "supplier_migrator"),
        DATABASE_RUNTIME_ROLE: "supplier_app",
        MIGRATIONS_PATH: "/app/drizzle",
      },
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
          supplierMigratorSecret as secretsmanager.ISecret,
          "password",
        ),
      },
    });
    const supplierSeedTask = this.createJobTask({
      name: "supplier-seed",
      cpu: props.config.services.supplierService.cpu,
      memoryMiB: props.config.services.supplierService.memoryMiB,
      image: ecs.ContainerImage.fromEcrRepository(
        props.supplierServiceRepository,
        props.releaseManifest.images.supplierService,
      ),
      command: ["node", "dist/database/seed/run.js"],
      environment: {
        ...databaseEnvironment("supplier", "supplier_app"),
        SUPPLIER_SEED_CSV_PATH: "/data/csv/supplier-seed-data.csv",
      },
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
          this.supplierRuntimeSecret,
          "password",
        ),
      },
    });

    this.databaseJobs = {
      "database-bootstrap": bootstrapTask as ecs.ITaskDefinition,
      "user-migration": userMigrationTask as ecs.ITaskDefinition,
      "supplier-migration": supplierMigrationTask as ecs.ITaskDefinition,
      "supplier-seed": supplierSeedTask as ecs.ITaskDefinition,
    };
    this.addOutputs();
  }

  private createDatabaseSecret(
    id: string,
    identity: DatabaseIdentity,
  ): secretsmanager.Secret {
    return this.createGeneratedSecret(id, {
      excludePunctuation: true,
      passwordLength: 48,
      generateStringKey: "password",
      secretStringTemplate: JSON.stringify({
        dbname: identity.database,
        username: identity.username,
      }),
    });
  }

  private createGeneratedSecret(
    id: string,
    generateSecretString: secretsmanager.SecretStringGenerator,
  ): secretsmanager.Secret {
    const secret = new secretsmanager.Secret(this, id, {
      generateSecretString,
      removalPolicy: RemovalPolicy.DESTROY,
      secretName: `foc-demo/${id.replace(/Secret$/, "")}`,
    });
    return secret;
  }

  private createJobTask(options: {
    readonly name: DatabaseJobName;
    readonly cpu: number;
    readonly memoryMiB: number;
    readonly image: ecs.ContainerImage;
    readonly environment: Record<string, string>;
    readonly secrets: Record<string, ecs.Secret>;
    readonly command?: string[];
  }): ecs.FargateTaskDefinition {
    const executionRole = new iam.Role(
      this,
      `${this.pascal(options.name)}ExecutionRole`,
      { assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com") },
    );
    const taskRole = new iam.Role(
      this,
      `${this.pascal(options.name)}TaskRole`,
      {
        assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      },
    );
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      `${this.pascal(options.name)}TaskDefinition`,
      {
        cpu: options.cpu,
        executionRole,
        family: `foc-demo-${options.name}`,
        memoryLimitMiB: options.memoryMiB,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        taskRole,
      },
    );
    const logGroup = new logs.LogGroup(
      this,
      `${this.pascal(options.name)}LogGroup`,
      {
        logGroupName: `/foc/demo/jobs/${options.name}`,
        removalPolicy: RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_WEEK,
      },
    );
    taskDefinition.addContainer(`${this.pascal(options.name)}Container`, {
      ...(options.command === undefined ? {} : { command: options.command }),
      environment: options.environment,
      image: options.image,
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "job" }),
      readonlyRootFilesystem: true,
      secrets: options.secrets,
      user: "1000",
    });
    return taskDefinition;
  }

  private pascal(name: string): string {
    return name
      .split("-")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join("");
  }

  private addOutputs(): void {
    new CfnOutput(this, "DatabaseEndpoint", {
      description: "Private RDS endpoint used by FoC tasks",
      value: this.database.dbInstanceEndpointAddress,
    });
    new CfnOutput(this, "DatabasePort", {
      value: this.database.dbInstanceEndpointPort,
    });
    new CfnOutput(this, "DatabaseJobsSecurityGroupId", {
      value: this.databaseJobsSecurityGroup.securityGroupId,
    });
    new CfnOutput(this, "DatabaseJobOrder", {
      description:
        "Run sequentially; every task must exit zero before service rollout",
      value: DATABASE_JOB_ORDER.join(","),
    });
    for (const name of DATABASE_JOB_ORDER) {
      new CfnOutput(this, `${this.pascal(name)}TaskDefinitionArn`, {
        value: this.databaseJobs[name].taskDefinitionArn,
      });
    }
  }
}
