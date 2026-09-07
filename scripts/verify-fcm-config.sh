#!/usr/bin/env bash

set -euo pipefail

required_variables=(
  FCM_PROJECT_ID
  FCM_CLIENT_EMAIL
  FCM_PRIVATE_KEY
)
missing_variables=()

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    missing_variables+=("${variable_name}")
  fi
done

if ((${#missing_variables[@]} > 0)); then
  printf 'Missing required Firebase Cloud Messaging configuration: %s\n' \
    "${missing_variables[*]}" >&2
  exit 1
fi

if [[ "${FCM_CLIENT_EMAIL}" != *@*.iam.gserviceaccount.com ]]; then
  printf 'FCM_CLIENT_EMAIL must be a Google service-account email.\n' >&2
  exit 1
fi

private_key="${FCM_PRIVATE_KEY//$'\r'/}"
if [[ "${private_key}" != *'BEGIN PRIVATE KEY'* &&
      "${private_key}" != *'BEGIN RSA PRIVATE KEY'* ]]; then
  printf 'FCM_PRIVATE_KEY does not contain a supported PEM header.\n' >&2
  exit 1
fi
if [[ "${private_key}" != *'END PRIVATE KEY'* &&
      "${private_key}" != *'END RSA PRIVATE KEY'* ]]; then
  printf 'FCM_PRIVATE_KEY does not contain a supported PEM footer.\n' >&2
  exit 1
fi

printf 'Firebase Cloud Messaging configuration is present for project %s.\n' \
  "${FCM_PROJECT_ID}"
