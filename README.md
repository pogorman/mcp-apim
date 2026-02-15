# Philly Poverty Profiteering

An MCP server that lets AI agents investigate poverty profiteering patterns in Philadelphia using 10 public datasets (~29M rows). Query property ownership networks, code violations, demolitions, business licenses, and assessment data to identify exploitative LLCs and property owners.

## How It Works

```
Web Chat SPA → Container App /chat → Azure OpenAI GPT-4.1 (tool calling) → APIM → Functions → SQL
Claude Code/Desktop → MCP Server (stdio, 12 tools) → APIM → Functions → SQL
Foundry/Copilot Studio → Container App /mcp (Streamable HTTP) → APIM → Functions → SQL
```

Three ways to interact: a **web chat interface** where you ask natural language questions and GPT-4.1 figures out which tools to call, **Claude Code/Desktop** via local MCP server, or any **remote MCP client** via the Streamable HTTP endpoint. All compute is serverless — costs ~$1-2/month when idle.

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

The MCP server is also deployed as a Container App with Streamable HTTP transport:

```
MCP Endpoint: https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp
Health Check: https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/healthz
```

Any MCP-compatible client can connect and auto-discover all 12 tools.

### Web Interface

Try it in your browser: **https://kind-forest-06c4d3c0f.1.azurestaticapps.net/**

Two views accessible from a VS Code-style activity bar:
- **Investigative Agent** — Ask questions in natural language. The AI model decides which tools to call, queries the database, and returns a synthesized answer. Switch between 6 models (GPT-4.1, GPT-5, GPT-5 Mini, o4-mini, o3-mini, Phi-4) via the dropdown.
- **MCP Tool Tester** — Connect directly to the MCP server, discover tools, and call them individually with specific parameters. Useful for demos and debugging.

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

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Client Layer                          │
│  Claude Code/Desktop (stdio)  │  Foundry/Copilot Studio (HTTP) │
└──────────┬────────────────────┼─────────────────┬───────────────┘
           │                    │                 │
           ▼                    ▼                 ▼
┌────────────────────┐  ┌──────────────────────────────┐
│  MCP Server (local)│  │  MCP Server (Container App)  │
│  stdio transport   │  │  Streamable HTTP transport   │
└─────────┬──────────┘  └──────────────┬───────────────┘
          │                            │
          └──────────┬─────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│          Azure API Management (Consumption tier)                │
│  Validates subscription key, injects function key               │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│          Azure Functions v4 (Flex Consumption)                  │
│  12 HTTP-triggered functions, Node.js 20                        │
│  Managed identity → Azure AD token auth to SQL                  │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│          Azure SQL Database (Serverless Gen5)                   │
│  10 tables, 3 views, 28+ indexes                                │
│  ~29M rows across property, entity, license, enforcement data   │
└─────────────────────────────────────────────────────────────────┘
```

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

Data sourced from [davew-msft/PhillyStats](https://github.com/davew-msft/PhillyStats) (Philadelphia open data portals).

## Project Structure

```
mcp-apim/
├── mcp-server/           # MCP Server (stdio + Streamable HTTP)
│   ├── src/
│   │   ├── index.ts      # Dual transport entry point
│   │   ├── tools.ts      # 12 tool definitions
│   │   └── apim-client.ts
│   └── Dockerfile        # Container App deployment
├── functions/            # Azure Functions (12 endpoints)
│   └── src/functions/    # One file per endpoint
├── agent/                # Azure AI Foundry agent
│   └── foundry_agent.py  # MCP + Bing grounding
├── web/                  # Browser-based dual-panel interface
│   └── index.html        # Agent chat + MCP tool tester SPA
├── sql/schema.sql        # Database schema
└── infra/                # Azure provisioning scripts
```

## Costs

All resources are serverless/consumption — scale to zero when idle:

| Resource | Idle Cost |
|----------|-----------|
| Azure SQL (Serverless, auto-pauses) | $0 |
| Azure Functions (Flex Consumption) | $0 |
| API Management (Consumption) | $0 |
| Container App (scales to zero) | $0 |
| Storage (2 accounts) | ~$1/mo |
| Container Registry (Basic) | ~$0.17/mo |
| Static Web App (Free tier) | $0 |
| **Total when idle** | **~$1-2/mo** |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Full technical reference: schema, API specs, ERD, infrastructure
- [USAGE.md](USAGE.md) — Quick start guides, curl examples, example prompts
- [COMMANDS.md](COMMANDS.md) — All CLI commands used to build and deploy this project
- [SESSION_LOG.md](SESSION_LOG.md) — Chronological build log with lessons learned
- [CLAUDE.md](CLAUDE.md) — AI agent instructions for working with this codebase

## License

MIT
