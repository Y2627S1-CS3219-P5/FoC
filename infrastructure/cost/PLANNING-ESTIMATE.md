<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Converted read-only AWS public-offer research into a concise, reproducible planning
estimate for issue #46, then recorded the author's decision to use its fingerprinted
artifact as authoritative cost evidence. No AWS resources were created or changed.
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

| Scenario                                                  | Estimated monthly cost (USD) |
| --------------------------------------------------------- | ---------------------------: |
| Retained resources; ECS/RDS stopped, no one-off jobs      |                        39.66 |
| Measured sizing; 80 active hours per service and RDS      |                        58.22 |
| Measured sizing; always on, one task per service          |                       207.38 |
| Measured sizing; always at maximum, two tasks per service |                       330.78 |

These scenarios use frontend 0.5 vCPU/1 GiB and User/Supplier each 1 vCPU/2 GiB,
a single-AZ `db.t4g.micro`, 20 GiB gp3, and an ALB retained **730 hours even when
ECS/RDS are stopped**, plus 73 LCU-hours. Other assumptions are 10 GB/100,000
CloudFront requests, 100,000 WAF requests, eight secrets/1,000 API calls, 1 GB
application-log ingestion and storage, and 3 GB ECR storage. Active scenarios allow
2 vCPU-hours and 4 GB-hours for database/release jobs. The approved budget stays USD60;
only the 80-hour scenario fits, with little headroom for more usage or other team resources.

The estimator includes all four WAF rules. Fifteen explicit CloudWatch alarms contain
18 alarm metrics (the three task-shortfall expressions each list two); six target-tracking
policies create twelve further alarms, for **30 billable alarm metrics**. It also includes
the deployment-failure custom metric and original Container Insights: 13 cluster metrics,
14 paid service metrics, and 10 per task-definition family, prorated by active hours.
The `RunningTaskCount` series is free from October 2026. Job time is conservatively
bounded by vCPU-hours divided by the smallest task CPU allocation, 0.25 vCPU.
Two replicas share the same service/family series, so using task-hours can overestimate.
Performance-log ingestion/storage are separately added using AWS's example-volume
assumptions, with two containers per Service Connect task. Actual telemetry volume varies.
See [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) and the committed
Singapore offer snapshot for the USD0.30 custom-metric and USD0.10 alarm-metric rates.

Metrics are emitted when tasks run; a stopped service does not produce Container Insights
metrics. See [ECS Container Insights](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cloudwatch-container-insights.html).
No Free Tier, credit, or volume discount is subtracted. These are planning estimates,
not hard spending limits; RDS stop time and workload bursts must be monitored.

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

The repository artifact is the authoritative reviewed estimate; no separate AWS Pricing
Calculator link is required. The team leader must still compare its total with the NUS
tracking portal and record their name and approval timestamp in the configuration. AWS
Budget alerts are monitoring only, not a real-time hard cap.
