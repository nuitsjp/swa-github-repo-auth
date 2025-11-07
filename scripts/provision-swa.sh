#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Azure Static Web Apps resource bootstrapper

Usage:
  provision-swa.sh -g <resource-group> -n <swa-name> [options]

Required arguments:
  -g, --resource-group   Azure Resource Group name (will be created if it does not exist)
  -n, --name             Static Web App name (must be globally unique)

Optional arguments:
  -l, --location         Azure region for the Static Web App (default: japaneast)
      --sku              Static Web App SKU tier: Free | Standard | Dedicated (default: Standard)
      --source           GitHub repository URL to connect (skips if omitted)
      --branch           Repository branch to deploy (default: main)
      --app-location     Relative application path for build (for example ./docs)
      --api-location     Relative API path (for example api)
      --output-location  Relative build output path (for example dist)
      --login-with-github  Open browser flow to grant the Azure CLI GitHub app access
  -h, --help             Show this message

Examples:
  provision-swa.sh -g swa-docs-rg -n swa-docs-app
  provision-swa.sh -g swa-docs-rg -n swa-docs-app \
    --source https://github.com/contoso/swa-github-repo-auth --branch main \
    --app-location ./docs --api-location api --login-with-github

The script requires an active 'az login' session.
EOF
}

RESOURCE_GROUP=""
SWA_NAME=""
LOCATION="japaneast"
SKU="Standard"
SOURCE=""
BRANCH="main"
APP_LOCATION=""
API_LOCATION=""
OUTPUT_LOCATION=""
LOGIN_WITH_GITHUB=false

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
    -l|--location)
      LOCATION="$2"
      shift 2
      ;;
    --sku)
      SKU="$2"
      shift 2
      ;;
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --app-location)
      APP_LOCATION="$2"
      shift 2
      ;;
    --api-location)
      API_LOCATION="$2"
      shift 2
      ;;
    --output-location)
      OUTPUT_LOCATION="$2"
      shift 2
      ;;
    --login-with-github)
      LOGIN_WITH_GITHUB=true
      shift 1
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

echo "[INFO] Ensuring Azure Static Web Apps CLI extension is installed..."
if ! az extension show --name staticwebapp >/dev/null 2>&1; then
  az extension add --name staticwebapp >/dev/null
else
  az extension update --name staticwebapp >/dev/null || true
fi

echo "[INFO] Creating/Updating resource group '$RESOURCE_GROUP'..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null

create_args=(
  az staticwebapp create
  --name "$SWA_NAME"
  --resource-group "$RESOURCE_GROUP"
  --location "$LOCATION"
  --sku "$SKU"
)

if [[ -n "$SOURCE" ]]; then
  create_args+=(--source "$SOURCE" --branch "$BRANCH")
fi

if [[ -n "$APP_LOCATION" ]]; then
  create_args+=(--app-location "$APP_LOCATION")
fi

if [[ -n "$API_LOCATION" ]]; then
  create_args+=(--api-location "$API_LOCATION")
fi

if [[ -n "$OUTPUT_LOCATION" ]]; then
  create_args+=(--output-location "$OUTPUT_LOCATION")
fi

if [[ "$LOGIN_WITH_GITHUB" == true ]]; then
  create_args+=(--login-with-github)
fi

echo "[INFO] Creating Static Web App '$SWA_NAME'..."
"${create_args[@]}"

echo "[SUCCESS] Static Web App '$SWA_NAME' is ready. Retrieve the deployment token with:\n  az staticwebapp secrets list -n $SWA_NAME -g $RESOURCE_GROUP --query deploymentToken -o tsv"
