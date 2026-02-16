# FAQ

Questions and answers that came up while building and managing this project.

---

## Table of Contents

- [Architecture & Design](#architecture--design)
- [Azure Foundry & MCAPS](#azure-foundry--mcaps)
- [Model Deployments](#model-deployments)
- [Tokens, Context & Model Behavior](#tokens-context--model-behavior)
- [Infrastructure & Costs](#infrastructure--costs)
- [Agent Patterns: Tools vs Platform Agents vs Frameworks](#agent-patterns-tools-vs-platform-agents-vs-frameworks)
- [Development & Deployment](#development--deployment)

---

## Architecture & Design

### What is the "Investigative Agent" in the SPA if there's no agent in Azure?

The SPA's Investigative Agent is **custom code**, not an Azure Foundry Agent. It's implemented in `mcp-server/src/chat.ts` using the Azure OpenAI **Chat Completions API** (`chat.completions.create()`). The code:

1. Sends the user's message + 12 tool definitions to a model (e.g., GPT-4.1)
2. If the model returns tool calls, executes them against APIM → Functions → SQL
3. Feeds the results back to the model
4. Repeats up to 10 rounds until the model returns a text response

There's no persistent agent resource in Azure for the Investigative Agent — it's a stateless function that rebuilds context from scratch each request. The conversation history is maintained client-side in the browser and sent with each message.

The **City Portal** panel, by contrast, uses a real **Foundry Agent** (Assistants API): a persistent assistant (`philly-investigator`, ID `asst_CiN7zyMnsQxEcgG5JdTRXOpZ`) stored in Azure with a name, instructions, and tool configurations. It creates threads (conversations) and runs, and Azure manages the tool-calling loop with GPT-4.1. Both patterns use the same 12 tools and APIM backend.

```
What we built (Chat Completions):          What a Foundry Agent is (Assistants):
┌──────────────────────────────┐           ┌──────────────────────────────┐
│ Browser sends message        │           │ Client sends message         │
│ chat.ts builds prompt        │           │ Azure loads stored agent     │
│ chat.ts defines 12 tools     │           │ Agent has pre-configured     │
│ chat.ts runs the loop        │           │   tools + instructions       │
│ chat.ts calls APIM per tool  │           │ Azure runs the loop          │
│ chat.ts returns final answer │           │ Azure stores conversation    │
│                              │           │                              │
│ Nothing stored in Azure      │           │ Agent + threads persist      │
│ Stateless per request        │           │ Stateful across sessions     │
└──────────────────────────────┘           └──────────────────────────────┘
```

Both approaches use the same models and produce similar results.

### Why are there two resource groups?

**`rg-philly-profiteering`** (East US 2) was purpose-built for this project. It contains the entire data pipeline: SQL, Functions, APIM, Container App, Static Web App, etc.

**`rg-foundry`** (East US) existed before this project — it was originally created for other AI/Foundry work. Our project uses some resources in it (the AI Services account with model deployments, the Foundry Hub and Project) but not all. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full inventory with "used by this project" flags.

### Why isn't the AI Services account in rg-philly-profiteering?

The AI Services account `foundry-og-agents` was created in `rg-foundry` before this project started. Rather than create a new one (which would mean redeploying models and re-assigning roles), we reused the existing one. The Container App in `rg-philly-profiteering` has a cross-resource-group role assignment ("Cognitive Services OpenAI User") to access it.

---

## Azure Foundry & MCAPS

### Why can't I open the Foundry project in the Azure portal?

The MCAPS corporate policy `AIFoundryHub_PublicNetwork_Modify` (assigned at the management group level via `MCAPSGovDeployPolicies`) automatically forces `publicNetworkAccess = Disabled` on any `Microsoft.MachineLearningServices/workspaces` resource. This includes the AI Foundry Hub (`philly-ai-hub`) and its child project (`philly-profiteering`).

When you try to set it to `Enabled` via CLI, MCAPS rewrites it back to `Disabled` within seconds:

```bash
# This succeeds but gets reverted immediately
az ml workspace update --name philly-ai-hub --resource-group rg-foundry --public-network-access Enabled

# Verify — still Disabled
az ml workspace show --name philly-ai-hub --resource-group rg-foundry --query public_network_access -o tsv
# Output: Disabled
```

The policy is a **Modify** effect (not Deny), meaning it actively rewrites the property rather than blocking the update. It's applied at a management group scope above the subscription, so subscription-level admin can't override it.

### Why can I open `foundry-deployments` but not `philly-profiteering`?

They're completely different Azure resource types despite both being called "projects" in the portal:

| Project | Resource Type | Parent | Network Setting |
|---------|-------------|--------|-----------------|
| `foundry-deployments` | `Microsoft.CognitiveServices/accounts/projects` | `foundry-og-agents` (AI Services) | Inherits from AI Services — `Enabled` |
| `philly-profiteering` | `Microsoft.MachineLearningServices/workspaces` | `philly-ai-hub` (ML Hub) | Inherits from Hub — `Disabled` (MCAPS) |

The MCAPS policy targets `MachineLearningServices/workspaces` only. It has no effect on `CognitiveServices` resources. So the AI Services account and its projects are accessible, while the ML workspace-based Hub and Project are locked down.

Microsoft is converging these two patterns — the `CognitiveServices/accounts/projects` style is the newer approach.

### Is there a higher admin than subscription admin for dev tenants?

Yes. MCAPS policies are Azure Policy assignments applied at the **management group** level, which sits above individual subscriptions in Azure's hierarchy:

```
Management Group (MCAPS policies live here)
  └── Subscription (your admin access is here)
        └── Resource Group
              └── Resources
```

Even as subscription Owner, you cannot modify or exempt policies assigned at management group scope. To get an exemption, you'd need to contact whoever manages `MCAPSGovDeployPolicies` at the management group level — typically your org's cloud governance or CSEO team.

You can see the blocking policy with:

```bash
az policy state list --resource-group rg-foundry \
  --filter "contains(policyDefinitionName, 'PublicNetwork')" \
  --query "[].{policy:policyDefinitionName, assignment:policyAssignmentName, scope:policyAssignmentScope, effect:policyDefinitionAction}" -o table
```

### Does the portal lockout affect the running system?

No. The Container App talks directly to `foundry-og-agents` (AI Services account), which has `publicNetworkAccess: Enabled` and is unaffected by the policy. The Hub and Project are just the portal management layer — they're not in the data path for the SPA, chat endpoint, or MCP tools.

### What are my options for managing Foundry without the portal?

1. **CLI + REST API** — see [CLI_CHEATSHEET.md](CLI_CHEATSHEET.md) for the full set of commands. `az ml` manages the Hub/Project metadata, `az cognitiveservices` manages model deployments, and the Assistants REST API manages agents.

2. **Create a CognitiveServices-style project** instead of an ML workspace-style project. Projects under `foundry-og-agents` (e.g., `foundry-deployments`) are accessible in the portal since they're not affected by the MCAPS policy.

3. **Request a MCAPS policy exemption** for `philly-ai-hub` from the management group admins.

---

## Model Deployments

### What models are deployed and what do they cost?

All 6 models use **GlobalStandard** (pay-per-token) — $0 when idle:

| Deployment | Model | Format | Capacity (TPM) | Best For |
|-----------|-------|--------|-----------------|----------|
| gpt-4.1 | GPT-4.1 | OpenAI | 150K | Complex multi-tool investigations (default) |
| gpt-5 | GPT-5 | OpenAI | 10K | Latest flagship model |
| gpt-5-mini | GPT-5 Mini | OpenAI | 10K | Fast and capable |
| o4-mini | o4-mini | OpenAI | 10K | Reasoning model, efficient |
| o3-mini | o3-mini | OpenAI | 100K | Reasoning model, compact |
| Phi-4 | Phi-4 | Microsoft MaaS | 1 | Lightweight SLM |

Users select models via the dropdown in the SPA header. The selected model ID is passed in the `/chat` request and maps directly to the deployment name in `chat.completions.create()`.

### Why isn't GPT-5.2 available?

GPT-5.2 only offers `GlobalProvisionedManaged` SKU in our region, which is a pay-per-hour provisioned capacity model (expensive, always-on). The other models offer `GlobalStandard` (pay-per-token, $0 idle). We chose not to deploy GPT-5.2 to keep costs consumption-based.

GPT-5.2 *is* deployed on the separate `og-foundry-eus2` AI Services account in East US 2, but that account is not used by this project.

### How does model selection work end-to-end?

1. **SPA loads** → fetches `GET /models` → populates dropdown with available models
2. **User selects model** → stored in `state.chat.model`
3. **User sends message** → `POST /chat` body includes `{ model: "gpt-5" }`
4. **`chat.ts` validates** → checks if `model` is in `AVAILABLE_MODELS` list, falls back to `gpt-4.1` if invalid
5. **OpenAI SDK call** → `chat.completions.create({ model: "gpt-5", ... })` — the `model` parameter maps to the Azure deployment name

---

## Tokens, Context & Model Behavior

### What are tokens and why do they matter?

Tokens are the unit of measurement for AI models. A token is roughly 3/4 of a word — "Philadelphia" is 4 tokens, "LLC" is 1 token. Everything the model reads (your question, the system prompt, tool definitions, tool results) and writes (the response) is counted in tokens. You pay per token consumed.

This matters for cost and performance:
- **GPT-4.1**: ~$2/million input tokens, ~$8/million output tokens
- **GPT-5**: ~$10/million input tokens, ~$30/million output tokens
- **Phi-4**: Cheapest (Microsoft's small language model)

A typical question that chains 3 tool calls might use 5,000-15,000 tokens total. At GPT-4.1 prices, that's about $0.01-0.05 per question.

### What is a context window?

The context window is how much text the AI can "see" at once — its working memory. For GPT-4.1, it's ~128,000 tokens (~96,000 words). Everything needs to fit in this window:

1. **System prompt** (~500 tokens) — tells the model who it is and how to behave
2. **12 tool definitions** (~3,000 tokens) — descriptions of every tool the model can call
3. **Conversation history** — grows with each exchange
4. **Tool results** — database query results can be large (thousands of tokens per call)

After a long conversation with many tool calls, you can approach the limit. That's why fresh conversations sometimes give better results than long threads — the model has more room to think.

### What is temperature and how does it affect responses?

Temperature controls randomness in the model's output. It's a number from 0 to 2:

- **0**: Deterministic — always picks the most likely next word. Same input = same output.
- **0.7-1.0**: Balanced — mostly predictable with some variety. Good for investigations.
- **2.0**: Very random — can produce incoherent output.

In our system:
- The **Investigative Agent** uses the model's default temperature (~1.0)
- The **City Portal** uses the assistant's default temperature (1.0)
- **Reasoning models** (o4-mini, o3-mini) ignore temperature entirely — they always reason deterministically

This is why you can ask the same question twice and get differently worded answers. The underlying data is the same, but the model phrases its analysis differently each time.

### What are reasoning models and why are they different?

Reasoning models (o4-mini, o3-mini, GPT-5) "think" internally before answering. They use hidden **reasoning tokens** — tokens you pay for but never see in the output. The model works through the problem step by step in its head, then gives you just the final answer.

Key differences from standard models:
- **Ignore temperature** — always reason deterministically
- **Require explicit `max_completion_tokens`** — without it, the model may spend its entire token budget on internal reasoning and return an empty response (this happened to our Foundry Agent with GPT-5)
- **More expensive** — you pay for both the visible output and the hidden reasoning
- **More thorough** — they tend to catch nuances that standard models miss

### Why does each panel give different answers to the same question?

Five factors combine to produce different responses:

1. **Different models**: GPT-4.1 is methodical, GPT-5 reasons deeply, o4-mini is concise, Phi-4 sometimes misses nuance. Each model has its own personality.

2. **Different context management**: The Investigative Agent sends full conversation history every time (maximum context). The City Portal lets Azure manage context — Azure may summarize or trim older messages. Copilot Studio manages its own context.

3. **Different tool output sizes**: The Investigative Agent gets full, untruncated tool results. The City Portal truncates results over 200KB (an Assistants API limit — combined tool outputs must be under 512KB). Large result sets may lose data in the City Portal.

4. **Different system prompts**: Each client has slightly different instructions. Copilot Studio adds its own system prompt on top of ours.

5. **Temperature randomness**: Even with the same model and data, the exact wording varies each time. Facts should be consistent; narrative structure will differ.

### Why did the City Portal switch from GPT-5 to GPT-4.1?

GPT-5 was initially configured as the City Portal's model (Assistants API), but we hit three issues:

1. **Empty responses**: GPT-5 is a reasoning model that requires explicit `max_completion_tokens`. Without it, the Assistants API run "completes" in 0-1 seconds with zero tool calls and no response — the model spends its entire budget on internal reasoning.

2. **Tool output limits**: The Assistants API has a 512KB combined limit on tool outputs. Some of our tools return large JSON payloads (property networks can be 2MB+). We added truncation at 200KB per tool result.

3. **Server errors**: Even after fixing the above, GPT-5 would successfully make 4 rounds of tool calls, then crash with `server_error` when generating the final response. Simple "hello" queries also failed. GPT-5 on the Assistants API was unstable.

GPT-4.1 works reliably on the Assistants API and produces excellent results. GPT-5 still works fine via the Investigative Agent (Chat Completions API) — the instability is specific to the Assistants API.

### How much does a typical question cost in tokens?

It varies by complexity:

| Question Type | Tool Calls | Approximate Tokens | GPT-4.1 Cost |
|--------------|-----------|-------------------|--------------|
| Simple lookup ("top 5 violators") | 1 | 4,000-6,000 | ~$0.01 |
| Entity investigation ("tell me about GEENA LLC") | 2-3 | 8,000-15,000 | ~$0.03 |
| Deep dive ("everything about 2837 Kensington Ave") | 4-5 | 15,000-30,000 | ~$0.05 |
| Complex comparison ("compare two zip codes") | 2-4 | 10,000-20,000 | ~$0.04 |

The biggest token consumers are tool results — a single `get_entity_network` call for an entity with 300+ properties can return 200KB of JSON. The system prompt + 12 tool definitions add ~3,500 tokens of overhead to every request.

---

## Infrastructure & Costs

### What does this cost when idle?

~$1-2/month. Every compute resource scales to zero:

- SQL Serverless auto-pauses after 60 minutes — $0 when paused
- Functions Flex Consumption — $0 when idle
- APIM Consumption — $0 when idle
- Container App — scales to 0 replicas when idle
- Azure OpenAI — pay-per-token only
- Static Web App — Free tier

The only idle costs are storage (~$1/mo for two accounts) and Container Registry Basic (~$0.17/mo).

### What's the cold start experience?

First request after idle can take 60-90 seconds due to cascading wake-ups:

1. Container App scales from 0 → 1 replica (~5-10s)
2. SQL Serverless resumes from auto-pause (~30-60s)
3. Subsequent requests are fast (milliseconds for container, normal query time for SQL)

The `requestTimeout` in `db.ts` is set to 120 seconds to accommodate this.

### What are the cleanup candidates in rg-foundry?

Three resources in `rg-foundry` are not used by this project:

| Resource | Why it's a candidate |
|----------|---------------------|
| `og-foundry-eus2` (AI Services, East US 2) | Separate account with sora, gpt-5-pro, gpt-image-1, gpt-5.2. **Note:** gpt-5-pro uses GlobalProvisionedManaged which may bill per-hour. |
| `foundry-og-agents/foundry-deployments` (Project) | Foundry project on the AI Services account, not related to this project |
| `og-foundry-eus2/claude-foundry` (Project) | Foundry project on the East US 2 account, not related to this project |

If nothing else depends on them, they can be deleted. Check `og-foundry-eus2` first since its `gpt-5-pro` deployment could be incurring costs.

### Why Azure SQL instead of Dataverse?

This project has 10 tables, ~29M rows, and 4.4GB of data. Azure SQL Serverless was the right fit for several reasons:

**Scale and performance.** The junction table `master_entity_address` alone has 15.5M rows. Queries like "find all properties linked to an entity" join across this table with aggregations over 1.6M violation records. Azure SQL handles this in seconds thanks to 25 custom nonclustered indexes tuned to our query patterns (e.g., `IX_mea_entity_id`, `IX_ci_opa`, composite `IX_assess_parcel` on `(parcel_number, year)`). Dataverse doesn't expose index management — Microsoft controls indexing internally, and analytical joins at this scale would be significantly slower.

**Storage overhead.** Dataverse adds mandatory system columns to every table (`createdon`, `modifiedon`, `createdby`, `modifiedby`, `ownerid`, `statecode`, `statuscode`, etc.). For 29M rows, this overhead is substantial. Our 4.4GB in SQL would likely require 10-15GB+ in Dataverse. Default tenant capacity is often 10GB.

**Schema flexibility.** Our `opa_properties` table has ~118 columns. Dataverse supports this but performance degrades with wide tables. We also use 3 SQL views (`vw_entity_properties`, `vw_property_violation_summary`, `vw_owner_portfolio`) for common query patterns — Dataverse has no equivalent to SQL views. These would need to be reimplemented as FetchXML queries or handled at the app layer.

**Cost.** Azure SQL Serverless auto-pauses after 60 minutes of inactivity — $0 when paused, ~$0.75/vCore-hour when active. Total idle cost is ~$0.50/month for storage. Dataverse capacity is licensed per-GB and doesn't scale to zero.

**Custom SQL.** The `run_query` tool lets the AI write and execute arbitrary SELECT queries. This is a powerful investigation tool — the model can explore the data in ways we didn't anticipate. Dataverse would require FetchXML or the Web API, which are far more constrained than SQL.

**When Dataverse would make sense.** If the goal were a Power Apps front-end with Copilot Studio integration, row-level security per user, or a transactional CRUD workflow (not analytical), Dataverse would be the better choice. It's purpose-built for the Power Platform ecosystem. Our use case — an AI agent running complex analytical queries across millions of rows — is what SQL databases are designed for.

---

## Agent Patterns: Tools vs Platform Agents vs Frameworks

### Should I build tools (like we did) or use platform agents?

It depends on your needs. The industry uses three main patterns:

**Pattern 1: Chat Completions + Tools (what we built)**
You call the model API directly, pass tool definitions inline, and write your own loop. The "agent" is your code (~80 lines in `chat.ts`).

**Pattern 2: Platform-Managed Agents (Foundry Agents, OpenAI Assistants, Bedrock Agents)**
You create a persistent agent resource with a provider, configure tools and instructions once, and the platform manages the loop and state.

**Pattern 3: Agent Frameworks (LangChain, Semantic Kernel, AutoGen, CrewAI)**
Libraries that wrap Chat Completions with orchestration features — more structure than raw API calls, more control than platform agents.

### When to use each?

| Factor | Chat Completions + Tools | Platform Agents |
|--------|-------------------------|-----------------|
| **Control** | Full — you decide retry logic, error handling, when to stop | Limited — platform decides loop behavior |
| **State** | You manage it (or go stateless like we did) | Platform stores threads, messages, files |
| **Latency** | Lower — direct API call | Higher — extra orchestration hop |
| **Cost transparency** | Clear — you see every API call | Opaque — platform may make unexpected calls |
| **Portability** | High — swap models easily | Low — tied to one platform's API |
| **Complexity** | You write the loop | Less code, more configuration |
| **Multi-turn memory** | DIY (send history each time) | Built-in (threads persist server-side) |
| **File handling** | DIY | Built-in (upload, code interpreter, retrieval) |

### What do most production systems use?

Most teams building real products today use **Pattern 1** (Chat Completions + tools):

- **Control matters.** When a tool call fails, you decide what happens — retry? Skip? Tell the user?
- **Stateless is simpler to scale.** Our `/chat` endpoint handles any request on any container replica with no shared state.
- **Model flexibility.** We swap between 6 models with a dropdown. Platform agents are often locked to one.
- **Debugging.** You can log every step of the loop. Platform agents are more of a black box.

Platform agents make more sense when:

- You need **persistent multi-turn conversations** with file uploads, code execution, or retrieval
- You're building for **non-developers** (Copilot Studio, low-code) where the loop shouldn't be hand-coded
- You want **built-in integrations** like Bing grounding, SharePoint connectors out-of-the-box

Most teams start with agent frameworks, then simplify down to raw Chat Completions (realizing the framework adds complexity without enough value) or move up to platform agents (when they need managed state and built-in integrations).

### Why did we choose Chat Completions + Tools?

Our system demonstrates all four client patterns side-by-side in the SPA:

- **Investigative Agent** (Chat Completions + Tools) — our code runs the loop in `chat.ts`. Stateless, full control, model-selectable (6 models).
- **City Portal** (Assistants API / Foundry Agent) — Azure runs the loop via `foundry-agent.ts` with GPT-4.1. Stateful threads, follow-ups remember context.
- **Copilot Studio** (MCP via Low-Code) — Microsoft Copilot Studio agent connected to the MCP endpoint. Demonstrates the low-code/no-code path. Embedded as a floating widget.
- **MCP Tool Tester** (Raw MCP Protocol) — direct tool calls, no AI in the loop.

All four use the same 12 tools hitting the same APIM → Functions → SQL backend. The shared tool definitions live in `tool-executor.ts`.

---

## Development & Deployment

### Why is there a staging directory pattern for Functions deployment?

npm workspaces hoist all packages to the root `node_modules/`. This means `functions/node_modules/` contains only symlinks, not real packages. When you zip the `functions/` directory for deployment, the zip contains broken symlinks. The staging pattern copies the function code to an isolated directory, runs a fresh `npm install`, and deploys from there.

### Why does the zip deployment use a custom PowerShell script?

PowerShell's `Compress-Archive` creates zip files with Windows backslash (`\`) path separators. The Linux-based Azure Functions host can't resolve paths like `dist\functions\searchEntities.js` — it needs forward slashes. The custom script uses `System.IO.Compression.ZipFile` and explicitly replaces `\` with `/` in entry names.

### What's the MSYS_NO_PATHCONV workaround?

Git Bash (MSYS2) automatically converts arguments that look like Unix paths. For example, `/subscriptions/abc` becomes `C:/Program Files/Git/subscriptions/abc`. This breaks `az` CLI commands that take Azure resource IDs as arguments. Prefixing with `MSYS_NO_PATHCONV=1` disables this conversion for that command.
