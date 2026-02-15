# Philly Poverty Profiteering - MCP + APIM + Azure Functions + Azure SQL

## What This Is

An MCP (Model Context Protocol) server that lets AI agents investigate poverty profiteering patterns in Philadelphia using 10 public datasets (~29M rows, ~4.4GB). The agent queries property ownership networks, code violations, demolitions, business licenses, and assessment data to identify exploitative LLCs and property owners.

## Architecture

```
Claude Desktop / Claude Code (stdio)
    └→ MCP Server (local) → APIM → Functions → SQL

Web Chat SPA (Static Web App)
    └→ Container App /chat → Azure OpenAI GPT-4.1 (tool calling) → APIM → Functions → SQL

Azure AI Foundry / Copilot Studio / Any HTTP MCP Client
    └→ Container App /mcp (Streamable HTTP) → APIM → Functions → SQL
```

Detailed flow:
```
MCP Client (stdio or HTTP)
    |
MCP Server (TypeScript, dual transport: stdio + Streamable HTTP)
    |  (HTTPS + Ocp-Apim-Subscription-Key header)
Azure API Management (Consumption tier)
    |  (HTTPS + x-functions-key header, injected by APIM policy)
Azure Functions v4 (Node.js 20, Flex Consumption FC1)
    |  (Azure AD token auth via DefaultAzureCredential)
Azure SQL Database (General Purpose Serverless, Gen5 2 vCores)
    (10 tables, 3 views, 20+ indexes)

Chat endpoint (/chat):
    Browser SPA → Container App /chat
        → Azure OpenAI GPT-4.1 (tool calling, up to 10 rounds)
        → APIM → Functions → SQL (per tool call)
        → Natural language response
```

## Project Structure

```
mcp-apim/
├── mcp-server/              # MCP Server (dual transport: stdio + HTTP) + Chat API
│   ├── src/
│   │   ├── index.ts          # Entry point (stdio or Streamable HTTP via MCP_TRANSPORT env)
│   │   ├── tools.ts          # 12 tool definitions for Claude
│   │   ├── chat.ts           # /chat endpoint: Azure OpenAI GPT-4.1 with tool calling
│   │   └── apim-client.ts    # HTTP client for APIM
│   ├── Dockerfile            # Multi-stage Node 20 Alpine build
│   └── .dockerignore
├── functions/                # Azure Functions app (12 endpoints)
│   └── src/
│       ├── functions/        # One file per endpoint
│       │   ├── searchEntities.ts
│       │   ├── getEntityNetwork.ts
│       │   ├── getPropertyProfile.ts
│       │   ├── getPropertyViolations.ts
│       │   ├── getPropertyAssessments.ts
│       │   ├── getPropertyLicenses.ts
│       │   ├── getPropertyAppeals.ts
│       │   ├── getPropertyDemolitions.ts
│       │   ├── searchBusinesses.ts
│       │   ├── getTopViolators.ts
│       │   ├── getAreaStats.ts
│       │   └── runQuery.ts
│       └── shared/
│           └── db.ts         # SQL connection pool (mssql + AAD)
├── agent/                    # Azure AI Foundry agent
│   ├── foundry_agent.py      # Agent with MCP tools + optional Bing grounding
│   └── requirements.txt      # Python dependencies
├── sql/
│   └── schema.sql            # 10 tables, 3 views, 20+ indexes
├── infra/
│   ├── deploy.sh             # az CLI infrastructure provisioning
│   ├── deploy-agent.sh       # ACR + Container App deployment
│   ├── set-policy.ps1        # APIM policy (injects function key)
│   ├── apim-policy.json      # APIM policy XML
│   └── func-app-body.json    # Function app ARM template
├── web/                      # Front-end dual-panel interface
│   └── index.html            # Agent chat + MCP tool tester SPA
├── .mcp.json                 # MCP server config for Claude Code
└── mcp-config-examples.json  # Config examples for Claude Desktop
```

## Azure Resources

| Resource | Name | SKU/Tier |
|----------|------|----------|
| Resource Group | `rg-philly-profiteering` | East US 2 |
| SQL Server | `philly-stats-sql-01.database.windows.net` | AAD-only auth |
| SQL Database | `phillystats` | GP Serverless Gen5, 2 vCores, 60-min auto-pause |
| Function App | `philly-profiteering-func` | Flex Consumption FC1, Node 20 |
| APIM | `philly-profiteering-apim` | Consumption |
| Storage (CSVs) | `phillyprofiteersa` | Standard LRS |
| Storage (Functions) | `phillyfuncsa` | Standard LRS |
| Container Registry | `phillymcpacr` | Basic |
| Container App Env | `philly-mcp-env` | Consumption (scale to zero) |
| Container App | `philly-mcp-server` | Consumption, 0-3 replicas |
| AI Foundry Hub | `philly-ai-hub` | — (rg-foundry, eastus) |
| AI Foundry Project | `philly-profiteering` | — (under philly-ai-hub) |
| AI Services | `foundry-og-agents` | S0 (eastus, 6 model deployments) |
| Static Web App | `philly-profiteering-spa` | Free |

## Database (10 Tables, ~29M Rows)

| Table | Rows | Purpose |
|-------|------|---------|
| `master_entity` | 2.8M | Entity names (people, LLCs, corporations) |
| `master_address` | 987K | Addresses |
| `master_entity_address` | 15.5M | Entity-address-parcel graph (junction table) |
| `opa_properties` | 584K | OPA property registry (~118 columns) |
| `assessments` | 6.4M | Historical assessments by year |
| `business_licenses` | 422K | Business licenses |
| `commercial_activity_licenses` | 508K | Commercial activity licenses |
| `case_investigations` | 1.6M | Code enforcement violations |
| `appeals` | 316K | L&I appeals |
| `demolitions` | 13.5K | Demolition records |

**Views:** `vw_entity_properties`, `vw_property_violation_summary`, `vw_owner_portfolio`

## MCP Tools (12)

| Tool | Method | Description |
|------|--------|-------------|
| `search_entities` | POST | Search entities by name pattern |
| `get_entity_network` | GET | Full property network for an entity |
| `get_property_profile` | GET | Complete property details + counts |
| `get_property_violations` | GET | Code enforcement cases (paginated) |
| `get_property_assessments` | GET | Assessment history by year |
| `get_property_licenses` | GET | Business + commercial licenses |
| `get_property_appeals` | GET | L&I appeals |
| `get_property_demolitions` | GET | Demolition records |
| `search_businesses` | POST | Search licenses by keyword/type/zip |
| `get_top_violators` | GET | Ranked owners by violation count |
| `get_area_stats` | GET | Zip code aggregate statistics |
| `run_query` | POST | Custom read-only SQL (SELECT only) |

## Building & Running

### Prerequisites
- Node.js 20+
- npm (uses workspaces)
- Azure CLI (`az`) for infrastructure
- Azure Functions Core Tools (`func`) for deployment

### Build
```bash
npm install          # Install all workspace dependencies
npm run build -w functions    # Compile Azure Functions
npm run build -w mcp-server   # Compile MCP server
```

### Run MCP Server Locally

**stdio mode** (Claude Code / Claude Desktop — default):
```bash
node mcp-server/dist/index.js
```

**HTTP mode** (Streamable HTTP for remote clients):
```bash
MCP_TRANSPORT=http APIM_BASE_URL=https://philly-profiteering-apim.azure-api.net/api APIM_SUBSCRIPTION_KEY=<key> node mcp-server/dist/index.js
```

The MCP server is configured in `.mcp.json` for Claude Code. It starts automatically when Claude Code uses the `philly-stats` tools.

### Deploy Container App (MCP Server as Remote HTTP)
```bash
# Requires: az CLI logged in, APIM_SUBSCRIPTION_KEY env var set
./infra/deploy-agent.sh
```
This creates ACR, builds the Docker image, and deploys to Container Apps. The MCP server is then accessible at `https://philly-mcp-server.<env>.azurecontainerapps.io/mcp`.

### Deploy Functions

Due to npm workspace hoisting, deployment requires a staging directory:

```bash
# Create staging dir outside workspace
mkdir /tmp/func-staging
cp -r functions/dist functions/host.json functions/package.json functions/package-lock.json /tmp/func-staging/

# Remove workspace self-reference from package.json
# (remove "philly-functions": "file:" line and fix trailing comma)

cd /tmp/func-staging
npm install --omit=dev
func azure functionapp publish philly-profiteering-func --javascript
```

The workspace hoists all packages to root `node_modules/`, leaving `functions/node_modules/` with only symlinks. Deployment zips need real packages.

## Key Design Decisions

- **Azure AD auth for SQL** (not SQL auth) — `DefaultAzureCredential` in `db.ts`, Function App has system-assigned managed identity with db_datareader role
- **120s request timeout** — accommodates Azure SQL Serverless auto-pause wake-up (~30-60s) and complex aggregation queries
- **CTE-based queries** for `getTopViolators` and correlated subqueries for `searchEntities` — CROSS APPLY and LEFT JOIN + GROUP BY approaches timed out on tables this size
- **APIM policy injects function key** — MCP server only needs the APIM subscription key, never sees the function key
- **`runQuery` safety validation** — blocks INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, EXEC, XP_, SP_; requires TOP(n) or OFFSET/FETCH

## Azure Costs

All resources are on consumption/serverless tiers — **~$1-2/month when idle**:
- SQL Serverless auto-pauses after 60min, $0 when paused (pay ~$0.75/vCore-hour when active)
- Functions Flex Consumption: $0 when idle, pay-per-execution
- APIM Consumption: $0 when idle, free tier 1M calls/mo
- Storage Standard LRS: ~$0.50/mo each
- Static Web Apps Free: $0
- No resources need manual stop/start — everything scales to zero automatically

## Web Interface (Static Web App)

Dual-panel SPA with VS Code-style activity bar providing two views:
- **Investigative Agent** — Natural language chat powered by GPT-4.1 with tool calling (`/chat` endpoint)
- **MCP Tool Tester** — Direct MCP tool discovery and invocation via Streamable HTTP (`/mcp` endpoint)

Both panels can be open side-by-side or individually. Deployed at: `https://kind-forest-06c4d3c0f.1.azurestaticapps.net/`

Deploy updates:
```bash
npx @azure/static-web-apps-cli deploy web --app-name philly-profiteering-spa --env production
```

## Remote MCP Server (Container App)

The MCP server supports dual transport: **stdio** (local, default) and **Streamable HTTP** (remote, via `MCP_TRANSPORT=http`). The HTTP transport is deployed as a Container App for use with Azure AI Foundry, Copilot Studio, or any remote MCP client.

- **Container App URL:** `https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io`
- **MCP endpoint:** `/mcp` (POST for requests, GET for SSE, DELETE for session cleanup)
- **Chat endpoint:** `/chat` (POST — natural language → Azure OpenAI GPT-4.1 with tool calling)
- **Health check:** `/healthz`
- **Scale:** 0-3 replicas (scales to zero when idle, ~$0 when not in use)

## Azure AI Foundry Agent

The `agent/` directory contains a Python script for creating an Azure AI Foundry agent that uses the MCP server:

```bash
cd agent
pip install -r requirements.txt
az login
export PROJECT_ENDPOINT=<your-foundry-project-endpoint>
export MCP_SERVER_URL=https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp
# Optional: export BING_CONNECTION_NAME=<bing-connection-id>
python foundry_agent.py
```

The agent combines MCP tools (12 property data tools) with optional Bing web search grounding for real-time internet data.

## Copilot Studio Integration

MCP is GA in Copilot Studio (May 2025). Now that the MCP server has Streamable HTTP transport and is deployed on Container Apps, it can be connected directly:

1. **MCP integration:** Point Copilot Studio at `https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp` — it auto-discovers all 12 tools
2. **Direct APIM (alternative):** Create a custom connector pointing at APIM endpoints — no MCP needed

**References:**
- [MCP GA in Copilot Studio](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/model-context-protocol-mcp-is-now-generally-available-in-microsoft-copilot-studio/)
- [Connect existing MCP server](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent)

## Conventions

- Root `.md` files (`README.md`, `CLAUDE.md`, `SESSION_LOG.md`, `USAGE.md`, `ARCHITECTURE.md`, `COMMANDS.md`, `PROMPTS.md`) are collectively referred to as "root md files" — update all of them when wrapping up a session
- `SESSION_LOG.md` is the chronological record — append new sessions at the bottom
- Secrets go in gitignored files (`.mcp.json`, `infra/apim-policy.json`); committed `.example` templates have placeholders

## Data Source

Based on [davew-msft/PhillyStats](https://github.com/davew-msft/PhillyStats) which used 10 Philadelphia public datasets. Original used Fabric/Synapse; this project uses Azure SQL + Azure Functions for a production-ready API.
