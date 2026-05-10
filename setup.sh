#!/bin/sh
# ============================================================================
# setup.sh — Bootstrap this project using Deno.
# Uses repo-local ./deno if present, otherwise falls back to system deno.
# No system Node.js or npm installation required.
# ============================================================================
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$REPO_ROOT/bin"

# --- Resolve Deno binary ---
if [ -x "$REPO_ROOT/deno" ]; then
  DENO="$REPO_ROOT/deno"
elif command -v deno >/dev/null 2>&1; then
  DENO="$(command -v deno)"
else
  echo "❌ Error: Deno not found."
  echo "   Either place a 'deno' binary at the repo root, or install Deno:"
  echo "   curl -fsSL https://deno.land/install.sh | sh"
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Setting up project with Deno                           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

DENO_VERSION=$("$DENO" --version | head -1)
echo "✅ Using: $DENO_VERSION"
echo "   Path:  $DENO"
echo ""

# --- Ensure shim scripts are executable ---
echo "🔧 Setting up bin/ shims (deno, node, npm, npx)..."
chmod +x "$BIN_DIR/deno" "$BIN_DIR/node" "$BIN_DIR/npm" "$BIN_DIR/npx"
echo ""

# --- Install npm dependencies ---
echo "📦 Installing npm dependencies..."
"$DENO" install --node-modules-dir=auto --allow-scripts
echo ""

# --- Print usage instructions ---
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Run any of these commands from the repo root:"
echo ""
echo "  deno task dev              # Start all apps"
echo "  deno task backend:dev      # Start backend only"
echo "  deno task storefront:dev   # Start storefront only"
echo "  deno task build            # Build all apps"
echo ""
