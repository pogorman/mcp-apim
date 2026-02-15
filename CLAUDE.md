# Philly Poverty Profiteering - MCP + APIM + Azure Functions + Azure SQL

## What This Is

An MCP (Model Context Protocol) server that lets AI agents investigate poverty profiteering patterns in Philadelphia using 10 public datasets (~29M rows, ~4.4GB). The agent queries property ownership networks, code violations, demolitions, business licenses, and assessment data to identify exploitative LLCs and property owners.

## Architecture

```
Claude Desktop / Claude Code / Any MCP Client
    |  (stdio / MCP Protocol)
MCP Server (TypeScript, local process)
    |  (HTTPS + Ocp-Apim-Subscription-Key header)
Azure API Management (Consumption tier)
    |  (HTTPS + x-functions-key header, injected by APIM policy)
Azure Functions v4 (Node.js 20, Flex Consumption FC1)
    |  (Azure AD token auth via DefaultAzureCredential)
Azure SQL Database (General Purpose Serverless, Gen5 2 vCores)
    (10 tables, 3 views, 20+ indexes)
```

## Project Structure

```
mcp-apim/
├── mcp-server/              # MCP Server (local stdio process)
│   └── src/
│       ├── index.ts          # Entry point, stdio transport
│       ├── tools.ts          # 12 tool definitions for Claude
│       └── apim-client.ts    # HTTP client for APIM
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
├── sql/
│   └── schema.sql            # 10 tables, 3 views, 20+ indexes
├── infra/
│   ├── deploy.sh             # az CLI infrastructure provisioning
│   ├── set-policy.ps1        # APIM policy (injects function key)
│   ├── apim-policy.json      # APIM policy XML
│   └── func-app-body.json    # Function app ARM template
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
The MCP server is configured in `.mcp.json` for Claude Code. It starts automatically when Claude Code uses the `philly-stats` tools.

To test manually:
```bash
node mcp-server/dist/index.js
```
Environment variables: `APIM_BASE_URL`, `APIM_SUBSCRIPTION_KEY`

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

## Data Source

Based on [davew-msft/PhillyStats](https://github.com/davew-msft/PhillyStats) which used 10 Philadelphia public datasets. Original used Fabric/Synapse; this project uses Azure SQL + Azure Functions for a production-ready API.
