# Usage & Testing Guide

This system is deployed and ready to use. The MCP server connects to live Azure infrastructure with ~29M rows of Philadelphia public data.

## Quick Start with Claude Code

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/pogorman/mcp-apim.git
cd mcp-apim
npm install
npm run build -w mcp-server
```

2. Copy the MCP config template and add your subscription key:

```bash
cp .mcp.json.example .mcp.json
```

Edit `.mcp.json` and replace `<your-apim-subscription-key>` with your actual key.

3. Open the project in Claude Code. The MCP server starts automatically and exposes 12 `philly-stats` tools.

## Quick Start with Claude Desktop

Add this to your Claude Desktop config file:
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "philly-stats": {
      "command": "node",
      "args": ["C:/path/to/mcp-apim/mcp-server/dist/index.js"],
      "env": {
        "APIM_BASE_URL": "https://philly-profiteering-apim.azure-api.net/api",
        "APIM_SUBSCRIPTION_KEY": "<your-apim-subscription-key>"
      }
    }
  }
}
```

## Testing the API Directly (curl)

All endpoints go through APIM. Set your subscription key:

```bash
KEY="<your-apim-subscription-key>"
BASE="https://philly-profiteering-apim.azure-api.net/api"
```

### Search for an entity (LLC or person)

```bash
curl -s -X POST "$BASE/search-entities" \
  -H "Ocp-Apim-Subscription-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "GEENA LLC"}' | jq .
```

### Get entity property network

Use a `master_entity_id` from search results:

```bash
curl -s "$BASE/entities/<entity-id>/network" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .
```

### Get property profile

```bash
curl -s "$BASE/properties/405100505" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .
```

### Get property violations

```bash
curl -s "$BASE/properties/405100505/violations" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .
```

### Get property assessments (value history)

```bash
curl -s "$BASE/properties/405100505/assessments" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .
```

### Get property licenses

```bash
curl -s "$BASE/properties/405100505/licenses" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .
```

### Get property appeals

```bash
curl -s "$BASE/properties/405100505/appeals" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .
```

### Get property demolitions

```bash
curl -s "$BASE/properties/405100505/demolitions" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .
```

### Search businesses (check cashing, pawn shops, etc.)

```bash
curl -s -X POST "$BASE/search-businesses" \
  -H "Ocp-Apim-Subscription-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"keyword": "CHECK CASHING", "zip": "19134"}' | jq .
```

### Get top violators

```bash
curl -s "$BASE/stats/top-violators?limit=10&minProperties=5" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .
```

### Get area stats by zip code

```bash
curl -s "$BASE/stats/zip/19134" \
  -H "Ocp-Apim-Subscription-Key: $KEY" | jq .
```

### Run a custom SQL query

```bash
curl -s -X POST "$BASE/query" \
  -H "Ocp-Apim-Subscription-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT TOP(5) owner_1, COUNT(*) AS cnt FROM opa_properties GROUP BY owner_1 ORDER BY cnt DESC"}' | jq .
```

## Example Prompts for Claude

Once the MCP server is connected, try asking Claude:

- "Who are the top 10 worst property owners in Philadelphia by code violations?"
- "Tell me about GEENA LLC — how many properties do they own and how many violations?"
- "What check cashing businesses operate in zip code 19134?"
- "Show me the assessment trend for parcel 405100505 over the last 10 years"
- "Which zip codes have the highest vacancy and violation rates?"
- "Find LLCs that own more than 50 properties and have demolition records"
- "What properties at 19134 have both vacant land licenses and failed inspections?"

## Remote MCP Server (Container App)

The MCP server is also deployed as a Container App with Streamable HTTP transport, accessible to any remote MCP client (Azure AI Foundry, Copilot Studio, etc.):

**MCP Endpoint:** `https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp`
**Health Check:** `https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/healthz`

```bash
# Test health
curl https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/healthz

# Initialize MCP session
curl -X POST https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

The response includes a `mcp-session-id` header — use it for subsequent requests (tools/list, tools/call).

## Azure AI Foundry Agent

The `agent/` directory contains a Python agent that connects to the MCP server and optionally adds Bing web search:

```bash
cd agent
pip install -r requirements.txt
az login

export PROJECT_ENDPOINT=<your-foundry-project-endpoint>
export MCP_SERVER_URL=https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp
# Optional: export BING_CONNECTION_NAME=<bing-connection-id>

# Interactive mode
python foundry_agent.py

# Single query
python foundry_agent.py --query "Who are the top 5 worst property owners by violations?"
```

**Prerequisites:**
- Azure AI Foundry project with a model deployment (e.g., gpt-4o)
- (Optional) Grounding with Bing Search resource connected to the project

## Copilot Studio

The MCP server is deployed and ready for Copilot Studio. Point Copilot Studio at the MCP endpoint:

`https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp`

Copilot Studio will auto-discover all 12 tools. See [MCP in Copilot Studio docs](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-extend-action-mcp) for setup.

## Notes

- **First request may be slow (~30-60s):** The Azure SQL database auto-pauses after 60 minutes of inactivity. The first query wakes it up.
- **Query timeout:** Complex queries have a 120-second timeout. If a custom SQL query times out, add more restrictive filters or reduce the result set.
- **Read-only:** The `run_query` tool only allows SELECT statements with TOP(n) or OFFSET/FETCH. INSERT, UPDATE, DELETE, and DDL are blocked.
- **Rate limits:** APIM is configured with standard Consumption tier limits.
- **Azure costs when idle:** ~$1-2/month. All compute is serverless/consumption — scales to zero automatically. No manual start/stop needed.
