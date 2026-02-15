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

## Current State (as of 2026-02-14)

Everything is deployed and operational. System is idle (SQL auto-paused). First query will take ~30-60s to wake the database, then subsequent queries are fast.

**Repo:** https://github.com/pogorman/mcp-apim
**Branch:** main
**Working tree:** clean
