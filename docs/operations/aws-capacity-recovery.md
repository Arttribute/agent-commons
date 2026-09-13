# Commons API rollout capacity and recovery

The production API and search service deploy together through
`.github/workflows/deploy-commons-api-aws.yml`. Vercel frontend readiness does
not prove that the API image has deployed.

## Before retrying a capacity failure

1. Check ECS service events and the CloudFormation stack state. A healthy
   previous task can remain active while CloudFormation reports
   `UPDATE_ROLLBACK_FAILED`.
2. Check the account's **Fargate On-Demand vCPU resource count** in the deployment
   region, including every ECS cluster. Rolling deployments need capacity for
   replacement tasks as well as the existing tasks. Include other services'
   scaling and deployments when planning headroom.
3. Request a quota increase if needed. Check existing requests before creating a
   duplicate. Do not stop unrelated services or reduce their resources to make
   a deployment fit without authorization from their owner.
4. After capacity is available, use `continue-update-rollback` for the affected
   stack and wait for `UPDATE_ROLLBACK_COMPLETE`. Do not skip resources merely
   to make the status green: skipped resources require explicit reconciliation.
5. Dispatch the normal protected production deployment from `main`. Confirm the
   deployed image/revision, task health and public API behavior. Restore any
   explicitly authorized temporary staging changes and verify staging health.

Useful read-only commands (production uses `eu-west-1`):

```sh
aws service-quotas get-service-quota --region eu-west-1 \
  --service-code fargate --quota-code L-3032A538
aws cloudformation describe-stacks --region eu-west-1 \
  --stack-name agent-commons-api-service \
  --query 'Stacks[0].{status:StackStatus,reason:StackStatusReason}'
aws ecs describe-services --region eu-west-1 --cluster default \
  --services agent-commons-api-production agent-commons-search-production \
  --query 'services[].{name:serviceName,running:runningCount,pending:pendingCount,desired:desiredCount,events:events[0:5]}'
```

The diagnosis on September 13, 2026 found all 12 allowed vCPUs allocated. The
replacement search task failed to start, and ECS restored its previous healthy
revision. The actual API and search health endpoints both returned HTTP 200;
CloudFormation still required recovery. An existing request for 24 vCPUs was
pending. Use live AWS state rather than treating this historical snapshot as the
current deployment status.

Diagnostic tools must report only deployment metadata and errors. Avoid dumping
container environment variables, runtime-secret values or full task definitions.
The isolated `fix/search-deployment-diagnostics` branch records a read-only
workflow that preserves permitted reads when another AWS read is denied.

References: [AWS ECS quotas](https://docs.aws.amazon.com/general/latest/gr/ecs-service.html)
and [CloudFormation recovery](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/troubleshooting.html).
