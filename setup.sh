#!/bin/sh
# ============================================================================
# setup.sh — Bootstrap this project using Deno.
# Uses repo-local ./deno if present, otherwise falls back to system deno.
# No system Node.js or npm installation required.
# ============================================================================
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$REPO_ROOT/bin"
BACKEND_DIR="$REPO_ROOT/apps/backend"
BACKEND_ENV_TEMPLATE="$BACKEND_DIR/.env.template"
BACKEND_ENV_FILE="$BACKEND_DIR/.env"
STOREFRONT_DIR="$REPO_ROOT/apps/storefront"
STOREFRONT_ENV_TEMPLATE="$STOREFRONT_DIR/.env.template"
STOREFRONT_ENV_FILE="$STOREFRONT_DIR/.env.local"
PGLITE_HOST="${PGHOST:-127.0.0.1}"
PGLITE_PORT="${PGPORT:-5444}"
PGLITE_USERNAME="postgres"
PGLITE_PASSWORD="postgres"
PGLITE_MAX_CONNECTIONS="${PGLITE_MAX_CONNECTIONS:-25}"
DEFAULT_PGLITE_DATABASE_URL="postgres://$PGLITE_USERNAME:$PGLITE_PASSWORD@$PGLITE_HOST:$PGLITE_PORT/postgres"
OLD_DEFAULT_PGLITE_DATABASE_URL="postgres://postgres:@127.0.0.1:5432/postgres"
CURRENT_DEFAULT_PGLITE_DATABASE_URL_NO_PASSWORD="postgres://postgres:@$PGLITE_HOST:$PGLITE_PORT/postgres"
LEGACY_DATABASE_URL="postgres://postgres:@localhost:5432/medusa-dtc-starter"
PGLITE_PID=""

get_env_value() {
  file_path="$1"
  key="$2"

  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, "", $0); print $0; exit }' "$file_path"
}

set_env_value() {
  file_path="$1"
  key="$2"
  value="$3"
  temp_file="$file_path.tmp"

  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "$file_path" > "$temp_file"

  mv "$temp_file" "$file_path"
}

ensure_backend_env() {
  if [ -f "$BACKEND_ENV_FILE" ]; then
    echo "🧩 Reusing existing backend environment file..."
    return
  fi

  echo "🧩 Creating backend environment file..."
  cp "$BACKEND_ENV_TEMPLATE" "$BACKEND_ENV_FILE"
}

ensure_storefront_env() {
  if [ -f "$STOREFRONT_ENV_FILE" ]; then
    echo "🧩 Reusing existing storefront environment file..."
    return
  fi

  echo "🧩 Creating storefront environment file..."
  cp "$STOREFRONT_ENV_TEMPLATE" "$STOREFRONT_ENV_FILE"
}

cleanup() {
  if [ -n "$PGLITE_PID" ] && kill -0 "$PGLITE_PID" >/dev/null 2>&1; then
    echo ""
    echo "🛑 Stopping local PGlite database..."
    kill "$PGLITE_PID" >/dev/null 2>&1 || true
    wait "$PGLITE_PID" >/dev/null 2>&1 || true
  fi
}

wait_for_pglite() {
  attempts=0

  while [ "$attempts" -lt 20 ]; do
    if ! kill -0 "$PGLITE_PID" >/dev/null 2>&1; then
      echo "❌ Error: PGlite exited before it was ready."
      exit 1
    fi

    if command -v nc >/dev/null 2>&1 && nc -z "$PGLITE_HOST" "$PGLITE_PORT" >/dev/null 2>&1; then
      return 0
    fi

    attempts=$((attempts + 1))
    sleep 1
  done

  echo "❌ Error: Timed out waiting for PGlite to accept connections on port $PGLITE_PORT."
  exit 1
}

trap cleanup EXIT INT TERM

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
PATH="$BIN_DIR:$PATH" "$DENO" install --node-modules-dir=auto --allow-scripts
echo ""

# --- Set up backend environment ---
ensure_backend_env
ensure_storefront_env

DATABASE_URL="$(get_env_value "$BACKEND_ENV_FILE" "DATABASE_URL")"
USE_PGLITE=0

if [ -z "$DATABASE_URL" ] || [ "$DATABASE_URL" = "$LEGACY_DATABASE_URL" ] || [ "$DATABASE_URL" = "$OLD_DEFAULT_PGLITE_DATABASE_URL" ] || [ "$DATABASE_URL" = "$CURRENT_DEFAULT_PGLITE_DATABASE_URL_NO_PASSWORD" ]; then
  DATABASE_URL="$DEFAULT_PGLITE_DATABASE_URL"
  USE_PGLITE=1

  echo "📝 Setting backend DATABASE_URL..."
  set_env_value "$BACKEND_ENV_FILE" "DATABASE_URL" "$DATABASE_URL"
  echo "   $DATABASE_URL"
else
  echo "📝 Keeping existing backend DATABASE_URL..."
  echo "   $DATABASE_URL"

  if [ "$DATABASE_URL" = "$DEFAULT_PGLITE_DATABASE_URL" ]; then
    USE_PGLITE=1
  fi
fi
echo ""

if [ "$USE_PGLITE" -eq 1 ]; then
  echo "🗄️ Starting local PGlite database for migrations..."
  PATH="$BIN_DIR:$PATH" PGHOST="$PGLITE_HOST" PGPORT="$PGLITE_PORT" PGLITE_MAX_CONNECTIONS="$PGLITE_MAX_CONNECTIONS" "$DENO" run --allow-all "$BACKEND_DIR/scripts/start-pglite.ts" &
  PGLITE_PID=$!
  wait_for_pglite
  echo ""

  echo "🩹 Patching migration internals for local PGlite..."
  PATH="$BIN_DIR:$PATH" "$DENO" run --allow-all "$BACKEND_DIR/scripts/patch-mikro-orm-migrator.ts"
  echo ""
fi

# --- Run backend migrations ---
echo "🛠️ Running backend migrations..."
(
  cd "$BACKEND_DIR"
  PATH="$BIN_DIR:$PATH" DATABASE_URL="$DATABASE_URL" MEDUSA_SKIP_PGLITE_DB_EXISTS_CHECK="$USE_PGLITE" MEDUSA_SKIP_PGLITE_MIGRATION_LOCK="$USE_PGLITE" "$DENO" run -A npm:@medusajs/cli db:migrate
)
echo ""

echo "🔑 Syncing storefront publishable API key..."
PATH="$BIN_DIR:$PATH" DATABASE_URL="$DATABASE_URL" STOREFRONT_ENV_FILE="$STOREFRONT_ENV_FILE" "$DENO" run --allow-env --allow-net --allow-read --allow-write --allow-sys "$BACKEND_DIR/scripts/sync-storefront-publishable-key.ts"
echo ""

# --- Print usage instructions ---
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Run any of these commands from the repo root:"
echo ""
echo '  cd apps/backend && PATH=$(pwd)/../../bin:$PATH deno run --allow-all scripts/run-medusa-cli-with-db.ts user -e admin@test.com -p supersecret'
echo "  # Create an admin user"
echo ""
echo "The storefront env file is already created at apps/storefront/.env.local."
echo "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is already set from the default publishable API key."
echo "Update it manually only if you want to use a different key."
echo ""
echo "  deno task dev              # Start all apps"
echo "  deno task backend:dev      # Start backend only"
echo "  deno task storefront:dev   # Start storefront only"
echo "  deno task build            # Build all apps"
echo ""
