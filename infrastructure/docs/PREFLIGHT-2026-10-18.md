<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Summarized read-only AWS CLI evidence gathered for issue #46. No AWS resources were
created, updated, bootstrapped, or deleted.
Author review: Pending pull-request review by @ron.
-->

# Read-only AWS preflight evidence — 2026-10-18

| Item                       | Result                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Profile and account        | `foc-dev`, account `656253649128`, NUS IAM Identity Center role                                                             |
| Primary/edge regions       | `ap-southeast-1` / `us-east-1`                                                                                              |
| Required service read APIs | Available for VPC, ECS, ECR, RDS, CloudFront, WAF, CloudWatch, Logs, Secrets Manager, SNS, Budgets, IAM, and CloudFormation |
| PostgreSQL                 | 17.11, `db.t4g.micro`, and gp3 orderable in three Singapore AZs                                                             |
| ECS                        | `FARGATE` and `FARGATE_SPOT` active                                                                                         |
| CloudFront VPC origin      | API readable; origin-facing managed prefix list present                                                                     |
| WAF                        | `AWSManagedRulesCommonRuleSet` available for CloudFront scope                                                               |
| Existing FoC resources     | None found in the scoped service inventories                                                                                |
| AWS Budget                 | API readable; no account budget configured                                                                                  |
| CDK bootstrap              | **Blocked:** no `CDKToolkit` stack or bootstrap version parameter in either required region                                 |
| Service Quotas             | Known restriction: exact explicit school Organizations SCP denial                                                           |

The successful read calls prove only describe/list access. They do not prove that every
create, update, delete, `iam:PassRole`, or CDK bootstrap operation is permitted. The new
preflight adds read-only IAM simulation, but the first real denial during reviewed
bootstrap/deploy must still be reported exactly rather than bypassed.

The Service Quotas denial is an organization-level restriction. An IAM permission on the
SSO role cannot override an explicit SCP deny. Deployment may proceed through the narrow
manual-evidence path only when the configuration records this exact restriction, names the
reviewer and evidence for `fargate:L-3032A538`, both quota calls show the known SCP denial,
and all direct required service and capability reads pass. Other access failures remain
blockers.

CDK bootstrap is deliberately not performed by the preflight because it is a mutation that
creates an S3 bucket, ECR repository, SSM parameter, and deployment roles. Both Singapore
and `us-east-1` remain blocked until bootstrap scope and permissions receive explicit
review.

The NUS allowance is not exposed by the AWS Budgets API. The team leader must supply
`monthlyBudgetUsd` after checking the school tracking portal. No estimate or AWS Budget
alert substitutes for that approval.
