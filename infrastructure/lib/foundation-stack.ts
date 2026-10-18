import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";
import type { Construct } from "constructs";

export interface FoundationStackProps extends StackProps {
  readonly retainedImageCount: number;
}

/**
 * Shared, regional resources that later FoC stacks consume explicitly.
 *
 * This stack deliberately creates no load balancer, database, task definition,
 * service, Order Service, or Credit Service resource.
 */
export class FoundationStack extends Stack {
  public readonly vpc: ec2.IVpc;
  public readonly cluster: ecs.ICluster;
  public readonly serviceConnectNamespace: servicediscovery.INamespace;
  public readonly frontendRepository: ecr.IRepository;
  public readonly userServiceRepository: ecr.IRepository;
  public readonly supplierServiceRepository: ecr.IRepository;

  public constructor(
    scope: Construct,
    id: string,
    props: FoundationStackProps,
  ) {
    super(scope, id, props);

    const network = new ec2.Vpc(this, "Network", {
      maxAzs: 2,
      natGateways: 0,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public-tasks",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "isolated-alb",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: "isolated-rds",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });
    // Some concrete CDK classes expose optional fields as `T | undefined`, which
    // is not assignable to their interfaces with exactOptionalPropertyTypes.
    this.vpc = network as ec2.IVpc;

    const cluster = new ecs.Cluster(this, "Cluster", {
      clusterName: "foc-demo-cluster",
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
      vpc: this.vpc,
    });
    this.cluster = cluster as ecs.ICluster;
    this.serviceConnectNamespace = cluster.addDefaultCloudMapNamespace({
      name: "foc-demo.local",
      type: servicediscovery.NamespaceType.DNS_PRIVATE,
      useForServiceConnect: true,
      vpc: this.vpc,
    });

    this.frontendRepository = this.createRepository(
      "FrontendRepository",
      "foc-demo-frontend",
      props.retainedImageCount,
    );
    this.userServiceRepository = this.createRepository(
      "UserServiceRepository",
      "foc-demo-user-service",
      props.retainedImageCount,
    );
    this.supplierServiceRepository = this.createRepository(
      "SupplierServiceRepository",
      "foc-demo-supplier-service",
      props.retainedImageCount,
    );

    this.addOutputs();
  }

  private createRepository(
    id: string,
    repositoryName: string,
    retainedImageCount: number,
  ): ecr.IRepository {
    const repository = new ecr.Repository(this, id, {
      repositoryName,
      encryption: ecr.RepositoryEncryption.AES_256,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      lifecycleRules: [
        {
          description: `Retain the ${retainedImageCount} newest release images`,
          maxImageCount: retainedImageCount,
          rulePriority: 1,
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });
    // AES-256 is ECR's service default, so the L2 deliberately omits it. Keep the
    // CloudFormation intent explicit for security review and assertion tests.
    const resource = repository.node.defaultChild as ecr.CfnRepository;
    resource.addPropertyOverride("EncryptionConfiguration", {
      EncryptionType: "AES256",
    });
    return repository;
  }

  private addOutputs(): void {
    const output = (id: string, value: string, description: string): void => {
      new CfnOutput(this, id, { description, value });
    };

    output("VpcId", this.vpc.vpcId, "VPC shared by all FoC demo stacks");
    output(
      "PublicTaskSubnetIds",
      this.vpc
        .selectSubnets({ subnetGroupName: "public-tasks" })
        .subnetIds.join(","),
      "Comma-separated public subnet IDs for public-IP Fargate tasks",
    );
    output(
      "IsolatedAlbSubnetIds",
      this.vpc
        .selectSubnets({ subnetGroupName: "isolated-alb" })
        .subnetIds.join(","),
      "Comma-separated private isolated subnet IDs for the internal ALB",
    );
    output(
      "IsolatedRdsSubnetIds",
      this.vpc
        .selectSubnets({ subnetGroupName: "isolated-rds" })
        .subnetIds.join(","),
      "Comma-separated private isolated subnet IDs for RDS",
    );
    output("ClusterName", this.cluster.clusterName, "FoC ECS cluster name");
    output("ClusterArn", this.cluster.clusterArn, "FoC ECS cluster ARN");
    output(
      "ServiceConnectNamespaceName",
      this.serviceConnectNamespace.namespaceName,
      "Private DNS namespace used by ECS Service Connect",
    );
    output(
      "ServiceConnectNamespaceId",
      this.serviceConnectNamespace.namespaceId,
      "Cloud Map namespace ID used by ECS Service Connect",
    );
    output(
      "ServiceConnectNamespaceArn",
      this.serviceConnectNamespace.namespaceArn,
      "Cloud Map namespace ARN used by ECS Service Connect",
    );
    this.addRepositoryOutputs("Frontend", this.frontendRepository);
    this.addRepositoryOutputs("UserService", this.userServiceRepository);
    this.addRepositoryOutputs(
      "SupplierService",
      this.supplierServiceRepository,
    );
  }

  private addRepositoryOutputs(
    component: string,
    repository: ecr.IRepository,
  ): void {
    new CfnOutput(this, `${component}RepositoryName`, {
      description: `${component} ECR repository name`,
      value: repository.repositoryName,
    });
    new CfnOutput(this, `${component}RepositoryArn`, {
      description: `${component} ECR repository ARN`,
      value: repository.repositoryArn,
    });
    new CfnOutput(this, `${component}RepositoryUri`, {
      description: `${component} ECR repository URI`,
      value: repository.repositoryUri,
    });
  }
}
