# AWS deployment for commons-api

`commons-api` deploys to Amazon ECS Express Mode. The Next.js applications are
still deployed by Vercel and are intentionally outside this workflow.

## Bootstrap

Deploy the bootstrap stack in the AWS account and region that will host the API:

```bash
aws cloudformation deploy \
  --stack-name agent-commons-api-bootstrap \
  --template-file infra/aws/ecs-express-bootstrap.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region eu-west-1
```

If the account already has the GitHub Actions OIDC provider, pass its ARN with
`ExistingGitHubOidcProviderArn` instead of creating another provider.
The deploy role is restricted to the repository's `production` GitHub
environment; branch protection remains enforced by the workflow trigger.

Copy the stack outputs into GitHub's `production` environment as variables:

| GitHub variable               | CloudFormation output   |
| ----------------------------- | ----------------------- |
| `AWS_REGION`                  | `AwsRegion`             |
| `AWS_ECR_REPOSITORY`          | `EcrRepository`         |
| `AWS_DEPLOY_ROLE_ARN`         | `GitHubDeployRoleArn`   |
| `AWS_TASK_EXECUTION_ROLE_ARN` | `TaskExecutionRoleArn`  |
| `AWS_INFRASTRUCTURE_ROLE_ARN` | `InfrastructureRoleArn` |
| `AWS_RUNTIME_SECRET_ARN`      | `RuntimeSecretArn`      |

## Runtime secrets

For the GCP migration, export the Cloud Run service and transfer its direct
values and Secret Manager references without printing them:

```bash
gcloud run services describe arttribute-commons-api-prod \
  --project arttribute-424420 \
  --region europe-west1 \
  --format=json > /tmp/agent-commons-prod.json

infra/aws/import-cloud-run-secrets.sh \
  /tmp/agent-commons-prod.json \
  arttribute-424420 \
  agent-commons/commons-api/production
```

For local development or recovery, values can instead be uploaded from a
dotenv file. Values are sent directly to Secrets Manager and are not printed:

```bash
infra/aws/import-runtime-secrets.sh apps/commons-api/.env \
  agent-commons/commons-api/production
```

## Deploy and cut over

Run the `Deploy commons-api to AWS` workflow. It builds the API image, pushes it
to ECR, creates or updates the Express Mode service, and verifies `/health`.

Once the endpoint passes application smoke tests, update the API custom-domain
DNS record for `api.agentcommons.io` to the Express Mode load balancer. The CLI
and courses app already use that stable hostname. Keep Cloud Run available
during a short validation period, then remove the Cloud Build trigger and Cloud
Run service. The Vercel projects, workflows, and application DNS records remain
unchanged; only their API origin continues to resolve through
`api.agentcommons.io`.
