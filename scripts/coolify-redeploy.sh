#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${COOLIFY_ENV_FILE:-$HOME/.secrets/coolify1.env}"
PROJECT_COOLIFY_RESOURCE_UUID="nmu27zox7uqup1wngzgf0ie9"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<EOF
Missing Coolify env file: $ENV_FILE

Create it with:

  mkdir -p "$HOME/.secrets"
  chmod 700 "$HOME/.secrets"
  install -m 600 /dev/null "$ENV_FILE"

Then add:

  COOLIFY_BASE_URL=http://coolify1:8000
  COOLIFY_API_TOKEN=<token>
EOF
  exit 1
fi

if [[ "$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")" != "600" ]]; then
  echo "Warning: $ENV_FILE should have mode 600 (chmod 600 \"$ENV_FILE\")" >&2
fi

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  if [[ "$line" != *=* ]]; then
    echo "Invalid line in $ENV_FILE: expected KEY=value" >&2
    exit 1
  fi

  key="${line%%=*}"
  value="${line#*=}"
  # Allow KEY="value" / KEY='value'.
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi

  case "$key" in
    COOLIFY_BASE_URL | COOLIFY_API_TOKEN | COOLIFY_FORCE | COOLIFY_RESOURCE_UUID | COOLIFY_GIT_BRANCH | COOLIFY_GIT_REPOSITORY)
      printf -v "$key" "%s" "$value"
      ;;
    *)
      echo "Ignoring unsupported key in $ENV_FILE: $key" >&2
      ;;
  esac
done < "$ENV_FILE"

: "${COOLIFY_BASE_URL:?Missing COOLIFY_BASE_URL}"
: "${COOLIFY_API_TOKEN:?Missing COOLIFY_API_TOKEN}"

COOLIFY_FORCE="${COOLIFY_FORCE:-false}"
COOLIFY_RESOURCE_UUID="${COOLIFY_RESOURCE_UUID:-$PROJECT_COOLIFY_RESOURCE_UUID}"
COOLIFY_BASE_URL="${COOLIFY_BASE_URL%/}"
COOLIFY_GIT_BRANCH="${COOLIFY_GIT_BRANCH:-$(git -C "$ROOT_DIR" branch --show-current)}"
COOLIFY_GIT_REPOSITORY="${COOLIFY_GIT_REPOSITORY:-$(git -C "$ROOT_DIR" remote get-url origin)}"

if [[ "$COOLIFY_GIT_REPOSITORY" =~ ^git@github.com:(.+)\.git$ ]]; then
  COOLIFY_GIT_REPOSITORY="${BASH_REMATCH[1]}"
elif [[ "$COOLIFY_GIT_REPOSITORY" =~ ^https://github.com/(.+)\.git$ ]]; then
  COOLIFY_GIT_REPOSITORY="${BASH_REMATCH[1]}"
elif [[ "$COOLIFY_GIT_REPOSITORY" =~ ^https://github.com/(.+)$ ]]; then
  COOLIFY_GIT_REPOSITORY="${BASH_REMATCH[1]}"
fi

if [[ "$COOLIFY_FORCE" != "true" && "$COOLIFY_FORCE" != "false" ]]; then
  echo "COOLIFY_FORCE must be true or false" >&2
  exit 1
fi

# Inside a quoted curl config value \ and " are escape characters, so escape them
# (backslashes first) or a token containing them would be mangled or break the line.
COOLIFY_API_TOKEN_CONFIG="${COOLIFY_API_TOKEN//\\/\\\\}"
COOLIFY_API_TOKEN_CONFIG="${COOLIFY_API_TOKEN_CONFIG//\"/\\\"}"

# Pass the token through curl's stdin config instead of argv, so it never shows up in `ps`.
coolify_curl() {
  curl --fail-with-body --show-error --silent --location --config - "$@" <<EOF
header = "Authorization: Bearer ${COOLIFY_API_TOKEN_CONFIG}"
header = "Accept: application/json"
EOF
}

# On Windows `python3` may be the Microsoft Store stub, which exists but does not run.
if python3 -c '' >/dev/null 2>&1; then PYTHON=python3; else PYTHON=python; fi

json_field() {
  "$PYTHON" -c 'import json, sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1"
}

if [[ -z "${COOLIFY_RESOURCE_UUID:-}" ]]; then
  APPLICATIONS_JSON="$(coolify_curl "${COOLIFY_BASE_URL}/api/v1/applications")"

  COOLIFY_RESOURCE_UUID="$(APPLICATIONS_JSON="$APPLICATIONS_JSON" "$PYTHON" - "$COOLIFY_GIT_REPOSITORY" "$COOLIFY_GIT_BRANCH" <<'PY'
import json
import os
import re
import sys


def repo_slug(value):
    """owner/name from owner/name, a GitHub https URL or an scp-style SSH URL."""
    value = re.sub(r"\.git$", "", value.strip().rstrip("/"))
    value = re.sub(r"^(?:https?://|ssh://)?(?:[^@/]+@)?github\.com[:/]", "", value)
    return value.lower()


repo = repo_slug(sys.argv[1])
branch = sys.argv[2]
apps = json.loads(os.environ["APPLICATIONS_JSON"])

matches = []
for app in apps:
    app_repo_values = [
        str(app.get("git_repository") or ""),
        str(app.get("git_full_url") or ""),
    ]
    branch_matches = not branch or str(app.get("git_branch") or "") == branch
    # Exact match: a substring test let "owner/app" also match "owner/app-staging".
    repo_matches = any(value and repo_slug(value) == repo for value in app_repo_values)
    if repo_matches and branch_matches:
        matches.append(app)

if len(matches) != 1:
    print(
        f"Expected exactly one Coolify application for repo {repo!r} on branch {branch!r}, found {len(matches)}.",
        file=sys.stderr,
    )
    if matches:
        for app in matches:
            print(f"- {app.get('uuid')} {app.get('name')} {app.get('git_branch')}", file=sys.stderr)
    sys.exit(1)

print(matches[0]["uuid"])
PY
)"
fi

if [[ ! "$COOLIFY_RESOURCE_UUID" =~ ^[A-Za-z0-9]+$ ]]; then
  echo "Invalid Coolify application UUID: $COOLIFY_RESOURCE_UUID" >&2
  exit 1
fi

DEPLOY_URL="${COOLIFY_BASE_URL}/api/v1/deploy?uuid=${COOLIFY_RESOURCE_UUID}&force=${COOLIFY_FORCE}"

echo "Triggering Coolify deployment of application ${COOLIFY_RESOURCE_UUID}"

DEPLOY_JSON="$(coolify_curl --request POST "$DEPLOY_URL")"
DEPLOYMENT_UUID="$(printf '%s' "$DEPLOY_JSON" | "$PYTHON" -c 'import json, sys; print(json.load(sys.stdin)["deployments"][0]["deployment_uuid"])')"
echo "Deployment ${DEPLOYMENT_UUID} queued"

if [[ "${COOLIFY_WAIT:-true}" != "true" ]]; then
  exit 0
fi

# Queuing is not success: wait until Coolify has built and rolled out the image.
deadline=$((SECONDS + ${COOLIFY_WAIT_TIMEOUT:-900}))
last_status=""
while :; do
  DEPLOYMENT_JSON="$(coolify_curl "${COOLIFY_BASE_URL}/api/v1/deployments/${DEPLOYMENT_UUID}")"
  status="$(printf '%s' "$DEPLOYMENT_JSON" | json_field status)"
  if [[ "$status" != "$last_status" ]]; then
    echo "Deployment status: ${status}"
    last_status="$status"
  fi
  case "$status" in
    finished) break ;;
    failed | cancelled*)
      echo "Deployment ${DEPLOYMENT_UUID} ended with status ${status}; see the Coolify UI for the build log." >&2
      exit 1
      ;;
  esac
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for deployment ${DEPLOYMENT_UUID} (last status: ${status})" >&2
    exit 1
  fi
  sleep 10
done

deployed_commit="$(printf '%s' "$DEPLOYMENT_JSON" | json_field commit)"
echo "Deployed commit: ${deployed_commit}"
local_head="$(git -C "$ROOT_DIR" rev-parse HEAD)"
if [[ "$deployed_commit" != "$local_head" ]]; then
  echo "Warning: deployed commit differs from local HEAD ${local_head} (not pushed yet, or Coolify tracks another branch)" >&2
fi
