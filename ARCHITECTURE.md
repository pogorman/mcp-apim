# Architecture & Technical Reference

## Executive Summary

This system enables AI agents to investigate poverty profiteering patterns in Philadelphia by querying 10 public datasets (~29 million rows, ~4.4GB) through a standardized API. It connects property ownership networks, code violations, demolitions, business licenses, and tax assessments to surface exploitative LLCs and property owners.

The architecture follows a four-tier pattern: an **MCP Server** translates AI tool calls into HTTPS requests to **Azure API Management**, which authenticates and routes them to **Azure Functions**, which query an **Azure SQL Database**. All compute tiers are serverless/consumption-based, costing ~$1-2/month when idle.

The MCP server supports dual transport: **stdio** (local, for Claude Code/Desktop) and **Streamable HTTP** (remote, deployed on Azure Container Apps for Azure AI Foundry, Copilot Studio, and other remote MCP clients).

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Client Layer                            │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐     │
│  │ Claude Code   │  │ Claude Desktop│  │ AI Foundry / Copilot │     │
│  └──────┬───────┘  └───────┬───────┘  └──────────┬───────────┘     │
│         │ stdio            │ stdio               │ HTTP             │
└─────────┼──────────────────┼─────────────────────┼─────────────────┘
          │                  │                     │
          ▼                  ▼                     ▼
┌─────────────────────────────────────┐  ┌──────────────────────────┐
│        MCP Server (local)           │  │ MCP Server (Container App)│
│  TypeScript, stdio transport        │  │ Streamable HTTP transport │
│  12 tools → HTTP calls              │  │ philly-mcp-server         │
│  Adds Ocp-Apim-Subscription-Key    │  │ Scale: 0-3 replicas       │
└──────────────┬──────────────────────┘  └────────────┬─────────────┘
               │ HTTPS                                │ HTTPS
               ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Azure API Management (Consumption)                     │
│  philly-profiteering-apim.azure-api.net/api                        │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │ Inbound Policy: validates subscription key,              │       │
│  │ injects x-functions-key header for backend auth          │       │
│  └─────────────────────────────────────────────────────────┘       │
│  12 operations (9 GET, 3 POST) → proxy to Function App            │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS + x-functions-key
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│           Azure Functions v4 (Flex Consumption FC1)                 │
│  philly-profiteering-func.azurewebsites.net                        │
│  Node.js 20, TypeScript compiled to JS                             │
│  12 HTTP-triggered functions                                       │
│  System-assigned managed identity for SQL auth                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ TDS (Azure AD token)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│           Azure SQL Database (General Purpose Serverless)           │
│  philly-stats-sql-01.database.windows.net / phillystats            │
│  Gen5 2 vCores, 0.5 min capacity, 60-min auto-pause               │
│  10 tables, 3 views, 28+ indexes                                  │
│  ~29M rows across entity resolution, property, license,           │
│  enforcement domains                                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
Client → MCP Server: stdio (no auth, local process)
MCP Server → APIM:   Ocp-Apim-Subscription-Key header
APIM → Functions:    x-functions-key header (injected by APIM policy, invisible to client)
Functions → SQL:     Azure AD token via DefaultAzureCredential (managed identity)
```

No passwords are stored in application code. The Function App's system-assigned managed identity has `db_datareader` role on the SQL database.

---

## Data Sources

All data comes from Philadelphia's open data portals. The original datasets were curated by [davew-msft/PhillyStats](https://github.com/davew-msft/PhillyStats).

| Dataset | Source Agency | Rows | Description |
|---------|-------------|------|-------------|
| Master Entity | OPA Entity Resolution | 2.8M | Deduplicated names of people, LLCs, corporations across all property records |
| Master Address | OPA Entity Resolution | 987K | Deduplicated addresses across all property records |
| Master Entity Address | OPA Entity Resolution | 15.5M | Junction table linking entities → addresses → parcels (the ownership graph) |
| OPA Properties | Office of Property Assessment | 584K | Every property in Philadelphia: ownership, building details, market value, zoning, geocoding |
| Assessments | Office of Property Assessment | 6.4M | Year-by-year property tax assessments (2015-2025): market value, taxable amounts, exemptions |
| Business Licenses | Dept. of Licenses & Inspections | 422K | Active and historical business licenses: rental, food, commercial, vacant property |
| Commercial Activity Licenses | Dept. of Licenses & Inspections | 508K | Commercial activity licenses with revenue codes |
| Case Investigations | Dept. of Licenses & Inspections | 1.6M | Code enforcement investigations: violations, inspections, pass/fail outcomes |
| Appeals | Board of L&I Review | 316K | L&I appeals: zoning, use, building code appeals with decisions |
| Demolitions | Dept. of Licenses & Inspections | 13.5K | Demolition permits: city-initiated (taxpayer-funded) vs owner-initiated |

---

## Database Schema

### Entity Relationship Diagram

```
                        ┌─────────────────┐
                        │  master_entity   │
                        │─────────────────│
                        │ PK entity_id     │
                        │    name_text     │
                        └────────┬────────┘
                                 │
                                 │ 1:N
                                 ▼
                   ┌──────────────────────────┐
                   │  master_entity_address    │
                   │──────────────────────────│
                   │ PK entity_address_id      │
                   │ FK entity_id              │──── entity resolution
                   │ FK address_id             │     graph (15.5M links)
                   │    parcel_number ─────────│──┐
                   └──────────┬───────────────┘  │
                              │                  │
                              │ N:1              │
                              ▼                  │
                   ┌─────────────────┐           │
                   │ master_address   │           │
                   │─────────────────│           │
                   │ PK address_id    │           │
                   │    address_text  │           │
                   └─────────────────┘           │
                                                 │
                    ┌────────────────────────────┘
                    │ parcel_number (join key across all tables below)
                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         opa_properties                                   │
│──────────────────────────────────────────────────────────────────────────│
│ PK parcel_number                                                         │
│    owner_1, owner_2           ← current owner(s)                        │
│    address_std, location      ← property address                        │
│    market_value               ← current assessed value                  │
│    category_code_description  ← SINGLE FAMILY, MULTI FAMILY, VACANT..  │
│    building_code_description  ← ROW HOME, SEMI-DETACHED, MIXED USE..   │
│    year_built, total_livable_area, number_stories                       │
│    zip_code, census_tract, zoning                                       │
│    sale_date, sale_price      ← last sale                               │
│    homestead_exemption        ← 0 = not owner-occupied                  │
│    geocode_lat, geocode_lon   ← coordinates                             │
│    mailing_address_1/2, mailing_street, mailing_zip                    │
│    ... (~88 total columns)                                               │
└──────┬───────────┬──────────────┬──────────────┬──────────────┬─────────┘
       │           │              │              │              │
       ▼           ▼              ▼              ▼              ▼
┌────────────┐ ┌──────────┐ ┌──────────────┐ ┌────────┐ ┌─────────────┐
│ assessments│ │ business │ │    case       │ │appeals │ │ demolitions  │
│            │ │_licenses │ │_investigations│ │        │ │             │
│────────────│ │──────────│ │──────────────│ │────────│ │─────────────│
│PK parcel,  │ │PK license│ │PK objectid   │ │PK appeal│ │PK objectid │
│   year     │ │   num    │ │   casenumber │ │  number │ │ case/permit│
│ market_val │ │ type     │ │   casetype   │ │ type    │ │ applicant  │
│ taxable_*  │ │ business │ │   priority   │ │ status  │ │ city_demo  │
│ exempt_*   │ │ status   │ │   status     │ │ decision│ │ contractor │
│            │ │ rental   │ │   opa_owner  │ │ grounds │ │ status     │
│ 6.4M rows  │ │ owner    │ │              │ │ primary │ │ type_work  │
│            │ │          │ │  1.6M rows   │ │appellant│ │            │
│            │ │ 422K rows│ │              │ │         │ │ 13.5K rows │
│            │ │          │ │              │ │316K rows│ │            │
└────────────┘ └──────────┘ └──────────────┘ └────────┘ └─────────────┘
                    │
                    │ company name match
                    ▼
          ┌───────────────────────┐
          │ commercial_activity   │
          │ _licenses             │
          │───────────────────────│
          │ PK licensenum         │
          │    companyname        │
          │    revenuecode        │
          │    508K rows          │
          └───────────────────────┘
```

**Key relationships:**
- `parcel_number` / `opa_account_num` is the universal join key linking properties to violations, licenses, assessments, appeals, and demolitions
- The entity resolution graph (`master_entity` → `master_entity_address` → `opa_properties`) links name variants to properties — e.g., "GEENA LLC", "GEENA L.L.C.", and "GEENA" all resolve to the same entity
- `commercial_activity_licenses` links to `business_licenses` via company name matching (no direct foreign key)

### Tables

#### Entity Resolution Tables

**master_entity** (2.8M rows)
| Column | Type | Description |
|--------|------|-------------|
| `master_entity_id` | UNIQUEIDENTIFIER PK | Deduplicated entity identifier |
| `name_text` | NVARCHAR(400) | Canonical entity name |

**master_address** (987K rows)
| Column | Type | Description |
|--------|------|-------------|
| `master_address_id` | UNIQUEIDENTIFIER PK | Deduplicated address identifier |
| `address_text` | NVARCHAR(400) | Canonical address text |

**master_entity_address** (15.5M rows)
| Column | Type | Description |
|--------|------|-------------|
| `master_entity_address_id` | UNIQUEIDENTIFIER PK | Link record identifier |
| `master_entity_id` | UNIQUEIDENTIFIER FK | Links to master_entity |
| `master_address_id` | UNIQUEIDENTIFIER FK | Links to master_address |
| `parcel_number` | VARCHAR(20) | OPA parcel number (join key to property tables) |
| `notes` | NVARCHAR(2000) | Source/context of the link |

#### Property Tables

**opa_properties** (584K rows) — ~88 columns, key fields:
| Column | Type | Description |
|--------|------|-------------|
| `parcel_number` | VARCHAR(20) PK | OPA parcel number |
| `owner_1`, `owner_2` | NVARCHAR(200) | Current property owner(s) |
| `address_std` | NVARCHAR(200) | Standardized property address |
| `market_value` | DECIMAL(18,2) | Current assessed market value |
| `category_code_description` | NVARCHAR(50) | SINGLE FAMILY, MULTI FAMILY, VACANT LAND, MIXED USE, etc. |
| `zoning` | VARCHAR(20) | Zoning classification (RSA5, CMX2, RM1, etc.) |
| `zip_code` | VARCHAR(20) | Postal code |
| `census_tract` | VARCHAR(20) | Census tract identifier |
| `homestead_exemption` | INT | 0 = not owner-occupied |
| `sale_date` | DATETIME2 | Date of last sale |
| `sale_price` | DECIMAL(18,2) | Last sale price |
| `year_built` | VARCHAR(10) | Construction year |
| `total_livable_area` | FLOAT | Livable square footage |
| `geocode_lat`, `geocode_lon` | FLOAT | Geographic coordinates |
| `mailing_address_1`, `mailing_street`, `mailing_zip` | NVARCHAR | Owner mailing address |

**assessments** (6.4M rows)
| Column | Type | Description |
|--------|------|-------------|
| `parcel_number` | VARCHAR(20) PK (composite) | OPA parcel number |
| `year` | INT PK (composite) | Assessment year (2015-2025) |
| `market_value` | DECIMAL(18,2) | Assessed market value |
| `taxable_building` | DECIMAL(18,2) | Taxable building value |
| `taxable_land` | DECIMAL(18,2) | Taxable land value |
| `exempt_building` | DECIMAL(18,2) | Exempt building value |
| `exempt_land` | DECIMAL(18,2) | Exempt land value |

#### License Tables

**business_licenses** (422K rows)
| Column | Type | Description |
|--------|------|-------------|
| `licensenum` | VARCHAR(20) PK | License number |
| `licensetype` | NVARCHAR(100) | Rental, Food, Commercial, Vacant, etc. |
| `licensestatus` | VARCHAR(20) | Active, Inactive, Expired |
| `business_name` | NVARCHAR(300) | Business name |
| `legalname` | NVARCHAR(300) | Legal entity name |
| `opa_account_num` | VARCHAR(20) | Links to opa_properties |
| `opa_owner` | NVARCHAR(200) | Property owner at time of license |
| `rentalcategory` | NVARCHAR(50) | Residential Dwellings, Shared Housing, etc. |
| `numberofunits` | INT | Number of rental units |
| `owneroccupied` | VARCHAR(10) | Yes/No |
| `zip` | VARCHAR(20) | Zip code |

**commercial_activity_licenses** (508K rows)
| Column | Type | Description |
|--------|------|-------------|
| `licensenum` | VARCHAR(20) PK | License number |
| `companyname` | NVARCHAR(300) | Company name |
| `licensetype` | NVARCHAR(50) | Activity, etc. |
| `revenuecode` | VARCHAR(10) | Revenue classification code |
| `licensestatus` | VARCHAR(20) | Active, Inactive |

#### Enforcement Tables

**case_investigations** (1.6M rows)
| Column | Type | Description |
|--------|------|-------------|
| `objectid` | INT PK | Record identifier |
| `casenumber` | VARCHAR(30) | L&I case number |
| `casetype` | NVARCHAR(50) | NOTICE OF VIOLATION, COMPLAINT, etc. |
| `casepriority` | VARCHAR(20) | UNSAFE, HAZARDOUS, STANDARD |
| `investigationstatus` | VARCHAR(20) | FAILED, PASSED, CLOSED |
| `investigationcompleted` | DATETIME2 | Date investigation was completed |
| `opa_account_num` | VARCHAR(20) | Links to opa_properties |
| `opa_owner` | NVARCHAR(200) | Property owner at time of investigation |

**appeals** (316K rows)
| Column | Type | Description |
|--------|------|-------------|
| `appealnumber` | VARCHAR(30) PK | Appeal number |
| `appealtype` | NVARCHAR(100) | Zoning, building code, etc. |
| `appealstatus` | VARCHAR(20) | Status |
| `decision` | NVARCHAR(50) | GRANTED, DENIED, WITHDRAWN, etc. |
| `primaryappellant` | NVARCHAR(200) | Who filed the appeal |
| `opa_account_num` | VARCHAR(20) | Links to opa_properties |

**demolitions** (13.5K rows)
| Column | Type | Description |
|--------|------|-------------|
| `objectid` | INT PK | Record identifier |
| `applicanttype` | VARCHAR(50) | OWNER, CITY, etc. |
| `city_demo` | VARCHAR(5) | Y = city-initiated (taxpayer-funded) demolition |
| `typeofwork` | VARCHAR(30) | FULL DEMOLITION, PARTIAL, etc. |
| `status` | VARCHAR(50) | Current status |
| `contractorname` | NVARCHAR(200) | Demolition contractor |
| `opa_account_num` | VARCHAR(20) | Links to opa_properties |

### Views

- **vw_entity_properties** — Joins entity resolution graph to property data. Used for traversing the entity → address → parcel → property chain.
- **vw_property_violation_summary** — Properties with aggregated violation, demolition, and appeal counts. Used for identifying problematic properties.
- **vw_owner_portfolio** — Owners with 5+ properties showing portfolio statistics: property count, total market value, vacancy count, non-owner-occupied count.

### Indexes (28 total)

**Entity resolution:** entity_id, address_id, parcel_number on junction table; name_text on entity; address_text on address

**Property:** owner_1, zip_code, census_tract, category_code on opa_properties; parcel+year on assessments

**Licenses:** opa_account_num, licensetype, zip, business_name on business_licenses; companyname, revenuecode on commercial_activity_licenses

**Enforcement:** opa_account_num, investigationstatus, zip, opa_owner on case_investigations; opa_account_num, opa_owner on appeals; opa_account_num, opa_owner, applicanttype on demolitions

---

## Azure Functions API

All endpoints are HTTP-triggered Azure Functions v4 (Node.js 20). Each function validates inputs, executes parameterized SQL, and returns JSON.

Base URL: `https://philly-profiteering-func.azurewebsites.net/api`
(accessed via APIM: `https://philly-profiteering-apim.azure-api.net/api`)

### Entity & Network Endpoints

#### POST /search-entities
Search for entities (people, LLCs, corporations) by name pattern.

- **Request body:**
  - `name` (string, required) — name or partial name to search
  - `limit` (number, optional, default 50, max 200) — max results
- **Response:**
  - `results[]` — `master_entity_id`, `name_text`, `property_count`
  - `count` — number of results
- **SQL:** LIKE search on `master_entity.name_text` with correlated subquery counting distinct parcels per entity. Ordered by property_count DESC.

#### GET /entities/{entityId}/network
Get the full property network for an entity.

- **Path:** `entityId` (UUID) — master_entity_id from search results
- **Response:**
  - `entity` — `master_entity_id`, `name_text`
  - `property_count` — total linked properties
  - `properties[]` — `parcel_number`, `address_text`, `notes`, `owner_1`, `property_address`, `category_code_description`, `market_value`, `zip_code`, `homestead_exemption`
  - `violation_summary` — `total_violations`, `total_failed`, `total_demolitions`
- **SQL:** Joins entity → junction → address → properties, then aggregates violations/demolitions across all linked parcels.

### Property Detail Endpoints

#### GET /properties/{parcelNumber}
Complete property profile with ownership, building info, latest assessment, active licenses, and enforcement counts.

- **Path:** `parcelNumber` — OPA parcel number (e.g., "405100505")
- **Response:**
  - `property` — full OPA record (~88 fields)
  - `latest_assessment` — most recent year's assessment
  - `counts` — `violation_count`, `failed_count`, `demolition_count`, `appeal_count`, `license_count`
  - `active_licenses[]` — currently active business licenses
- **SQL:** 4 queries: property record, latest assessment, scalar subquery counts, active licenses.

#### GET /properties/{parcelNumber}/violations
Code enforcement case investigations with pagination and filtering.

- **Path:** `parcelNumber` — OPA parcel number
- **Query params:**
  - `status` (optional) — filter by FAILED, PASSED, CLOSED
  - `offset` (optional, default 0) — pagination offset
  - `limit` (optional, default 100, max 500) — results per page
- **Response:**
  - `results[]` — `objectid`, `casenumber`, `casetype`, `casepriority`, `caseresponsibility`, `investigationstatus`, `investigationcompleted`, `address`, `opa_owner`
  - `total` — total matching count
  - `offset`, `limit` — pagination state

#### GET /properties/{parcelNumber}/assessments
Assessment value history by year.

- **Path:** `parcelNumber` — OPA parcel number
- **Response:**
  - `parcel_number`
  - `assessments[]` — `year`, `market_value`, `taxable_building`, `taxable_land`, `exempt_building`, `exempt_land`

#### GET /properties/{parcelNumber}/licenses
Business and commercial activity licenses at a property.

- **Path:** `parcelNumber` — OPA parcel number
- **Response:**
  - `parcel_number`
  - `business_licenses[]` — `licensenum`, `licensetype`, `licensestatus`, `business_name`, `legalname`, `rentalcategory`, `numberofunits`, `owneroccupied`, `initialissuedate`, `expirationdate`, `address`
  - `commercial_activity_licenses[]` — `licensenum`, `companyname`, `licensestatus`, `licensetype`, `revenuecode`, `issuedate`

#### GET /properties/{parcelNumber}/appeals
L&I appeals for a property.

- **Path:** `parcelNumber` — OPA parcel number
- **Response:**
  - `parcel_number`
  - `appeals[]` — `appealnumber`, `appealtype`, `appealstatus`, `decision`, `appealgrounds`, `primaryappellant`, `appellanttype`, `proviso`, `createddate`, `scheduleddate`, `decisiondate`, `completeddate`, `relatedcasefile`, `relatedpermit`, `address`
  - `count`

#### GET /properties/{parcelNumber}/demolitions
Demolition records for a property.

- **Path:** `parcelNumber` — OPA parcel number
- **Response:**
  - `parcel_number`
  - `demolitions[]` — `objectid`, `caseorpermitnumber`, `applicantname`, `applicanttype`, `city_demo`, `typeofwork`, `typeofworkdescription`, `status`, `contractorname`, `start_date`, `completed_date`, `address`, `opa_owner`
  - `count`

### Search & Analytics Endpoints

#### POST /search-businesses
Search business and commercial activity licenses by keyword, type, or zip code.

- **Request body:**
  - `keyword` (string, optional) — business name search (e.g., "CHECK CASHING", "PAWN")
  - `licensetype` (string, optional) — license type filter (e.g., "Rental", "Vacant")
  - `zip` (string, optional) — zip code filter
  - `limit` (number, optional, default 50, max 200) — max results
- **Response:**
  - `business_licenses[]` — `licensenum`, `licensetype`, `licensestatus`, `business_name`, `legalname`, `address`, `opa_account_num`, `opa_owner`, `rentalcategory`, `numberofunits`, `owneroccupied`, `ownercontact1name`, `ownercontact1state`, `zip`, `censustract`
  - `commercial_activity_licenses[]` — `licensenum`, `companyname`, `licensestatus`, `licensetype`, `revenuecode`, `issuedate`, `ownercontact1name`, `ownercontact1state`
  - `business_license_count`, `commercial_activity_count`

#### GET /stats/top-violators
Ranked list of property owners by total code violations.

- **Query params:**
  - `limit` (number, optional, default 25, max 100) — number of results
  - `minProperties` (number, optional, default 5) — minimum property count to qualify
  - `entityType` (string, optional) — "llc" for corporate entities, omit for all
- **Response:**
  - `results[]` — `owner_1`, `property_count`, `total_market_value`, `vacant_count`, `total_violations`, `total_failed`, `total_demolitions`, `total_appeals`
  - `count`
- **SQL:** CTE-based query aggregating owners → violations → demolitions → appeals. Performance-critical: avoids CROSS APPLY pattern.

#### GET /stats/zip/{zipCode}
Aggregate statistics for a Philadelphia zip code.

- **Path:** `zipCode` — 5-digit zip code (e.g., "19134")
- **Response:**
  - `zip_code`
  - `property_stats` — `total_properties`, `vacant_properties`, `single_family`, `multi_family`, `commercial`, `avg_market_value`, `total_market_value`, `non_owner_occupied`
  - `violation_stats` — `total_investigations`, `failed_investigations`, `passed_investigations`
  - `demolition_stats` — `total_demolitions`, `city_initiated_demolitions`
  - `license_stats` — `total_licenses`, `rental_licenses`, `vacant_licenses`
  - `top_owners[]` — top 10 owners by property count in this zip

### Advanced Endpoint

#### POST /query
Execute a custom read-only SQL query.

- **Request body:**
  - `sql` (string, required) — SELECT statement with TOP(n) or OFFSET/FETCH
  - `params` (object, optional) — named parameters for parameterized queries
- **Response:**
  - `results[]` — query result rows
  - `count` — number of rows
- **Safety constraints:**
  - Only SELECT statements allowed
  - Blocked keywords: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, EXEC, EXECUTE, XP_, SP_
  - Must include TOP(n) or OFFSET/FETCH (max 1000 rows)
- **Available tables:** master_entity, master_address, master_entity_address, opa_properties, assessments, business_licenses, commercial_activity_licenses, case_investigations, appeals, demolitions
- **Available views:** vw_entity_properties, vw_property_violation_summary, vw_owner_portfolio

---

## MCP Server

The MCP server is a local TypeScript process that bridges AI agents to the APIM-backed API.

### Transport
- **stdio** (default) — JSON-RPC over stdin/stdout, for Claude Code and Claude Desktop
- **Streamable HTTP** (`MCP_TRANSPORT=http`) — JSON-RPC over HTTP with SSE responses, session-based via `mcp-session-id` header. Deployed on Azure Container Apps for Azure AI Foundry, Copilot Studio, and any remote MCP client.
  - Health probe: `GET /healthz`
  - MCP endpoint: `POST /mcp` (requests), `GET /mcp` (SSE stream), `DELETE /mcp` (session cleanup)

### Tools (12)

Each tool maps 1:1 to an Azure Function endpoint:

- **search_entities** — Search entities by name → POST /search-entities
- **get_entity_network** — Entity property network → GET /entities/{id}/network
- **get_property_profile** — Full property details → GET /properties/{parcel}
- **get_property_violations** — Code violations (paginated) → GET /properties/{parcel}/violations
- **get_property_assessments** — Assessment history → GET /properties/{parcel}/assessments
- **get_property_licenses** — Business licenses → GET /properties/{parcel}/licenses
- **get_property_appeals** — L&I appeals → GET /properties/{parcel}/appeals
- **get_property_demolitions** — Demolition records → GET /properties/{parcel}/demolitions
- **search_businesses** — Business license search → POST /search-businesses
- **get_top_violators** — Top violators ranking → GET /stats/top-violators
- **get_area_stats** — Zip code statistics → GET /stats/zip/{zip}
- **run_query** — Custom SQL query → POST /query

### Configuration

Environment variables:
- `APIM_BASE_URL` — APIM gateway URL (e.g., `https://philly-profiteering-apim.azure-api.net/api`)
- `APIM_SUBSCRIPTION_KEY` — APIM subscription key

Fallback variables (for direct Function App access, bypassing APIM):
- `FUNCTION_BASE_URL` — Function App URL (e.g., `https://philly-profiteering-func.azurewebsites.net/api`)
- `FUNCTION_KEY` — Azure Function host key

---

## Azure Infrastructure

### Resource Inventory

| Resource | Name | SKU | Region | Purpose |
|----------|------|-----|--------|---------|
| Resource Group | `rg-philly-profiteering` | — | East US 2 | Container for all resources |
| SQL Server | `philly-stats-sql-01` | — | East US 2 | Logical SQL server (AAD-only auth) |
| SQL Database | `phillystats` | GP_S_Gen5_2 | East US 2 | Data store (Serverless, auto-pause) |
| Function App | `philly-profiteering-func` | FC1 | East US 2 | API compute (Flex Consumption) |
| App Service Plan | `philly-func-flex-plan` | FC1 | East US 2 | Flex Consumption plan for Functions |
| APIM | `philly-profiteering-apim` | Consumption | East US 2 | API gateway, auth, rate limiting |
| Storage | `phillyprofiteersa` | Standard_LRS | East US | CSV data storage |
| Storage | `phillyfuncsa` | Standard_LRS | East US 2 | Function App deployment storage |
| Container Registry | `phillymcpacr` | Basic | East US 2 | Docker images for MCP server |
| Container App Env | `philly-mcp-env` | Consumption | East US 2 | Container Apps environment |
| Container App | `philly-mcp-server` | Consumption (0-3) | East US 2 | Remote MCP server (Streamable HTTP) |
| App Insights | `philly-profiteering-func` | — | East US 2 | Function monitoring/logging |

### Cost Model

All compute tiers are serverless/consumption — scale to zero when idle:

| Resource | Idle Cost | Active Cost |
|----------|-----------|-------------|
| SQL Database | $0 (auto-paused) | ~$0.75/vCore-hour when running |
| Function App | $0 | Pay per execution (free tier: 1M/month) |
| APIM | $0 | ~$3.50/million calls (free tier: 1M/month) |
| Storage (x2) | ~$1/mo total | Minimal additional for operations |
| App Insights | $0 | Free tier covers low volume |
| Container Registry | ~$0.17/mo | Storage only (Basic tier) |
| Container App | $0 | Pay per use (free grant: 180K vCPU-s/mo) |
| **Total idle** | **~$1-2/month** | |

No resources require manual start/stop. The SQL database auto-pauses after 60 minutes of inactivity and auto-resumes on first query (wake-up takes 30-60 seconds).

### Security

- **SQL:** Azure AD-only authentication. No SQL passwords. Function App uses system-assigned managed identity with `db_datareader` role.
- **Functions:** Protected by function-level key. Key is injected by APIM inbound policy — never exposed to end clients.
- **APIM:** Requires `Ocp-Apim-Subscription-Key` header on every request. Subscription key is per-product.
- **Secrets management:** Keys stored in gitignored config files (`.mcp.json`, `infra/apim-policy.json`). Committed `.example` templates have placeholders.

---

## Deployment

### Functions Deployment

Due to npm workspace hoisting, the Function App cannot be deployed directly from the `functions/` directory (node_modules contains symlinks, not real packages). A staging directory pattern is required:

```bash
# 1. Build
npm run build -w functions

# 2. Create staging directory outside workspace
mkdir /tmp/func-staging
cp -r functions/dist functions/host.json functions/package.json \
      functions/package-lock.json /tmp/func-staging/

# 3. Remove workspace self-reference from package.json
#    (delete "philly-functions": "file:" and fix trailing comma)

# 4. Install production dependencies
cd /tmp/func-staging
npm install --omit=dev

# 5. Deploy
func azure functionapp publish philly-profiteering-func --javascript
```

### Infrastructure Provisioning

All Azure resources are created via `infra/deploy.sh` using `az` CLI. The script is idempotent.

APIM policy (injecting function key) is applied via `infra/set-policy.ps1`:
```powershell
./infra/set-policy.ps1 -FunctionKey <key> -SubscriptionId <sub-id>
```

---

## Performance Considerations

- **SQL Serverless wake-up:** First query after 60min idle takes 30-60s. `requestTimeout` is set to 120s in `db.ts` to accommodate this.
- **getTopViolators query:** Uses CTE-based approach (aggregate owners first, then join violations/demolitions/appeals). The naive CROSS APPLY approach timed out on 584K properties × 1.6M investigations.
- **searchEntities query:** Uses correlated subquery for property count instead of LEFT JOIN + GROUP BY on 2.8M entities × 15.5M junction rows.
- **Connection pooling:** Max 10 connections, 30s idle timeout. Shared across all function invocations within an instance.
- **runQuery safety:** Requires TOP(n) or OFFSET/FETCH to prevent unbounded result sets. Max 1000 rows.
