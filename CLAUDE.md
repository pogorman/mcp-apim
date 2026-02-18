# Philly Poverty Profiteering - MCP + APIM + Azure Functions + Azure SQL

## Table of Contents

- [What This Is](#what-this-is)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Azure Resources](#azure-resources)
- [Database (11 Tables, ~34M Rows)](#database-11-tables-34m-rows)
- [MCP Tools (14)](#mcp-tools-14)
- [Building & Running](#building--running)
- [Key Design Decisions](#key-design-decisions)
- [Azure Costs](#azure-costs)
- [Web Interface (Static Web App)](#web-interface-static-web-app)
- [Remote MCP Server (Container App)](#remote-mcp-server-container-app)
- [Azure AI Foundry Agent](#azure-ai-foundry-agent)
- [Copilot Studio Integration](#copilot-studio-integration)
- [M365 Copilot Declarative Agent](#m365-copilot-declarative-agent)
- [Conventions](#conventions)
- [Data Source](#data-source)

---

## What This Is

An MCP (Model Context Protocol) server that lets AI agents investigate poverty profiteering patterns in Philadelphia using 11 public datasets (~34M rows, ~5.5GB). The agent queries property ownership networks, code violations, demolitions, business licenses, assessment data, and real estate transfer records to identify exploitative LLCs and property owners.

## Architecture

```
Claude Desktop / Claude Code (stdio)
    └→ MCP Server (local) → APIM → Functions → SQL

Web Chat SPA — Investigative Agent (Static Web App)
    └→ Container App /chat → Azure OpenAI (6 models, tool calling) → APIM → Functions → SQL

Web Chat SPA — Foundry Portal (Static Web App)
    └→ Container App /agent → Azure OpenAI GPT-4.1 (Assistants API, persistent threads) → APIM → Functions → SQL

Microsoft Copilot Studio (floating widget in SPA)
    └→ Container App /mcp (Streamable HTTP) → APIM → Functions → SQL

Azure AI Foundry / Any HTTP MCP Client
    └→ Container App /mcp (Streamable HTTP) → APIM → Functions → SQL

M365 Copilot Declarative Agent (Teams / Outlook / Edge)
    └→ Container App /mcp (Streamable HTTP, RemoteMCPServer runtime) → APIM → Functions → SQL
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
    (11 tables, 3 views, 28+ indexes)

Chat endpoint (/chat — Investigative Agent):
    Browser SPA → Container App /chat
        → Azure OpenAI (6 models, default GPT-4.1, tool calling, up to 10 rounds)
        → APIM → Functions → SQL (per tool call)
        → Natural language response

Agent endpoint (/agent — Foundry Portal):
    Browser SPA → Container App /agent/thread + /agent/message
        → Azure OpenAI GPT-4.1 (Assistants API, persistent threads)
        → APIM → Functions → SQL (per tool call)
        → Natural language response with thread context
```

## Project Structure

```
mcp-apim/
├── mcp-server/              # MCP Server (dual transport: stdio + HTTP) + Chat API
│   ├── src/
│   │   ├── index.ts          # Entry point (stdio or Streamable HTTP via MCP_TRANSPORT env)
│   │   ├── tools.ts          # 14 tool definitions for Claude
│   │   ├── tool-executor.ts  # Shared tool defs + executor (used by chat + agent)
│   │   ├── chat.ts           # /chat endpoint: Azure OpenAI with tool calling
│   │   ├── foundry-agent.ts  # Assistants API: ensureAgent, createThread, sendMessage
│   │   └── apim-client.ts    # HTTP client for APIM
│   ├── Dockerfile            # Multi-stage Node 20 Alpine build
│   └── .dockerignore
├── functions/                # Azure Functions app (14 endpoints)
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
├── sk-agent/                 # Semantic Kernel multi-agent (C#/.NET 8)
│   ├── Program.cs            # 4-agent orchestrator (Triage, Owner, Violation, Area)
│   ├── Plugins/              # 3 plugin files calling APIM endpoints
│   └── Dockerfile            # Container App deployment
├── agent/                    # Azure AI Foundry agent
│   ├── foundry_agent.py      # Agent with MCP tools + optional Bing grounding
│   └── requirements.txt      # Python dependencies
├── m365-agent/               # M365 Copilot declarative agent
│   ├── manifest.json          # Teams app manifest (v1.25)
│   ├── declarativeAgent.json  # Agent definition (v1.6) — instructions + conversation starters
│   ├── ai-plugin.json         # Plugin (v2.4) — RemoteMCPServer runtime + 14 tool schemas
│   ├── color.png              # 192x192 app icon
│   └── outline.png            # 32x32 outline icon
├── sql/
│   ├── schema.sql            # 11 tables, 3 views, 27+ indexes
│   ├── bulk_import.js        # Fast CSV→SQL loader (TDS bulk copy, ~25K rows/sec)
│   └── download-carto.js     # Downloads live data from Philadelphia Carto API
├── infra/
│   ├── main.bicep            # Bicep orchestrator — deploys all modules
│   ├── main.bicepparam       # Parameters (secrets via CLI at deploy time)
│   ├── modules/              # 7 Bicep modules (sql, storage, functionApp, apim, acr, containerApps, swa)
│   ├── deploy.sh             # az CLI infrastructure provisioning
│   ├── deploy-agent.sh       # ACR + Container App deployment
│   ├── deploy-swa.sh         # SWA deploy (copies docs/notebooks/images, deploys, cleans up)
│   ├── create-zip.ps1        # PowerShell zip with forward slashes for func deploy
│   ├── set-policy.ps1        # APIM policy (injects function key)
│   ├── apim-policy.json      # APIM policy XML
│   └── func-app-body.json    # Function app ARM template
├── web/                      # Front-end multi-panel interface
│   ├── index.html            # 9-panel SPA (Investigative Agent, Foundry Portal, Copilot Studio, Triage, Tools, Docs, Slides, Architecture, About)
│   └── staticwebapp.config.json  # SWA auth config (Entra ID login required)
├── docs/                     # Project documentation
│   ├── ARCHITECTURE.md       # Full technical reference
│   ├── CLI_CHEATSHEET.md     # Day-to-day management commands
│   ├── COMMANDS.md           # All CLI commands used to build/deploy
│   ├── ELI5.md               # Plain-English explainer for demos/presentations
│   ├── FAQ.md                # Common questions and answers
│   ├── PROMPTS.md            # User prompts from each session
│   ├── SESSION_LOG.md        # Chronological build log
│   └── USER_GUIDE.md         # How to use the web app (non-technical)
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
| Container App | `philly-sk-agent` | Consumption, 0-3 replicas |
| AI Foundry Hub | `philly-ai-hub` | — (rg-foundry, eastus) |
| AI Foundry Project | `philly-profiteering` | — (under philly-ai-hub) |
| AI Services | `foundry-og-agents` | S0 (eastus, 6 model deployments) |
| VNet | `vnet-philly-profiteering` | 10.0.0.0/16 (eastus2) |
| Private Endpoints | `pe-sql/blob/table/queue-philly` | SQL + Storage private connectivity |
| Private DNS Zones | `privatelink.database/blob/table/queue` | DNS resolution for private endpoints |
| Static Web App | `philly-profiteering-spa` | Free |

## Database (11 Tables, ~34M Rows)

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
| `rtt_summary` | 5.05M | Real estate transfer tax records (deeds, sheriff sales, mortgages) |

**Views:** `vw_entity_properties`, `vw_property_violation_summary`, `vw_owner_portfolio`

## MCP Tools (14)

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
| `get_property_transfers` | GET | Real estate transfer history for a property |
| `search_transfers` | POST | Search transfers by grantor/grantee/type/amount |
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

### Refresh Data from Carto API

The Philadelphia Carto API (`phl.carto.com`) serves live, daily-updated public data. To download fresh data:

```bash
node sql/download-carto.js              # Download all configured tables (currently rtt_summary)
node sql/download-carto.js rtt_summary  # Download a specific table
```

Then load into Azure SQL:
```bash
cd functions && node ../sql/bulk_import.js
```

The workspace hoists all packages to root `node_modules/`, leaving `functions/node_modules/` with only symlinks. Deployment zips need real packages.

## Key Design Decisions

- **Azure AD auth for SQL** (not SQL auth) — `DefaultAzureCredential` in `db.ts`, Function App has system-assigned managed identity with db_datareader role
- **120s request timeout** — accommodates Azure SQL Serverless auto-pause wake-up (~30-60s) and complex aggregation queries
- **CTE-based queries** for `getTopViolators` and correlated subqueries for `searchEntities` — CROSS APPLY and LEFT JOIN + GROUP BY approaches timed out on tables this size
- **APIM policy injects function key** — MCP server only needs the APIM subscription key, never sees the function key
- **`runQuery` safety validation** — blocks INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, EXEC, XP_, SP_; requires TOP(n) or OFFSET/FETCH
- **VNet + Private Endpoints** — Function App is VNet-integrated; SQL and Storage accessed via private endpoints only. Public access disabled on both. Prevents MCAPS security policies from breaking the data path.

## Azure Costs

All resources are on consumption/serverless tiers — **~$33/month** (mostly private endpoints):
- SQL Serverless auto-pauses after 60min, $0 when paused (pay ~$0.75/vCore-hour when active)
- Functions Flex Consumption: $0 when idle, pay-per-execution
- APIM Consumption: $0 when idle, free tier 1M calls/mo
- Storage Standard LRS: ~$0.50/mo each
- Private Endpoints (x4: SQL, blob, table, queue): ~$29/mo ($7.20/endpoint)
- Private DNS Zones (x4): ~$2/mo ($0.50/zone)
- Static Web Apps Free: $0
- No resources need manual stop/start — everything scales to zero automatically

## Web Interface (Static Web App)

SPA with VS Code-style activity bar demonstrating multiple panels using the same APIM backend. Protected by Azure SWA built-in authentication (Microsoft Entra ID login required — config in `web/staticwebapp.config.json`). User email and sign-out button in header.

- **Investigative Agent** — Chat Completions + Tools. Natural language chat with model selector (6 models). Our code runs the agentic loop (`/chat` endpoint).
- **Foundry Portal** — Assistants API (Microsoft Foundry). Azure manages the tool-calling loop with GPT-4.1 and threads persist server-side (`/agent` endpoints). Floating chat widget.
- **Copilot Studio** — Microsoft Copilot Studio agent connected via MCP. Low-code/no-code — auto-discovers all 14 tools. Floating chat widget with iframe.
- **Triage (Agent Framework)** — Semantic Kernel multi-agent panel. Chat widget connecting to the `philly-sk-agent` Container App. Triage agent routes to 3 specialists (C#/.NET 8).
- **MCP Tool Tester** — Raw MCP protocol. Direct tool discovery and invocation via Streamable HTTP (`/mcp` endpoint).
- **Documentation** — Built-in reader for all project markdown files and Jupyter notebooks. Files copied to `web/docs/` and `web/notebooks/` at deploy time.
- **Slide Deck** — Reveal.js presentation embedded in an iframe. Architecture walkthrough with animated builds, section-by-section.
- **Architecture** — Interactive architecture diagram (HTML).
- **About** — Project overview with cards for all 7 integration patterns including M365 Copilot declarative agent.

Panels can be open side-by-side or individually. Chat responses in the Investigative Agent include inline maps powered by Leaflet.js when properties have coordinates (99.97% do).

Deployed at: `https://kind-forest-06c4d3c0f.1.azurestaticapps.net/`

Deploy updates (copies docs/notebooks/images, deploys to SWA, cleans up):
```bash
bash infra/deploy-swa.sh
```

## Remote MCP Server (Container App)

The MCP server supports dual transport: **stdio** (local, default) and **Streamable HTTP** (remote, via `MCP_TRANSPORT=http`). The HTTP transport is deployed as a Container App for use with Azure AI Foundry, Copilot Studio, or any remote MCP client.

- **Container App URL:** `https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io`
- **MCP endpoint:** `/mcp` (POST for requests, GET for SSE, DELETE for session cleanup)
- **Chat endpoint:** `/chat` (POST — natural language → Azure OpenAI with tool calling, 6 models)
- **Agent endpoints:** `/agent/thread` (POST — create thread), `/agent/message` (POST — Assistants API with GPT-4.1)
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

## Semantic Kernel Agent (Container App)

A C#/.NET 8 multi-agent system using Microsoft Semantic Kernel with Azure OpenAI GPT-4.1. Deployed as Container App `philly-sk-agent`.

- **Container App URL:** `https://philly-sk-agent.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io`
- **Investigate endpoint:** `/investigate` (POST with `{"prompt": "..."}`)
- **Health check:** `/healthz`

4 specialist agents orchestrated by a Triage agent:
- **OwnerAnalyst** — Entity search, property networks, profiles (3 APIM endpoints)
- **ViolationAnalyst** — Code violations, top violators, demolitions, appeals (4 APIM endpoints)
- **AreaAnalyst** — Zip stats, businesses, assessments, licenses, custom SQL (5 APIM endpoints)

The Triage agent routes questions to the right specialist. Its instructions explicitly prohibit emitting planning/status messages — it only returns the final synthesized answer with real data from the specialists.

## Bicep Infrastructure-as-Code

All Azure resources can be recreated via Bicep:

```bash
az deployment group create \
  --resource-group rg-philly-profiteering \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam \
  --parameters sqlAdminPassword=$SQL_ADMIN_PASSWORD clientIp=$(curl -s ifconfig.me)
```

7 modules in `infra/modules/`: sql, storage, functionApp, apim, containerRegistry, containerApps, staticWebApp. Orchestrated by `infra/main.bicep` with role assignments.

Post-deploy manual steps: SQL schema + data load, SQL MI user creation, container image builds, function code deploy, SPA deploy, Azure OpenAI model deployments.

## Copilot Studio Integration

MCP is GA in Copilot Studio (May 2025). Now that the MCP server has Streamable HTTP transport and is deployed on Container Apps, it can be connected directly:

1. **MCP integration:** Point Copilot Studio at `https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp` — it auto-discovers all 14 tools
2. **Direct APIM (alternative):** Create a custom connector pointing at APIM endpoints — no MCP needed

**References:**
- [MCP GA in Copilot Studio](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/model-context-protocol-mcp-is-now-generally-available-in-microsoft-copilot-studio/)
- [Connect existing MCP server](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent)

## M365 Copilot Declarative Agent

The `m365-agent/` directory contains a declarative agent for Microsoft 365 Copilot (Teams, Outlook, Edge). Zero custom code, zero new infrastructure — just 3 JSON manifest files + 2 icons that point M365 Copilot at our existing MCP endpoint via the `RemoteMCPServer` runtime type. This is the simplest integration path in the project.

**How it works:** `ai-plugin.json` declares a `RemoteMCPServer` runtime with the Container App's `/mcp` URL. M365 Copilot connects via Streamable HTTP and discovers all 14 tools automatically — the same endpoint Copilot Studio and Azure AI Foundry already use.

**This is NOT Copilot Studio.** Copilot Studio is a separate low-code agent builder. This is a declarative agent that lives _inside_ M365 Copilot (the one built into Teams/Outlook/Edge), alongside your enterprise data (emails, files, calendar). Both connect to the same MCP endpoint, but they're different products.

**Files:** `manifest.json` (Teams app v1.25), `declarativeAgent.json` (agent v1.6 — instructions + 6 conversation starters), `ai-plugin.json` (plugin v2.4 — RemoteMCPServer runtime + 14 tool schemas)

**CLI used:** `teamsapp` (M365 Agents Toolkit CLI, `@microsoft/m365agentstoolkit-cli@1.1.4`, installed globally via npm)

**Deploy:**
```bash
cd m365-agent
# Create zip (use Node.js, NOT PowerShell Compress-Archive which produces incompatible zips)
# Then sideload:
teamsapp install --file-path philly-investigator.zip -i false
```

**Deployed instance:** TitleId `T_1179e3d7-033e-8784-6e25-caf4c0bbed61`, AppId `cadbec7e-cd67-4635-b60d-4f8d1a6b04fc`

**Validation gotchas:** `name_for_human` max 20 chars, `description_for_human` max 100 chars, `run_for_functions` array required in runtime (can't be empty), `description.short` max 80 chars. PowerShell's `Compress-Archive` creates zips the portal rejects — use Node.js or 7-Zip.

**Note:** MCP in declarative agents is in public preview (announced Ignite Nov 2025). See `m365-agent/README.md` for full build/deploy details including all validation errors we hit.

## Conventions

- Documentation files live in `docs/` (`SESSION_LOG.md`, `USER_GUIDE.md`, `ARCHITECTURE.md`, `COMMANDS.md`, `PROMPTS.md`, `CLI_CHEATSHEET.md`, `FAQ.md`, `ELI5.md`). `README.md` and `CLAUDE.md` stay in root. Update docs when wrapping up a session.
- `docs/SESSION_LOG.md` is the chronological record — append new sessions at the bottom
- **`docs/ELI5.md` must be kept current** — it's used for demos and presentations. Update it whenever features, panels, data, architecture, or costs change.
- Secrets go in gitignored files (`.mcp.json`, `infra/apim-policy.json`); committed `.example` templates have placeholders

## Data Source

**V1 (10 tables):** Based on [davew-msft/PhillyStats](https://github.com/davew-msft/PhillyStats) — static CSV exports from 10 Philadelphia public datasets. Original used Fabric/Synapse; this project uses Azure SQL + Azure Functions for a production-ready API.

**V2 (11 tables):** Added live data pipeline from the [Philadelphia Carto SQL API](https://phl.carto.com/api/v2/sql) (`sql/download-carto.js`). Downloaded 5.05M real estate transfer records (rtt_summary) enabling $1 transfer detection, sheriff sale tracking, and property flip analysis. The same pipeline can refresh all existing tables and add new datasets (violations, permits). See `docs/V2.md` for the full V2 story.
