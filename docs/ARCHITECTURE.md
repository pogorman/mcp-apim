# Architecture & Technical Reference

## Table of Contents

- [Executive Summary](#executive-summary)
- [System Architecture](#system-architecture)
- [Data Sources](#data-sources)
- [Database Schema](#database-schema)
- [Azure Functions API](#azure-functions-api)
- [MCP Server](#mcp-server)
- [Container App Deep Dive](#container-app-deep-dive)
- [Agent Behavior: How the LLM Decides What to Do](#agent-behavior-how-the-llm-decides-what-to-do)
- [Azure Infrastructure](#azure-infrastructure)
- [Deployment](#deployment)
- [Performance Considerations](#performance-considerations)
- [Web Interface (Static Web App)](#web-interface-static-web-app)

---

## Executive Summary

This system enables AI agents to investigate poverty profiteering patterns in Philadelphia by querying 11 public datasets (~34 million rows, ~4.4GB) through a standardized API. It connects property ownership networks, code violations, demolitions, business licenses, and tax assessments to surface exploitative LLCs and property owners.

The architecture follows a four-tier pattern: an **MCP Server** translates AI tool calls into HTTPS requests to **Azure API Management**, which authenticates and routes them to **Azure Functions**, which query an **Azure SQL Database**. All compute tiers are serverless/consumption-based, costing ~$1-2/month when idle.

The MCP server supports dual transport: **stdio** (local, for Claude Code/Desktop) and **Streamable HTTP** (remote, deployed on Azure Container Apps for Azure AI Foundry, Copilot Studio, and other remote MCP clients). A **chat endpoint** (`/chat`) powered by Azure OpenAI (6 selectable models) with tool calling enables natural language interaction via a web SPA. An **agent endpoint** (`/agent`) uses the Assistants API with GPT-4.1 for stateful, thread-based conversations. A **Copilot Studio** agent connects via MCP for a low-code integration path. The LLM autonomously selects and invokes tools to answer user questions across all patterns.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                   │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │ Claude Code   │  │ Claude Desktop│  │ Copilot Studio│  │ Web SPA      │  │
│  └──────┬───────┘  └───────┬───────┘  └───────┬───────┘  └──────┬───────┘  │
│         │ stdio            │ stdio             │ HTTP            │ HTTPS     │
└─────────┼──────────────────┼───────────────────┼────────────────┼───────────┘
          │                  │                   │                │
          ▼                  ▼                   │                │
┌─────────────────────────────────────┐          │                │
│        MCP Server (local)           │          │                │
│  TypeScript, stdio transport        │          │                │
│  14 tools → HTTP calls              │          │                │
│  Adds Ocp-Apim-Subscription-Key    │          │                │
└──────────────┬──────────────────────┘          │                │
               │                                 │                │
               │          ┌──────────────────────┘                │
               │          │    ┌───────────────────────────────────┘
               │          │    │
               │          ▼    ▼
               │  ┌────────────────────────────────────────────────────────┐
               │  │     Container App (philly-mcp-server, scale 0-3)      │
               │  │                                                        │
               │  │  POST /chat     — Chat Completions + tool calling      │
               │  │  POST /agent/*  — Assistants API (GPT-4.1, threads)    │
               │  │  POST /mcp      — MCP protocol (Streamable HTTP)       │
               │  │  GET  /models   — Available model list                 │
               │  │  GET  /healthz  — Health probe                         │
               │  └──────────┬──────────────────────┬──────────────────────┘
               │             │                      │
               │             │ Tool calls            │ LLM inference
               │             │ (HTTPS + sub key)     │ (Azure AD token)
               ▼             ▼                      ▼
┌────────────────────────────────────────┐  ┌────────────────────────────────┐
│  Azure API Management (Consumption)    │  │ Azure OpenAI (AI Services)     │
│  philly-profiteering-apim              │  │ foundry-og-agents (eastus)     │
│  Validates subscription key,           │  │ 6 model deployments:           │
│  injects x-functions-key               │  │ GPT-4.1, GPT-5, GPT-5 Mini,   │
│  14 operations (10 GET, 4 POST)         │  │ o4-mini, o3-mini, Phi-4        │
└───────────────────┬────────────────────┘  └────────────────────────────────┘
                    │ HTTPS + x-functions-key
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│           Azure Functions v4 (Flex Consumption FC1)                         │
│  philly-profiteering-func.azurewebsites.net                                │
│  Node.js 20, TypeScript compiled to JS                                     │
│  14 HTTP-triggered functions                                               │
│  System-assigned managed identity for SQL auth                             │
│  VNet-integrated (snet-functions, 10.0.1.0/24)                             │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ TDS (Azure AD token)
                                │ via Private Endpoint (pe-sql-philly)
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│           Azure SQL Database (General Purpose Serverless)                    │
│  philly-stats-sql-01.database.windows.net / phillystats                    │
│  Gen5 2 vCores, 0.5 min capacity, 60-min auto-pause                       │
│  11 tables, 3 views, 28+ indexes                                          │
│  ~34M rows across entity resolution, property, license,                    │
│  enforcement domains                                                        │
│  Public network access: DISABLED (private endpoint only)                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
Local MCP path:
  Client → MCP Server:     stdio (no auth, local process)
  MCP Server → APIM:       Ocp-Apim-Subscription-Key header

Container App paths:
  Web SPA → Container App:       HTTPS (SWA auth gates the SPA; Container App is publicly accessible)
  Copilot Studio → Container App: HTTPS (no auth — see note below)
  Container App → APIM:          Ocp-Apim-Subscription-Key header (stored as Container App secret)
  Container App → Azure OpenAI:  Azure AD token via managed identity ("Cognitive Services OpenAI User" role)

Backend:
  APIM → Functions:    x-functions-key header (injected by APIM policy, invisible to caller)
  Functions → SQL:     Azure AD token via DefaultAzureCredential (managed identity)
```

No passwords or API keys are stored in application code. The Function App's system-assigned managed identity has `db_datareader` role on the SQL database. The Container App's managed identity has the `Cognitive Services OpenAI User` role on the AI Services account (`foundry-og-agents`), enabling keyless Azure OpenAI access via `DefaultAzureCredential` + `getBearerTokenProvider`.

**Copilot Studio auth note:** The Container App's `/mcp` endpoint is currently unauthenticated — Copilot Studio connects directly without an API key or OAuth token. This is acceptable for a demo/POC (the endpoint only exposes read-only data queries), but a production deployment should add authentication (e.g., an API key header validated in Express middleware, or OAuth via Container Apps Easy Auth).

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
| RTT Summary | Dept. of Revenue | 5.05M | Real estate transfer tax records (deeds, sheriff sales, mortgages) |

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

### Transfer Endpoints

#### GET /properties/{parcelNumber}/transfers
Real estate transfer history for a property.

- **Path:** `parcelNumber` — OPA parcel number
- **Response:**
  - `parcel_number`
  - `transfers[]` — transfer tax records (deeds, mortgages, sheriff sales)
  - `count`

#### POST /search-transfers
Search transfers by grantor/grantee name, document type, or amount.

- **Request body:**
  - `keyword` (string, optional) — grantor or grantee name search
  - `documentType` (string, optional) — DEED, MORTGAGE, SHERIFF, etc.
  - `minAmount` (number, optional) — minimum transfer amount
  - `maxAmount` (number, optional) — maximum transfer amount
  - `limit` (number, optional, default 50, max 200) — max results
- **Response:**
  - `results[]` — matching transfer records
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
- **Available tables:** master_entity, master_address, master_entity_address, opa_properties, assessments, business_licenses, commercial_activity_licenses, case_investigations, appeals, demolitions, rtt_summary
- **Available views:** vw_entity_properties, vw_property_violation_summary, vw_owner_portfolio

---

## MCP Server

The MCP server is a local TypeScript process that bridges AI agents to the APIM-backed API.

### Transport
- **stdio** (default) — JSON-RPC over stdin/stdout, for Claude Code and Claude Desktop
- **Streamable HTTP** (`MCP_TRANSPORT=http`) — JSON-RPC over HTTP with SSE responses, session-based via `mcp-session-id` header. Deployed on Azure Container Apps for Azure AI Foundry, Copilot Studio, and any remote MCP client.
  - Health probe: `GET /healthz`
  - MCP endpoint: `POST /mcp` (requests), `GET /mcp` (SSE stream), `DELETE /mcp` (session cleanup)

### Tools (14)

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
- **get_property_transfers** — Real estate transfer history → GET /properties/{parcel}/transfers
- **search_transfers** — Search transfers by grantor/grantee/type/amount → POST /search-transfers

### Configuration

Environment variables:
- `APIM_BASE_URL` — APIM gateway URL (e.g., `https://philly-profiteering-apim.azure-api.net/api`)
- `APIM_SUBSCRIPTION_KEY` — APIM subscription key

Fallback variables (for direct Function App access, bypassing APIM):
- `FUNCTION_BASE_URL` — Function App URL (e.g., `https://philly-profiteering-func.azurewebsites.net/api`)
- `FUNCTION_KEY` — Azure Function host key

---

## Container App Deep Dive

### What's a Container?

A container is an isolated, lightweight runtime environment that packages an application together with everything it needs to run: the code, the Node.js runtime, npm packages, and OS-level libraries. Unlike a virtual machine (which emulates an entire operating system), a container shares the host's OS kernel and only bundles the application layer. This makes containers fast to start (seconds, not minutes), small (our image is ~180MB vs multi-GB for a VM), and perfectly reproducible — the same image runs identically on a developer laptop, in CI/CD, and in production.

### How Our Container Image Is Built

The image is defined by `mcp-server/Dockerfile` using a **multi-stage build**:

```
Stage 1: "builder" (node:20-alpine)          Stage 2: runtime (node:20-alpine)
┌──────────────────────────────────┐         ┌──────────────────────────────────┐
│ COPY package.json                │         │ COPY package.json                │
│ npm install (ALL deps)           │         │ npm install --omit=dev           │
│ COPY tsconfig.json + src/        │         │   (production deps only:         │
│ npx tsc (compile TS → JS)        │         │    express, openai, mcp-sdk,     │
│                                  │──dist──→│    @azure/identity, etc.)        │
│ Contains: TypeScript compiler,   │         │ COPY dist/ from builder stage    │
│   dev dependencies, source code  │         │                                  │
│ (discarded after build)          │         │ ENV MCP_TRANSPORT=http            │
└──────────────────────────────────┘         │ ENV PORT=8080                    │
                                             │ CMD ["node", "dist/index.js"]    │
                                             └──────────────────────────────────┘
```

**Why two stages?** Stage 1 installs everything needed to compile TypeScript. Stage 2 starts fresh with only production npm packages and the compiled JavaScript. This keeps the final image small and excludes build-time tooling (TypeScript compiler, type definitions, dev dependencies) from production.

**Why Alpine?** `node:20-alpine` uses Alpine Linux (~5MB base) instead of Debian (~120MB). Smaller image = faster pulls, less storage, smaller attack surface.

### Azure Container Registry (ACR)

The built image is stored in **Azure Container Registry** (`phillymcpacr.azurecr.io`), a private Docker registry in Azure. We don't build images locally — instead we use `az acr build`, which uploads the Dockerfile and source to ACR and builds the image in the cloud. This means you don't need Docker installed on your machine.

```
Developer machine                          Azure Container Registry
┌─────────────────┐    az acr build       ┌─────────────────────────┐
│ mcp-server/      │──────────────────────→│ phillymcpacr.azurecr.io │
│   Dockerfile     │   (uploads context,   │                         │
│   package.json   │    builds in cloud)   │ mcp-server:latest       │
│   src/           │                       │ sha256:af035801...       │
└─────────────────┘                       └────────────┬────────────┘
                                                       │ image pull
                                                       ▼
                                          ┌─────────────────────────┐
                                          │ Container App            │
                                          │ philly-mcp-server        │
                                          └─────────────────────────┘
```

### Azure Container Apps

**Container Apps** is a serverless container hosting service. You give it a container image and it runs it, handling all the infrastructure: load balancing, HTTPS certificates, DNS, scaling, and health monitoring. You never SSH into a VM or configure Nginx.

Key characteristics of our deployment:

| Setting | Value | Why |
|---------|-------|-----|
| Plan | Consumption | Pay-per-use, scales to zero — $0 when idle |
| Min replicas | 0 | Container shuts down completely when no requests arrive |
| Max replicas | 3 | Scales up under load; each replica is an independent instance |
| Target port | 8080 | Express listens on 8080 inside the container |
| Ingress | External | Publicly accessible HTTPS URL with auto-provisioned TLS cert |
| Scale rule | HTTP concurrent requests | New replicas spawn when request concurrency exceeds threshold |

**Scaling behavior:**
```
No traffic (idle)     First request           Sustained load          Traffic drops
┌──────────────┐     ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  0 replicas   │────→│  1 replica    │──────→│  2-3 replicas │──────→│  1 → 0       │
│  $0 cost      │     │  cold start   │       │  auto-scaled  │       │  scale down  │
│               │     │  ~5-10s       │       │               │       │               │
└──────────────┘     └──────────────┘       └──────────────┘       └──────────────┘
```

**Cold start:** When the container scales from 0 to 1, there's a ~5-10 second delay while Azure pulls the image and starts the Node.js process. On top of this, if the SQL database is also auto-paused, the first actual data query adds another 30-60 seconds of wake-up time. Subsequent requests are fast (milliseconds for the container, normal query time for SQL).

### What Runs Inside the Container

The container runs a single Node.js process executing `dist/index.js` with `MCP_TRANSPORT=http`. This starts an Express server exposing three endpoint groups:

| Endpoint | Purpose | Who calls it |
|----------|---------|-------------|
| `GET /healthz` | Health probe — Container Apps pings this to verify the container is alive | Azure (automatic) |
| `POST/GET/DELETE /mcp` | MCP protocol (Streamable HTTP) — tool discovery and invocation | MCP clients (Foundry, Copilot Studio, etc.) |
| `POST /chat` | Natural language chat — 6 selectable models with tool calling (Chat Completions) | Web SPA (Investigative Agent), curl, any HTTP client |
| `POST /agent/thread` | Create a new Assistants API thread | Web SPA (Foundry Portal) |
| `POST /agent/message` | Send message to thread — GPT-4.1 Assistants API with tool calling | Web SPA (Foundry Portal) |
| `GET /models` | List available model deployments | Web SPA (model selector dropdown) |

### Environment & Secrets

Environment variables are injected by Container Apps at runtime (not baked into the image):

| Variable | Source | Purpose |
|----------|--------|---------|
| `MCP_TRANSPORT` | Set in Dockerfile | Selects HTTP mode (vs stdio) |
| `PORT` | Set in Dockerfile | Express listen port |
| `APIM_BASE_URL` | Container App env var | Where to send tool API calls |
| `APIM_SUBSCRIPTION_KEY` | Container App secret (encrypted) | Auth for APIM gateway |
| `AZURE_OPENAI_ENDPOINT` | Container App env var | Azure OpenAI endpoint for /chat |
| `AZURE_OPENAI_DEPLOYMENT` | Container App env var | Default model deployment name (gpt-4.1 for /chat) |

Secrets (like the APIM subscription key) are stored encrypted in Container Apps and exposed as environment variables at runtime. They never appear in the container image or in logs.

### Managed Identity

The Container App has a **system-assigned managed identity** — an Azure AD identity automatically created and tied to this specific resource. This identity (principal ID `11b19c22-85cc-4230-afa2-7979813c5571`) has been granted the "Cognitive Services OpenAI User" role on the AI Services account. When the Node.js code calls `new DefaultAzureCredential()`, the Azure SDK automatically detects it's running inside a Container App and obtains Azure AD tokens using this managed identity. No API keys or passwords needed.

---

## Agent Behavior: How the LLM Decides What to Do

### The Tool-Calling Loop

When a user sends a message to the `/chat` endpoint, the system doesn't just pass it to GPT-4.1 and return whatever text comes back. Instead, it runs an **agentic loop** where the LLM can iteratively call tools and reason about the results.

Here's what happens for every message:

```
User: "Tell me about GEENA LLC"
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  1. Build message array:                                 │
│     [system prompt] + [conversation history] + [user msg]│
│                                                          │
│  2. Send to GPT-4.1 with 14 tool definitions             │
│     GPT-4.1 sees: "I have these tools available..."      │
│                                                          │
│  3. GPT-4.1 responds with either:                        │
│     (a) A text response (done — return to user)          │
│     (b) One or more tool_calls (continue loop)           │
└─────────────────────────────────────────────────────────┘
         │
         │ GPT-4.1 chose: tool_calls
         │   → search_entities({name: "GEENA LLC"})
         ▼
┌─────────────────────────────────────────────────────────┐
│  4. Execute each tool call against APIM → Functions → SQL│
│     Result: [{entity_id: "abc-123", property_count: 330}]│
│                                                          │
│  5. Append tool results to message array                 │
│                                                          │
│  6. Send ENTIRE conversation back to GPT-4.1             │
│     (system + history + user msg + tool call + result)   │
└─────────────────────────────────────────────────────────┘
         │
         │ GPT-4.1 chose: another tool_call
         │   → get_entity_network({entityId: "abc-123"})
         ▼
┌─────────────────────────────────────────────────────────┐
│  7. Execute tool, get full property network              │
│     Result: 631 properties, 8426 failed violations, etc. │
│                                                          │
│  8. Send everything back to GPT-4.1 again                │
│                                                          │
│  9. GPT-4.1 now has enough data — responds with text     │
│     "GEENA LLC is linked to 330 properties with..."      │
└─────────────────────────────────────────────────────────┘
         │
         ▼
    Return to user: {reply: "GEENA LLC is linked to...", toolCalls: [...]}
```

The loop runs up to **10 rounds**. In practice, most questions need 1-3 tool calls. Complex investigative questions ("compare two zip codes and identify the worst LLC in each") might need 5-6.

### When Does the LLM Use Tools vs. Respond Directly?

GPT-4.1 makes this decision autonomously based on the system prompt and the user's question. The tool definitions include descriptions that help the LLM understand when each tool is relevant.

**LLM responds directly (no tools) when:**
- The question is about general knowledge: "What is poverty profiteering?"
- The question can be answered from prior tool results already in the conversation: "Can you summarize that in a table?"
- The user asks for clarification or formatting: "Show that as bullet points"
- The question is conversational: "Thanks, that's helpful"

**LLM calls one tool when:**
- The question maps directly to a single tool: "Who are the top 10 violators?" → `get_top_violators`
- A specific entity or property is asked about with a known identifier: "What violations does parcel 405100505 have?" → `get_property_violations`

**LLM chains multiple tools when:**
- It needs to resolve a name to an ID first: "Tell me about GEENA LLC" → `search_entities` (get entity ID) → `get_entity_network` (get property details)
- The question requires data from multiple sources: "What's happening at 2837 Kensington Ave?" → `run_query` (find parcel by address) → `get_property_profile` → `get_property_violations` → `get_property_demolitions`
- Comparison questions: "Compare zip codes 19134 and 19140" → `get_area_stats(19134)` → `get_area_stats(19140)`
- The first tool call reveals something interesting that warrants deeper investigation

**LLM uses `run_query` (custom SQL) when:**
- The question can't be answered by any of the 13 specific tools: "How many properties were built before 1900 and have more than 5 violations?"
- The user asks for a specific aggregation or join that no tool covers
- The LLM constructs a SQL query itself, including TOP(n), proper table names, and WHERE clauses

### What the LLM Sees

The system prompt tells GPT-4.1:
- It's an investigative analyst specializing in Philadelphia property data
- It should cite specific data (parcel numbers, violation counts, addresses)
- It should call multiple tools when needed to build a complete picture
- The scale of data available (584K properties, 2.8M entities, 1.6M violations, etc.)

Each of the 14 tools has a `description` and `parameters` schema. GPT-4.1 reads these descriptions to decide which tool to call and what arguments to pass. For example, seeing the description "Search for entities (people, LLCs, corporations) by name" tells it to use `search_entities` when the user mentions a company or person name.

### Example: Multi-Step Investigation

User asks: **"Deep dive on 2837 Kensington Ave — who owns it, what violations, any demolitions?"**

The agent typically chains 4-5 tool calls:

| Round | Tool Called | Why | Result |
|-------|-----------|-----|--------|
| 1 | `run_query` | No tool finds properties by address, so it writes SQL: `SELECT TOP(1) parcel_number, owner_1 FROM opa_properties WHERE address_std LIKE '%2837%KENSINGTON%'` | parcel: 871533290, owner: A KENSINGTON JOINT LLC |
| 2 | `get_property_profile` | Get full property details | Market value, building info, license/violation counts |
| 3 | `get_property_violations` | Get violation detail | 20 violations, 14 failed, UNSAFE priority |
| 4 | `get_property_demolitions` | Check for demolitions | 1 demolition record |
| 5 | `search_entities` | Look up the owner LLC | A KENSINGTON JOINT LLC → 2 properties |

Then GPT-4.1 synthesizes all results into a narrative response with specific data points.

---

## Azure Infrastructure

### Resource Inventory

Resources are split across two resource groups.

#### `rg-philly-profiteering` (East US 2) — Data + API + Compute

Everything in the core data pipeline lives here. This is the purpose-built resource group for this project.

| Resource | Name | SKU | Purpose |
|----------|------|-----|---------|
| SQL Server | `philly-stats-sql-01` | — | Logical SQL server (AAD-only auth) |
| SQL Database | `phillystats` | GP_S_Gen5_2 | Data store (Serverless, auto-pause) |
| Function App | `philly-profiteering-func` | FC1 | API compute (Flex Consumption) |
| App Service Plan | `philly-func-flex-plan` | FC1 | Flex Consumption plan for Functions |
| APIM | `philly-profiteering-apim` | Consumption | API gateway, auth, rate limiting |
| Storage | `phillyprofiteersa` | Standard_LRS | CSV data storage (East US) |
| Storage | `phillyfuncsa` | Standard_LRS | Function App deployment storage |
| Container Registry | `phillymcpacr` | Basic | Docker images for MCP server |
| Container App Env | `philly-mcp-env` | Consumption | Container Apps environment |
| Container App | `philly-mcp-server` | Consumption (0-3) | Remote MCP server (Streamable HTTP) |
| VNet | `vnet-philly-profiteering` | — | Network isolation (10.0.0.0/16) |
| Private Endpoint | `pe-sql-philly` | — | SQL Server private connectivity |
| Private Endpoint | `pe-blob-philly` | — | Storage blob private connectivity |
| Private Endpoint | `pe-table-philly` | — | Storage table private connectivity |
| Private Endpoint | `pe-queue-philly` | — | Storage queue private connectivity |
| Private DNS Zone | `privatelink.database.windows.net` | — | SQL private DNS resolution |
| Private DNS Zone | `privatelink.blob.core.windows.net` | — | Storage blob private DNS resolution |
| Private DNS Zone | `privatelink.table.core.windows.net` | — | Storage table private DNS resolution |
| Private DNS Zone | `privatelink.queue.core.windows.net` | — | Storage queue private DNS resolution |
| App Insights | `philly-profiteering-func` | — | Function monitoring/logging |
| Static Web App | `philly-profiteering-spa` | Free | Chat SPA interface |

#### `rg-foundry` — AI Services + Foundry

This is a shared resource group that existed before this project (originally created for other AI/Foundry work). Our project uses some of these resources but not all.

| Resource | Name | SKU | Region | Used by This Project? |
|----------|------|-----|--------|----------------------|
| AI Services | `foundry-og-agents` | S0 | East US | **Yes** — hosts all 6 model deployments (gpt-4.1, gpt-5, gpt-5-mini, o4-mini, o3-mini, Phi-4). The Container App's managed identity has "Cognitive Services OpenAI User" role on this account. |
| AI Foundry Hub | `philly-ai-hub` | — | East US | **Yes** — AI project management hub |
| AI Foundry Project | `philly-profiteering` | — | East US | **Yes** — agent project under hub |
| Storage | `phillyaistorage417a39638` | — | East US | **Yes** — auto-provisioned by AI Foundry Hub for project artifacts |
| Key Vault | `phillyaikeyvault6700cd78` | — | East US | **Yes** — auto-provisioned by AI Foundry Hub for secrets |
| AI Services | `og-foundry-eus2` | S0 | East US 2 | **No** — separate AI Services account with unrelated deployments (sora, gpt-5-pro, gpt-image-1, gpt-5.2). Not used by this project. |
| AI Services Project | `foundry-og-agents/foundry-deployments` | — | East US | **No** — Foundry project on the other AI Services account. Not used by this project. |
| AI Services Project | `og-foundry-eus2/claude-foundry` | — | East US 2 | **No** — Foundry project on the EUS2 account. Not used by this project. |

**Cleanup candidates** in `rg-foundry`: The three resources marked "No" (`og-foundry-eus2`, `foundry-deployments` project, `claude-foundry` project) are not used by this project. If they aren't used by anything else, they can be deleted. The `og-foundry-eus2` account has paid deployments (gpt-5-pro uses GlobalProvisionedManaged which bills per-hour if provisioned) — worth checking if those are still needed.

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
| Private Endpoints (x4) | ~$29/mo | $7.20/endpoint/month |
| Private DNS Zones (x4) | ~$2/mo | $0.50/zone/month |
| Static Web App | $0 | Free tier |
| **Total idle** | **~$33/month** | |

No resources require manual start/stop. The SQL database auto-pauses after 60 minutes of inactivity and auto-resumes on first query (wake-up takes 30-60 seconds).

### Security

- **SQL:** Azure AD-only authentication. No SQL passwords. Function App uses system-assigned managed identity with `db_datareader` role.
- **Functions:** Protected by function-level key. Key is injected by APIM inbound policy — never exposed to end clients.
- **APIM:** Requires `Ocp-Apim-Subscription-Key` header on every request. Subscription key is per-product.
- **Secrets management:** Keys stored in gitignored config files (`.mcp.json`, `infra/apim-policy.json`). Committed `.example` templates have placeholders.

### Network Isolation (VNet + Private Endpoints)

The Function App communicates with SQL and Storage entirely over private endpoints — public network access is disabled on both. This prevents Azure security policies (MCAPS) from breaking the data path by toggling public access settings.

```
┌──────────────────────────────────────────────────────────────────────┐
│  VNet: vnet-philly-profiteering (10.0.0.0/16, East US 2)            │
│                                                                      │
│  ┌─────────────────────────────────┐                                 │
│  │ snet-functions (10.0.1.0/24)    │  ← Function App VNet integration│
│  │ Delegated: Microsoft.Web/       │                                 │
│  │            serverFarms          │                                 │
│  └────────────┬────────────────────┘                                 │
│               │                                                      │
│               │ Private DNS resolution                               │
│               ▼                                                      │
│  ┌─────────────────────────────────┐                                 │
│  │ snet-private-endpoints          │                                 │
│  │ (10.0.2.0/24)                   │                                 │
│  │                                 │                                 │
│  │  pe-sql-philly ──────→ SQL Server (privatelink.database...)       │
│  │  pe-blob-philly ─────→ Storage blob (privatelink.blob...)         │
│  │  pe-table-philly ────→ Storage table (privatelink.table...)       │
│  │  pe-queue-philly ────→ Storage queue (privatelink.queue...)       │
│  └─────────────────────────────────┘                                 │
└──────────────────────────────────────────────────────────────────────┘
```

**Key points:**
- **Function App** has VNet integration into `snet-functions` with `vnetRouteAllEnabled` — all outbound traffic routes through the VNet
- **SQL Server** has `publicNetworkAccess: Disabled` — only accessible via the `pe-sql-philly` private endpoint
- **Storage (phillyfuncsa)** has `publicNetworkAccess: Disabled` — Function App accesses deployment packages and runtime storage via private endpoints (blob, table, queue)
- **Storage (phillyprofiteersa)** remains public — CSV data storage, not accessed at runtime
- **Container Apps** are NOT in the VNet — they don't access SQL/Storage directly (they go through APIM, which is public)
- **APIM Consumption** doesn't support VNet — remains the public front door, which is by design
- **Private DNS Zones** linked to the VNet ensure the Function App resolves `*.database.windows.net` and `*.blob.core.windows.net` to private IPs
- **Bicep IaC** in `infra/modules/networking.bicep` manages the entire VNet + private endpoint stack

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

### Static Web App Deployment

The SPA includes a documentation panel that reads markdown and notebook files. These live in `docs/` and `jupyter-notebooks/` (not in `web/`), so a deploy script copies them before deploying:

```bash
bash infra/deploy-swa.sh
```

This script:
1. Copies `docs/*.md` and `README.md` → `web/docs/`
2. Copies `jupyter-notebooks/*.ipynb` → `web/notebooks/`
3. Copies `images/*` → `web/images/`
4. Runs `npx swa deploy web --app-name philly-profiteering-spa --env production`
5. Cleans up the copied files (they're in `.gitignore`)

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

---

## Web Interface (Static Web App)

A single-file SPA (`web/index.html`) with a VS Code-style activity bar demonstrating nine panels (multiple AI-powered client patterns + slide deck + documentation reader + tool tester) that all consume the same APIM backend. Protected by Azure Static Web Apps built-in authentication (Microsoft Entra ID login required). User email and sign-out button visible in the header.

### Pattern 1: Investigative Agent (Chat Completions + Tools)

- Users type questions in plain English; the selected model decides which tools to call
- Azure OpenAI tool calling loop (up to 10 rounds per query) via `/chat` endpoint
- 6 selectable models via dropdown: GPT-4.1 (default), GPT-5, GPT-5 Mini, o4-mini, o3-mini, Phi-4
- Displays agent responses with rich markdown rendering (tables, lists, code blocks) and tool call badges
- Conversation history maintained client-side for multi-turn interactions
- Stateless — our code runs the agentic loop in `chat.ts`

```
Browser → Container App /chat → Azure OpenAI (tool calling) → APIM → Functions → SQL
```

### Pattern 2: Foundry Portal (Assistants API / Foundry Agent)

- Dark-themed panel matching the Investigative Agent style
- Floating chat widget (FAB icon, bottom-right of the Foundry Portal panel)
- Azure manages the tool-calling loop using GPT-4.1 via the Assistants API
- Threads persist server-side — follow-up questions remember context without resending history
- Agent named `philly-investigator` (assistant ID: `asst_CiN7zyMnsQxEcgG5JdTRXOpZ`)

```
Browser → Container App /agent/thread + /agent/message → Azure OpenAI Assistants API (GPT-4.1) → APIM → Functions → SQL
```

### Pattern 3: Copilot Studio (MCP via Low-Code)

- Microsoft Copilot Studio agent connected directly to the Container App's `/mcp` endpoint
- Embedded as an iframe widget — floating purple icon (bottom-right) scoped to the Copilot Studio panel
- Demonstrates the low-code/no-code path: Copilot Studio auto-discovers all 14 tools via MCP protocol
- No custom code needed on the Copilot Studio side — just point it at the MCP endpoint
- **Authentication**: The Container App's `/mcp` endpoint is currently unauthenticated. Copilot Studio connects over HTTPS without an API key. The endpoint is read-only (all tool calls go through APIM which has its own subscription key auth), so the exposure is limited to data queries. See the [Authentication Flow](#authentication-flow) section for production hardening options.

```
Copilot Studio → Container App /mcp (Streamable HTTP, no auth) → APIM (sub key) → Functions → SQL
```

### Pattern 4: Documentation (Static Content Reader)

- Built-in reader for all project markdown files and Jupyter notebooks
- Left sidebar lists documents under "Documentation" (9 markdown files) and "Notebooks" (3 .ipynb files)
- Custom markdown renderer (`formatContentDoc()`) with heading IDs, TOC anchor navigation, blockquotes, tables, code blocks
- Notebook renderer parses .ipynb JSON: markdown cells rendered as docs, code cells as syntax-highlighted blocks, outputs as muted text
- Content cached client-side after first load
- Files are copied from `docs/` and `jupyter-notebooks/` to `web/docs/` and `web/notebooks/` at deploy time via `infra/deploy-swa.sh`

### Pattern 5: MCP Tool Tester (Raw Protocol)

- Connects directly to the MCP server Container App via Streamable HTTP
- Discovers all 14 tools via MCP `initialize` → `tools/list` protocol
- Allows calling individual tools with specific parameters (parcel numbers, entity IDs, SQL queries)
- Displays raw JSON results with elapsed time
- No AI in the loop — user manually selects tools and fills parameters

```
Browser → Container App /mcp (Streamable HTTP, JSON-RPC 2.0) → APIM → Functions → SQL
```

### Pattern 6: Triage / Agent Framework (Semantic Kernel Multi-Agent)

- C#/.NET multi-agent system using Microsoft Semantic Kernel with Azure OpenAI GPT-4.1
- Deployed as Container App `philly-sk-agent` (separate from the MCP server Container App)
- **HandoffOrchestration** pattern: Triage agent routes questions to 3 specialist agents:
  - **OwnerAnalyst** — Entity search, property networks, profiles (3 APIM endpoints)
  - **ViolationAnalyst** — Code violations, top violators, demolitions, appeals (4 APIM endpoints)
  - **AreaAnalyst** — Zip stats, businesses, assessments, licenses, custom SQL (5 APIM endpoints)
- Each specialist has Kernel plugins that call APIM directly (not via MCP)
- Triage agent synthesizes specialist findings into a comprehensive answer
- SPA shows live elapsed timer and rotating status messages during the 15-30s response time
- `ResponseCallback` tracks which agents participated in each response

```
Browser → Container App /investigate → SK Orchestration → Azure OpenAI GPT-4.1 → APIM → Functions → SQL
```

### Layout

- **Activity bar** (48px, left edge): Nine icon buttons — chat bubble (Investigative Agent), building (Foundry Portal), goggles (Copilot Studio), atom (Triage / Agent Framework), wrench (MCP Tools), book (Documentation), monitor (Slide Deck), grid (Architecture), question mark (About)
- **Authentication**: Azure SWA built-in auth (`/.auth/login/aad`). Config in `web/staticwebapp.config.json`. User email displayed in header via `/.auth/me`. Sign out via `/.auth/logout`.
- Panels can be open simultaneously side-by-side (50/50 split)
- Closing one panel gives the other full width
- Closing all shows a welcome screen with quick-open buttons
- **Copilot Studio widget**: Floats within the Copilot Studio panel (purple icon, bottom-right). Scoped to the Copilot panel only.
- Responsive: on mobile (<768px), only one panel visible at a time
- No build step or dependencies — open the HTML file directly or serve with any static file server

### Chat Endpoint Architecture

The `/chat` endpoint on the Container App:
1. Receives a natural language message + conversation history + model selection
2. Sends it to Azure OpenAI (selected model) with 14 tool definitions
3. The model decides which tools to call (may call multiple in sequence)
4. Each tool call is executed against APIM → Functions → SQL
5. Results are fed back to the model for synthesis
6. Final natural language response returned to the browser

The `/agent` endpoints use the Assistants API instead:
1. `POST /agent/thread` creates a persistent thread
2. `POST /agent/message` adds a user message, creates a run, polls until completion
3. Azure manages the tool-calling loop — our code just executes requested tools
4. Thread state persists server-side — follow-up questions have full context

Authentication: Container App's managed identity has "Cognitive Services OpenAI User" role on the AI Services account. Uses `DefaultAzureCredential` + `getBearerTokenProvider` (no API keys).

### Model Selection

The SPA header includes a model selector dropdown. Available models are fetched from `GET /models` on page load. The selected model is passed in the `/chat` request body as `model` — the server validates it against the `AVAILABLE_MODELS` list and falls back to `gpt-4.1` if invalid.

Deployed models on the AI Services account (`foundry-og-agents`):

| Deployment | Model | Format | Use Case |
|-----------|-------|--------|----------|
| gpt-4.1 | GPT-4.1 | OpenAI | Best for complex multi-tool investigations (default) |
| gpt-5 | GPT-5 | OpenAI | Latest flagship model |
| gpt-5-mini | GPT-5 Mini | OpenAI | Fast and capable |
| o4-mini | o4-mini | OpenAI | Reasoning model, efficient |
| o3-mini | o3-mini | OpenAI | Reasoning model, compact |
| Phi-4 | Phi-4 | Microsoft MaaS | Lightweight SLM |

All models use the same Azure OpenAI endpoint and managed identity auth. The `model` parameter in the OpenAI SDK's `chat.completions.create()` is set to the deployment name.
