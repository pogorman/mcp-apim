#!/usr/bin/env bash
# Wake up all serverless resources (Container App + SQL Database)
# Run this before demos to avoid the 30-60s cold start delay.
#
# Usage: bash infra/wake.sh

set -euo pipefail

BASE="https://philly-mcp-server.victoriouspond-48a6f41b.eastus2.azurecontainerapps.io"

echo "=== Philly Poverty Profiteering — Wake-Up Script ==="
echo ""

# Step 1: Wake Container App via healthz
echo "[1/3] Waking Container App..."
start_time=$(date +%s)
status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$BASE/healthz" 2>/dev/null || echo "000")
elapsed=$(( $(date +%s) - start_time ))

if [ "$status" = "200" ]; then
  echo "      Container App is up (${elapsed}s)"
else
  echo "      WARNING: healthz returned $status (${elapsed}s) — Container App may still be starting"
fi

# Step 2: Wake SQL Database by running a lightweight query via /chat
echo "[2/3] Waking SQL Database (this takes 30-60s if auto-paused)..."
start_time=$(date +%s)
response=$(curl -s --max-time 120 -X POST "$BASE/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"How many properties are in the database? Just give me the number."}' 2>/dev/null || echo '{"error":"timeout"}')
elapsed=$(( $(date +%s) - start_time ))

if echo "$response" | grep -q '"reply"'; then
  echo "      SQL Database is up (${elapsed}s)"
  # Extract a snippet of the reply
  reply=$(echo "$response" | sed -n 's/.*"reply":"\([^"]*\).*/\1/p' | head -c 120)
  echo "      Response: $reply"
else
  echo "      WARNING: Chat endpoint did not return a reply (${elapsed}s)"
  echo "      Response: $(echo "$response" | head -c 200)"
fi

# Step 3: Verify the MCP endpoint
echo "[3/3] Verifying MCP endpoint..."
mcp_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"wake-script","version":"1.0"}}}' 2>/dev/null || echo "000")

if [ "$mcp_status" = "200" ]; then
  echo "      MCP endpoint is responding"
else
  echo "      WARNING: MCP endpoint returned $mcp_status"
fi

echo ""
echo "=== All resources warmed up. Ready for use. ==="
echo "    SPA: https://kind-forest-06c4d3c0f.1.azurestaticapps.net/"
echo ""
