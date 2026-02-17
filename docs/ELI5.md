# ELI5 — Explain Like I'm 5

A plain-English guide to the Philly Poverty Profiteering platform. Use this for demos, presentations, and explaining the solution to any audience — technical or not.

**Keep this file updated.** Whenever features, panels, data, or architecture change, update this document so it stays current for presentations.

---

## Table of Contents

- [The One-Liner](#the-one-liner)
- [The Elevator Pitch (30 seconds)](#the-elevator-pitch-30-seconds)
- [The Demo Walkthrough (5 minutes)](#the-demo-walkthrough-5-minutes)
- [What's Inside the Data](#whats-inside-the-data)
- [How It Works — No Jargon](#how-it-works--no-jargon)
- [How It Works — Some Jargon](#how-it-works--some-jargon)
- [How the Network Security Works](#how-the-network-security-works)
- [The Seven Ways to Use It](#the-seven-ways-to-use-it)
- [Why It Matters (The Story)](#why-it-matters-the-story)
- [How AI Models Think — Tokens, Context, and Temperature](#how-ai-models-think--tokens-context-and-temperature)
- [Why Each Panel Gives Different Answers](#why-each-panel-gives-different-answers)
- [Frequently Asked Questions (Non-Technical)](#frequently-asked-questions-non-technical)
- [Cost — How Is This Not Expensive?](#cost--how-is-this-not-expensive)
- [Glossary](#glossary)

---

## The One-Liner

> We took 29 million rows of Philadelphia public records and made them queryable by AI — ask a question in English, get an investigative answer with maps.

---

## The Elevator Pitch (30 seconds)

Philadelphia publishes data about every property in the city: who owns it, what violations it has, whether it's been demolished, what businesses operate there, and what it's assessed at. The problem is that this data is spread across 10 separate datasets with nearly 29 million rows. Nobody can realistically search through that.

We loaded all of it into one database, built 12 search tools on top of it, and connected those tools to AI models (GPT-4.1, GPT-5, and others). Now you can ask plain-English questions like "Who are the worst landlords in Philadelphia?" or "Tell me about this LLC — how many properties do they own and how many have violations?" and the AI figures out which tools to use, runs the queries, and writes you a report. It even shows the properties on a map.

The whole thing costs about $33/month when nobody's using it (most of that is network security). Everything is serverless — it sleeps when idle and wakes up on demand.

---

## The Demo Walkthrough (5 minutes)

Open the app: **https://kind-forest-06c4d3c0f.1.azurestaticapps.net/**

### Step 1 — Welcome Screen (30 seconds)

You'll see a dark screen with a map of Philadelphia in the background and seven buttons. Explain:

> "This is a web app. You sign in with your Microsoft account — it's protected by Azure authentication. It's got seven different interfaces that all talk to the same data. Let me show you the main one."

Click **Investigative Agent**.

### Step 2 — Ask a Question (2 minutes)

Type: **"Who are the top 5 worst property owners in Philadelphia by code violations?"**

While it's thinking, explain:

> "I just asked a plain-English question. Behind the scenes, the AI is deciding which database queries to run. It has 12 tools it can use — things like 'search for a person or LLC', 'get property details', 'check violations', 'look up demolitions'. It picks the right ones automatically."

When the answer comes back, point out:

> "It found the data, ran the query, and wrote me a summary. These aren't canned responses — it's actually querying 29 million rows of real Philadelphia public records in real time."

### Step 3 — Follow Up (1 minute)

Type: **"Tell me more about the second one on that list — what properties do they own?"**

> "Now it's using a different tool to look up that specific entity's property network. I didn't have to give it a database ID or parcel number — it figured that out from context."

If the response includes a map, point it out:

> "See the map? Every property that came back from the database has GPS coordinates. 99.97% of the 584,000 properties in Philadelphia have coordinates in this dataset."

### Step 4 — Show the City Portal (1 minute)

Click the **building icon** in the left sidebar.

> "This is the same data, same tools, but presented as a government-style portal. It uses a different AI pattern — Microsoft's Assistants API instead of Chat Completions. The key difference: this one remembers your conversation. If I ask a follow-up, it has full context without me re-sending the history."

Click the blue chat bubble in the bottom-right. Ask something.

### Step 5 — Show Copilot Studio (30 seconds)

Click the **star icon** in the left sidebar.

> "This is Microsoft Copilot Studio — a low-code/no-code AI agent builder. We pointed it at our MCP endpoint and it auto-discovered all 12 tools. No custom code. If you have Copilot Studio in your organization, you can connect to this same backend in minutes."

Click the purple chat icon and ask something.

### Wrap Up

> "Seven completely different interfaces — a custom chat agent, a government-branded portal, a Copilot Studio agent, a Semantic Kernel multi-agent, a project overview, a documentation reader, and a raw tool tester — all using the same 12 tools and the same 29 million rows of data. The whole thing runs serverless and costs about $33 a month when nobody's using it — most of that is network security keeping the data path private."

---

## What's Inside the Data

29 million rows from 10 Philadelphia public datasets:

| What | How Many | Why It Matters |
|------|----------|----------------|
| **Properties** | 584,000 | Every property in the city — address, owner, building type, sale price, market value, GPS coordinates |
| **Entities** (people, LLCs, corporations) | 2.8 million | The people and companies who own properties |
| **Entity-property links** | 15.5 million | Who owns what — this is the "graph" that connects owners to addresses |
| **Code violations** | 1.6 million | Failed inspections, unsafe buildings, maintenance violations |
| **Tax assessments** | 6.4 million | Market value by year (2015-2025) for every property |
| **Business licenses** | 422,000 | Rental licenses, food licenses, vacant property licenses |
| **Commercial activity licenses** | 508,000 | Commercial operations with revenue codes |
| **Appeals** | 316,000 | Owners appealing violations, zoning, and building code decisions |
| **Demolitions** | 13,500 | Buildings torn down — and whether the city or the owner paid for it |

**Source:** Philadelphia open data portals, via [davew-msft/PhillyStats](https://github.com/davew-msft/PhillyStats).

---

## How It Works — No Jargon

Think of it like this:

1. **The data** lives in a database in the cloud. It sleeps when no one's using it.
2. **12 "tools"** sit on top of the database. Each tool does one thing: search for a person, look up a property, check violations, etc.
3. **An AI model** (like GPT-5) knows about all 12 tools. When you ask a question in English, the AI reads your question, decides which tools to call, calls them (sometimes chaining 3-5 tools together), reads the results, and writes you an answer in plain English.
4. **A website** shows you the answer, with maps when there are addresses involved.

That's it. You talk to the AI. The AI talks to the tools. The tools talk to the database. The database has the data.

```
You → AI → Tools → Database → Data
         ↑                      |
         └──────────────────────┘
         (AI reads results, writes answer)
```

---

## How It Works — Some Jargon

For technical audiences or colleagues who want to know the stack:

```
Web Browser (SPA on Azure Static Web Apps)
    ↓
MCP Server (TypeScript, Container App, scales 0-3)
    ↓ talks to both:
    ├── Azure OpenAI (GPT-4.1, GPT-5, etc. for AI reasoning)
    └── APIM (API Management, routes to backend)
            ↓
        Azure Functions (12 HTTP endpoints, Node.js 20)
            ↓ via VNet + Private Endpoints (private network, no public internet)
        Azure SQL Database (Serverless, 10 tables, ~29M rows)
        Azure Storage (Function App code + internal state)
```

**Key technologies:**
- **MCP** (Model Context Protocol) — a standard from Anthropic for connecting AI agents to tools. Any MCP-compatible client can connect and auto-discover all 12 tools.
- **Azure OpenAI** — runs the AI models. We have 6 deployed: GPT-4.1, GPT-5, GPT-5 Mini, o4-mini, o3-mini, Phi-4.
- **API Management** — a gateway that handles auth and routing. The AI never touches the database directly.
- **VNet + Private Endpoints** — the Function App talks to SQL and Storage over a private network. Public access is disabled on both. See [How the Network Security Works](#how-the-network-security-works).
- **Serverless** — everything scales to zero when idle. No VMs, no always-on services. Pay only when someone's using it.

---

## How the Network Security Works

Think of it like a building analogy:

**Before VNet:** Our Function App (the worker) needed to walk outside on the public sidewalk to get to the database (the filing cabinet in another building) and the storage room (where the worker's own tools are kept). Azure's security team (MCAPS) kept locking the front doors of both buildings — "no public access allowed!" — which meant the worker couldn't get to the data or even to its own tools. The whole system went down every time MCAPS locked the doors.

**After VNet:** We built an underground tunnel (the **VNet**) connecting all three buildings. The worker now uses the tunnel to reach the database and storage. The front doors are intentionally locked — nobody uses them anymore. MCAPS can lock them all day long; the worker doesn't care because it has its private tunnel.

The technical pieces:

| Component | Analogy | What It Does |
|-----------|---------|-------------|
| **VNet** | The underground tunnel system | A private network where only our services can communicate |
| **Private Endpoints** (×4) | Private doorways from the tunnel into each building | Give SQL and Storage private addresses that only work inside the tunnel |
| **Private DNS Zones** (×4) | Address book updates | When the worker asks "where is the database?", the answer is now the private tunnel door, not the public front door |
| **VNet Integration** | The worker's connection to the tunnel | Function App routes all traffic through the VNet instead of the public internet |

This costs ~$31/month (the "construction cost" of the tunnel), but it permanently solves the problem. MCAPS can't break what's already locked down.

---

## The Seven Ways to Use It

This is the demo's punchline: one backend, seven completely different client experiences.

### 1. Investigative Agent (Chat icon)

| | |
|---|---|
| **Pattern** | Chat Completions + Tools |
| **What it means** | Our code runs the AI loop — sends the question to Azure OpenAI, the model picks tools, we execute them, feed results back, repeat until the model has an answer |
| **Model** | User picks from 6 models (GPT-4.1 default) |
| **Memory** | None — each question starts fresh (history sent from browser) |
| **Maps** | Yes — inline maps appear when properties are returned |
| **Best for** | Open-ended investigations, comparing models |

### 2. City Portal (Building icon)

| | |
|---|---|
| **Pattern** | Assistants API (Foundry Agent) |
| **What it means** | Azure manages the AI loop — we just create a "thread" and send messages. Azure decides which tools to call, executes them, and maintains conversation state |
| **Model** | GPT-4.1 (fixed, configured on the assistant) |
| **Memory** | Yes — threads persist server-side, follow-ups remember context |
| **Maps** | No (plain chat widget) |
| **Best for** | Showing Azure manages the complexity; persistent conversations |

### 3. Copilot Studio (Star icon)

| | |
|---|---|
| **Pattern** | MCP auto-discovery |
| **What it means** | Microsoft's low-code agent platform. We pointed it at our MCP endpoint and it found all 12 tools automatically. No custom code on the Copilot Studio side. |
| **Model** | Whatever Copilot Studio uses internally |
| **Memory** | Yes (managed by Copilot Studio) |
| **Maps** | No |
| **Best for** | Showing the low-code/no-code path; enterprise agent platforms |

### 4. About (Info icon)

| | |
|---|---|
| **Pattern** | Static content |
| **What it means** | Project overview and architecture documentation. No AI. |
| **Model** | None |
| **Memory** | None |
| **Maps** | No |
| **Best for** | Quick project overview during demos |

### 5. SK Agent (Brain icon)

| | |
|---|---|
| **Pattern** | Semantic Kernel multi-agent orchestration |
| **What it means** | A C#/.NET 8 agent using Microsoft Semantic Kernel. A Triage agent routes questions to 3 specialist agents (OwnerAnalyst, ViolationAnalyst, AreaAnalyst), each with their own APIM-calling plugins. Azure OpenAI GPT-4.1. |
| **Model** | GPT-4.1 (via Azure OpenAI, Semantic Kernel) |
| **Memory** | None — each question is independent |
| **Maps** | No (text responses only) |
| **Best for** | Showing the Microsoft Semantic Kernel pattern; C# enterprise agent architecture |

### 6. Documentation (Book icon)

| | |
|---|---|
| **Pattern** | Static content reader |
| **What it means** | Renders all project documentation (markdown files) and Jupyter notebooks directly in the browser. No AI involved — just a built-in docs reader so you don't have to leave the app. |
| **Model** | None |
| **Memory** | None |
| **Maps** | No |
| **Best for** | Reading docs during demos, quick reference, showing notebooks without Jupyter |

### 7. MCP Tool Tester (Wrench icon, bottom of sidebar)

| | |
|---|---|
| **Pattern** | Raw MCP protocol |
| **What it means** | No AI at all. You pick a tool, fill in parameters, hit call. See raw JSON results. |
| **Model** | None |
| **Memory** | None |
| **Maps** | No |
| **Best for** | Debugging, showing what the AI sees under the hood, demonstrating MCP protocol |

---

## Why It Matters (The Story)

Philadelphia has a problem with **poverty profiteering** — LLCs and individuals who buy up distressed properties in low-income neighborhoods, let them deteriorate, rack up code violations, and either flip them to other LLCs or let the city demolish them at taxpayer expense.

The data to investigate this already exists. Philadelphia publishes it. But it's scattered across separate portals, in CSV files with millions of rows. A journalist, community organizer, or city council member can't realistically cross-reference 2.8 million entities against 1.6 million violations against 584,000 properties.

This platform changes that. Ask a question. Get an answer. See it on a map. Follow the money.

**Example findings from the data:**
- The **Philadelphia Land Bank** (a city entity) has the most violations — 2,495 properties with 13,588 code violations
- **GEENA LLC** is linked to 330+ properties across the city
- 2837 Kensington Ave was flipped between LLCs (A Kensington Joint LLC → Birds Nest LLC), racked up 20 violations (14 failed), had an UNSAFE priority case fail 8 times, and ultimately got demolished

---

## How AI Models Think — Tokens, Context, and Temperature

These three concepts explain why AI models behave the way they do and why you get different results each time.

### Tokens — The Currency of AI

AI models don't read words — they read **tokens**. A token is roughly 3/4 of a word. "Philadelphia" is 4 tokens. "LLC" is 1 token. A typical question-and-answer exchange might use 2,000-5,000 tokens.

**Why this matters:** You pay per token. Every question and every answer costs money based on how many tokens are consumed. Bigger models (GPT-5) cost more per token than smaller ones (Phi-4). Reasoning models (o4-mini, o3-mini) use extra "thinking tokens" that you pay for even though you never see them — the model thinks internally before answering.

In our solution:
- The **Investigative Agent** uses tokens efficiently because it's stateless — each question only sends the current conversation
- The **City Portal** stores threads server-side, so Azure manages the token budget
- **Tool results** count as tokens too. When the AI calls `get_top_violators` and gets back 25 owners with 50 properties each, all that JSON data uses tokens. Larger results = more tokens = higher cost per question

### Context Window — The AI's Short-Term Memory

The **context window** is how much the AI can "see" at once. Think of it as the AI's desk — everything it needs to answer your question has to fit on the desk.

For GPT-4.1, the context window is ~128,000 tokens (~96,000 words). That sounds huge, but it fills up fast when you include:
- The system prompt (instructions telling the AI what it is)
- 12 tool definitions (descriptions of every tool it can use)
- Your conversation history
- Tool results (database query results can be massive)

**Why this matters for our solution:**
- The **Investigative Agent** sends the full conversation history with each message. After 10-15 exchanges with big tool results, you can hit the context limit. That's why starting a fresh conversation sometimes gives better answers than a long thread.
- The **City Portal** also has this limit, but Azure manages it — it may silently drop older messages to stay within bounds.
- This is why the tool output truncation exists (tool results over 200KB get cut off in the City Portal) — without it, a single large result could eat the entire context window.

### Temperature — The Creativity Dial

**Temperature** controls how "creative" vs "predictable" the AI is. It's a number from 0 to 2:

| Temperature | Behavior | Best For |
|-------------|----------|----------|
| **0** | Always picks the most likely next word. Same input = same output every time. | Math, code, factual lookups |
| **0.7** | Mostly predictable but with some variety. Good balance. | General chat, investigations |
| **1.0** | More creative and varied. Different phrasing each time. | Writing, brainstorming |
| **2.0** | Very random. Can produce nonsensical output. | Almost never used |

In our solution:
- The **Investigative Agent** uses whatever temperature the model defaults to (typically ~1.0)
- The **City Portal** uses the assistant's default temperature (1.0)
- **Reasoning models** (o4-mini, o3-mini) ignore temperature — they always reason deterministically internally

This is why you can ask the exact same question twice and get differently worded answers. The data is the same, but the model phrases its analysis differently each time.

---

## Why Each Panel Gives Different Answers

Ask the same question across all four panels and you'll get different responses. Here's why:

| Factor | Investigative Agent | City Portal | Copilot Studio |
|--------|-------------------|-------------|----------------|
| **Who runs the AI loop** | Our code (`chat.ts`) | Azure (Assistants API) | Microsoft (Copilot Studio) |
| **Model** | You choose (6 options) | GPT-4.1 (fixed) | Copilot Studio's model |
| **System prompt** | Our custom investigator prompt | Same prompt (on the assistant) | Copilot Studio's prompt + our tools |
| **Tool output size** | Full results (no limit) | Truncated at 200KB per tool | Unknown (managed by Copilot) |
| **Conversation memory** | Browser sends history each time | Azure stores threads server-side | Copilot manages sessions |
| **Temperature** | Model default | Assistant default (1.0) | Copilot's setting |

The biggest reason for different responses:

1. **Different models think differently.** GPT-4.1 is methodical and thorough. GPT-5 reasons more deeply (but is less stable on the Assistants API). o4-mini is concise. Phi-4 is lightweight and sometimes misses nuance.

2. **Different context management.** The Investigative Agent sends your full chat history every time — it has maximum context. The City Portal lets Azure manage context — Azure may summarize or trim older messages. Copilot Studio manages its own context window.

3. **Different tool output sizes.** The Investigative Agent gets full, untruncated results from every tool call. The City Portal truncates results over 200KB (an Assistants API limit). This means the City Portal might miss data that appeared late in a large result set.

4. **Temperature randomness.** Even with the same model and same data, temperature means the exact wording varies each time. The facts should be consistent, but the narrative structure will differ.

---

## Frequently Asked Questions (Non-Technical)

**Q: Do I need to install anything?**
No. Open the URL in any browser and sign in with your Microsoft account. No plugins, no setup.

**Q: Why is the first question slow?**
The database goes to sleep after an hour of no activity (it saves money). The first question wakes it up, which takes 30-60 seconds. After that, it's fast. Run the wake-up script (`infra/wake.sh`) before demos.

**Q: Is the data real?**
Yes. It's from Philadelphia's official open data portals. 10 datasets, ~29 million rows.

**Q: How current is the data?**
The data was loaded from a snapshot. It's not live-updating from the city's portals (that would be a future enhancement).

**Q: Can I break it?**
No. The SQL endpoint only allows read-only queries. There are no write operations. The database enforces read-only access at the permission level.

**Q: How much does this cost to run?**
About $33/month when nobody's using it (most of that is network security — private endpoints that keep the data path secure). When someone IS using it, you pay a few cents per query on top of that. See the [cost section](#cost--how-is-this-not-expensive) below.

**Q: Can other AI tools connect to this?**
Yes. Claude Code, Claude Desktop, Azure AI Foundry, Copilot Studio, or any MCP-compatible client can connect and auto-discover all 12 tools. The MCP endpoint is publicly available.

**Q: What models can I use?**
Six models are deployed: GPT-4.1 (default), GPT-5, GPT-5 Mini, o4-mini, o3-mini, and Phi-4 (Microsoft's small language model). Switch between them using the dropdown in the Investigative Agent panel.

---

## Cost — How Is This Not Expensive?

Everything is **serverless** — it only runs (and costs money) when someone's actively using it.

| Resource | When Idle | When Active |
|----------|-----------|-------------|
| Database (Azure SQL Serverless) | $0 (auto-pauses after 60 min) | ~$0.75/vCore-hour |
| API layer (Functions + APIM) | $0 | Pennies per 1000 calls |
| MCP Server (Container App) | $0 (scales to zero) | ~$0.01/hour per replica |
| AI Models (Azure OpenAI) | $0 | Pay per token (varies by model) |
| Website (Static Web App) | $0 (Free tier) | $0 |
| Storage | ~$1/month | ~$1/month |
| Network Security (VNet + Private Endpoints) | ~$31/month | ~$31/month |
| **Total when idle** | **~$33/month** | |

The trick: **consumption/serverless tiers across the board.** No VMs, no always-on compute, no reserved capacity. Everything sleeps until someone sends a request. The biggest fixed cost is **network security** — private endpoints that let the Function App talk to SQL and Storage over a private network instead of the public internet. This prevents Azure security policies from breaking the data path.

---

## Glossary

For when someone in your audience asks "what does that mean?"

| Term | Plain English |
|------|---------------|
| **MCP** | Model Context Protocol — a standard way for AI models to discover and use tools. Think of it as a USB plug for AI tools. |
| **APIM** | API Management — a gateway that sits in front of our tools. Like a receptionist who checks your ID before letting you into the building. |
| **Serverless** | Code that runs only when called, then goes away. No server to manage. You're billed by the second, not by the month. |
| **LLM** | Large Language Model — the AI brain (GPT-4.1, GPT-5, etc.) that reads your question and figures out what to do. |
| **Tool calling** | When the AI decides it needs data, it "calls a tool" — which really means it sends a request to one of our 12 database endpoints. |
| **Container App** | A way to run our server code in the cloud. It can scale from zero (sleeping, $0) to multiple copies when busy. |
| **Assistants API** | Microsoft's managed version of tool calling. Instead of us running the AI loop, Azure does it. Conversations are stored server-side. |
| **Copilot Studio** | Microsoft's low-code platform for building AI agents. You can connect it to our tools without writing any code. |
| **Entity resolution** | Figuring out that "John Smith", "JOHN SMITH", and "J. Smith at 123 Main St" might all be the same person. The database has a graph of 2.8M entities linked to 987K addresses. |
| **SPA** | Single Page Application — the website is one HTML file with no build step. No React, no npm, no webpack. Just HTML, CSS, and JavaScript. |
| **Token** | The unit AI models use to read and write text. Roughly 3/4 of a word. You pay per token consumed. |
| **Context window** | How much text the AI can "see" at once — its working memory. GPT-4.1 can see ~128K tokens (~96K words) at a time. |
| **Temperature** | A dial from 0 to 2 controlling how creative vs predictable the AI is. Lower = more consistent, higher = more varied. |
| **Reasoning model** | AI models (like o4-mini, o3-mini) that "think" internally before answering, using hidden reasoning tokens. More thorough but more expensive. |
| **Cold start** | When a serverless resource wakes up from sleep. Takes 30-60 seconds for the database, a few seconds for the container. |
| **Flex Consumption** | Azure's pricing tier for Functions — you only pay when a function actually runs. Idle = free. |
| **Managed identity** | Instead of passwords, our services authenticate to each other using Azure's identity system. No secrets to manage or rotate. |
| **VNet** | Virtual Network — a private, isolated network in Azure. Think of it as your own private office building where only your services can communicate. |
| **Private Endpoint** | A private doorway that gives an Azure service (like SQL or Storage) a private IP address inside your VNet. Traffic never goes over the public internet. |
| **Private DNS Zone** | An address book override that makes service names resolve to private IPs instead of public ones. Without this, the Function App would try to reach SQL at its public address (which is blocked). |
| **MCAPS** | Microsoft Corporate Azure Platform Standards — security policies applied at a level above your subscription. They can automatically change settings on your resources. The VNet + Private Endpoints setup makes us immune to the most disruptive MCAPS policies. |

---

*Last updated: Session 21 (2026-02-17). This file should be updated whenever features, panels, data, architecture, or costs change.*
