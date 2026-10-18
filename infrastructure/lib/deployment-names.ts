// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: AWS demo deployment implementation and pre-deployment review fixes.
// Author review: PENDING.
export const DEPLOYMENT_TAGS = {
  Project: "FoC",
  Environment: "demo",
  ManagedBy: "CDK",
  Issue: "44",
} as const;

export const STACKS = {
  foundation: {
    cdkId: "FoCDemoFoundation",
    name: "foc-demo-foundation",
    region: "primary" as const,
  },
  data: {
    cdkId: "FoCDemoData",
    name: "foc-demo-data",
    region: "primary" as const,
  },
  application: {
    cdkId: "FoCDemoApplication",
    name: "foc-demo-application",
    region: "primary" as const,
  },
  edge: {
    cdkId: "FoCDemoEdge",
    name: "foc-demo-edge",
    region: "edge" as const,
  },
} as const;

export type StackKey = keyof typeof STACKS;
export const STACK_KEYS = Object.keys(STACKS) as readonly StackKey[];

export const SERVICE_NAMES = {
  frontend: "foc-demo-frontend",
  userService: "foc-demo-user-service",
  supplierService: "foc-demo-supplier-service",
} as const;

export type ServiceKey = keyof typeof SERVICE_NAMES;

export const SERVICE_START_ORDER = [
  "userService",
  "supplierService",
  "frontend",
] as const satisfies readonly ServiceKey[];

export const SERVICE_STOP_ORDER = [
  "frontend",
  "supplierService",
  "userService",
] as const satisfies readonly ServiceKey[];

export const REPOSITORY_NAMES = {
  frontend: "foc-demo-frontend",
  userService: "foc-demo-user-service",
  supplierService: "foc-demo-supplier-service",
} as const;

export const JOBS = [
  {
    key: "database-bootstrap",
    taskOutput: "DatabaseBootstrapTaskDefinitionArn",
    containerOutput: "DatabaseBootstrapContainerName",
    image: "bootstrap" as const,
  },
  {
    key: "user-migration",
    taskOutput: "UserMigrationTaskDefinitionArn",
    containerOutput: "UserMigrationContainerName",
    image: "userService" as const,
  },
  {
    key: "supplier-migration",
    taskOutput: "SupplierMigrationTaskDefinitionArn",
    containerOutput: "SupplierMigrationContainerName",
    image: "supplierService" as const,
  },
  {
    key: "supplier-seed",
    taskOutput: "SupplierSeedTaskDefinitionArn",
    containerOutput: "SupplierSeedContainerName",
    image: "supplierService" as const,
  },
] as const;

export type JobDefinition = (typeof JOBS)[number];

export const SERVICE_OUTPUTS = {
  frontend: "FrontendServiceName",
  userService: "UserServiceServiceName",
  supplierService: "SupplierServiceServiceName",
} as const;

export const SERVICE_LOG_OUTPUTS = {
  frontend: "FrontendLogGroupName",
  userService: "UserServiceLogGroupName",
  supplierService: "SupplierServiceLogGroupName",
} as const;
