import type * as ecs from "aws-cdk-lib/aws-ecs";

export const DATABASE_JOB_ORDER = [
  "database-bootstrap",
  "user-migration",
  "supplier-migration",
  "supplier-seed",
] as const;

export type DatabaseJobName = (typeof DATABASE_JOB_ORDER)[number];

/**
 * The release controller must run these task definitions in this exact order,
 * wait for exit code zero after each, and stop before updating any service on
 * the first failure. Defining tasks does not execute them.
 */
export type DatabaseReleaseBoundary = Readonly<
  Record<DatabaseJobName, ecs.ITaskDefinition>
>;
