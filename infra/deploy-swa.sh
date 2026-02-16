#!/bin/bash
set -euo pipefail

# ============================================================
# Philly Poverty Profiteering - SWA Deployment
# ============================================================
# Copies docs and notebooks into web/ for static serving,
# then deploys to Azure Static Web Apps.
#
# Usage: bash infra/deploy-swa.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

WEB_DIR="$PROJECT_ROOT/web"
DOCS_DEST="$WEB_DIR/docs"
NB_DEST="$WEB_DIR/notebooks"
IMG_DEST="$WEB_DIR/images"

echo "=== Cleaning previous copies ==="
rm -rf "$DOCS_DEST" "$NB_DEST" "$IMG_DEST"

echo "=== Copying documentation ==="
mkdir -p "$DOCS_DEST"
cp "$PROJECT_ROOT/docs/"*.md "$DOCS_DEST/"
cp "$PROJECT_ROOT/README.md" "$DOCS_DEST/"

echo "=== Copying notebooks ==="
mkdir -p "$NB_DEST"
cp "$PROJECT_ROOT/jupyter-notebooks/"*.ipynb "$NB_DEST/"

echo "=== Copying images ==="
mkdir -p "$IMG_DEST"
cp "$PROJECT_ROOT/images/"* "$IMG_DEST/" 2>/dev/null || true

echo "=== Files staged ==="
ls -la "$DOCS_DEST"
echo ""
ls -la "$NB_DEST"
echo ""
ls -la "$IMG_DEST"

echo ""
echo "=== Deploying to Azure Static Web Apps ==="
cd "$PROJECT_ROOT"
npx @azure/static-web-apps-cli deploy web --app-name philly-profiteering-spa --env production

echo "=== Cleaning up copied files ==="
rm -rf "$DOCS_DEST" "$NB_DEST" "$IMG_DEST"

echo "=== Done ==="
