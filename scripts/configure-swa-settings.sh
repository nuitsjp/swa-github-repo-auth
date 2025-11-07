#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Configure Static Web App environment variables for GitHub auth.

Usage:
  configure-swa-settings.sh -g <resource-group> -n <swa-name> [options]

Required arguments:
  -g, --resource-group       Resource group containing the Static Web App
  -n, --name                 Static Web App name

Optional arguments (will be prompted if missing):
      --environment-name     Name of the Static Web App environment (default: Production)
      --client-id            GitHub OAuth App Client ID
      --client-secret        GitHub OAuth App Client Secret
      --repo-owner           GitHub repository owner or organization
      --repo-name            GitHub repository name
  -h, --help                 Show this help

The script sets the following SWA app settings:
  GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REPO_OWNER, GITHUB_REPO_NAME

Run `az login` beforehand.
EOF
}

RESOURCE_GROUP=""
SWA_NAME=""
ENVIRONMENT_NAME=""
CLIENT_ID=""
CLIENT_SECRET=""
REPO_OWNER=""
REPO_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -g|--resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    -n|--name)
      SWA_NAME="$2"
      shift 2
      ;;
    --environment-name)
      ENVIRONMENT_NAME="$2"
      shift 2
      ;;
    --client-id)
      CLIENT_ID="$2"
      shift 2
      ;;
    --client-secret)
      CLIENT_SECRET="$2"
      shift 2
      ;;
    --repo-owner)
      REPO_OWNER="$2"
      shift 2
      ;;
    --repo-name)
      REPO_NAME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$RESOURCE_GROUP" || -z "$SWA_NAME" ]]; then
  echo "[ERROR] --resource-group and --name are required" >&2
  usage
  exit 1
fi

if ! command -v az >/dev/null 2>&1; then
  echo "[ERROR] Azure CLI (az) is required. Install it from https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
fi

if [[ -z "$CLIENT_ID" ]]; then
  read -r -p "GitHub OAuth Client ID: " CLIENT_ID
fi

if [[ -z "$CLIENT_SECRET" ]]; then
  read -r -s -p "GitHub OAuth Client Secret: " CLIENT_SECRET
  echo
fi

if [[ -z "$REPO_OWNER" ]]; then
  read -r -p "GitHub repository owner (user or org): " REPO_OWNER
fi

if [[ -z "$REPO_NAME" ]]; then
  read -r -p "GitHub repository name: " REPO_NAME
fi

SETTINGS=(
  "GITHUB_CLIENT_ID=$CLIENT_ID"
  "GITHUB_CLIENT_SECRET=$CLIENT_SECRET"
  "GITHUB_REPO_OWNER=$REPO_OWNER"
  "GITHUB_REPO_NAME=$REPO_NAME"
)

cmd=(
  az staticwebapp appsettings set
  --name "$SWA_NAME"
  --resource-group "$RESOURCE_GROUP"
  --setting-names "${SETTINGS[@]}"
)

if [[ -n "$ENVIRONMENT_NAME" ]]; then
  cmd+=(--environment-name "$ENVIRONMENT_NAME")
fi

echo "[INFO] Updating app settings on '$SWA_NAME'..."
"${cmd[@]}" >/dev/null

echo "[SUCCESS] App settings updated. Run 'az staticwebapp appsettings list -n $SWA_NAME -g $RESOURCE_GROUP' to verify."
