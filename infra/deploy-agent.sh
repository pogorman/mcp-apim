#!/bin/bash
set -euo pipefail

# ============================================================
# Philly MCP Server - Container App Deployment
# ============================================================
# Usage: ./infra/deploy-agent.sh
# Requires: az CLI logged in, subscription set
#
# Set these environment variables before running:
#   APIM_SUBSCRIPTION_KEY - Your APIM subscription key
#
# Or it will be prompted interactively.

# --- Configuration ---
RESOURCE_GROUP="rg-philly-profiteering"
LOCATION="eastus2"
ACR_NAME="phillymcpacr"
CA_ENV_NAME="philly-mcp-env"
CA_APP_NAME="philly-mcp-server"
APIM_BASE_URL="https://philly-profiteering-apim.azure-api.net/api"

# --- Prompt for APIM key if not set ---
if [ -z "${APIM_SUBSCRIPTION_KEY:-}" ]; then
  echo "Enter your APIM subscription key:"
  read -s APIM_SUBSCRIPTION_KEY
  echo ""
fi

echo "=== Creating Container Registry (Basic) ==="
az acr create \
  --name "$ACR_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Basic \
  --admin-enabled true \
  --output none

echo "=== Building Container Image via ACR ==="
az acr build \
  --registry "$ACR_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --image mcp-server:latest \
  --file mcp-server/Dockerfile \
  mcp-server/

echo "=== Creating Container App Environment (Consumption) ==="
az containerapp env create \
  --name "$CA_ENV_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

echo "=== Getting ACR Credentials ==="
ACR_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "loginServer" -o tsv)
ACR_USER=$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "username" -o tsv)
ACR_PASS=$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "passwords[0].value" -o tsv)

echo "=== Creating Container App ==="
az containerapp create \
  --name "$CA_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CA_ENV_NAME" \
  --image "${ACR_SERVER}/mcp-server:latest" \
  --registry-server "$ACR_SERVER" \
  --registry-username "$ACR_USER" \
  --registry-password "$ACR_PASS" \
  --target-port 8080 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 3 \
  --secrets "apim-key=${APIM_SUBSCRIPTION_KEY}" \
  --env-vars \
    "MCP_TRANSPORT=http" \
    "PORT=8080" \
    "APIM_BASE_URL=${APIM_BASE_URL}" \
    "APIM_SUBSCRIPTION_KEY=secretref:apim-key" \
  --output none

echo "=== Configuring Health Probe ==="
az containerapp update \
  --name "$CA_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --set-env-vars "DUMMY=probe-update" \
  --output none 2>/dev/null || true

# Get the app URL
APP_URL=$(az containerapp show \
  --name "$CA_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo ""
echo "============================================"
echo "  Container App Deployed!"
echo "============================================"
echo ""
echo "Resources created:"
echo "  Container Registry: ${ACR_NAME}.azurecr.io"
echo "  Container App Env:  $CA_ENV_NAME"
echo "  Container App:      $CA_APP_NAME"
echo ""
echo "MCP Server URL:  https://${APP_URL}/mcp"
echo "Health Check:    https://${APP_URL}/healthz"
echo ""
echo "Test with:"
echo "  curl https://${APP_URL}/healthz"
echo ""
echo "  curl -X POST https://${APP_URL}/mcp \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}}}'"
echo ""
