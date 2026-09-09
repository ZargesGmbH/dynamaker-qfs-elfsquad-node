#!/usr/bin/env bash
#
# Runs `sam <args…> --parameter-overrides <parameters from an env file>`.
#
# Usage: scripts/sam-with-env.sh <env-file> <sam args…>
#
# Every value is handed to SAM wrapped in literal single quotes. Without them SAM's
# --parameter-overrides shorthand truncates a value at its first comma as soon as the
# value contains double quotes, so a JobServicesByModelId JSON array silently arrives as
# the fragment `[{` and the Lambda then fails at init. Passing the env file through
# `xargs` has the same effect, because xargs strips the quotes before SAM sees them.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  printf 'Usage: %s <env-file> <sam args…>\n' "$0" >&2
  exit 1
fi

env_file="$1"
shift

if [ ! -f "$env_file" ]; then
  printf 'Env file %s not found. Copy .env.example and fill it in.\n' "$env_file" >&2
  exit 1
fi

params=()
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  trimmed="${line#"${line%%[![:space:]]*}"}"
  case "$trimmed" in
    '' | '#'*) continue ;;
  esac

  if [[ "$trimmed" != *=* ]]; then
    printf 'Skipping malformed line (no "="): %s\n' "$trimmed" >&2
    continue
  fi

  key="${trimmed%%=*}"
  value="${trimmed#*=}"

  # A single quote in the value would end the quoting SAM relies on; there is no way to
  # escape it in the shorthand syntax, so fail loudly instead of deploying a mangled value.
  if [[ "$value" == *\'* ]]; then
    printf 'Value of %s contains a single quote, which SAM cannot receive.\n' "$key" >&2
    exit 1
  fi

  params+=("${key}='${value}'")
done < "$env_file"

if [ "${#params[@]}" -eq 0 ]; then
  printf 'No parameters found in %s.\n' "$env_file" >&2
  exit 1
fi

exec sam "$@" --parameter-overrides "${params[@]}"
