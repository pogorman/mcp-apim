# Know Your Options: Advanced Power Platform + Azure Agent Demo

## Session Info

| | |
|---|---|
| **Title** | Know Your Options: From No-Code Agents to Pro-Code Orchestration on the Power Platform + Azure |
| **Alt Title** | One Backend, Seven Agents: The Power Platform + Azure Agent Spectrum |
| **Duration** | 60 minutes (50% slides, 50% live demo) |
| **Audience** | Mixed — Microsoft colleagues + government customers (varying technical depth) |
| **Central Thesis** | "You don't need to know how to do everything. You need to know it's an option." |
| **Live Demo URL** | `https://kind-forest-06c4d3c0f.1.azurestaticapps.net/` |

## Abstract

Every AI conversation starts the same way: a user asks a question. But *how* that question gets answered — who picks the tools, who runs the loop, how much context the model sees — changes everything. In this session, we'll walk through a real project with 34 million rows of public data and 7 different agent patterns hitting the same backend, from zero-code M365 Copilot declarative agents to multi-agent Semantic Kernel orchestration. You'll see how Power Platform, Azure AI Foundry, and Azure Functions form a spectrum of options — and why knowing your options matters more than mastering any single one.

## Three Key Takeaways

1. **Context windows are invisible but decisive.** The same model + same tools + different context management = different answers. Know how your platform manages context.
2. **The spectrum is the strategy.** No-code for speed, pro-code for control. Both hit the same backend. Start left, move right as you need to.
3. **You don't need to know how to build all of these. You need to know they exist.** When a customer asks "can we build an agent that...?" — your answer should be "yes, and here are your options."

---

## The Spectrum

```
NO CODE ←—————————————————————————————————————→ PRO CODE

M365 Copilot    Copilot     Foundry     Investigative    SK Agent
Declarative     Studio      Portal      Agent (Chat      Framework
Agent           (MCP)       (Assistants Completions)     (Multi-agent
(3 JSON files)              API)                         C#/.NET 8)
```

All five patterns hit the same 14 MCP tools, the same 34 million rows of Philadelphia public data.

---

## Minute-by-Minute Breakdown

### ACT 1: SET THE STAGE (12 min)

#### [0:00–3:00] Opening — The Thesis (SLIDES)

**Slide 1: Title**
- "Know Your Options: From No-Code Agents to Pro-Code Orchestration"
- Subtitle: "You don't need to know how to do everything. You need to know it's an option."

**Slide 2: The Problem**
- 34M rows of Philadelphia public records scattered across 11 datasets
- 2.8M entity names, 1.6M code violations, 584K properties, 5M real estate transfers
- Journalists, community orgs, and city council can't cross-reference this
- Who's buying distressed properties at sheriff sales? Which LLCs are racking up violations and flipping to other LLCs?

**Slide 3: The Solution**
- One MCP backend. 14 tools. 7 agent patterns. $33/month idle.
- Architecture diagram screenshot (from D3.js interactive diagram)

> **Speaker notes:** Frame this as a real project, not a lab exercise. Public data. Real addresses. Real LLCs. This is what agents look like when they hit production-scale data. The story matters — poverty profiteering is a real problem, and AI + public data can surface patterns that humans can't find manually.

---

#### [3:00–5:00] Quick Hit Demo — "Show, Don't Tell" (DEMO)

**Demo 1: Opening Hook**
1. Open the SPA, sign in with Microsoft account
2. Click **Investigative Agent** (chat icon)
3. Type: *"Who are the top 5 worst property owners by code violations?"*
4. While it runs, narrate: "This is Azure OpenAI calling tools against 34 million rows through APIM and Azure Functions."
5. Show the result with the Leaflet.js map — properties with coordinates light up (99.97% have coords)

> **Speaker notes:** Hook the audience. Don't explain the architecture yet — just show them it works. They'll want to know how. The map is the wow moment. Let the audience see real Philadelphia addresses pinned on a map before you explain any technology.

---

#### [5:00–8:00] The Spectrum (SLIDES)

**Slide 4: The Spectrum of Options**
- Visual: the no-code → pro-code spectrum (see above)
- Each one hits the same 14 tools, the same 34M rows
- "The question isn't which is 'best.' It's which fits your team, your timeline, and your governance requirements."

> **Speaker notes:** This is the punchline of the whole talk. Come back to this slide multiple times — after each demo, remind the audience where on the spectrum you just were. "We just saw the no-code option. Now let's move right."

---

#### [8:00–12:00] How It All Connects (SLIDES)

**Slide 5: Architecture — 5 Layers**
- Layer 1: 7 Clients (the patterns)
- Layer 2: Container App (MCP Server — multi-protocol host)
- Layer 3: APIM (security + governance — the single front door)
- Layer 4: Azure Functions (14 tools, serverless, Node.js 20)
- Layer 5: Azure SQL (11 tables, 34M rows, serverless, auto-pause)

**Slide 6: What Is MCP?**
- "Model Context Protocol is the USB-C of AI. One standard interface. Any client can plug in."
- Anthropic open standard (Nov 2024). Microsoft adopted it across Copilot Studio, M365 Copilot, and AI Foundry.
- Our server exposes 14 tools. Any MCP client discovers them automatically.

> **Speaker notes:** Don't go deep on architecture yet. This is the map they'll refer back to. Point at each layer briefly. We'll zoom into each one during demos. The MCP slide is important because it's the thread that ties everything together — every pattern connects through MCP or the same APIM endpoints behind it.

---

### ACT 2: THE SPECTRUM — DEMO EACH PATTERN (30 min)

#### [12:00–18:00] Pattern 1: No-Code — Copilot Studio (DEMO + SLIDES)

**Slide 7: Copilot Studio + MCP**
- What it is: Low-code/no-code agent builder in the Power Platform
- Key fact: auto-discovers all 14 tools from the MCP endpoint. Zero schema mapping. Zero custom connectors.
- Who it's for: Citizen developers, Power Platform teams, rapid prototyping
- MCP is GA in Copilot Studio (May 2025)

**Demo 2: Copilot Studio**
1. Click **Copilot Studio** panel (star icon)
2. Type: *"Show me properties owned by GEENA LLC"*
3. While waiting, narrate: "I pointed Copilot Studio at one URL — the MCP endpoint — and it found all 14 tools. No connector. No schema mapping. No code."
4. Show the response

**Slide 8: What Copilot Studio Controls**
- Microsoft manages: the model, the orchestration loop, the safety filters, the context window
- You don't pick the model. You don't control loop depth. You don't see raw tool output.
- Trade-off: **simplicity vs. control**

> **Speaker notes:** "This is the most accessible option on the spectrum. A Power Platform admin could set this up in 30 minutes. But you're trading control for simplicity. You don't know which model it's using. You can't tune how many tool calls it makes. You can't see the raw data coming back from the tools. That's not bad — it's a deliberate choice. And for many use cases, it's the right one."

---

#### [18:00–20:00] Pattern 2: No-Code — M365 Copilot Declarative Agent (SLIDES)

**Slide 9: M365 Copilot — Zero New Infrastructure**
- 3 JSON files + 2 icons = an agent in Teams, Outlook, and Edge
- `manifest.json` (Teams app), `declarativeAgent.json` (instructions + conversation starters), `ai-plugin.json` (RemoteMCPServer runtime → our `/mcp` endpoint)
- Same endpoint as Copilot Studio. Same 14 tools. Zero code.
- Deployed via Teams App Toolkit CLI: `teamsapp install --file-path philly-investigator.zip`

**Slide 10: Why This Matters for Government**
- Agents distributed through Teams — users are already there
- Enterprise compliance: Entra ID, DLP policies, audit logs — all built in
- Data stays in your Azure subscription — the MCP server is behind your VNet
- No new apps to install, no new URLs to remember

> **Speaker notes:** "For SLG customers, this is huge. Your users don't install anything new. The agent shows up in Teams, right next to their email and calendar. All governed by existing M365 policies. The data never leaves your Azure subscription. And the implementation is three JSON files. I showed this to a colleague and they didn't believe me until I showed them the manifest."

---

#### [20:00–27:00] Pattern 3: Pro-Code (Managed) — Foundry Portal (DEMO + SLIDES)

**Slide 11: Azure AI Foundry — "Azure Manages the Loop"**
- Assistants API: you define tools, Azure manages threads, runs, and tool-calling
- Threads persist server-side — conversation memory without managing it yourself
- GPT-4.1 fixed in our implementation (but you can configure it)
- Azure handles: thread truncation, tool dispatch, run polling

**Demo 3: Foundry Portal**
1. Click **Foundry Portal** (building icon)
2. Type the SAME question: *"Show me properties owned by GEENA LLC"*
3. Compare the response to Copilot Studio — likely different structure, depth, or detail
4. Narrate: "Same question, same tools, same data. Different answer."

**Slide 12: Context Windows — The Big Insight** ⭐

This is the slide that teaches the most important concept in the talk:

- **What is a context window?** The model's working memory. Everything it can "see" at once — the system prompt, tool definitions, conversation history, and tool results.
- **Investigative Agent:** We send the full conversation history every request. The window fills up as the conversation grows. Our code manages it.
- **Foundry Portal:** Azure manages the thread. It decides what to keep, what to summarize, when to truncate.
- **Copilot Studio:** Microsoft manages it. You don't even see the window.
- **SK Triage:** Each specialist gets a fresh window with only its tools. The triage agent's window stays small.

> **Speaker notes:** "This was the single biggest learning from building this project. The same model, the same tools, the same data — but how the context window is managed completely changes the results. When you ask a follow-up question, does the agent remember your first question? How much of the tool output does it keep? Can it still reason clearly after 6 rounds of tool calls, or has it filled its window with data and lost the ability to think? This is invisible to most users, but it's the most important factor in answer quality. And each pattern on the spectrum handles it differently."

---

#### [27:00–34:00] Pattern 4: Pro-Code (Full Control) — Investigative Agent (DEMO + SLIDES)

**Slide 13: Chat Completions + Tools — "You Run the Loop"**
- TypeScript code manages the entire agentic loop (`chat.ts`)
- You pick the model (6 deployed: GPT-4.1, GPT-5, GPT-5 Mini, o4-mini, o3-mini, Phi-4)
- You see full tool outputs. You control max rounds (10). You write the system prompt.
- This is maximum control.

**Demo 4: Model Comparison**
1. In the **Investigative Agent**, select **GPT-5** from dropdown
2. Type: *"Show me properties owned by GEENA LLC"*
3. Watch the tool calls appear in real-time. Note what it decides to look up.
4. Clear the conversation
5. Switch to **Phi-4** (Microsoft's small language model)
6. Type the same question
7. Compare: GPT-5 likely goes deeper (may look up violations, transfers). Phi-4 is faster but shallower.

**Slide 14: The Agentic Loop**
```
User asks question
    → Model reads system prompt + tools + history
    → Model decides: which tool(s) to call?
    → Tools return data
    → Model synthesizes (or decides to call more tools)
    → Repeat up to 10 rounds
    → Final answer to user
```
- "The model is the decision-maker. The tools are the hands. The context window is the memory."

> **Speaker notes:** "Watch the tool calls when GPT-5 runs vs. Phi-4. GPT-5 might decide to look up violations after finding the properties. It might search for transfers to see if properties were flipped. Phi-4 might just return the property list and call it done. Same prompt, same tools — but different intelligence deciding what to do next. This is why model selection matters. And on the pro-code side of the spectrum, YOU make that choice."

---

#### [34:00–42:00] Pattern 5: Pro-Code (Multi-Agent) — Semantic Kernel (DEMO + SLIDES)

**Slide 15: Semantic Kernel — "A Team of Specialists"**
- 4 agents: **Triage** routes to **OwnerAnalyst**, **ViolationAnalyst**, **AreaAnalyst**
- C#/.NET 8 — the enterprise pro-code path
- Each specialist has 3-5 tools (not all 14)
- Triage reads the question, picks the right specialist
- This is the agent equivalent of microservices

**Demo 5: Triage**
1. Click **Triage** (brain icon)
2. Type: *"What's happening in zip code 19134?"*
3. Watch it route to AreaAnalyst
4. Show the response — zip-level stats, violation counts, business licenses

**Slide 16: Why Multi-Agent?**
- **Smaller context windows per specialist = more focused responses.** Each specialist's system prompt is tuned to its domain. No wasted tokens on irrelevant tool definitions.
- **Triage prevents tool overload.** 14 tools is a lot for one model to reason about. Give it 3 and it can focus.
- **Counterintuitive insight:** Sometimes giving a model *fewer* tools makes it *smarter*.

> **Speaker notes:** "Here's the counterintuitive thing about multi-agent systems. You'd think more tools = more capable. But in practice, when a model has 14 tools, it spends tokens reasoning about which to use. When a specialist has 3 tools, it goes straight to work. The triage agent is cheap — it just reads the question and picks a specialist. The specialist is focused — it knows exactly what to do. This is the same pattern you'd use in a large enterprise: don't build one super-agent, build a team."

---

### ACT 3: THE INSIGHTS (12 min)

#### [42:00–47:00] The Comparison (SLIDES)

**Slide 17: Same Question, Different Answers**
- Side-by-side screenshots of "Show me properties owned by GEENA LLC" across all 4 panels
- For each: number of tool calls, depth of investigation, what it found, what it missed

**Slide 18: Why the Differences?**

| Factor | Copilot Studio | Foundry Portal | Investigative Agent | SK Triage |
|--------|---------------|----------------|---------------------|-----------|
| **Who picks tools** | Microsoft | Azure (Assistants) | The LLM (your loop) | Specialist agents |
| **Who runs the loop** | Microsoft | Azure | Your code | Semantic Kernel |
| **Model** | Platform default | GPT-4.1 | User picks (6) | GPT-4.1 |
| **Context management** | Platform | Server-side threads | Client sends history | Per-specialist |
| **Tool output size** | Unknown | Truncated ~200KB | Full | Varies by plugin |
| **Max tool rounds** | Platform decides | Azure decides | 10 (configurable) | Per-specialist |

> **Speaker notes:** "This table is the single most important slide in this talk. Every row is a decision someone made — either you, or the platform. The more you move right on the spectrum, the more of these decisions you make yourself. That's not better or worse — it's a trade-off between control and simplicity. The important thing is knowing these decisions exist, so you can make them intentionally instead of by accident."

---

#### [47:00–50:00] Context Windows Deep Dive (SLIDES)

**Slide 19: What Fits in the Window?**
- GPT-4.1: 128K token window (~96K words). Sounds huge. But:
  - System prompt: ~500 tokens
  - 14 tool definitions: ~3,000 tokens
  - Each tool result: 500–5,000 tokens
  - Conversation history: grows with every exchange
  - After 5-6 rounds of tool calls → 30-40K tokens consumed just on tool results
  - The model's "thinking space" shrinks with every round

**Slide 20: Managing the Window — Your Options**
1. **Let the platform manage it** — Copilot Studio, M365 Copilot (simplest, least control)
2. **Let Azure manage it** — Assistants API with automatic thread management (middle ground)
3. **Manage it yourself** — Send history, truncate outputs, limit rounds (full control)
4. **Split it up** — Multi-agent, each specialist gets a fresh window (most sophisticated)

> **Speaker notes:** "This is why the Foundry Portal truncates tool output at 200KB. This is why the SK agent gives each specialist only 3-5 tools. This is why longer conversations sometimes get *worse* answers — the model is running out of room to think. Four options for managing context. All valid. Know which one you're using and why. If you remember nothing else from this talk, remember this: **the context window is the hidden variable that determines whether your agent gives a great answer or a mediocre one.**"

---

#### [50:00–54:00] The Power Platform Angle (SLIDES)

**Slide 21: Where Power Platform Fits**
- **Copilot Studio:** Your first agent in 30 minutes. Point at an MCP endpoint, done.
- **M365 Copilot:** Distribute agents to every user via Teams. 3 JSON files.
- **Power Automate:** Trigger flows from agent outputs (future — "when this LLC gets 10+ violations, email the inspector")
- **Power Apps:** Build a custom UI over the same APIM backend (future — inspector mobile app)
- **Power Pages:** Public-facing portal for citizens (future — "look up your property's violation history")

> **Speaker notes:** "Power Platform isn't just one tool. It's the on-ramp. Start with Copilot Studio — no code. Add an M365 declarative agent — still no code. Then when you need more control, step into Foundry, then Functions, then Semantic Kernel. The backend doesn't change. You just change who's driving. And the beautiful thing is: you can have ALL of these running simultaneously. Same 14 tools. Same 34M rows. Different front doors for different users."

**Slide 22: The Decision Framework**

| Need | Option |
|------|--------|
| Agent in Teams, fast | M365 Copilot declarative agent |
| Quick prototype, no code | Copilot Studio + MCP |
| Thread persistence, managed | Assistants API (Foundry) |
| Model selection, full control | Chat Completions + your code |
| Specialist routing | Semantic Kernel multi-agent |

> **Speaker notes:** "Print this slide. When someone asks 'how should we build an agent?' — start here. The answer is always 'it depends.' But now you know what it depends ON."

---

### ACT 4: CLOSE (6 min)

#### [54:00–57:00] What This Costs (SLIDES)

**Slide 23: Cost Model**
- Everything scales to zero: **~$33/month idle**
  - Azure SQL Serverless: auto-pauses after 60 min. $0 when paused.
  - Azure Functions Flex Consumption: $0 when idle. Pay per execution.
  - APIM Consumption: Free tier, 1M calls/month.
  - Container Apps: Scale to zero. $0 when no requests.
  - Private Endpoints (x4): ~$29/month (the main cost — VNet security)
  - Static Web App: Free tier.
- "Thirty-three dollars a month for 34 million rows, 14 endpoints, 7 agent patterns, and 6 AI models."

> **Speaker notes:** "This always gets a reaction. The secret is consumption pricing — you only pay when someone's actually asking questions. The SQL database literally pauses itself after an hour of inactivity. The Functions scale to zero. The Container Apps scale to zero. The only thing that costs money 24/7 is the private endpoints that keep the network secure. For a government customer running a pilot or proof of concept, this is transformative. You're not committing to $10K/month infrastructure — you're committing to thirty-three dollars."

---

#### [57:00–59:00] Key Takeaways (SLIDES)

**Slide 24: Three Things to Remember**

1. **Context windows are invisible but decisive.** Same model + same tools + different context management = different answers. Know how your platform manages context.

2. **The spectrum is the strategy.** No-code for speed, pro-code for control. Both hit the same backend. Start left, move right as you need to.

3. **You don't need to know how to build all of these. You need to know they exist.** When a customer asks "can we build an agent that...?" — your answer should be "yes, and here are your options."

---

#### [59:00–60:00] Resources + Q&A (SLIDES)

**Slide 25: Try It Yourself**
- Live SPA: `https://kind-forest-06c4d3c0f.1.azurestaticapps.net/`
- GitHub: `github.com/pogorman/mcp-apim`
- MCP Spec: `modelcontextprotocol.io`
- "I'll stay for questions. The SPA is live — try it yourself."

---

## Demo Scripts — Exact Steps

### Pre-Session Checklist (5 min before)
- [ ] Open the SPA in a browser tab, sign in
- [ ] Send any query in MCP Tool Tester to wake up SQL (avoids 60s cold start during demo)
- [ ] Verify Copilot Studio widget loads
- [ ] Verify Triage panel connects
- [ ] Have backup screenshots ready (in case of network issues)

### Demo 1: Opening Hook (3:00–5:00)
1. Open SPA → Click **Investigative Agent**
2. Type: *"Who are the top 5 worst property owners by code violations?"*
3. Wait ~5s (SQL should be warm from pre-check)
4. Scroll to show the Leaflet.js map with property pins
5. Highlight: Philadelphia Land Bank (city entity, most violations) or GEENA LLC (330+ properties)

### Demo 2: Copilot Studio (12:00–18:00)
1. Click **Copilot Studio** (star icon)
2. Type: *"Show me properties owned by GEENA LLC"*
3. Narrate while waiting: "One URL. Zero connectors. Zero code."
4. Show the response — note what's different from Demo 1

### Demo 3: Foundry Portal (20:00–27:00)
1. Click **Foundry Portal** (building icon)
2. Type: *"Show me properties owned by GEENA LLC"*
3. Compare: different depth, structure, detail
4. Key narration: "Same question, same data, different answer."

### Demo 4: Model Comparison (27:00–34:00)
1. Click **Investigative Agent**
2. Select **GPT-5** from dropdown → Type: *"Show me properties owned by GEENA LLC"*
3. Note tool calls (what it decided to look up beyond the initial search)
4. Clear conversation → Switch to **Phi-4**
5. Type same question → Compare speed and depth

### Demo 5: Triage (34:00–42:00)
1. Click **Triage** (brain icon)
2. Type: *"What's happening in zip code 19134?"*
3. Narrate: "Watch it route to the AreaAnalyst specialist"
4. Show response — zip stats, violations, businesses, transfers

### Demo 6: Architecture Diagram (Optional — if time)
1. Click **Architecture** (grid icon)
2. Hover over nodes → connections highlight, others dim
3. Click **MCP Server** → detail panel slides in
4. Narrate: "Every one of those clients on the left goes through this single node"

---

## Backup Plans

| Problem | Solution |
|---------|----------|
| SQL cold start (60s) | Hit MCP Tool Tester 5 min before session to warm it up |
| Copilot Studio down/slow | Skip to Foundry Portal — the key point still works with any 2 panels |
| Triage container cold | Hit health check (`/healthz`) during pre-check |
| Network issues | Have screenshot slides for each demo result as fallback |
| Demo runs long | Cut Demo 4 (model comparison) — it's impressive but not essential |
| Demo runs short | Show Architecture diagram interactively, or run a bonus query |

---

## Transition Language

These are the key phrases that connect sections back to the thesis:

- After Copilot Studio: *"That's the leftmost option on the spectrum. No code. Full simplicity. Now let's move right."*
- After M365 Copilot slide: *"Still no code. Three JSON files. But it's a different option — enterprise distribution through Teams."*
- After Foundry Portal: *"We've moved to the middle of the spectrum. Azure manages the loop, but we define the tools. More control, more responsibility."*
- After Investigative Agent: *"Full right side of the spectrum. We run the loop. We pick the model. We see everything. Maximum control."*
- After SK Triage: *"This is beyond the spectrum — it's a team of specialists. Each one is a pro-code agent, but they work together."*
- Before closing: *"We just walked through five options. Same 14 tools. Same 34 million rows. Five different answers. You don't need to master all five. You need to know they exist."*

---

*Created: Session 27 (2026-02-18). Based on the Philly Poverty Profiteering platform — 11 public datasets, 34M rows, 14 MCP tools, 7 agent patterns, ~$33/month.*
