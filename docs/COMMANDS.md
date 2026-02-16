# Commands Reference

All CLI commands used to build, deploy, and manage this project. Grouped by category.

---

## Table of Contents

- [Build & Development](#build--development)
- [Azure Infrastructure](#azure-infrastructure-infradeploysh)
- [Container App Deployment](#container-app-deployment-infradeploy-agentsh)
- [Function App Deployment](#function-app-deployment)
- [Data Loading](#data-loading)
- [SQL Administration](#sql-administration)
- [API Testing (curl)](#api-testing-curl)
- [MCP Testing (Container App)](#mcp-testing-container-app)
- [Azure AI Foundry Agent](#azure-ai-foundry-agent)
- [Chat API Testing](#chat-api-testing)
- [Azure AI Foundry Setup](#azure-ai-foundry-setup)
- [Static Web App (Chat SPA)](#static-web-app-chat-spa)
- [Git & GitHub](#git--github)
- [Troubleshooting](#troubleshooting)

---

## Build & Development

```bash
npm install                          # Install all workspace dependencies (root, functions, mcp-server)
npm run build -w functions           # Compile Azure Functions TypeScript to dist/
npm run build -w mcp-server          # Compile MCP server TypeScript to dist/
node mcp-server/dist/index.js        # Run MCP server locally (stdio mode)
```

```bash
# Run MCP server in HTTP mode (Streamable HTTP for remote clients)
MCP_TRANSPORT=http PORT=3000 \
  APIM_BASE_URL=https://philly-profiteering-apim.azure-api.net/api \
  APIM_SUBSCRIPTION_KEY=<key> \
  node mcp-server/dist/index.js
```

---

## Azure Infrastructure (infra/deploy.sh)

### Resource Group

```bash
az group create --name rg-philly-profiteering --location eastus2
```

### SQL Server & Database

```bash
# Create SQL Server (AAD-only auth)
az sql server create \
  --name philly-stats-sql-01 \
  --resource-group rg-philly-profiteering \
  --location eastus2 \
  --admin-user phillyadmin \
  --admin-password <password>

# Allow Azure services through firewall
az sql server firewall-rule create \
  --server philly-stats-sql-01 \
  --resource-group rg-philly-profiteering \
  --name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Allow client IP through firewall
az sql server firewall-rule create \
  --server philly-stats-sql-01 \
  --resource-group rg-philly-profiteering \
  --name AllowClientIP \
  --start-ip-address <your-ip> \
  --end-ip-address <your-ip>

# Create Serverless database (Gen5, 2 vCores, auto-pause at 60min)
az sql db create \
  --name phillystats \
  --server philly-stats-sql-01 \
  --resource-group rg-philly-profiteering \
  --edition GeneralPurpose \
  --family Gen5 \
  --capacity 2 \
  --compute-model Serverless \
  --auto-pause-delay 60 \
  --min-capacity 0.5 \
  --max-size 32GB

# Set AAD-only authentication
az sql server ad-only-auth enable \
  --server philly-stats-sql-01 \
  --resource-group rg-philly-profiteering

# Re-enable public network access (MCAPS policy disables this periodically)
az sql server update \
  --name philly-stats-sql-01 \
  --resource-group rg-philly-profiteering \
  --enable-public-network true
```

### Storage Accounts

```bash
# CSV data storage
az storage account create \
  --name phillyprofiteersa \
  --resource-group rg-philly-profiteering \
  --location eastus \
  --sku Standard_LRS

# Function App storage
az storage account create \
  --name phillyfuncsa \
  --resource-group rg-philly-profiteering \
  --location eastus2 \
  --sku Standard_LRS

# Re-enable public access (MCAPS policy disables this periodically)
az storage account update \
  --name phillyfuncsa \
  --resource-group rg-philly-profiteering \
  --public-network-access Enabled
```

### Function App

```bash
# Create Flex Consumption function app (Node.js 20)
az functionapp create \
  --name philly-profiteering-func \
  --resource-group rg-philly-profiteering \
  --storage-account phillyfuncsa \
  --flexconsumption-location eastus2 \
  --runtime node \
  --runtime-version 20

# Enable system-assigned managed identity
az functionapp identity assign \
  --name philly-profiteering-func \
  --resource-group rg-philly-profiteering

# Set app settings (SQL connection info)
az functionapp config appsettings set \
  --name philly-profiteering-func \
  --resource-group rg-philly-profiteering \
  --settings \
    "SQL_SERVER=philly-stats-sql-01.database.windows.net" \
    "SQL_DATABASE=phillystats"

# List function keys
az functionapp keys list \
  --name philly-profiteering-func \
  --resource-group rg-philly-profiteering

# List deployed functions
az functionapp function list \
  --name philly-profiteering-func \
  --resource-group rg-philly-profiteering \
  --query "[].name" -o tsv
```

### API Management

```bash
# Create APIM instance (Consumption tier, takes 10-30 min)
az apim create \
  --name philly-profiteering-apim \
  --resource-group rg-philly-profiteering \
  --location eastus2 \
  --publisher-name "Philly Profiteering Project" \
  --publisher-email "admin@example.com" \
  --sku-name Consumption

# Create API with /api path prefix
az apim api create \
  --resource-group rg-philly-profiteering \
  --service-name philly-profiteering-apim \
  --api-id philly-stats \
  --display-name "Philly Stats API" \
  --path api \
  --service-url "https://philly-profiteering-func.azurewebsites.net/api" \
  --protocols https

# List APIs (check path)
az apim api list \
  --resource-group rg-philly-profiteering \
  --service-name philly-profiteering-apim \
  --query "[].{name:name, path:path}" -o table

# Create API operations (example: search-entities)
az apim api operation create \
  --resource-group rg-philly-profiteering \
  --service-name philly-profiteering-apim \
  --api-id philly-stats \
  --operation-id search-entities \
  --display-name "Search Entities" \
  --method POST \
  --url-template "/search-entities"

# Create product and subscription
az apim product create \
  --resource-group rg-philly-profiteering \
  --service-name philly-profiteering-apim \
  --product-id PhillyStats \
  --title "PhillyStats" \
  --subscription-required true \
  --state published

az apim product api add \
  --resource-group rg-philly-profiteering \
  --service-name philly-profiteering-apim \
  --product-id PhillyStats \
  --api-id philly-stats

az apim subscription create \
  --resource-group rg-philly-profiteering \
  --service-name philly-profiteering-apim \
  --product-id /products/PhillyStats \
  --display-name "Default" \
  --subscription-id DefaultSubscription

# List subscription keys
az apim subscription list \
  --resource-group rg-philly-profiteering \
  --service-name philly-profiteering-apim \
  --query "[].{name:displayName, key:primaryKey}" -o table
```

### APIM Policy (PowerShell)

```powershell
# Set inbound policy to inject function key on all API requests
./infra/set-policy.ps1 -FunctionKey <function-key> -SubscriptionId <subscription-id>
```

---

## Container App Deployment (infra/deploy-agent.sh)

```bash
# Register required resource providers
az provider register --namespace Microsoft.ContainerRegistry --wait
az provider register --namespace Microsoft.App --wait

# Create Container Registry (Basic tier)
az acr create \
  --name phillymcpacr \
  --resource-group rg-philly-profiteering \
  --location eastus2 \
  --sku Basic \
  --admin-enabled true

# Build Docker image via ACR (cloud build, no local Docker needed)
az acr build \
  --registry phillymcpacr \
  --resource-group rg-philly-profiteering \
  --image mcp-server:latest \
  --file mcp-server/Dockerfile \
  mcp-server/

# Create Container App Environment (Consumption plan, scales to zero)
az containerapp env create \
  --name philly-mcp-env \
  --resource-group rg-philly-profiteering \
  --location eastus2

# Get ACR credentials
az acr show --name phillymcpacr --query loginServer -o tsv
az acr credential show --name phillymcpacr --query username -o tsv
az acr credential show --name phillymcpacr --query "passwords[0].value" -o tsv

# Create Container App with APIM key as secret
az containerapp create \
  --name philly-mcp-server \
  --resource-group rg-philly-profiteering \
  --environment philly-mcp-env \
  --image phillymcpacr.azurecr.io/mcp-server:latest \
  --registry-server phillymcpacr.azurecr.io \
  --registry-username <acr-user> \
  --registry-password <acr-pass> \
  --target-port 8080 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 3 \
  --secrets "apim-key=<apim-subscription-key>" \
  --env-vars \
    "MCP_TRANSPORT=http" \
    "PORT=8080" \
    "APIM_BASE_URL=https://philly-profiteering-apim.azure-api.net/api" \
    "APIM_SUBSCRIPTION_KEY=secretref:apim-key"

# Update Container App env vars
az containerapp update \
  --name philly-mcp-server \
  --resource-group rg-philly-profiteering \
  --set-env-vars "APIM_BASE_URL=https://philly-profiteering-apim.azure-api.net/api"

# Get Container App URL
az containerapp show \
  --name philly-mcp-server \
  --resource-group rg-philly-profiteering \
  --query "properties.configuration.ingress.fqdn" -o tsv

# View Container App logs
az containerapp logs show \
  --name philly-mcp-server \
  --resource-group rg-philly-profiteering \
  --follow
```

---

## Function App Deployment

```bash
# Staging directory approach (required due to npm workspace hoisting)
mkdir /tmp/func-staging
cp -r functions/dist functions/host.json functions/package.json functions/package-lock.json /tmp/func-staging/

# Remove "philly-functions": "file:" self-reference from package.json, fix trailing comma
cd /tmp/func-staging
npm install --omit=dev

# Deploy via func CLI
func azure functionapp publish philly-profiteering-func --javascript

# Alternative: deploy via zip (use custom PS script to avoid backslash path bug)
az functionapp deployment source config-zip \
  --resource-group rg-philly-profiteering \
  --name philly-profiteering-func \
  --src <zip-path>
```

### Windows Zip Script (avoids backslash path separator bug)

```powershell
# PowerShell script to create deployment zip with forward slashes
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = 'C:\path\to\func-staging'
$zip = 'C:\path\to\func-deploy.zip'
$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1).Replace('\','/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $rel)
}
$archive.Dispose()
```

---

## Data Loading

```bash
# Node.js bulk import (custom CSV parser for Philadelphia data edge cases)
node sql/bulk_import.js <table-name> <csv-file>
```

---

## SQL Administration

```bash
# Assign managed identity as db_datareader (use az rest to work around MCAPS RBAC blocks)
MSYS_NO_PATHCONV=1 az rest \
  --method PUT \
  --url "https://management.azure.com/subscriptions/<sub>/resourceGroups/rg-philly-profiteering/providers/Microsoft.Sql/servers/philly-stats-sql-01/databases/phillystats/providers/Microsoft.Authorization/roleAssignments/<guid>?api-version=2022-04-01" \
  --body '{"properties":{"roleDefinitionId":"/subscriptions/<sub>/providers/Microsoft.Authorization/roleDefinitions/<reader-role-id>","principalId":"<managed-identity-id>"}}'
```

---

## API Testing (curl)

```bash
KEY="<your-apim-subscription-key>"
BASE="https://philly-profiteering-apim.azure-api.net/api"

# Search entities
curl -s -X POST "$BASE/search-entities" \
  -H "Ocp-Apim-Subscription-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "GEENA LLC"}' | jq .

# Get entity network
curl -s "$BASE/entities/<entity-id>/network" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .

# Get property profile
curl -s "$BASE/properties/405100505" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .

# Get property violations
curl -s "$BASE/properties/405100505/violations" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .

# Get property assessments
curl -s "$BASE/properties/405100505/assessments" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .

# Get property licenses
curl -s "$BASE/properties/405100505/licenses" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .

# Get property appeals
curl -s "$BASE/properties/405100505/appeals" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .

# Get property demolitions
curl -s "$BASE/properties/405100505/demolitions" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .

# Search businesses
curl -s -X POST "$BASE/search-businesses" \
  -H "Ocp-Apim-Subscription-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"keyword": "CHECK CASHING", "zip": "19134"}' | jq .

# Get top violators
curl -s "$BASE/stats/top-violators?limit=10&minProperties=5" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .

# Get area stats
curl -s "$BASE/stats/zip/19134" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .

# Run custom SQL query
curl -s -X POST "$BASE/query" \
  -H "Ocp-Apim-Subscription-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT TOP(5) owner_1, COUNT(*) AS cnt FROM opa_properties GROUP BY owner_1 ORDER BY cnt DESC"}' | jq .
```

---

## MCP Testing (Container App)

```bash
# Health check
curl https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/healthz

# Initialize MCP session (returns mcp-session-id header)
curl -v -X POST https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# List tools (use session ID from initialize response)
curl -X POST https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <session-id>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call a tool (use session ID from initialize response)
curl -X POST https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <session-id>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_top_violators","arguments":{"limit":5}}}'
```

---

## Azure AI Foundry Agent

```bash
cd agent
pip install -r requirements.txt
az login

export PROJECT_ENDPOINT=<your-foundry-project-endpoint>
export MCP_SERVER_URL=https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp

# Interactive mode
python foundry_agent.py

# Single query
python foundry_agent.py --query "Who are the top 5 worst property owners by violations?"
```

---

## Chat API Testing

```bash
# Test chat endpoint (natural language → Azure OpenAI GPT-4.1 tool calling)
curl -X POST https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Who are the top 5 worst property owners?"}'

# Chat with conversation history
curl -X POST https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Tell me more about the first one","history":[{"role":"user","content":"Who are the top 5?"},{"role":"assistant","content":"..."}]}'
```

---

## Azure AI Foundry Setup

```bash
# Create AI Foundry Hub
az ml workspace create --kind hub --name philly-ai-hub \
  --resource-group rg-foundry --location eastus

# Create AI Services connection (YAML file)
MSYS_NO_PATHCONV=1 az ml connection create --file connection.yml \
  --resource-group rg-foundry --workspace-name philly-ai-hub

# Create Foundry Project under Hub
MSYS_NO_PATHCONV=1 az ml workspace create --kind project \
  --name philly-profiteering --resource-group rg-foundry \
  --hub-id /subscriptions/<sub>/resourceGroups/rg-foundry/providers/Microsoft.MachineLearningServices/workspaces/philly-ai-hub

# Enable managed identity on Container App
MSYS_NO_PATHCONV=1 az containerapp identity assign \
  --name philly-mcp-server --resource-group rg-philly-profiteering \
  --system-assigned

# Assign Cognitive Services OpenAI User role to Container App MI
MSYS_NO_PATHCONV=1 az role assignment create \
  --assignee <container-app-principal-id> \
  --role "Cognitive Services OpenAI User" \
  --scope /subscriptions/<sub>/resourceGroups/rg-foundry/providers/Microsoft.CognitiveServices/accounts/foundry-og-agents

# Update Container App with Azure OpenAI env vars
MSYS_NO_PATHCONV=1 az containerapp update \
  --name philly-mcp-server --resource-group rg-philly-profiteering \
  --image phillymcpacr.azurecr.io/mcp-server:latest \
  --set-env-vars "AZURE_OPENAI_ENDPOINT=https://foundry-og-agents.cognitiveservices.azure.com/" "AZURE_OPENAI_DEPLOYMENT=gpt-4.1"
```

---

## Static Web App (Chat SPA)

```bash
# Create Static Web App (Free tier)
az staticwebapp create \
  --name philly-profiteering-spa \
  --resource-group rg-philly-profiteering \
  --location eastus2 \
  --sku Free

# Get deployment token
az staticwebapp secrets list \
  --name philly-profiteering-spa \
  --resource-group rg-philly-profiteering \
  --query "properties.apiKey" -o tsv

# Deploy web/ folder
npx @azure/static-web-apps-cli deploy web \
  --deployment-token <token> \
  --env production
```

**Live URL:** https://kind-forest-06c4d3c0f.1.azurestaticapps.net/

---

## Git & GitHub

```bash
git init
git remote add origin https://github.com/pogorman/mcp-apim.git
git push -u origin main
```

---

## Troubleshooting

```bash
# Check resource group location
az group show --name rg-philly-profiteering --query location -o tsv

# Check Function App status
az functionapp show \
  --name philly-profiteering-func \
  --resource-group rg-philly-profiteering \
  --query "state" -o tsv

# Check storage public access (MCAPS may disable this)
az storage account show \
  --name phillyfuncsa \
  --query "publicNetworkAccess" -o tsv

# Check SQL public access (MCAPS may disable this)
az sql server show \
  --name philly-stats-sql-01 \
  --resource-group rg-philly-profiteering \
  --query "publicNetworkAccess" -o tsv

# MSYS path conversion fix for Git Bash
MSYS_NO_PATHCONV=1 az <command with path args>
```
