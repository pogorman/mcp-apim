# M365 Copilot Declarative Agent

A Microsoft 365 Copilot declarative agent that connects to our MCP server, giving M365 Copilot access to all 12 Philadelphia property investigation tools. This is the simplest integration path in the entire project — 3 JSON files and 2 icons, zero custom code, zero new infrastructure.

## Was It Really That Simple?

**Yes.** The entire agent is 3 JSON files:

1. **`manifest.json`** — Teams app manifest (v1.25). Identifies the app, points to the declarative agent definition.
2. **`declarativeAgent.json`** — Instructions, 6 conversation starters, and a reference to the plugin.
3. **`ai-plugin.json`** — Declares a `RemoteMCPServer` runtime pointing to our existing MCP endpoint URL. Lists all 12 tool schemas.

That's it. No backend code. No new Azure resources. No new deployments. The `RemoteMCPServer` runtime type tells M365 Copilot to connect directly to our existing Container App's `/mcp` endpoint — the same one Copilot Studio already uses. M365 Copilot discovers and invokes all 12 tools via the MCP protocol automatically.

The total effort was: write the 3 JSON files, generate placeholder icons, zip them, and run `teamsapp install`. The hardest part was getting the validation right (field length limits, required `run_for_functions` array).

## How It Differs from Copilot Studio

| | M365 Copilot Declarative Agent | Copilot Studio Agent |
|---|---|---|
| **What it is** | A manifest-only agent sideloaded as a Teams app | A full agent built in the Copilot Studio low-code designer |
| **Where it runs** | Inside M365 Copilot (Teams, Outlook, Edge) | As an embedded widget or standalone bot |
| **Code required** | Zero — just JSON manifests | Zero (low-code), but you configure in the Studio UI |
| **MCP connection** | `RemoteMCPServer` runtime in `ai-plugin.json` | MCP connector configured in Studio's UI |
| **AI model** | Microsoft's M365 Copilot orchestration model (you don't choose) | Microsoft's generative orchestration (you don't choose) |
| **Distribution** | Sideload or publish via Teams Admin Center | Publish via Copilot Studio |
| **Our approach** | Manifest files in `m365-agent/` | Point-and-click in Studio portal |

Both connect to the same `/mcp` endpoint on our Container App. Both auto-discover all 12 tools. The key difference: the declarative agent lives _inside_ M365 Copilot alongside your enterprise data (emails, files, calendar), while Copilot Studio is a standalone agent platform.

## Architecture

```
M365 Copilot (Teams / Outlook / Edge)
    └→ Declarative Agent (ai-plugin.json)
        └→ RemoteMCPServer runtime
            └→ Container App /mcp (Streamable HTTP)
                └→ APIM → Functions → SQL (29M rows)
```

No new infrastructure. Reuses the exact same MCP endpoint that Copilot Studio and Azure AI Foundry connect to.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Teams app manifest (v1.25) — app identity, icons, agent reference |
| `declarativeAgent.json` | Agent definition (v1.6) — instructions, 6 conversation starters, actions |
| `ai-plugin.json` | Plugin definition (v2.4) — RemoteMCPServer runtime + 12 tool schemas |
| `color.png` | 192x192 color icon (placeholder — replace with proper branding) |
| `outline.png` | 32x32 outline icon (placeholder — replace with proper branding) |

## How We Built and Deployed It

### Tools Used

| Tool | Version | Purpose |
|------|---------|---------|
| **M365 Agents Toolkit CLI** (`teamsapp`) | `@microsoft/m365agentstoolkit-cli@1.1.4` | Sideload the app package to M365 |
| **Node.js** | 18+ | Generate placeholder icons, create zip |
| **Python** | 3.x | Generate GUID for app ID (`uuid.uuid4()`) |

The M365 Agents Toolkit CLI (formerly Teams Toolkit CLI) is installed globally via npm:
```bash
npm install -g @microsoft/m365agentstoolkit-cli
```

### Step-by-Step Build

**1. Write the manifests** (the 3 JSON files described above). The key insight is the `RemoteMCPServer` runtime type in `ai-plugin.json`:

```json
{
  "runtimes": [{
    "type": "RemoteMCPServer",
    "spec": {
      "url": "https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/mcp"
    },
    "auth": { "type": "None" },
    "run_for_functions": ["search_entities", "get_entity_network", ...]
  }]
}
```

**2. Generate app ID and icons:**
```bash
# GUID for manifest.json
python -c "import uuid; print(uuid.uuid4())"

# Placeholder icons were generated with Node.js (minimal valid PNGs)
```

**3. Create the zip package:**
```bash
cd m365-agent
# Node.js script creates a standard ZIP (PowerShell's Compress-Archive had compatibility issues)
node -e "..." # see deploy script below
```

> **Note:** PowerShell's `Compress-Archive` produces zips that the Teams Developer Portal rejects with "Provided add-in package was not understood." Use Node.js, 7-Zip, or `ZipFile.CreateFromDirectory` instead.

**4. Deploy with teamsapp CLI:**
```bash
teamsapp install --file-path philly-investigator.zip -i false
```

This opens a browser for M365 auth, then sideloads the app directly. Output:
```
TitleId: T_1179e3d7-033e-8784-6e25-caf4c0bbed61
AppId: cadbec7e-cd67-4635-b60d-4f8d1a6b04fc
```

**5. Use in M365 Copilot:**
- Open https://m365.cloud.microsoft/chat
- Click the agent picker (@)
- Select "Philly Investigator"
- Conversation starters appear automatically

### Validation Errors We Hit

During deployment, the M365 package service returned these errors that we fixed:

| Error | Fix |
|-------|-----|
| `name_for_human` exceeds 20 chars | Shortened to "Philly Investigator" (19 chars) |
| `description_for_human` exceeds 100 chars | Shortened description |
| `run_for_functions` has 0 items (min 1 required) | Added array of all 12 function names to the runtime |
| `description.short` exceeds 80 chars | Shortened manifest short description |
| Teams Developer Portal: "add-in package not understood" | PowerShell zip format issue — switched to Node.js zip creation |

## Prerequisites

- **Microsoft 365 Copilot license** (required to see the agent picker)
- **Sideloading enabled** in your tenant (Teams Admin Center → Setup policies → "Upload custom apps" = On)
- **M365 Agents Toolkit CLI** installed: `npm install -g @microsoft/m365agentstoolkit-cli`
- **MCP server running** — hit the warm-up button in the SPA or `curl https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io/healthz`

## Redeploying After Changes

If you modify the manifest files:

```bash
cd m365-agent

# Bump version in manifest.json (e.g., "1.0.0" → "1.0.1")

# Rebuild zip (Node.js for reliable format)
node -e "
const fs=require('fs');
// ... (zip creation script)
"

# Reinstall
teamsapp install --file-path philly-investigator.zip -i false
```

## Limitations (Public Preview)

- MCP in declarative agents is in **public preview** (announced Ignite Nov 2025)
- Integer parameters must be declared as strings in `ai-plugin.json` (our schemas already do this)
- `params` object in `run_query` is omitted (nested objects may fail validation)
- One declarative agent per app package
- The M365 Copilot orchestration model decides which tools to call — you can't control it directly
- Cold start: if the Container App has scaled to zero, the first tool call will take 30-60s

## Customizing Icons

Replace `color.png` (192x192) and `outline.png` (32x32) with proper branded icons. The current ones are simple placeholder circles. Teams requires:
- `color.png`: 192x192 pixels, full color, used in Teams app catalog
- `outline.png`: 32x32 pixels, white on transparent background, used in the activity bar
