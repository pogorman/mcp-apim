# FAQ

Questions and answers that came up while building and managing this project.

---

## Architecture & Design

### What is the "Investigative Agent" in the SPA if there's no agent in Azure?

The SPA's Investigative Agent is **custom code**, not an Azure Foundry Agent. It's implemented in `mcp-server/src/chat.ts` using the Azure OpenAI **Chat Completions API** (`chat.completions.create()`). The code:

1. Sends the user's message + 12 tool definitions to a model (e.g., GPT-4.1)
2. If the model returns tool calls, executes them against APIM → Functions → SQL
3. Feeds the results back to the model
4. Repeats up to 10 rounds until the model returns a text response

There's no persistent agent resource in Azure — it's a stateless function that rebuilds context from scratch each request. The conversation history is maintained client-side in the browser and sent with each message.

A **Foundry Agent** (Assistants API) would be different: a persistent resource stored in Azure with a name, instructions, and tool configurations. You'd create threads (conversations) and runs, and Azure would manage the tool-calling loop. The Foundry project infrastructure was set up for this, but the running system uses the simpler Chat Completions approach.

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

Our system demonstrates all three patterns side-by-side in the SPA:

- **Investigative Agent** (Chat Completions + Tools) — our code runs the loop in `chat.ts`. Stateless, full control, model-selectable.
- **City Portal** (Assistants API / Foundry Agent) — Azure runs the loop via `foundry-agent.ts`. Stateful threads, follow-ups remember context.
- **MCP Tool Tester** (Raw MCP Protocol) — direct tool calls, no AI in the loop.

All three use the same 12 tools hitting the same APIM → Functions → SQL backend. The shared tool definitions live in `tool-executor.ts`.

---

## Development & Deployment

### Why is there a staging directory pattern for Functions deployment?

npm workspaces hoist all packages to the root `node_modules/`. This means `functions/node_modules/` contains only symlinks, not real packages. When you zip the `functions/` directory for deployment, the zip contains broken symlinks. The staging pattern copies the function code to an isolated directory, runs a fresh `npm install`, and deploys from there.

### Why does the zip deployment use a custom PowerShell script?

PowerShell's `Compress-Archive` creates zip files with Windows backslash (`\`) path separators. The Linux-based Azure Functions host can't resolve paths like `dist\functions\searchEntities.js` — it needs forward slashes. The custom script uses `System.IO.Compression.ZipFile` and explicitly replaces `\` with `/` in entry names.

### What's the MSYS_NO_PATHCONV workaround?

Git Bash (MSYS2) automatically converts arguments that look like Unix paths. For example, `/subscriptions/abc` becomes `C:/Program Files/Git/subscriptions/abc`. This breaks `az` CLI commands that take Azure resource IDs as arguments. Prefixing with `MSYS_NO_PATHCONV=1` disables this conversion for that command.
