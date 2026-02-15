#!/bin/bash
set -euo pipefail

# ============================================================
# Philly Poverty Profiteering - Azure Infrastructure Deployment
# ============================================================
# Usage: ./infra/deploy.sh
# Requires: az CLI logged in, subscription set
#
# Set these environment variables before running:
#   SQL_ADMIN_PASSWORD - Password for the SQL admin user
#
# Or they will be prompted interactively.

# --- Configuration ---
RESOURCE_GROUP="rg-philly-profiteering"
LOCATION="eastus"
SQL_SERVER_NAME="philly-profiteering-sql"
SQL_DB_NAME="phillystats"
SQL_ADMIN_USER="phillyadmin"
STORAGE_ACCOUNT="phillyprofiteersa"
FUNC_APP_NAME="philly-profiteering-func"
APIM_NAME="philly-profiteering-apim"
FUNC_PLAN_NAME="philly-profiteering-plan"

# --- Prompt for password if not set ---
if [ -z "${SQL_ADMIN_PASSWORD:-}" ]; then
  echo "Enter SQL admin password (min 8 chars, must include upper, lower, number, special):"
  read -s SQL_ADMIN_PASSWORD
  echo ""
fi

echo "=== Creating Resource Group ==="
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

echo "=== Creating SQL Server ==="
az sql server create \
  --name "$SQL_SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --admin-user "$SQL_ADMIN_USER" \
  --admin-password "$SQL_ADMIN_PASSWORD" \
  --output none

echo "=== Configuring SQL Firewall ==="
# Allow Azure services
az sql server firewall-rule create \
  --server "$SQL_SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --name "AllowAzureServices" \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0 \
  --output none

# Allow current client IP
MY_IP=$(curl -s https://ifconfig.me)
az sql server firewall-rule create \
  --server "$SQL_SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --name "AllowClientIP" \
  --start-ip-address "$MY_IP" \
  --end-ip-address "$MY_IP" \
  --output none
echo "  Added firewall rule for client IP: $MY_IP"

echo "=== Creating SQL Database (General Purpose Serverless) ==="
az sql db create \
  --name "$SQL_DB_NAME" \
  --server "$SQL_SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --edition GeneralPurpose \
  --family Gen5 \
  --capacity 2 \
  --compute-model Serverless \
  --auto-pause-delay 60 \
  --min-capacity 0.5 \
  --max-size 32GB \
  --output none

echo "=== Creating Storage Account ==="
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --output none

echo "=== Creating Function App (Consumption Plan) ==="
az functionapp create \
  --name "$FUNC_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --storage-account "$STORAGE_ACCOUNT" \
  --consumption-plan-location "$LOCATION" \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --output none

echo "=== Configuring Function App Settings ==="
SQL_CONN_STR="Server=tcp:${SQL_SERVER_NAME}.database.windows.net,1433;Database=${SQL_DB_NAME};User ID=${SQL_ADMIN_USER};Password=${SQL_ADMIN_PASSWORD};Encrypt=true;TrustServerCertificate=false;"

az functionapp config appsettings set \
  --name "$FUNC_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    "SQL_SERVER=${SQL_SERVER_NAME}.database.windows.net" \
    "SQL_DATABASE=${SQL_DB_NAME}" \
    "SQL_USER=${SQL_ADMIN_USER}" \
    "SQL_PASSWORD=${SQL_ADMIN_PASSWORD}" \
  --output none

echo "=== Creating APIM Instance (Basic v2) ==="
echo "  NOTE: APIM provisioning can take 10-30 minutes."
az apim create \
  --name "$APIM_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --publisher-name "Philly Profiteering Project" \
  --publisher-email "admin@example.com" \
  --sku-name Basicv2 \
  --output none

echo "=== Getting Function App Key ==="
FUNC_KEY=$(az functionapp keys list \
  --name "$FUNC_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "functionKeys.default" -o tsv 2>/dev/null || echo "")

if [ -z "$FUNC_KEY" ]; then
  echo "  Function key not yet available (app may still be starting). You can retrieve it later with:"
  echo "  az functionapp keys list --name $FUNC_APP_NAME --resource-group $RESOURCE_GROUP"
fi

echo "=== Configuring APIM API ==="
FUNC_URL="https://${FUNC_APP_NAME}.azurewebsites.net/api"

# Create API in APIM pointing to Function App
az apim api create \
  --resource-group "$RESOURCE_GROUP" \
  --service-name "$APIM_NAME" \
  --api-id "philly-stats" \
  --display-name "Philly Stats API" \
  --path "philly" \
  --service-url "$FUNC_URL" \
  --protocols https \
  --output none

echo ""
echo "============================================"
echo "  Deployment Complete!"
echo "============================================"
echo ""
echo "Resources created:"
echo "  Resource Group:  $RESOURCE_GROUP"
echo "  SQL Server:      ${SQL_SERVER_NAME}.database.windows.net"
echo "  SQL Database:    $SQL_DB_NAME"
echo "  SQL Admin:       $SQL_ADMIN_USER"
echo "  Function App:    https://${FUNC_APP_NAME}.azurewebsites.net"
echo "  APIM Gateway:    https://${APIM_NAME}.azure-api.net/philly"
echo "  Storage Account: $STORAGE_ACCOUNT"
echo ""
echo "Next steps:"
echo "  1. Run sql/seed.sh to load data into the database"
echo "  2. Deploy functions: cd functions && func azure functionapp publish $FUNC_APP_NAME"
echo "  3. Get APIM subscription key: az apim subscription list -g $RESOURCE_GROUP -n $APIM_NAME"
echo ""
