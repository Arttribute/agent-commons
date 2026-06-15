#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-apps/commons-api/.env}"
SECRET_ID="${2:-agent-commons/commons-api/production}"
KEY_FILE="$(dirname "$0")/runtime-secret-keys.txt"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI is required." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

payload='{}'
missing=()

aws_cli() {
  if [[ -d /opt/homebrew/opt/expat/lib ]]; then
    DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib aws "$@"
  else
    aws "$@"
  fi
}

while IFS= read -r key; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  value=$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)
  if [[ -z "$value" ]]; then
    missing+=("$key")
    continue
  fi
  payload=$(jq --arg key "$key" --arg value "$value" '. + {($key): $value}' <<<"$payload")
done < "$KEY_FILE"

if (( ${#missing[@]} > 0 )); then
  printf 'Missing required production values in %s:\n' "$ENV_FILE" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

aws_cli secretsmanager put-secret-value \
  --secret-id "$SECRET_ID" \
  --secret-string "$payload" >/dev/null

echo "Updated $SECRET_ID from $ENV_FILE."
