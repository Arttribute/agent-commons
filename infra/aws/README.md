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

| GitHub variable         | CloudFormation output   |
| ----------------------- | ----------------------- |
| `AWS_REGION`            | `AwsRegion`             |
| `AWS_DEPLOY_ROLE_ARN`   | `GitHubDeployRoleArn`   |
| `AWS_SOURCE_BUCKET`     | `SourceBucketName`      |
| `AWS_CODEBUILD_PROJECT` | `CodeBuildProjectName`  |

The service deployment itself receives `TaskRoleArn`, `AgentFilesBucketName`,
`TaskExecutionRoleArn`, `InfrastructureRoleArn`, `RuntimeSecretArn`, and the
region from the bootstrap stack through CodeBuild environment variables. The
running API uses the ECS task role for S3 access; do not store AWS access keys
or `AGENT_FILES_AWS_ROLE_ARN` in the production runtime secret for agent file
uploads.

If uploads fail with `Could not load credentials from any providers`, redeploy
this bootstrap stack first so the API task role and CodeBuild environment are
created, then run the `Deploy commons-api to AWS` workflow again.

## Runtime secrets

Values can be uploaded from a
dotenv file. Values are sent directly to Secrets Manager and are not printed:

```bash
infra/aws/import-runtime-secrets.sh apps/commons-api/.env \
  agent-commons/commons-api/production
```

Live web search can use either Brave or a self-hosted SearXNG instance:

```dotenv
# Managed provider
BRAVE_SEARCH_API_KEY=...

# Or self-hosted (JSON must be enabled in SearXNG search.formats)
WEB_SEARCH_PROVIDER=searxng
SEARXNG_BASE_URL=https://search.internal.example
SEARXNG_SEARCH_COST_USD_PER_CALL=0
```

Staging defaults to the repository's authenticated SearXNG container and
production defaults to `none`. The deployment builds both API and search
images, rotates an ephemeral shared key, deploys SearXNG as a separate ECS
Express service, and smoke-tests its JSON endpoint. Set the CodeBuild
`WEB_SEARCH_PROVIDER` environment variable only to override this default.

The ECS template only injects the Brave secret when Brave is explicitly
selected. `SEARXNG_SEARCH_COST_USD_PER_CALL` can optionally meter measured
self-hosted infrastructure cost; it defaults to zero.

## Deploy and cut over

Run the `Deploy commons-api to AWS` workflow. It builds the API image, pushes it
to ECR, creates or updates the Express Mode service, and verifies `/health`.

The API custom domain `api.agentcommons.io` resolves to the AWS deployment.
Historical Cloud Run build and secret-migration files are retained under
`archive/gcp/` and must not be connected to an automatic trigger.
