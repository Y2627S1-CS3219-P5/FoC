import assert from "node:assert/strict";
import { test } from "node:test";
import { Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { createFocDemoApp } from "../lib/app.js";
import { validConfig, validReleaseManifest } from "./fixtures.js";

function synthesizedDataTemplate(): Template {
  const app = createFocDemoApp(validConfig(), validReleaseManifest());
  const stack = app.node.findChild("FoCDemoData");
  assert.ok(stack instanceof Stack);
  return Template.fromStack(stack);
}

test("creates the approved private disposable PostgreSQL 17.11 instance", () => {
  const template = synthesizedDataTemplate();
  template.resourceCountIs("AWS::RDS::DBInstance", 1);
  template.hasResourceProperties("AWS::RDS::DBInstance", {
    AllocatedStorage: "20",
    AllowMajorVersionUpgrade: false,
    AutoMinorVersionUpgrade: false,
    BackupRetentionPeriod: 1,
    CACertificateIdentifier: "rds-ca-rsa2048-g1",
    DBInstanceClass: "db.t4g.micro",
    DeleteAutomatedBackups: true,
    DeletionProtection: false,
    Engine: "postgres",
    EngineLifecycleSupport: "open-source-rds-extended-support-disabled",
    EngineVersion: "17.11",
    MaxAllocatedStorage: 100,
    MultiAZ: false,
    PubliclyAccessible: false,
    StorageEncrypted: true,
    StorageType: "gp3",
  });
  template.allResources("AWS::RDS::DBInstance", {
    DeletionPolicy: "Delete",
    UpdateReplacePolicy: "Delete",
  });
  template.hasResourceProperties("AWS::RDS::DBParameterGroup", {
    Family: "postgres17",
    Parameters: { "rds.force_ssl": "1" },
  });
  const subnetGroups = JSON.stringify(
    template.findResources("AWS::RDS::DBSubnetGroup"),
  );
  assert.match(subnetGroups, /isolatedrds/);
  assert.doesNotMatch(subnetGroups, /publictasks|isolatedalb/);
});

test("allows PostgreSQL only from database jobs and restricts job egress", () => {
  const template = synthesizedDataTemplate();
  template.resourceCountIs("AWS::EC2::SecurityGroupIngress", 1);
  template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
    FromPort: 5432,
    IpProtocol: "tcp",
    SourceSecurityGroupId: Match.anyValue(),
    ToPort: 5432,
  });
  template.hasResourceProperties("AWS::EC2::SecurityGroupEgress", {
    FromPort: 5432,
    IpProtocol: "tcp",
    DestinationSecurityGroupId: Match.anyValue(),
    ToPort: 5432,
  });
  template.hasResourceProperties("AWS::EC2::SecurityGroup", {
    GroupDescription: "Restricted egress for one-off database jobs",
    SecurityGroupEgress: [
      {
        CidrIp: "0.0.0.0/0",
        FromPort: 443,
        IpProtocol: "tcp",
        ToPort: 443,
      },
    ],
  });
  const rendered = JSON.stringify(template.toJSON());
  assert.doesNotMatch(rendered, /"CidrIp":"0\.0\.0\.0\/0"[^}]*"FromPort":5432/);
});

test("generates exactly eight disposable secrets without plaintext values", () => {
  const template = synthesizedDataTemplate();
  template.resourceCountIs("AWS::SecretsManager::Secret", 8);
  template.hasResourceProperties("AWS::SecretsManager::Secret", {
    GenerateSecretString: {
      ExcludeCharacters: "ghijklmnopqrstuvwxyz",
      ExcludePunctuation: true,
      ExcludeUppercase: true,
      IncludeSpace: false,
      PasswordLength: 64,
      RequireEachIncludedType: false,
    },
    Name: "foc-demo/AuditHmac",
  });
  for (const identity of [
    { dbname: "postgres", username: "focmaster" },
    { dbname: "users", username: "user_migrator" },
    { dbname: "users", username: "user_app" },
    { dbname: "supplier", username: "supplier_migrator" },
    { dbname: "supplier", username: "supplier_app" },
  ]) {
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      GenerateSecretString: {
        ExcludePunctuation: true,
        GenerateStringKey: "password",
        PasswordLength: 48,
        SecretStringTemplate: JSON.stringify(identity),
      },
    });
  }
  template.allResources("AWS::SecretsManager::Secret", {
    DeletionPolicy: "Delete",
    UpdateReplacePolicy: "Delete",
  });
  const rendered = JSON.stringify(template.toJSON());
  assert.doesNotMatch(rendered, /DATABASE_URL|postgres(?:ql)?:\/\//);
  assert.doesNotMatch(rendered, /MASTER_PASSWORD":"(?!\{)/);
});

test("defines four immutable, non-root, read-only database jobs with discrete TLS settings", () => {
  const template = synthesizedDataTemplate();
  template.resourceCountIs("AWS::ECS::TaskDefinition", 4);
  for (const family of [
    "foc-demo-database-bootstrap",
    "foc-demo-user-migration",
    "foc-demo-supplier-migration",
    "foc-demo-supplier-seed",
  ]) {
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      Family: family,
      NetworkMode: "awsvpc",
      RequiresCompatibilities: ["FARGATE"],
      RuntimePlatform: {
        CpuArchitecture: "X86_64",
        OperatingSystemFamily: "LINUX",
      },
      ContainerDefinitions: [
        Match.objectLike({
          ReadonlyRootFilesystem: true,
          User: "1000",
        }),
      ],
    });
  }
  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    Family: "foc-demo-user-migration",
    ContainerDefinitions: [
      Match.objectLike({
        Command: ["node", "dist/migrate.js"],
        Environment: Match.arrayWith([
          { Name: "DATABASE_NAME", Value: "users" },
          {
            Name: "DATABASE_SSL_CA_PATH",
            Value: "/app/certs/ap-southeast-1-bundle.pem",
          },
          { Name: "DATABASE_USER", Value: "user_migrator" },
        ]),
        Secrets: [Match.objectLike({ Name: "DATABASE_PASSWORD" })],
      }),
    ],
  });
  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    Family: "foc-demo-supplier-migration",
    ContainerDefinitions: [
      Match.objectLike({
        Command: ["node", "dist/database/migrate.js"],
        Environment: Match.arrayWith([
          { Name: "DATABASE_NAME", Value: "supplier" },
          { Name: "DATABASE_USER", Value: "supplier_migrator" },
          { Name: "DATABASE_RUNTIME_ROLE", Value: "supplier_app" },
          { Name: "MIGRATIONS_PATH", Value: "/app/drizzle" },
        ]),
      }),
    ],
  });
  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    Family: "foc-demo-supplier-seed",
    ContainerDefinitions: [
      Match.objectLike({
        Command: ["node", "dist/database/seed/run.js"],
        Environment: Match.arrayWith([
          { Name: "DATABASE_USER", Value: "supplier_app" },
          {
            Name: "SUPPLIER_SEED_CSV_PATH",
            Value: "/data/csv/supplier-seed-data.csv",
          },
        ]),
      }),
    ],
  });
  const rendered = JSON.stringify(template.toJSON());
  assert.match(
    rendered,
    /@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/,
  );
  assert.match(
    rendered,
    /@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc/,
  );
  assert.doesNotMatch(rendered, /:latest/);
});

test("keeps task roles empty and scopes master-secret access to bootstrap", () => {
  const template = synthesizedDataTemplate();
  template.resourceCountIs("AWS::IAM::Role", 8);
  template.resourceCountIs("AWS::IAM::Policy", 4);
  const policies = template.findResources("AWS::IAM::Policy") as Record<
    string,
    {
      readonly Properties: {
        readonly Roles: readonly { readonly Ref: string }[];
      };
    }
  >;
  for (const policy of Object.values(policies)) {
    for (const role of policy.Properties.Roles) {
      assert.match(role.Ref, /ExecutionRole/);
      assert.doesNotMatch(role.Ref, /TaskRole/);
    }
  }
  const masterPolicies = Object.entries(policies).filter(([, policy]) =>
    JSON.stringify(policy).includes("MasterSecret"),
  );
  assert.equal(masterPolicies.length, 1);
  assert.match(masterPolicies[0]?.[0] ?? "", /DatabaseBootstrap/);
});

test("publishes the canonical fail-closed job boundary without secret outputs", () => {
  const template = synthesizedDataTemplate();
  template.hasOutput("DatabaseJobOrder", {
    Value: "database-bootstrap,user-migration,supplier-migration,supplier-seed",
  });
  for (const output of [
    "DatabaseEndpoint",
    "DatabasePort",
    "DatabaseJobsSecurityGroupId",
    "DatabaseBootstrapTaskDefinitionArn",
    "UserMigrationTaskDefinitionArn",
    "SupplierMigrationTaskDefinitionArn",
    "SupplierSeedTaskDefinitionArn",
  ]) {
    template.hasOutput(output, {});
  }
  assert.doesNotMatch(
    JSON.stringify(template.toJSON().Outputs),
    /Secret|Password/,
  );
});
