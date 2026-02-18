# M365 Copilot Declarative Agent

A Microsoft 365 Copilot declarative agent that connects to our MCP server, giving M365 Copilot access to all 12 Philadelphia property investigation tools.

## Prerequisites

- Microsoft 365 Copilot license
- Teams Admin access (to sideload or publish)
- Teams Toolkit for VS Code (recommended) or Teams Developer Portal

## How It Works

```
M365 Copilot (Teams / Outlook / Edge)
    └→ Declarative Agent (ai-plugin.json)
        └→ RemoteMCPServer runtime
            └→ Container App /mcp (Streamable HTTP)
                └→ APIM → Functions → SQL
```

The `ai-plugin.json` uses the `RemoteMCPServer` runtime type, which tells Copilot to connect to our MCP endpoint via Streamable HTTP. Copilot discovers and invokes all 12 tools automatically.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Teams app manifest (v1.25) — app identity, icons, agent reference |
| `declarativeAgent.json` | Agent definition (v1.6) — instructions, conversation starters, actions |
| `ai-plugin.json` | Plugin definition (v2.4) — RemoteMCPServer runtime + tool schemas |
| `color.png` | 192x192 color icon (placeholder) |
| `outline.png` | 32x32 outline icon (placeholder) |

## Setup

### 1. Generate an App ID

Replace `{{APP_ID}}` in `manifest.json` with a new GUID. Generate one:

```bash
python -c "import uuid; print(uuid.uuid4())"
# or
uuidgen
```

### 2. Package the App

Zip all files in this directory into a `.zip`:

```bash
cd m365-agent
zip philly-investigator.zip manifest.json declarativeAgent.json ai-plugin.json color.png outline.png
```

### 3. Sideload in Teams

**Option A: Teams Toolkit (recommended)**
1. Open this folder in VS Code with Teams Toolkit installed
2. Select "Upload a custom app" from the toolkit
3. Choose the zip file

**Option B: Teams Developer Portal**
1. Go to https://dev.teams.microsoft.com/apps
2. Click "Import app" and upload the zip
3. Publish to your org or sideload for testing

**Option C: Teams Admin Center**
1. Go to https://admin.teams.microsoft.com
2. Teams apps → Manage apps → Upload new app
3. Upload the zip

### 4. Use in M365 Copilot

Once installed, open M365 Copilot in Teams, Outlook, or Edge and look for "Philly Investigator" in the agent picker. The conversation starters will appear automatically.

## Limitations (Public Preview)

- MCP in declarative agents is in **public preview** as of late 2025
- Integer parameters are sent as strings (our tool definitions already handle this)
- `params` object in `run_query` is omitted (nested objects may fail validation)
- Max 10 actions per plugin (we have 12 tools — all included but Copilot may only surface 10)
- One declarative agent per app package

## Customizing Icons

Replace `color.png` (192x192) and `outline.png` (32x32) with proper branded icons. The current ones are simple placeholders.
