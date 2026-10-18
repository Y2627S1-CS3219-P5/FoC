<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Converted read-only AWS public-offer research into a concise, reproducible planning
estimate for issue #46. No AWS resources were created or changed.
Author review: Pending pull-request review by @ron.
-->

# AWS demo planning estimate

This is a planning scenario, not an approved deployment configuration. Actual provisioning
remains blocked until measured sizing, expected usage, the NUS allowance, and the named
cost approval are supplied through `config/demo.json`.

The committed [`pricing-snapshot.json`](pricing-snapshot.json) records the public rates and
source offer files used by the deterministic estimator. It deliberately applies no Free
Tier, NUS credit, discount, tax, or customer-specific pricing.

## Illustrative scenarios

| Scenario                                                   | Estimated monthly cost (USD) |
| ---------------------------------------------------------- | ---------------------------: |
| Retain chargeable resources; ECS and RDS stopped all month |                        33.89 |
| 80 active hours; three tasks at 0.25 vCPU / 1 GB           |                        43.60 |
| Always on; three tasks at 0.25 vCPU / 1 GB                 |                       105.55 |
| Always at maximum scale; six tasks at 0.25 vCPU / 1 GB     |                       156.29 |

The 105.55 scenario assumes 730 hours, a single-AZ `db.t4g.micro`, 20 GB RDS gp3,
one ALB plus 73 LCU-hours, 10 GB/100,000 CloudFront requests, 100,000 WAF requests,
eight secrets, 1 GB of logs, twelve alarm metrics, and 3 GB of ECR storage. Task sizing is
illustrative only and must be replaced with measurements.

Important continuing costs remain when compute is stopped: the ALB, WAF, Secrets Manager,
RDS storage, alarms, retained logs, and ECR storage. RDS also restarts automatically after
seven stopped days.

## Reproduce the approved estimate

1. Copy `config/demo.example.json` to the ignored `config/demo.json`.
2. Replace every placeholder with measured and human-approved inputs.
3. Set `FOC_DEPLOYMENT_CONFIG` to that file.
4. Run `npm run estimate`.

The generated `artifacts/cost-estimate.json` records every line item, pricing-snapshot hash,
configuration fingerprint, total, budget comparison, and approval identity. Changing the
configuration or pricing snapshot invalidates the deployment gate until the estimate is
regenerated and reviewed.

The team leader must also compare the estimate with the NUS tracking portal and save a
shared AWS Pricing Calculator URL. AWS Budget alerts are monitoring only, not a real-time
hard cap.
