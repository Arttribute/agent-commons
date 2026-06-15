#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${1:?ECS Express service name is required}"
THRESHOLD="${2:?Alarm threshold is required}"
ALARM_JSON=$(mktemp)
trap 'rm -f "$ALARM_JSON"' EXIT

aws_cli() {
  if [[ -d /opt/homebrew/opt/expat/lib ]]; then
    DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib aws "$@"
  else
    aws "$@"
  fi
}

aws_cli cloudwatch describe-alarms \
  --alarm-names "default/${SERVICE_NAME}/RollbackAlarm" \
  --query 'MetricAlarms[0]' --output json --region "$AWS_REGION" |
jq --argjson threshold "$THRESHOLD" '{
  AlarmName, AlarmDescription, ActionsEnabled, OKActions, AlarmActions,
  InsufficientDataActions, Metrics, EvaluationPeriods, DatapointsToAlarm,
  Threshold: $threshold, ComparisonOperator, TreatMissingData,
  EvaluateLowSampleCountPercentile, ThresholdMetricId
} | with_entries(select(.value != null))' > "$ALARM_JSON"

aws_cli cloudwatch put-metric-alarm --cli-input-json "file://$ALARM_JSON" --region "$AWS_REGION"

if (( THRESHOLD > 1 )); then
  aws_cli cloudwatch set-alarm-state \
    --alarm-name "default/${SERVICE_NAME}/RollbackAlarm" \
    --state-value OK \
    --state-reason "Reset before ECS Express deployment" \
    --region "$AWS_REGION"
fi
