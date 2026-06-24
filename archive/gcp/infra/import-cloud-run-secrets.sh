#!/usr/bin/env bash
# Archived migration helper. Production secrets now live in AWS Secrets Manager.
set -euo pipefail

SERVICE_JSON="${1:?Cloud Run service JSON is required}"
GCP_PROJECT="${2:?GCP project ID is required}"
AWS_SECRET_ID="${3:?AWS Secrets Manager secret ID is required}"

for command in gcloud aws jq; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "$command is required." >&2
    exit 1
  fi
done

if [[ ! -f "$SERVICE_JSON" ]]; then
  echo "Cloud Run service JSON not found: $SERVICE_JSON" >&2
  exit 1
fi

payload='{}'

aws_cli() {
  if [[ -d /opt/homebrew/opt/expat/lib ]]; then
    DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib aws "$@"
  else
    aws "$@"
  fi
}

while IFS= read -r entry; do
  name=$(jq -r '.name' <<<"$entry")

  case "$name" in
    NODE_ENV | HOST | LOG_LEVEL | PORT)
      continue
      ;;
  esac

  if jq -e 'has("value")' >/dev/null <<<"$entry"; then
    value=$(jq -r '.value' <<<"$entry")
  else
    secret_name=$(jq -r '.valueFrom.secretKeyRef.name' <<<"$entry")
    version=$(jq -r '.valueFrom.secretKeyRef.key // "latest"' <<<"$entry")
    value=$(gcloud secrets versions access "$version" \
      --secret "$secret_name" \
      --project "$GCP_PROJECT")
  fi

  payload=$(jq --arg name "$name" --arg value "$value" \
    '. + {($name): $value}' <<<"$payload")
done < <(jq -c '.spec.template.spec.containers[0].env[]?' "$SERVICE_JSON")

aws_cli secretsmanager put-secret-value \
  --secret-id "$AWS_SECRET_ID" \
  --secret-string "$payload" >/dev/null

echo "Migrated Cloud Run environment values to $AWS_SECRET_ID."
