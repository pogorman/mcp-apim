# Philly Poverty Profiteering

An AI-powered investigative platform that surfaces poverty profiteering patterns in Philadelphia. It combines 10 public datasets (~29 million rows) covering property ownership, code violations, demolitions, business licenses, and tax assessments into a queryable system that any AI agent — or a human through a web browser — can use to identify exploitative LLCs and property owners.

The system has three layers: a **serverless data API** (Azure Functions + SQL), an **MCP server** that exposes 12 investigative tools to any AI agent, and a **web interface** with three client patterns — a Chat Completions agent, a Foundry Agent (Assistants API), and an MCP tool tester — showing how the same backend serves different AI integration approaches. Everything is serverless and costs ~$1-2/month when idle.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Interfaces                                       │
│                                                                             │
│  Web SPA (chat)         Claude Code/Desktop       Foundry / Copilot Studio  │
│  Browser → /chat        stdio (local process)     Streamable HTTP (remote)  │
└─────┬───────────────────────────┬──────────────────────────┬────────────────┘
      │                           │                          │
      ▼                           ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MCP Server (Container App + local)                        │
│                                                                             │
│  Express server on Azure Container Apps (scale 0-3)                         │
│  POST /chat  — Chat Completions + tool calling (6 models, stateless)       │
│  POST /agent — Foundry Agent / Assistants API (persistent threads)         │
│  POST /mcp   — MCP protocol (Streamable HTTP, 12 tools, session-based)     │
│  GET  /models — available model list                                        │
│  Also runs locally via stdio for Claude Code/Desktop                        │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTPS + Ocp-Apim-Subscription-Key
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               Azure API Management (Consumption tier)                       │
│  Validates subscription key, injects x-functions-key for backend auth       │
│  12 operations (9 GET, 3 POST)                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTPS + x-functions-key
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               Azure Functions v4 (Flex Consumption, Node.js 20)             │
│  12 HTTP-triggered functions, managed identity → Azure AD token auth        │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ TDS + Azure AD token
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               Azure SQL Database (Serverless Gen5, auto-pause)              │
│  10 tables, 3 views, 28+ indexes, ~29M rows                                │
│  Entity resolution graph + property + license + enforcement data            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**How the chat agent works:** When a user asks a question through the web SPA or `/chat` endpoint, the system sends it to Azure OpenAI with 12 tool definitions. The LLM autonomously decides which tools to call — it might chain 3-5 calls to resolve a name, pull property details, check violations, and look up demolitions — then synthesizes the results into a narrative answer. The loop runs up to 10 rounds per question. See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed walkthrough with examples.

## Web Interface

Try it in your browser: **https://kind-forest-06c4d3c0f.1.azurestaticapps.net/**

A three-panel SPA with a VS Code-style activity bar, demonstrating three different ways to consume the same APIM backend:

- **Investigative Agent** — Chat Completions + Tools pattern. Ask questions in natural language; our code runs the agentic loop. Switch between 6 models (GPT-4.1, GPT-5, GPT-5 Mini, o4-mini, o3-mini, Phi-4) via the dropdown.
- **City Portal** — Assistants API (Foundry Agent) pattern. A Philadelphia-branded government page with a floating chat widget. Azure manages the tool-calling loop and threads persist server-side — follow-up questions remember context.
- **MCP Tool Tester** — Raw MCP protocol pattern. Connect directly to the MCP server, discover tools, and call them individually with specific parameters.

Panels can be open side-by-side or individually.

## Quick Start

### Claude Code

```bash
git clone https://github.com/pogorman/mcp-apim.git
cd mcp-apim
npm install
npm run build -w mcp-server
```

Copy the MCP config and add your subscription key:

```bash
cp .mcp.json.example .mcp.json
# Edit .mcp.json — replace <your-apim-subscription-key> with your key
```

Open the project in Claude Code. The MCP server starts automatically and exposes all 12 tools.

### Claude Desktop

Add to your config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "philly-stats": {
      "command": "node",
      "args": ["<path-to-repo>/mcp-server/dist/index.js"],
      "env": {
        "APIM_BASE_URL": "https://philly-profiteering-apim.azure-api.net/api",
        "APIM_SUBSCRIPTION_KEY": "<your-key>"
      }
    }
  }
}
```

### Remote MCP Clients (Foundry, Copilot Studio)

The MCP server is deployed as a Container App with Streamable HTTP transport:

```
MCP Endpoint: https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp
Health Check: https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/healthz
```

Any MCP-compatible client can connect and auto-discover all 12 tools.

## Tools

| Tool | Description |
|------|-------------|
| `search_entities` | Search people, LLCs, and corporations by name |
| `get_entity_network` | Get all properties linked to an entity |
| `get_property_profile` | Full property details with violation/license counts |
| `get_property_violations` | Code enforcement cases (filterable, paginated) |
| `get_property_assessments` | Assessment value history (2015-2025) |
| `get_property_licenses` | Business and commercial licenses |
| `get_property_appeals` | L&I appeals with decisions |
| `get_property_demolitions` | Demolition records (city vs owner initiated) |
| `search_businesses` | Find check cashing, pawn shops, etc. by keyword/zip |
| `get_top_violators` | Ranked owners by code violations |
| `get_area_stats` | Zip code aggregate statistics |
| `run_query` | Custom read-only SQL against the full database |

## Example Prompts

Once connected, try asking your AI agent:

- "Who are the top 10 worst property owners in Philadelphia by code violations?"
- "Tell me about GEENA LLC — how many properties do they own and how many violations?"
- "What check cashing businesses operate in zip code 19134?"
- "Show me the assessment trend for parcel 405100505 over the last 10 years"
- "Which zip codes have the highest vacancy and violation rates?"
- "Find LLCs that own more than 50 properties and have demolition records"
- "Deep dive on 2837 Kensington Ave — who owns it, what violations, any demolitions?"
- "Compare violation rates between zip codes 19134 and 19140"

## Data

~29 million rows from 10 Philadelphia public datasets:

| Table | Rows | What It Contains |
|-------|------|-----------------|
| Entity Resolution Graph | 19.3M | 2.8M entities, 987K addresses, 15.5M links |
| OPA Properties | 584K | Every property in Philadelphia |
| Assessments | 6.4M | Tax assessments by year (2015-2025) |
| Business Licenses | 422K | Rental, food, commercial, vacant licenses |
| Commercial Activity | 508K | Commercial activity licenses with revenue codes |
| Code Investigations | 1.6M | Violations, inspections, pass/fail outcomes |
| Appeals | 316K | L&I zoning and building code appeals |
| Demolitions | 13.5K | City-initiated and owner-initiated demolitions |

Data sourced from [davew-msft/PhillyStats](https://github.com/davew-msft/PhillyStats) (Philadelphia open data portals). Original Fabric/Synapse notebooks are in [`jupyter-notebooks/`](jupyter-notebooks/).

## Project Structure

```
mcp-apim/
├── mcp-server/              # MCP Server (stdio + Streamable HTTP)
│   ├── src/
│   │   ├── index.ts         # Dual transport entry point (Express + stdio)
│   │   ├── tools.ts         # 12 MCP tool registrations
│   │   ├── tool-executor.ts # Shared tool definitions + executor (used by chat + agent)
│   │   ├── chat.ts          # Chat Completions + tool calling loop
│   │   ├── foundry-agent.ts # Assistants API: ensureAgent, createThread, sendMessage
│   │   └── apim-client.ts   # HTTP client for APIM
│   └── Dockerfile           # Container App deployment (multi-stage, Alpine)
├── functions/               # Azure Functions (12 HTTP endpoints)
│   └── src/functions/       # One file per endpoint
├── web/                     # Browser-based three-panel interface
│   └── index.html           # Agent chat + City Portal + MCP tool tester
├── agent/                   # Azure AI Foundry agent
│   └── foundry_agent.py     # MCP + Bing grounding
├── sql/schema.sql           # Database schema (10 tables, 3 views, 28+ indexes)
├── data/                    # Source CSV files (~4.4GB, 10 datasets)
├── jupyter-notebooks/       # Original PhillyStats Fabric/Synapse notebooks
└── infra/                   # Azure provisioning scripts
```

## Costs

All resources are serverless/consumption — scale to zero when idle:

| Resource | Idle Cost |
|----------|-----------|
| Azure SQL (Serverless, auto-pauses after 60min) | $0 |
| Azure Functions (Flex Consumption) | $0 |
| API Management (Consumption) | $0 |
| Container App (scales to zero) | $0 |
| Azure OpenAI (pay-per-token) | $0 |
| Static Web App (Free tier) | $0 |
| Storage (2 accounts) | ~$1/mo |
| Container Registry (Basic) | ~$0.17/mo |
| **Total when idle** | **~$1-2/mo** |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Full technical reference: schema, ERD, API specs, agent behavior, infrastructure, Container App deep dive
- [CLI_CHEATSHEET.md](CLI_CHEATSHEET.md) — Day-to-day management commands (Foundry agents, Container App, APIM, SQL, MCAPS troubleshooting)
- [FAQ.md](FAQ.md) — Common questions: agent architecture, MCAPS policies, model deployments, costs, deployment gotchas
- [USAGE.md](USAGE.md) — Quick start guides, curl examples, example prompts
- [COMMANDS.md](COMMANDS.md) — All CLI commands used to build and deploy this project
- [SESSION_LOG.md](SESSION_LOG.md) — Chronological build log with lessons learned
- [PROMPTS.md](PROMPTS.md) — User prompts from each build session
- [CLAUDE.md](CLAUDE.md) — AI agent instructions for working with this codebase

## License

MIT
