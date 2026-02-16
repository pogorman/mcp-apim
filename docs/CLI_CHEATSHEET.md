# CLI Cheat Sheet

Day-to-day management commands for the Philly Poverty Profiteering platform. For build/deploy commands, see [COMMANDS.md](COMMANDS.md).

---

## Quick Status Check

```bash
# What's running? What's healthy?
az functionapp show --name philly-profiteering-func --resource-group rg-philly-profiteering --query "{state:state, defaultHostName:defaultHostName}" -o table
az containerapp show --name philly-mcp-server --resource-group rg-philly-profiteering --query "{fqdn:properties.configuration.ingress.fqdn, replicas:properties.runningStatus}" -o json
curl -s https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/healthz

# SQL database status (Running or Paused)
az sql db show --name phillystats --server philly-stats-sql-01 --resource-group rg-philly-profiteering --query "{status:status, currentSku:currentSku.name}" -o table
```

---

## AI Foundry (Portal Blocked by MCAPS)

The AI Foundry Hub and Project are locked behind `AIFoundryHub_PublicNetwork_Modify` (MCAPS policy at management group scope). Use CLI instead of the portal.

### View Project & Hub

```bash
# Project details
az ml workspace show --name philly-profiteering --resource-group rg-foundry -o json

# Hub details
az ml workspace show --name philly-ai-hub --resource-group rg-foundry -o json

# Project connections (how it knows about AI Services)
az ml connection list --workspace-name philly-profiteering --resource-group rg-foundry -o table
```

### Update Project Metadata

```bash
# Set description
az ml workspace update --name philly-profiteering --resource-group rg-foundry \
  --description "Investigative AI agent for Philadelphia poverty profiteering analysis"

# Set display name
az ml workspace update --name philly-profiteering --resource-group rg-foundry \
  --display-name "Philly Profiteering"
```

### Model Deployments

```bash
# List all deployments (model name, version, SKU, capacity)
az cognitiveservices account deployment list \
  --name foundry-og-agents --resource-group rg-foundry \
  --query "[].{name:name, model:properties.model.name, version:properties.model.version, sku:sku.name, capacity:sku.capacity}" -o table

# Deploy a new model
az cognitiveservices account deployment create \
  --name foundry-og-agents --resource-group rg-foundry \
  --deployment-name <deployment-name> \
  --model-name <model-name> \
  --model-version <version> \
  --model-format OpenAI \
  --sku-name GlobalStandard \
  --sku-capacity 10

# Delete a deployment
az cognitiveservices account deployment delete \
  --name foundry-og-agents --resource-group rg-foundry \
  --deployment-name <deployment-name>

# List available models in the region
az cognitiveservices account list-models \
  --name foundry-og-agents --resource-group rg-foundry \
  --query "[?kind=='OpenAI'].{name:model.name, version:model.version, format:model.format, skus:model.skus[0].name}" -o table
```

### Agents (Assistants API)

Foundry agents are built on the OpenAI Assistants API. All management goes through REST calls to the AI Services endpoint.

```bash
# Auth setup (reuse for all agent commands below)
TOKEN=$(az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv)
BASE="https://foundry-og-agents.cognitiveservices.azure.com/openai"
API="api-version=2025-01-01-preview"
```

#### List Agents

```bash
curl -s "$BASE/assistants?$API" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

#### Create an Agent

```bash
curl -s "$BASE/assistants?$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Philly Investigator",
    "description": "Investigates poverty profiteering patterns in Philadelphia",
    "model": "gpt-4.1",
    "instructions": "You are an investigative analyst specializing in Philadelphia property data. You have access to 29 million rows covering property ownership, code violations, demolitions, business licenses, and tax assessments. When answering questions, cite specific data: parcel numbers, violation counts, addresses, and dollar amounts. Call multiple tools when needed to build a complete picture.",
    "temperature": 0.7
  }' | python3 -m json.tool
```

#### View a Specific Agent

```bash
curl -s "$BASE/assistants/<assistant-id>?$API" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

#### Update Agent (name, instructions, model, etc.)

```bash
# Change instructions
curl -s -X POST "$BASE/assistants/<assistant-id>?$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"instructions": "Updated instructions here..."}' | python3 -m json.tool

# Change model
curl -s -X POST "$BASE/assistants/<assistant-id>?$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-5"}' | python3 -m json.tool

# Change name and description
curl -s -X POST "$BASE/assistants/<assistant-id>?$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Name", "description": "New description"}' | python3 -m json.tool
```

#### Delete an Agent

```bash
curl -s -X DELETE "$BASE/assistants/<assistant-id>?$API" \
  -H "Authorization: Bearer $TOKEN"
```

#### Run an Agent (Interactive Test)

```bash
# 1. Create a thread
THREAD=$(curl -s "$BASE/threads?$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Thread: $THREAD"

# 2. Add a message
curl -s "$BASE/threads/$THREAD/messages?$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "Who are the top 5 worst property owners by violations?"}'

# 3. Create a run (starts the agent)
RUN=$(curl -s "$BASE/threads/$THREAD/runs?$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assistant_id": "<assistant-id>"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Run: $RUN"

# 4. Poll for completion
curl -s "$BASE/threads/$THREAD/runs/$RUN?$API" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])"

# 5. Get the response
curl -s "$BASE/threads/$THREAD/messages?$API" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
msgs = json.load(sys.stdin)['data']
for m in msgs:
    role = m['role']
    text = m['content'][0]['text']['value'] if m['content'] else ''
    print(f'{role}: {text[:500]}')
"
```

---

## Container App Management

```bash
# View current revision and image
az containerapp revision list \
  --name philly-mcp-server --resource-group rg-philly-profiteering \
  --query "[].{name:name, active:properties.active, replicas:properties.replicas, created:properties.createdTime}" -o table

# View environment variables
az containerapp show \
  --name philly-mcp-server --resource-group rg-philly-profiteering \
  --query "properties.template.containers[0].env" -o table

# View secrets (names only — values are hidden)
az containerapp secret list \
  --name philly-mcp-server --resource-group rg-philly-profiteering -o table

# Update an environment variable
az containerapp update \
  --name philly-mcp-server --resource-group rg-philly-profiteering \
  --set-env-vars "AZURE_OPENAI_DEPLOYMENT=gpt-5"

# Deploy a new image (after az acr build)
az containerapp update \
  --name philly-mcp-server --resource-group rg-philly-profiteering \
  --image phillymcpacr.azurecr.io/mcp-server:latest

# Stream live logs
az containerapp logs show \
  --name philly-mcp-server --resource-group rg-philly-profiteering --follow

# Check replica count (0 = scaled to zero)
az containerapp replica count \
  --name philly-mcp-server --resource-group rg-philly-profiteering 2>/dev/null || \
az containerapp revision list \
  --name philly-mcp-server --resource-group rg-philly-profiteering \
  --query "[?properties.active].properties.replicas" -o tsv
```

---

## APIM

```bash
# List all API operations
az apim api operation list \
  --resource-group rg-philly-profiteering \
  --service-name philly-profiteering-apim \
  --api-id philly-stats \
  --query "[].{name:displayName, method:method, url:urlTemplate}" -o table

# Get subscription keys
az apim subscription list \
  --resource-group rg-philly-profiteering \
  --service-name philly-profiteering-apim \
  --query "[].{name:displayName, state:state}" -o table

# Show primary key for a subscription
az apim subscription show \
  --resource-group rg-philly-profiteering \
  --service-name philly-profiteering-apim \
  --subscription-id DefaultSubscription \
  --query primaryKey -o tsv
```

---

## SQL Database

```bash
# Check if database is paused or running
az sql db show --name phillystats --server philly-stats-sql-01 \
  --resource-group rg-philly-profiteering \
  --query "{status:status, currentSku:currentSku.name, maxSize:maxSizeBytes}" -o table

# Wake up the database (any query will do this, or use resume)
az sql db update --name phillystats --server philly-stats-sql-01 \
  --resource-group rg-philly-profiteering

# Check firewall rules
az sql server firewall-rule list \
  --server philly-stats-sql-01 --resource-group rg-philly-profiteering -o table

# Add your current IP to firewall
MY_IP=$(curl -s ifconfig.me)
az sql server firewall-rule create \
  --server philly-stats-sql-01 --resource-group rg-philly-profiteering \
  --name "MyIP-$(date +%Y%m%d)" \
  --start-ip-address $MY_IP --end-ip-address $MY_IP
```

---

## MCAPS Policy Checks

Corporate MCAPS policies (assigned at management group level) can silently revert settings. These commands check for common issues.

```bash
# Check what's non-compliant
az policy state list --resource-group rg-philly-profiteering \
  --filter "isCompliant eq false" \
  --query "[].{policy:policyDefinitionName, resource:resourceId}" -o table

az policy state list --resource-group rg-foundry \
  --filter "isCompliant eq false" \
  --query "[].{policy:policyDefinitionName, resource:resourceId}" -o table

# Check specific settings MCAPS likes to flip
az storage account show --name phillyfuncsa --query publicNetworkAccess -o tsv
az sql server show --name philly-stats-sql-01 --resource-group rg-philly-profiteering --query publicNetworkAccess -o tsv
az ml workspace show --name philly-ai-hub --resource-group rg-foundry --query public_network_access -o tsv

# Find the specific policy blocking Foundry portal access
az policy state list --resource-group rg-foundry \
  --filter "contains(policyDefinitionName, 'PublicNetwork')" \
  --query "[].{policy:policyDefinitionName, assignment:policyAssignmentName, scope:policyAssignmentScope, effect:policyDefinitionAction}" -o table
```

---

## Quick API Smoke Tests

```bash
KEY="<your-apim-subscription-key>"
BASE="https://philly-profiteering-apim.azure-api.net/api"
CHAT="https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io"

# Test APIM → Functions → SQL
curl -s "$BASE/stats/top-violators?limit=3" -H "Ocp-Apim-Subscription-Key: $KEY" | python3 -m json.tool

# Test Container App health
curl -s "$CHAT/healthz"

# Test chat endpoint
curl -s -X POST "$CHAT/chat" -H "Content-Type: application/json" \
  -d '{"message":"Who are the top 3 worst property owners?"}' | python3 -m json.tool

# Test chat with specific model
curl -s -X POST "$CHAT/chat" -H "Content-Type: application/json" \
  -d '{"message":"How many properties are in zip 19134?","model":"o4-mini"}' | python3 -m json.tool

# Test models endpoint
curl -s "$CHAT/models" | python3 -m json.tool
```

---

## Resource Costs (Quick Check)

```bash
# See what's actually costing money (last 30 days)
az consumption usage list \
  --start-date $(date -d '-30 days' +%Y-%m-%d 2>/dev/null || date -v-30d +%Y-%m-%d) \
  --end-date $(date +%Y-%m-%d) \
  --query "[?contains(instanceId || '', 'philly') || contains(instanceId || '', 'foundry')].{resource:instanceName, cost:pretaxCost, currency:currency}" \
  -o table 2>/dev/null || echo "consumption API may not be available on this subscription type"
```
