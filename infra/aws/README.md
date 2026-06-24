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

Values can be uploaded from a
dotenv file. Values are sent directly to Secrets Manager and are not printed:

```bash
infra/aws/import-runtime-secrets.sh apps/commons-api/.env \
  agent-commons/commons-api/production
```

## Deploy and cut over

Run the `Deploy commons-api to AWS` workflow. It builds the API image, pushes it
to ECR, creates or updates the Express Mode service, and verifies `/health`.

The API custom domain `api.agentcommons.io` resolves to the AWS deployment.
Historical Cloud Run build and secret-migration files are retained under
`archive/gcp/` and must not be connected to an automatic trigger.
