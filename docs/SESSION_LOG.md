# Session Log

Chronological record of what was built, what broke, and how it was fixed. Keeps context across machines.

---

## Session 1 — Project Setup & Planning

- Designed full architecture: MCP Server → APIM → Azure Functions → Azure SQL
- Based on [davew-msft/PhillyStats](https://github.com/davew-msft/PhillyStats) (10 Philadelphia public datasets, ~29M rows, ~4.4GB CSV)
- Created project plan covering 6 implementation steps
- Set up npm workspaces with `functions/` and `mcp-server/` packages

## Session 2 — SQL Schema & Infrastructure

### SQL Schema (`sql/schema.sql`)
- Created 10 tables: master_entity, master_address, master_entity_address, opa_properties, assessments, business_licenses, commercial_activity_licenses, case_investigations, appeals, demolitions
- Added 3 views: vw_entity_properties, vw_property_violation_summary, vw_owner_portfolio
- Created 20+ indexes for entity resolution, property lookups, and owner searches

### Azure Infrastructure (`infra/deploy.sh`)
- Resource Group: `rg-philly-profiteering` (eastus2)
- SQL Server: `philly-stats-sql-01` (AAD-only auth)
- SQL Database: `phillystats` (GP Serverless Gen5, 2 vCores, 60-min auto-pause)
- Attempted APIM with `Basicv2` SKU — **failed** (not a valid SKU name in az CLI). Used `Consumption` tier instead (actually cheaper).

### Data Loading — Multiple Approaches Tried
1. **bcp utility** — initial approach, had issues with CSV parsing
2. **Python bulk load** (`sql/load_data.py`, `sql/bulk_load.py`) — tried, hit encoding issues
3. **Node.js TDS bulk copy** (`sql/bulk_load.js`, `sql/bulk_import.js`) — **this is what worked**
   - Had to fix CSV parser for backslash-escaped quotes (`\"` inside fields)
   - Had to fix unescaped quotes mid-field in some CSVs
   - Final approach: custom CSV parser with relaxed quote handling
   - All 28.8M rows loaded successfully across 10 tables

## Session 3 — Azure Functions

### 12 Functions Created (`functions/src/functions/`)
- searchEntities, getEntityNetwork, getPropertyProfile, getPropertyViolations, getPropertyAssessments, getPropertyLicenses, getPropertyAppeals, getPropertyDemolitions, searchBusinesses, getTopViolators, getAreaStats, runQuery

### Shared DB Module (`functions/src/shared/db.ts`)
- Uses `mssql` package with `@azure/identity` (DefaultAzureCredential)
- Azure AD token auth (no SQL passwords in connection)
- Connection pool: max 10, idle timeout 30s
- Request timeout: 120s (to handle Serverless auto-pause wake-up)

### Error Handling
- All 12 handlers wrapped in try/catch returning `{ error, stack }` on 500

## Session 4 — MCP Server

### MCP Server (`mcp-server/src/`)
- `index.ts` — stdio transport, connects to McpServer
- `tools.ts` — 12 tool definitions with zod schemas and descriptions
- `apim-client.ts` — HTTP client that adds `Ocp-Apim-Subscription-Key` header

### Configuration
- `.mcp.json` — Claude Code config (gitignored, has real key)
- `.mcp.json.example` — committed template without key
- `mcp-config-examples.json` — examples for both Claude Desktop and Claude Code

## Session 5 — Deployment & Debugging (longest session)

### Problem: All APIM endpoints returning 404

**Root cause:** npm workspace hoisting.

The project uses `"workspaces": ["functions", "mcp-server"]` in root `package.json`. This hoists ALL packages to root `node_modules/`. The `functions/node_modules/` directory only contained symlinks (88KB) instead of real packages (69MB). Deployment zips contained symlinks, not actual files, so Azure Functions couldn't find dependencies.

**Multiple failed deployment attempts:**
1. `func azure functionapp publish` — hung on "Creating archive", then "Array dimensions exceeded supported range" (too many files in node_modules)
2. `az functionapp deployment source config-zip` — succeeded but functions still 404 (zip had symlinks)
3. Direct blob upload to deployment container — didn't work either

**Fix — staging directory pattern:**
```bash
mkdir /tmp/func-staging
cp -r functions/dist functions/host.json functions/package.json functions/package-lock.json /tmp/func-staging/
# Remove "philly-functions": "file:" self-reference from package.json
# Fix trailing comma in JSON
cd /tmp/func-staging
npm install --omit=dev    # 78 packages, 69MB of real files
func azure functionapp publish philly-profiteering-func --javascript
```
This deployed successfully — all 12 functions registered.

### Problem: Query timeouts

**getTopViolators** and **searchEntities** timed out at 30s default.

- `getTopViolators`: Changed from CROSS APPLY (row-by-row on 584K × 1.6M rows) to CTE-based approach (aggregate first, then join). Orders of magnitude faster.
- `searchEntities`: Changed from LEFT JOIN + GROUP BY (2.8M × 15.5M) to correlated subquery.
- Increased `requestTimeout` from 30000 to 120000 in `db.ts`.

### APIM Configuration
- Created API `philly-stats` with path `/api`
- 12 operations (9 GET, 3 POST) matching function routes
- API-level policy injects `x-functions-key` header on every request
- Product `PhillyStats` with subscription key requirement
- Subscription key: stored in `.mcp.json` (gitignored)

### End-to-End Verification Results
| Endpoint | Result |
|----------|--------|
| `get_top_violators` | Philadelphia Land Bank: 2,495 properties, 13,588 violations |
| `search_entities` | GEENA LLC: 330 linked properties |
| `get_entity_network` | 631 property links for GEENA LLC |
| `get_area_stats` | Zip 19134: 25,744 properties, 89,722 investigations |
| `search_businesses` | 50+ check cashing businesses in 19134 |
| `get_property_assessments` | 11 years of data for parcel 405100505 |
| `run_query` | Custom SQL executing correctly |
| MCP Server (stdio) | Full tool call pipeline verified |

## Session 6 — Documentation & Git (2026-02-14)

### Created Documentation
- `CLAUDE.md` — project architecture, structure, resources, tools, build/deploy instructions, design decisions
- `USAGE.md` — quick start guide, curl examples for all 12 endpoints, example Claude prompts
- `SESSION_LOG.md` — this file

### Git Repository Setup
- Initialized repo, pushed to https://github.com/pogorman/mcp-apim
- **GitHub push protection** caught hardcoded function key in `infra/set-policy.ps1`
  - Fixed: replaced hardcoded key/subscription ID with mandatory parameters
  - Squashed all commits into one clean commit before pushing
- Secrets excluded via `.gitignore`: `.mcp.json`, `infra/apim-policy.json`, `.claude/`, `local.settings.json`
- Template files committed: `.mcp.json.example`, `infra/apim-policy.json.example`, `functions/local.settings.json.example`

### Azure Cost Review
All resources are on cheapest viable tiers:
- SQL: GP Serverless (auto-pauses, ~$1-2/mo when idle)
- Functions: Flex Consumption (pay-per-use, free tier)
- APIM: Consumption (~$0 idle, free tier 1M calls/mo)
- Storage: Standard LRS ($0.50/mo each)

---

## Key Lessons / Gotchas

1. **npm workspaces + Azure Functions deployment don't mix** — must use a staging directory with standalone `npm install` to get real node_modules
2. **`func azure functionapp publish --javascript`** — need the `--javascript` flag when deploying from a directory without tsconfig
3. **Azure SQL Serverless wake-up** — first query after 60min idle takes 30-60s; set requestTimeout to 120s
4. **CROSS APPLY on large tables kills performance** — use CTEs to aggregate first, then join
5. **GitHub push protection** catches Azure Function keys — parameterize scripts, don't hardcode
6. **`az apim create --sku-name Basicv2`** is not valid — allowed values are Developer, Standard, Premium, Basic, Consumption, Isolated
7. **CSV parsing edge cases** — Philadelphia public data has backslash-escaped quotes and unescaped quotes mid-field; standard CSV parsers choke on these

## Session 6 (continued) — Testing, Cost Review, Copilot Studio Research

### Live API Testing
- Verified all endpoints still responding through APIM
- Tested `search_entities` for GEENA LLC (330 properties) — confirmed working
- Tested `get_top_violators` — top 5 are all government entities (Land Bank, Housing Auth, City)
- Deep-dive on 2837 Kensington Ave (parcel 871533290):
  - Owned by A Kensington Joint LLC (2 properties), bought Dec 2022 for $22,500
  - Previously owned by Birds Nest LLC
  - 20 violations (14 failed), 1 demolition, 1 appeal
  - UNSAFE priority case failed 8 times before passing
  - Pattern: distressed property flip between LLCs with ongoing violation history

### Azure Cost Review
- Confirmed all resources on cheapest viable tiers
- No resources need manual start/stop — everything auto-scales to zero
- Estimated idle cost: ~$1-2/month (just storage)

### Copilot Studio + MCP Discussion
- MCP is GA in Copilot Studio (May 2025)
- **Problem:** Our MCP server uses stdio transport; Copilot Studio needs remote HTTP (Streamable HTTP — SSE deprecated Aug 2025)
- **Option A:** Add Streamable HTTP transport to MCP server, deploy as hosted service
- **Option B:** Skip MCP, create Copilot Studio custom connector pointing directly at APIM (no code changes)
- **Status:** Open — user researching further before deciding

### Documentation Updates
- Updated all root md files (CLAUDE.md, SESSION_LOG.md, USAGE.md)
- Created `ARCHITECTURE.md` — comprehensive technical reference with executive summary, ASCII architecture diagrams, entity relationship diagram, full database schema documentation, all 12 API endpoint specifications (request/response), MCP tool listing, Azure resource inventory, cost model, security model, deployment procedures, and performance notes
- Established convention: "root md files" = all root-level .md files (CLAUDE.md, SESSION_LOG.md, USAGE.md, ARCHITECTURE.md), update at end of each session
- Added Copilot Studio section to CLAUDE.md and USAGE.md

---

## Session 7 — Streamable HTTP Transport, Container App, Foundry Agent (2026-02-15)

### Streamable HTTP Transport
- Modified `mcp-server/src/index.ts` — dual-mode: stdio (default, Claude Code/Desktop) and HTTP (`MCP_TRANSPORT=http`)
- Uses `StreamableHTTPServerTransport` from MCP SDK v1.26.0, session-based with `mcp-session-id` header
- Added express dependency, `start:http` script to `mcp-server/package.json`
- Tested locally: health endpoint, MCP initialize (returns session ID), tools/list (all 12 tools)

### Docker & Container App
- Created `mcp-server/Dockerfile` — multi-stage Node 20 Alpine build (build stage → runtime stage)
- Created `mcp-server/.dockerignore`
- Created `infra/deploy-agent.sh` — ACR + Container App Environment + Container App provisioning
- Registered `Microsoft.ContainerRegistry` and `Microsoft.App` resource providers
- Created ACR: `phillymcpacr.azurecr.io` (Basic tier)
- Built image via `az acr build` — cloud-based build, no local Docker needed
- Created Container App Environment: `philly-mcp-env` (Consumption plan, scales to zero)
- Created Container App: `philly-mcp-server`
  - URL: `https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io`
  - APIM subscription key stored as Container App secret

### MCAPS Policy Issues
- **Storage `publicNetworkAccess` was `Disabled`** — MCAPS policy turned it off since Session 6. Function App returned 503 because it couldn't load code from storage.
  - Fixed: `az storage account update --public-network-access Enabled`
  - Note: `allowSharedKeyAccess` is still `false` (MCAPS blocks it), but the Function App uses managed identity which doesn't need shared keys
- **SQL `publicNetworkAccess` was `Disabled`** — MCAPS policy turned it off. Functions got "Deny Public Network Access" error.
  - Fixed: `az sql server update --enable-public-network true`
- **Zip deployment 403** — `config-zip` failed because Kudu uses shared keys internally. The existing deployment (from Session 5) is still intact so no redeployment was needed.

### Foundry Agent Script
- Created `agent/foundry_agent.py` — Azure AI Foundry Agent with MCP tools + optional Bing grounding
  - Uses `azure-ai-projects` SDK (classic API with threads/runs/messages)
  - Configures `McpTool` pointing at Container App MCP endpoint
  - Optional `BingGroundingTool` via connection ID
  - Auto-approves MCP tool calls (we trust our own server)
  - Supports single query (`--query`) or interactive chat loop
- Created `agent/requirements.txt` — azure-ai-projects, azure-ai-agents, azure-identity

### End-to-End Verification
Full chain tested and working:
```
Container App (MCP Server) → APIM → Functions → SQL → data returned
```
- Health: `curl /healthz` → `{"status":"ok"}`
- Initialize: returns session ID + capabilities
- tools/list: all 12 tools discovered
- tools/call get_top_violators: returns real data (Philadelphia Land Bank, Housing Auth, City of Phila)

---

## Current State (as of 2026-02-15)

### Architecture (updated)
```
Claude Code / Claude Desktop (stdio)
    └→ MCP Server (local) → APIM → Functions → SQL

Azure AI Foundry / Copilot Studio / Any HTTP MCP client
    └→ Container App (MCP Server, HTTP) → APIM → Functions → SQL
```

### New Azure Resources
| Resource | Name | SKU |
|----------|------|-----|
| Container Registry | `phillymcpacr` | Basic |
| Container App Env | `philly-mcp-env` | Consumption |
| Container App | `philly-mcp-server` | Consumption (scale 0-3) |
| Log Analytics | `workspace-rgphillyprofiteeringD7ew` | Free tier (auto-created) |

### Known Issues
- MCAPS periodically disables `publicNetworkAccess` on storage and SQL — may need re-enabling after periods of inactivity
- `allowSharedKeyAccess` on storage is permanently blocked by MCAPS — zip deployment requires workaround (existing deployment still works, or use staging dir + `func publish`)

### Open Items
- Azure AI Foundry project setup (needed for `foundry_agent.py` — requires PROJECT_ENDPOINT)
- Bing grounding resource creation (optional, for web search capability)
- Copilot Studio integration testing

**Repo:** https://github.com/pogorman/mcp-apim
**Branch:** main

---

## Session 8 — Documentation, SPA Test Harness (2026-02-15)

### New Root Markdown Files
- **README.md** — GitHub repo homepage with architecture overview, quick start, tools table, data summary, costs, project structure
- **COMMANDS.md** — All CLI commands used across the project: build, infrastructure provisioning, Container App deployment, function deployment, API testing (curl), MCP testing, troubleshooting
- **PROMPTS.md** — Reconstructed user prompts from all sessions (exact wording for sessions 7-8, summaries for sessions 1-6); includes example analysis prompts for the connected agent

### SPA Test Harness (`web/index.html`)
- Single-file HTML/CSS/JS — no build step, no dependencies
- Connects to the MCP server Container App via Streamable HTTP
- Dark theme UI with sidebar (tool list) and main panel (parameters + results)
- Flow: Connect → Initialize session → List tools → Select tool → Fill params → Call → View JSON result
- Pre-filled with Container App URL, auto-discovers all 12 tools
- Displays elapsed time for each call
- Handles SSE response format from Streamable HTTP transport

### SPA Deployment to Azure
- Added CORS middleware to `mcp-server/src/index.ts` (OPTIONS preflight, `Access-Control-Allow-Origin: *`, expose `mcp-session-id` header)
- Rebuilt container image via `az acr build`, restarted Container App revision
- Verified CORS preflight returns 204 with correct headers
- Created Azure Static Web App: `philly-profiteering-spa` (Free tier)
- Deployed via `swa deploy` — live at `https://kind-forest-06c4d3c0f.1.azurestaticapps.net/`

### Root MD Updates
- Updated all 7 root md files with Static Web App URL, resource, and deployment commands
- Updated CLAUDE.md: added web/, README.md, COMMANDS.md, PROMPTS.md to project structure; added SWA to resources
- Updated ARCHITECTURE.md: added web test harness section, SWA to resource inventory and cost model
- Updated USAGE.md: added live SPA URL and redeploy command
- Updated COMMANDS.md: added SWA creation and deployment commands
- Updated SESSION_LOG.md: added Session 8

### New Azure Resources
| Resource | Name | SKU |
|----------|------|-----|
| Static Web App | `philly-profiteering-spa` | Free |

**SPA URL:** https://kind-forest-06c4d3c0f.1.azurestaticapps.net/

---

## Session 9 — Azure AI Foundry, Chat Endpoint, Chat SPA (2026-02-15)

### Problem: SPA Was Just a Tool Tester
User feedback: the original SPA only allowed calling individual MCP tools with specific parameters (parcel numbers, SQL queries). There was no way to ask a natural language question and have an agent figure out which tools to call. Also, no AI Foundry project existed in Azure.

### Azure AI Foundry Setup
- Created AI Foundry Hub: `philly-ai-hub` (rg-foundry, eastus)
- Connected existing AI Services account `foundry-og-agents` via YAML connection file
- Created Foundry Project: `philly-profiteering` under the hub
- Hit MSYS path conversion bug on `--hub-id` parameter — fixed with `MSYS_NO_PATHCONV=1`
- API keys disabled on AI Services (`disableLocalAuth: true`) — must use Azure AD token auth

### Container App Managed Identity for Azure OpenAI
- Enabled system-assigned managed identity on Container App (principal: `11b19c22-85cc-4230-afa2-7979813c5571`)
- Assigned "Cognitive Services OpenAI User" role on `foundry-og-agents` AI Services account
- Container App can now authenticate to Azure OpenAI via DefaultAzureCredential

### Chat Endpoint (`/chat`)
- Created `mcp-server/src/chat.ts`:
  - AzureOpenAI client using `DefaultAzureCredential` + `getBearerTokenProvider`
  - System prompt: investigative analyst for Philadelphia property data
  - 12 tool definitions as `ChatCompletionTool[]`
  - `executeTool()` maps tool names to APIM client functions
  - `chat()` function: tool-calling loop (up to 10 rounds), builds message history
- Added `/chat` POST endpoint to `index.ts`
- Fixed OpenAI SDK v6 union type error: `ChatCompletionMessageToolCall` is a union, needed `tc.type !== "function"` guard
- Added `openai` and `@azure/identity` dependencies
- Built and pushed new container image via `az acr build`
- Updated Container App with new image + `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_DEPLOYMENT` env vars
- Tested: `curl /chat` with "Who are the top 5 worst property owners?" — agent called `get_top_violators` and returned full analysis

### SPA Rebuild as Chat Interface
- Replaced tool-picker UI (`web/index.html`) with a chat interface
- Features: natural language input, conversation history, tool call badges, suggestion prompts, thinking indicator, auto-resize textarea
- Chat calls `/chat` endpoint which invokes Azure OpenAI GPT-4.1 with tool calling
- Dark theme maintained, responsive design
- Deployed to Static Web App (production): `https://kind-forest-06c4d3c0f.1.azurestaticapps.net/`

### New Azure Resources
| Resource | Name | Details |
|----------|------|---------|
| AI Foundry Hub | `philly-ai-hub` | rg-foundry, eastus |
| AI Foundry Project | `philly-profiteering` | Under philly-ai-hub |
| AI Services connection | `foundry-og-agents` | Linked to hub |

### Architecture (updated)
```
Web Chat SPA → Container App /chat → Azure OpenAI GPT-4.1 (tool calling) → APIM → Functions → SQL
Claude Code/Desktop → MCP Server (stdio) → APIM → Functions → SQL
Foundry/Copilot Studio → Container App /mcp (Streamable HTTP) → APIM → Functions → SQL
```

### Key Lessons
- OpenAI SDK v6 uses union types for tool calls — need `tc.type !== "function"` guard before accessing `tc.function`
- Azure AI Services `disableLocalAuth: true` means no API keys — must use managed identity + Azure AD tokens
- `getBearerTokenProvider(credential, "https://cognitiveservices.azure.com/.default")` is the correct scope for Azure OpenAI

---

## Session 10 — Documentation Deep-Dive, Dual-Panel SPA (2026-02-15)

### ARCHITECTURE.md Enhancements
- Added **Container App Deep Dive** section between MCP Server and Azure Infrastructure:
  - What containers are (vs VMs), why Alpine, multi-stage Dockerfile build process with ASCII diagram
  - Azure Container Registry cloud builds (`az acr build`)
  - Container Apps: scaling behavior (0→1→3→0), cold start explanation, Consumption plan
  - What runs inside the container (3 endpoint groups: `/healthz`, `/mcp`, `/chat`)
  - Environment variables and secrets management (encrypted at rest, injected at runtime)
  - Managed identity for Azure OpenAI auth (no API keys)
- Added **Agent Behavior** section:
  - Tool-calling loop with detailed ASCII flow diagram
  - When LLM uses tools vs responds directly (4 categories: direct response, single tool, multi-tool chains, custom SQL)
  - What the LLM sees (system prompt + 12 tool descriptions)
  - Worked example: multi-step investigation of "2837 Kensington Ave" showing 5 sequential tool calls

### Dual-Panel SPA (`web/index.html`)
- Complete rewrite from single-view chat to dual-panel interface:
  - **Activity bar** (48px, left edge): VS Code-style with two SVG icon buttons (chat bubble for Agent, wrench for Tools)
  - **Panel 1 — Investigative Agent**: Natural language chat with GPT-4.1 tool calling, suggestion prompts, tool call badges, conversation history
  - **Panel 2 — MCP Tool Tester**: Connect to MCP server, discover tools, call individual tools with parameter forms, raw JSON results with elapsed time
  - **Layout**: Both panels can be open side-by-side (50/50 split) or individually (full width). Closing both shows welcome screen with quick-open buttons.
  - **Responsive**: On mobile (<768px), only one panel visible at a time
- Deployed to Azure Static Web App (production): `https://kind-forest-06c4d3c0f.1.azurestaticapps.net/`

### Root MD Updates
- Updated all 7 root md files (ARCHITECTURE.md, README.md, CLAUDE.md, USAGE.md, SESSION_LOG.md, COMMANDS.md, PROMPTS.md)
- Replaced "Chat SPA" / "Chat Interface" references with "dual-panel SPA" / "Web Interface" across all files
- Updated project structure descriptions to reflect Agent chat + MCP tool tester

---

## Session 11 — Model Selector, AI Foundry Fix (2026-02-15)

### MCAPS Fix: AI Foundry Hub
- **Problem:** `publicNetworkAccess` on `philly-ai-hub` was set to `Disabled` by MCAPS policy — user got "restricted resource from unauthorized network location" error in Foundry portal
- **Fix:** `az ml workspace update --name philly-ai-hub --resource-group rg-foundry --public-network-access Enabled`
- Same pattern as storage/SQL in Session 7 — MCAPS periodically disables public access

### Model Deployments
Deployed 4 new models on `foundry-og-agents` AI Services account (GlobalStandard, pay-per-token):
| Deployment | Model | Format |
|-----------|-------|--------|
| gpt-4.1 | gpt-4.1 | OpenAI (existing) |
| o3-mini | o3-mini | OpenAI (existing) |
| o4-mini | o4-mini | OpenAI (new) |
| gpt-5 | gpt-5 | OpenAI (new) |
| gpt-5-mini | gpt-5-mini | OpenAI (new) |
| Phi-4 | Phi-4 | Microsoft MaaS (new) |

Note: gpt-5.2 was only available as `GlobalProvisionedManaged` (pay-per-hour, expensive) — used gpt-5 (GlobalStandard, pay-per-token) instead.

### Model Selector
- Added `model` field to `ChatRequest` in `chat.ts` — maps to Azure OpenAI deployment name
- Added `/models` GET endpoint returning available model list
- Added `AVAILABLE_MODELS` array in `chat.ts` with id, label, description for each model
- Response now includes `model` field showing which deployment was actually used
- Added model selector dropdown to SPA header (between title and status indicator)
- SPA fetches `/models` on load to stay in sync with server; falls back to hardcoded defaults
- Built and deployed new container image + SPA

### Key Lesson
- Phi-4 uses `Microsoft` model format (MaaS) but deploys on the same AI Services account as OpenAI models. Same Azure OpenAI endpoint, same `DefaultAzureCredential` auth — just a different deployment name.

---

## Session 12 — Documentation, Foundry Deep-Dive, FAQ (2026-02-15)

### Jupyter Notebooks
- Found and downloaded 3 original PhillyStats Fabric/Synapse notebooks from `davew-msft/PhillyStats` repo via GitHub API
- Saved to new `jupyter-notebooks/` directory:
  - `PhillyStat 01-Setup.ipynb` (1.8 MB) — data setup and loading
  - `PhillyStats-Analytics.ipynb` (45 KB) — analytics queries
  - `PhillyStats02-LLC-Analytics.ipynb` (237 KB) — LLC-specific analysis

### README Rewrite
- Replaced opening line ("An MCP server that...") with executive summary describing the full platform
- Rebuilt architecture diagram showing all tiers: Web SPA, Claude Code/Desktop, Foundry, Container App endpoints (`/chat`, `/mcp`, `/models`), APIM, Functions, SQL
- Reordered sections: Web Interface moved above Quick Start
- Added missing entries: `chat.ts`, `data/`, `jupyter-notebooks/` in project structure
- Added `PROMPTS.md` to documentation links

### ARCHITECTURE.md Resource Group Clarification
- Split Resource Inventory into two sections by resource group (`rg-philly-profiteering` and `rg-foundry`)
- Documented all 8 resources in `rg-foundry` with "Used by This Project?" column
- Identified 3 cleanup candidates: `og-foundry-eus2`, `foundry-deployments`, `claude-foundry`
- Noted `gpt-5-pro` on `og-foundry-eus2` uses GlobalProvisionedManaged (potential cost)

### MCAPS Policy Investigation
- Confirmed `AIFoundryHub_PublicNetwork_Modify` policy (Modify effect) actively rewrites `publicNetworkAccess = Disabled` on ML workspaces
- Policy assigned at management group scope (`MCAPSGovDeployPolicies`) — subscription admin cannot override
- Setting reverts to `Disabled` within seconds of being changed
- This is why `foundry-deployments` (CognitiveServices project) works in portal but `philly-profiteering` (ML workspace project) doesn't — different resource types, policy only targets `MachineLearningServices/workspaces`

### CLI Cheat Sheet (`CLI_CHEATSHEET.md`)
- Created new root md for day-to-day management commands
- Sections: Quick Status Check, AI Foundry (full agent lifecycle via REST API), Container App, APIM, SQL, MCAPS Policy Checks, Smoke Tests
- Covers managing Foundry agents entirely via CLI since portal is blocked

### FAQ (`FAQ.md`)
- Created new root md capturing Q&As from this session
- Architecture & Design: What is the Investigative Agent, why two resource groups
- Azure Foundry & MCAPS: Why portal is blocked, management group hierarchy, resource type differences
- Agent Patterns: Chat Completions + Tools vs Platform Agents vs Frameworks — when to use each, pros/cons, what production systems use
- Model Deployments: What's deployed, why no GPT-5.2, model selection end-to-end
- Infrastructure & Costs: Idle costs, cold start, cleanup candidates
- Development & Deployment: Staging dir, zip backslash bug, MSYS path conversion

### Key Lessons
- MCAPS `Modify` policies cannot be overridden at subscription level — they actively rewrite resource properties, not just block changes
- Azure has two types of "Foundry projects": `CognitiveServices/accounts/projects` (newer, not affected by ML workspace policies) and `MachineLearningServices/workspaces` (older, subject to MCAPS ML workspace policies)
- Most production AI systems use Chat Completions + Tools (Pattern 1), not platform-managed agents — control, debuggability, and model flexibility outweigh convenience of managed state

---

## Session 13 — City Portal + Foundry Agent (2026-02-16)

### Goal
Add a 3rd panel to the SPA demonstrating a third client pattern: the **Assistants API** (Foundry Agent), where Azure manages the tool-calling loop and threads persist server-side. The panel should look like a City of Philadelphia government page with a floating chat widget, contrasting with the existing dark-themed panels.

### Shared Tool Definitions (`tool-executor.ts`)
- Extracted `SYSTEM_PROMPT`, `TOOLS` (12 tool definitions), and `executeTool()` from `chat.ts` into a new shared module `mcp-server/src/tool-executor.ts`
- Both `chat.ts` and the new `foundry-agent.ts` import from this module
- `chat.ts` refactored to use imports — no behavioral change

### Foundry Agent (`foundry-agent.ts`)
- Created `mcp-server/src/foundry-agent.ts` implementing the Assistants API lifecycle:
  - `ensureAgent()` — searches for existing assistant named `philly-investigator`, creates one if not found. Caches agent ID in memory. Uses `gpt-4.1` deployment.
  - `createThread()` — creates a new Assistants API thread
  - `sendMessage(threadId, message)` — adds user message, creates a run, polls status in a loop:
    - `requires_action` → executes requested tools via `executeTool()`, submits results
    - `completed` → extracts assistant response from thread messages
    - `failed` / `cancelled` / `expired` → throws error
  - Returns `{ reply, toolCalls }` matching the Chat Completions response shape
- Key difference from `chat.ts`: Azure decides when/which tools to call; we just execute them. Thread state persists server-side.
- Fixed openai v6 type issues:
  - `ChatCompletionTool` is a union type (`ChatCompletionFunctionTool | ChatCompletionCustomTool`) — needed type guard filter
  - `runs.retrieve(runId, { thread_id })` and `runs.submitToolOutputs(runId, { thread_id, tool_outputs })` — v6 uses params object instead of positional args for thread ID

### Express Endpoints
- Added to `mcp-server/src/index.ts`:
  - `POST /agent/thread` — creates a new thread, returns `{ threadId }`
  - `POST /agent/message` — accepts `{ threadId, message }`, returns `{ reply, toolCalls }`
- `ensureAgent()` called eagerly on startup (non-fatal if it fails)

### City Portal Panel (`web/index.html`)
- Added 3rd panel with Philadelphia city government branding:
  - **Color scheme**: Navy blue (`#004785`), warm yellow (`#f2c94c`), light gray background
  - **Header**: SVG city seal + "City of Philadelphia" / "Property Data Transparency Portal"
  - **Content**: Intro text, stats grid (584K Properties, 1.6M Code Investigations, 13.5K Demolitions), "About This Data" card
  - **FAB**: 56px floating action button (bottom-right), navy blue with chat icon, hover scale effect
  - **Chat widget**: 400x500px overlay above FAB with:
    - Header with title + close button
    - Message area with user (blue right-aligned) / assistant (gray left-aligned) / system (centered) bubbles
    - Text input with send button
    - Thinking indicator while waiting for agent response
  - Thread created on first widget open; subsequent messages use same thread for persistent context
- Added 3rd activity bar tab with building icon
- Added "City Portal" to welcome screen quick-open buttons
- Updated `state.panels` and `updatePanels()` to handle `city` panel

### Three Client Patterns Demonstrated
```
Pattern 1: Investigative Agent (Chat Completions + Tools)
  → Our code runs the agentic loop in chat.ts
  → Stateless — client sends full history each request
  → User selects model via dropdown

Pattern 2: City Portal (Assistants API / Foundry Agent)
  → Azure manages the tool-calling loop
  → Stateful — threads persist server-side, follow-ups remember context
  → Fixed model (gpt-4.1) configured in the assistant

Pattern 3: MCP Tool Tester (Raw MCP Protocol)
  → Direct tool calls via MCP Streamable HTTP
  → No AI — user manually selects tools and fills parameters
```

### Deployment
- Built TypeScript: `npm run build -w mcp-server` (clean)
- Built container image: `az acr build` → `phillymcpacr.azurecr.io/mcp-server:latest`
- Updated Container App: `az containerapp update`
- Deployed SPA: `swa deploy` → `https://kind-forest-06c4d3c0f.1.azurestaticapps.net/`

### Verification
- `POST /agent/thread` → returns `{ threadId: "thread_..." }`
- `POST /agent/message` with "Who are the top 3 worst property owners?" → agent called `get_top_violators`, returned detailed analysis
- Follow-up "Tell me more about the second one" → agent responded from thread context without making additional tool calls (thread persistence confirmed)

### Key Lessons
- OpenAI SDK v6 Assistants API: `runs.retrieve()` and `runs.submitToolOutputs()` take `(runId, { thread_id, ... })` — thread_id goes in params object, not as a positional argument
- `ChatCompletionTool` is a union type in v6 — can't access `.function` without narrowing to `ChatCompletionFunctionTool` first
- Assistants API on Azure uses the same `AzureOpenAI` client and `DefaultAzureCredential` — no separate client needed
- Thread persistence is the key differentiator: follow-up questions work without re-sending history or making tool calls

---

## Session 14 — UI Polish, Copilot Studio Integration, Docs Reorganization (2026-02-16)

### Model Selector & GPT-5 Agent
- Hid model selector dropdown on City Portal panel (only relevant for Investigative Agent)
- Updated Foundry Agent (`foundry-agent.ts`) from `gpt-4.1` to `gpt-5`
- Updated live assistant via REST API to use `gpt-5` model

### Docs Reorganization
- Moved 7 markdown files from root to `docs/` directory: ARCHITECTURE.md, CLI_CHEATSHEET.md, COMMANDS.md, FAQ.md, PROMPTS.md, SESSION_LOG.md, USAGE.md
- Only README.md and CLAUDE.md remain in root
- Updated all cross-references in README.md and CLAUDE.md

### UI Improvements
- Moved MCP Tools icon to bottom of activity bar (flex spacer pattern)
- Rewrote `formatContent()` from simple regex to full markdown parser handling: tables, numbered/ordered lists, code blocks, inline code, headers, bold, italic, horizontal rules
- Added extensive CSS for markdown rendering (`.md-h`, `.md-list`, `.md-table`, `.md-code`, `.md-inline-code`, `.md-hr`)

### Azure AI Foundry Portal
- Confirmed MCAPS blocks Foundry portal access: "restricted resource from unauthorized network location"
- This is the same `AIFoundryHub_PublicNetwork_Modify` policy — it cannot be overridden at subscription level
- All agent management done via CLI/REST API instead

### FAQ: Azure SQL vs Dataverse
- Added detailed FAQ entry covering why Azure SQL was chosen over Dataverse
- Covers: scale/performance (25 custom indexes), storage overhead, schema flexibility, cost, custom SQL, when Dataverse would make sense

### Copilot Studio Integration
- Connected Copilot Studio to MCP server endpoint (`/mcp` on Container App)
- Copilot Studio auto-discovers all 12 tools via MCP protocol
- No authentication required (endpoint is open)
- Configured agent description and instructions in Copilot Studio
- Embedded Copilot Studio as iframe widget in the SPA:
  - Initially as a 4th panel tab — had CSS bug where it showed on homepage
  - Reworked to a floating widget: purple star FAB icon (bottom-right), 420x560px overlay with iframe
  - Accessible from any page, independent of the panel system
  - Iframe lazy-loaded on first open to avoid startup cost

### Four Client Patterns Now Demonstrated
```
Pattern 1: Investigative Agent (Chat Completions + Tools)
  → Our code runs the agentic loop in chat.ts
  → Stateless — client sends full history each request
  → User selects model via dropdown (6 models)

Pattern 2: City Portal (Assistants API / Foundry Agent)
  → Azure manages the tool-calling loop with GPT-5
  → Stateful — threads persist server-side, follow-ups remember context

Pattern 3: Copilot Studio (MCP via Low-Code)
  → Copilot Studio auto-discovers tools via MCP protocol
  → Embedded as floating iframe widget
  → No custom code — just point at the MCP endpoint

Pattern 4: MCP Tool Tester (Raw MCP Protocol)
  → Direct tool calls via MCP Streamable HTTP
  → No AI — user manually selects tools and fills parameters
```

### Deployment
- Built and deployed new container image (GPT-5 agent update)
- Deployed SPA multiple times (UI improvements + Copilot Studio widget)

### Key Lessons
- Copilot Studio MCP integration is straightforward: just point at the Streamable HTTP endpoint, no auth setup needed
- Copilot Studio iframe embed works for demos but may have SSO/auth considerations for production
- Container App cold starts can cause Copilot Studio connection timeouts — wake container via `/healthz` first
- CSS specificity matters: adding `display: flex` to a panel class can override the `.panel { display: none }` rule, causing panels to leak onto the homepage

## Session 15 — Copilot Studio Panel, User Guide, Wake-Up Script

### Copilot Studio Gets Its Own Panel
- Moved Copilot Studio from a global floating widget (visible on every page) to a dedicated left-nav panel with its own tab (star icon)
- Created a branded info page explaining auto-discovery, no-code approach, and same-backend architecture
- FAB (floating chat button) + widget overlay are now scoped to the Copilot Studio panel only — no longer visible on other panels
- Fixed "JavaScriptError" in Copilot Studio iframe by force-reloading the iframe each time the widget opens (clears stale sessions)
- Added `referrerpolicy="no-referrer-when-downgrade"` to iframe for better cross-origin behavior

### Documentation Consolidation
- Created `docs/USER_GUIDE.md` — comprehensive, TOC-driven user guide written for non-technical users
  - Covers all four panels with step-by-step instructions
  - Example prompts organized by category (quick wins, deep investigations, business, area analysis, custom SQL)
  - Model selection guide, tips & tricks, cold start explanation
  - Consolidated user-facing content from USAGE.md, FAQ.md, and ARCHITECTURE.md
  - Includes connecting other clients (Claude Code, Claude Desktop, Copilot Studio setup, direct API)
  - FAQ section, cost breakdown, and developer docs index
- Removed `docs/USAGE.md` — fully superseded by USER_GUIDE.md
- Updated README.md documentation index

### Wake-Up Script
- Created `infra/wake.sh` — warms up all serverless resources before demos
  - Step 1: Pings `/healthz` to wake Container App
  - Step 2: Sends a lightweight `/chat` query to wake SQL Database
  - Step 3: Verifies MCP endpoint is responding
  - Reports timing for each step

### Key Lessons
- Copilot Studio iframe "JavaScriptError" is a known issue from their webchat SDK — force-reloading the iframe on each open is the best workaround
- Scoping floating elements to panels (position: absolute inside panel) is cleaner than global fixed positioning (z-index wars, visibility on wrong pages)
- A simple wake-up script is better than hoping someone remembers to hit healthz manually
