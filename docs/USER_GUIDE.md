# Philadelphia Property Data — User Guide

A web app for investigating property ownership, code violations, demolitions, and poverty profiteering patterns in Philadelphia. Four AI-powered interfaces, 12 tools, 29 million rows of public data.

**Live URL:** https://kind-forest-06c4d3c0f.1.azurestaticapps.net/

---

## Table of Contents

- [Open the App](#open-the-app)
- [The Four Panels](#the-four-panels)
  - [Investigative Agent](#1-investigative-agent--chat-icon)
  - [City Portal](#2-city-portal--building-icon)
  - [Copilot Studio](#3-copilot-studio--star-icon)
  - [MCP Tool Tester](#4-mcp-tool-tester--wrench-icon)
- [Things to Try](#things-to-try)
  - [Quick Wins](#quick-wins)
  - [Deep Investigations](#deep-investigations)
  - [Business & Licensing](#business--licensing)
  - [Area Analysis](#area-analysis)
  - [Custom SQL](#custom-sql)
- [Choosing a Model](#choosing-a-model)
- [Tips & Tricks](#tips--tricks)
- [Cold Starts](#cold-starts)
- [The Data](#the-data)
- [How It Works (Simple Version)](#how-it-works-simple-version)
- [How It Works (Technical Version)](#how-it-works-technical-version)
- [Connecting Other Clients](#connecting-other-clients)
  - [Claude Code](#claude-code)
  - [Claude Desktop](#claude-desktop)
  - [Copilot Studio (Setup)](#copilot-studio-setup)
  - [Direct API](#direct-api)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Costs](#costs)
- [Developer Docs](#developer-docs)

---

## Open the App

1. Go to https://kind-forest-06c4d3c0f.1.azurestaticapps.net/
2. You'll see a welcome screen with four buttons. Pick one.
3. That's it. No login, no setup, no install.

> **First time?** Start with the **Investigative Agent** — just type a question in plain English and hit Send.

> **Slow first response?** The database goes to sleep after an hour of no activity. The first question takes 30–60 seconds to wake everything up. After that, responses are fast.

---

## The Four Panels

The left sidebar has four icons. Click one to open that panel. You can have multiple panels open at once (they'll split the screen side by side).

### 1. Investigative Agent — Chat Icon

**What it is:** An AI chat where you ask questions in plain English. The AI figures out which tools to use, queries the database, and gives you a written answer.

**How to use it:**
1. Click the chat icon (top of left sidebar)
2. Type a question in the text box at the bottom
3. Hit Enter or click Send
4. Wait for the response — you'll see a "thinking" animation while it works
5. Small blue badges show which tools the AI used to answer your question

**Example:** Type "Who are the top 10 worst property owners by code violations?" and the AI will search the database, find the answer, and explain it to you.

**Follow-up questions work.** After you get an answer, ask a follow-up like "Tell me more about the first one" — the AI remembers the conversation.

**Clear button** in the top-right resets the conversation.

### 2. City Portal — Building Icon

**What it is:** A Philadelphia city government-themed page with a chat assistant built on a different AI technology (Azure Foundry Agent with GPT-5). Same data, different engine.

**How to use it:**
1. Click the building icon in the sidebar
2. Read the portal page if you want — it has some stats about the data
3. Click the **blue chat bubble** in the bottom-right corner
4. Type your question and hit Enter
5. The assistant remembers your entire conversation — even follow-ups

**Key difference from the Investigative Agent:** This one uses persistent conversation threads managed by Azure. Your conversation lives on the server, not in your browser. It always uses GPT-5.

### 3. Copilot Studio — Star Icon

**What it is:** A Microsoft Copilot Studio agent that connects to the same tools. This is the "no-code" approach — no custom programming was needed to build this agent. Copilot Studio discovered the tools automatically.

**How to use it:**
1. Click the star icon in the sidebar
2. Read the info page about how it works
3. Click the **purple star button** in the bottom-right corner
4. The Copilot Studio webchat loads in a popup
5. Ask your question and wait for a response

**Note:** This agent sometimes shows a "JavaScriptError" — that's a Copilot Studio issue, not ours. If it happens, close the widget and reopen it (the iframe reloads fresh each time).

### 4. MCP Tool Tester — Wrench Icon

**What it is:** A direct interface to the raw tools. No AI in the loop — you pick a tool, fill in parameters, and see the raw JSON data that comes back.

**How to use it:**
1. Click the wrench icon (bottom of left sidebar)
2. Click **Connect** (the endpoint URL is pre-filled)
3. Wait for "Connected — 12 tools discovered"
4. Click a tool name from the left list
5. Fill in the required parameters (e.g., a parcel number or entity name)
6. Click **Call Tool**
7. See the raw JSON result with elapsed time

**Good for:** Demos, debugging, seeing exactly what data the AI gets when it calls a tool.

---

## Things to Try

Copy-paste any of these into the Investigative Agent or City Portal chat.

### Quick Wins

- "Who are the top 10 worst property owners by code violations?"
- "Tell me about GEENA LLC — how many properties and violations?"
- "Look up property 405100505"
- "What's the assessment history for parcel 884437200?"

### Deep Investigations

- "Find LLCs that own more than 50 properties with demolition records"
- "Who are the top violators that are LLCs specifically, not government entities?"
- "Deep dive on 2837 Kensington Ave — who owns it, what violations, any demolitions?"
- "Show me everything about the entity linked to parcel 405100505"

### Business & Licensing

- "What check cashing businesses operate in zip code 19134?"
- "Search for pawn shops in 19140"
- "Find dollar stores in North Philadelphia zip codes"
- "What businesses are licensed at this address?"

### Area Analysis

- "What are the stats for zip code 19134?"
- "Compare violation rates between zip codes 19134 and 19140"
- "Which zip codes have the highest vacancy and violation rates?"

### Custom SQL

The AI can write and run SQL queries for questions that don't fit the preset tools:

- "Write a SQL query to find properties owned by the same entity in multiple zip codes"
- "How many properties changed ownership more than 3 times since 2020?"
- "What's the average assessment value by zip code?"

---

## Choosing a Model

The model dropdown in the top-right (visible when the Investigative Agent is open) lets you pick which AI model processes your question:

| Model | Best For |
|-------|----------|
| **GPT-4.1** (default) | Complex multi-tool investigations. Reliable, fast. |
| **GPT-5** | Latest flagship. Most capable but sometimes slower. |
| **GPT-5 Mini** | Fast and capable. Good balance. |
| **o4-mini** | Reasoning model. Good for complex logic. |
| **o3-mini** | Compact reasoning model. |
| **Phi-4** | Lightweight. May struggle with complex multi-tool tasks. |

**Recommendation:** Stick with GPT-4.1 unless you want to experiment. It handles multi-tool investigations well and responds quickly.

The model selector only affects the Investigative Agent. The City Portal always uses GPT-5. Copilot Studio uses whatever model Microsoft assigns.

---

## Tips & Tricks

- **Multiple panels at once:** Click multiple sidebar icons to open panels side-by-side. Close one and the other takes the full width.
- **Keyboard shortcut:** In the Investigative Agent, press Enter to send, Shift+Enter for a new line.
- **Be specific:** "Show me violations for parcel 405100505" works better than "show me some violations."
- **Use zip codes:** Many tools filter by zip code. If you're exploring an area, start with the zip code stats.
- **Ask for SQL:** If the pre-built tools don't cover your question, ask the AI to write a custom SQL query.
- **Watch the tool badges:** The blue badges under each response tell you which tools the AI used. This helps you understand what data it accessed.
- **Conversation length:** The Investigative Agent keeps the last 40 messages. For very long investigations, click Clear and start fresh.
- **City Portal threads persist:** Unlike the Investigative Agent, the City Portal's conversation lives on the server. You can ask long follow-up chains.

---

## Cold Starts

Everything in this system scales to zero when idle to save money. The first request after a period of inactivity takes longer because the system wakes up:

1. **Container App** (the server) wakes up: 5–10 seconds
2. **SQL Database** resumes from auto-pause: 30–60 seconds
3. **After that:** Responses are fast (a few seconds)

**To warm things up before a demo:** Run the wake-up script (see [Developer Docs](#developer-docs)) or just open the app and send a simple question. Everything stays warm for about an hour after the last request.

---

## The Data

10 public Philadelphia datasets, approximately 29 million rows total:

| Dataset | Rows | What It Contains |
|---------|------|------------------|
| **Properties** | 584K | Every property in Philadelphia — address, owner, zoning, size, use |
| **Entities** | 2.8M | People, LLCs, corporations linked to properties |
| **Entity-Address Links** | 15.5M | The connections between entities and properties (who owns what) |
| **Code Investigations** | 1.6M | Code enforcement cases — violations, inspections, outcomes |
| **Assessments** | 6.4M | Property tax assessments by year (2015–2025) |
| **Commercial Activity Licenses** | 508K | Commercial business licenses |
| **Business Licenses** | 422K | General business licenses |
| **Appeals** | 316K | L&I zoning and code appeals |
| **Addresses** | 987K | Standardized address records |
| **Demolitions** | 13.5K | Demolition records — city-initiated vs. owner-initiated |

Data is sourced from Philadelphia's open data portals and the [PhillyStats project](https://github.com/davew-msft/PhillyStats).

---

## How It Works (Simple Version)

```
You ask a question
    ↓
AI reads your question and decides which tools to use
    ↓
Tools query a database with 29 million rows of Philadelphia property data
    ↓
AI reads the results and writes you an answer in plain English
```

All four panels use the same database and the same 12 tools. The difference is how the AI part works:

- **Investigative Agent:** Our code runs the AI loop. You pick the model. Stateless.
- **City Portal:** Azure runs the AI loop (Foundry Agent). GPT-5. Conversations persist.
- **Copilot Studio:** Microsoft runs everything. No custom code. Auto-discovers tools.
- **Tool Tester:** No AI. You call tools directly and see raw data.

---

## How It Works (Technical Version)

```
SPA (Azure Static Web Apps)
    ↓ HTTPS
Container App (Node.js, Express, MCP Server)
    ↓ HTTPS + Ocp-Apim-Subscription-Key
Azure API Management (Consumption tier)
    ↓ HTTPS + x-functions-key (injected by APIM policy)
Azure Functions (Flex Consumption, Node.js 20)
    ↓ Azure AD token (DefaultAzureCredential, Managed Identity)
Azure SQL Database (Serverless Gen5, 4 vCores)
    (10 tables, 3 views, 28+ indexes, ~29M rows)
```

The 12 tools available to the AI:

| Tool | What It Does |
|------|-------------|
| `search_entities` | Search people, LLCs, corporations by name |
| `get_entity_network` | All properties linked to an entity |
| `get_property_profile` | Full property details + violation/demolition counts |
| `get_property_violations` | Code enforcement cases for a property |
| `get_property_assessments` | Assessment history (2015–2025) |
| `get_property_licenses` | Business licenses at a property |
| `get_property_appeals` | L&I appeals for a property |
| `get_property_demolitions` | Demolition records for a property |
| `search_businesses` | Search licenses by keyword, type, or zip |
| `get_top_violators` | Ranked owners by violation count |
| `get_area_stats` | Zip code aggregate statistics |
| `run_query` | Custom read-only SQL (SELECT only) |

---

## Connecting Other Clients

The same backend can be used from other tools besides the web app.

### Claude Code

1. Clone the repo: `git clone https://github.com/pogorman/mcp-apim.git`
2. `cd mcp-apim && npm install && npm run build -w mcp-server`
3. Copy `.mcp.json.example` to `.mcp.json` and add the APIM subscription key
4. Open in Claude Code — the 12 `philly-stats` tools appear automatically

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "philly-stats": {
      "command": "node",
      "args": ["/path/to/mcp-apim/mcp-server/dist/index.js"],
      "env": {
        "APIM_BASE_URL": "https://philly-profiteering-apim.azure-api.net/api",
        "APIM_SUBSCRIPTION_KEY": "<your-key>"
      }
    }
  }
}
```

### Copilot Studio (Setup)

1. Create or open an agent in Copilot Studio
2. Add an MCP Server action
3. **Server URL:** `https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp`
4. **Authentication:** No connection (none)
5. **API Key:** Leave blank
6. Copilot Studio auto-discovers all 12 tools

### Direct API

For programmatic access, hit the chat endpoint directly:

```bash
curl -X POST https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Who are the top 5 worst property owners?"}'
```

Response includes `reply` (the answer) and `toolCalls` (which tools were used).

---

## Frequently Asked Questions

### Why is the first response so slow?

The database auto-pauses after 60 minutes of inactivity to save money. The first query wakes it up, which takes 30–60 seconds. After that, responses are fast. Run `infra/wake.sh` before demos to warm everything up.

### What's the difference between the Investigative Agent and the City Portal?

Both answer the same questions using the same data. The Investigative Agent is custom code (stateless, you pick the model). The City Portal uses a Foundry Agent managed by Azure (stateful, always GPT-5, conversations persist on the server).

### Why does Copilot Studio sometimes show "JavaScriptError"?

That error comes from inside Microsoft's webchat embed, not from our code. Try closing and reopening the widget (it reloads fresh each time). If it persists, the Copilot Studio agent may need to be re-published.

### Can I break anything?

No. All queries are read-only. The `run_query` tool blocks INSERT, UPDATE, DELETE, DROP, and other destructive operations. You can't modify any data.

### How much does this cost to run?

About $1–2/month when idle. Every component scales to zero: SQL auto-pauses, Functions and APIM are pay-per-use, the Container App scales to 0 replicas, and AI models are pay-per-token. See [Costs](#costs) for details.

### What if the AI gives a wrong answer?

The AI interprets data but can make mistakes. Look at the tool badges to see what data it accessed, and use the MCP Tool Tester to verify the raw data if something looks off.

### Can I use this data in my own application?

Yes. The MCP endpoint is open and can be connected to any MCP-compatible client. The APIM endpoints require a subscription key. See [Connecting Other Clients](#connecting-other-clients).

---

## Costs

Everything scales to zero when idle:

| Resource | Idle Cost | Active Cost |
|----------|-----------|-------------|
| SQL Database | ~$0.50/mo (storage only) | ~$0.75/vCore-hour |
| Azure Functions | $0 | Pay per execution |
| APIM | $0 | Free tier (1M calls/mo) |
| Container App | $0 | Per vCPU-second |
| Azure OpenAI Models | $0 | Pay per token |
| Static Web App | $0 | Free tier |
| Storage (2 accounts) | ~$1/mo | Same |
| Container Registry | ~$0.17/mo | Same |

**Total idle:** ~$1–2/month. No resources need manual start/stop.

---

## Developer Docs

For building, deploying, and operating the system:

| Document | What It Covers |
|----------|---------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Full system architecture, database schema, API specs, security model |
| [COMMANDS.md](COMMANDS.md) | Every CLI command used to build and deploy the system |
| [CLI_CHEATSHEET.md](CLI_CHEATSHEET.md) | Day-to-day management commands (status checks, deployments, troubleshooting) |
| [FAQ.md](FAQ.md) | Technical Q&A (MCAPS policies, Foundry portal, agent patterns, Azure SQL vs Dataverse) |
| [SESSION_LOG.md](SESSION_LOG.md) | Chronological build log (14 sessions, what was built, what broke, how it was fixed) |
| [PROMPTS.md](PROMPTS.md) | User prompts from each build session |
