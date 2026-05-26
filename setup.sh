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
DEFAULT_MARKETS="eu"
MARKETS="${MARKETS:-${MARKET:-$DEFAULT_MARKETS}}"
SHOP_NAME="${SHOP_NAME:-Medusa Store}"
LOGO_PATH="${LOGO_PATH:-}"
FAVICON_PATH="${FAVICON_PATH:-}"
ADMIN_USER="${ADMIN_USER:-}"
ADMIN_PASS="${ADMIN_PASS:-}"
VALID_MARKETS="us uk eu ca au"

print_usage() {
  echo "Usage: ./setup.sh [options]"
  echo ""
  echo "Options:"
  echo "  --market MARKETS      Seed one or more markets, comma-separated. Defaults to $DEFAULT_MARKETS."
  echo "  --markets MARKETS     Alias for --market."
  echo "  --shopname NAME       Set the seeded shop name and storefront/admin branding."
  echo "  --logo PATH           Copy a logo into the admin and storefront public assets."
  echo "  --favicon PATH        Copy a favicon into the admin and storefront public assets."
  echo "  --adminuser EMAIL     Create the first admin user with this email."
  echo "  --adminpass PASSWORD  Password for --adminuser."
  echo "  -h, --help            Show this help message."
  echo ""
  echo "Supported markets: $VALID_MARKETS"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --market|--markets)
      if [ "$#" -lt 2 ]; then
        echo "❌ Error: $1 requires a value."
        print_usage
        exit 1
      fi
      MARKETS="$2"
      shift 2
      ;;
    --market=*|--markets=*)
      MARKETS="${1#*=}"
      shift
      ;;
    --shopname)
      if [ "$#" -lt 2 ]; then
        echo "❌ Error: --shopname requires a value."
        print_usage
        exit 1
      fi
      SHOP_NAME="$2"
      shift 2
      ;;
    --shopname=*)
      SHOP_NAME="${1#*=}"
      shift
      ;;
    --logo)
      if [ "$#" -lt 2 ]; then
        echo "❌ Error: --logo requires a value."
        print_usage
        exit 1
      fi
      LOGO_PATH="$2"
      shift 2
      ;;
    --logo=*)
      LOGO_PATH="${1#*=}"
      shift
      ;;
    --favicon)
      if [ "$#" -lt 2 ]; then
        echo "❌ Error: --favicon requires a value."
        print_usage
        exit 1
      fi
      FAVICON_PATH="$2"
      shift 2
      ;;
    --favicon=*)
      FAVICON_PATH="${1#*=}"
      shift
      ;;
    --adminuser)
      if [ "$#" -lt 2 ]; then
        echo "❌ Error: --adminuser requires a value."
        print_usage
        exit 1
      fi
      ADMIN_USER="$2"
      shift 2
      ;;
    --adminuser=*)
      ADMIN_USER="${1#*=}"
      shift
      ;;
    --adminpass)
      if [ "$#" -lt 2 ]; then
        echo "❌ Error: --adminpass requires a value."
        print_usage
        exit 1
      fi
      ADMIN_PASS="$2"
      shift 2
      ;;
    --adminpass=*)
      ADMIN_PASS="${1#*=}"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "❌ Error: Unknown option '$1'."
      print_usage
      exit 1
      ;;
  esac
done

MARKETS="$(printf '%s' "$MARKETS" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"

if [ -z "$MARKETS" ]; then
  echo "❌ Error: --market requires at least one market."
  echo "   Expected one or more of: $VALID_MARKETS"
  exit 1
fi

NORMALIZED_MARKETS=""
OLD_IFS="$IFS"
IFS=,
for MARKET_ID in $MARKETS; do
  if [ -z "$MARKET_ID" ]; then
    continue
  fi

  case " $VALID_MARKETS " in
    *" $MARKET_ID "*)
      ;;
    *)
      IFS="$OLD_IFS"
      echo "❌ Error: Unsupported market '$MARKET_ID'."
      echo "   Expected one or more of: $VALID_MARKETS"
      exit 1
      ;;
  esac

  case ",$NORMALIZED_MARKETS," in
    *",$MARKET_ID,"*)
      ;;
    *)
      if [ -z "$NORMALIZED_MARKETS" ]; then
        NORMALIZED_MARKETS="$MARKET_ID"
      else
        NORMALIZED_MARKETS="$NORMALIZED_MARKETS,$MARKET_ID"
      fi
      ;;
  esac
done
IFS="$OLD_IFS"

if [ -z "$NORMALIZED_MARKETS" ]; then
  echo "❌ Error: --market requires at least one market."
  echo "   Expected one or more of: $VALID_MARKETS"
  exit 1
fi

MARKETS="$NORMALIZED_MARKETS"

if [ -z "$SHOP_NAME" ]; then
  echo "❌ Error: --shopname requires a non-empty value."
  exit 1
fi

if [ -n "$LOGO_PATH" ] && [ ! -f "$LOGO_PATH" ]; then
  echo "❌ Error: Logo file not found: $LOGO_PATH"
  exit 1
fi

if [ -n "$FAVICON_PATH" ] && [ ! -f "$FAVICON_PATH" ]; then
  echo "❌ Error: Favicon file not found: $FAVICON_PATH"
  exit 1
fi

if { [ -n "$ADMIN_USER" ] && [ -z "$ADMIN_PASS" ]; } || { [ -z "$ADMIN_USER" ] && [ -n "$ADMIN_PASS" ]; }; then
  echo "❌ Error: --adminuser and --adminpass must be provided together."
  exit 1
fi

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

get_asset_extension() {
  asset_name="$(basename "$1")"

  case "$asset_name" in
    *.*)
      printf '%s' "${asset_name##*.}" | tr '[:upper:]' '[:lower:]'
      ;;
    *)
      printf 'asset'
      ;;
  esac
}

copy_brand_asset() {
  source_path="$1"
  public_dir="$2"
  asset_name="$3"
  asset_extension="$(get_asset_extension "$source_path")"
  asset_public_path="/brand/$asset_name.$asset_extension"

  mkdir -p "$public_dir/brand"
  cp "$source_path" "$public_dir$asset_public_path"
  printf '%s' "$asset_public_path"
}

configure_branding() {
  echo "🎨 Configuring shop branding..."

  set_env_value "$BACKEND_ENV_FILE" "SHOP_NAME" "$SHOP_NAME"
  set_env_value "$BACKEND_ENV_FILE" "ADMIN_SHOP_NAME" "$SHOP_NAME"
  set_env_value "$BACKEND_ENV_FILE" "PLUGIN_SHOP_NAME" "$SHOP_NAME"
  set_env_value "$STOREFRONT_ENV_FILE" "NEXT_PUBLIC_SHOP_NAME" "$SHOP_NAME"

  if [ -n "$LOGO_PATH" ]; then
    storefront_logo_public_path="$(copy_brand_asset "$LOGO_PATH" "$STOREFRONT_DIR/public" "logo")"
    admin_logo_public_path="$(copy_brand_asset "$LOGO_PATH" "$BACKEND_DIR/src/admin/public" "logo")"

    set_env_value "$BACKEND_ENV_FILE" "ADMIN_LOGO_PATH" "$admin_logo_public_path"
    set_env_value "$BACKEND_ENV_FILE" "PLUGIN_SHOP_LOGO" "$admin_logo_public_path"
    set_env_value "$STOREFRONT_ENV_FILE" "NEXT_PUBLIC_SHOP_LOGO" "$storefront_logo_public_path"
    echo "   Logo: $LOGO_PATH"
  fi

  if [ -n "$FAVICON_PATH" ]; then
    storefront_favicon_public_path="$(copy_brand_asset "$FAVICON_PATH" "$STOREFRONT_DIR/public" "favicon")"
    admin_favicon_public_path="$(copy_brand_asset "$FAVICON_PATH" "$BACKEND_DIR/src/admin/public" "favicon")"

    set_env_value "$BACKEND_ENV_FILE" "ADMIN_FAVICON_PATH" "$admin_favicon_public_path"
    set_env_value "$BACKEND_ENV_FILE" "PLUGIN_SHOP_FAVICON" "$admin_favicon_public_path"
    set_env_value "$STOREFRONT_ENV_FILE" "NEXT_PUBLIC_SHOP_FAVICON" "$storefront_favicon_public_path"
    echo "   Favicon: $FAVICON_PATH"
  fi

  echo "   Shop name: $SHOP_NAME"
  echo ""
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
echo "   Markets: $MARKETS"
echo "   Shop name: $SHOP_NAME"
echo ""

# --- Clear Deno compilation cache, Next.js storefront cache, and Medusa Admin cache ---
echo "🧹 Clearing Deno, storefront, and admin build/compilation caches..."
# Clear Next.js cache
if [ -d "$STOREFRONT_DIR/.next" ]; then
  rm -rf "$STOREFRONT_DIR/.next"
fi

# Clear Medusa Admin build caches
if [ -d "$BACKEND_DIR/.medusa/server" ]; then
  rm -rf "$BACKEND_DIR/.medusa/server"
fi
if [ -d "$BACKEND_DIR/.medusa/admin" ]; then
  rm -rf "$BACKEND_DIR/.medusa/admin"
fi

# Clear Deno typescript compiler cache (avoiding re-downloading remote dependencies)
DENO_GEN_DIR="$("$DENO" info 2>/dev/null | grep "Emitted modules cache" | cut -d: -f2- | xargs 2>/dev/null || true)"
if [ -n "$DENO_GEN_DIR" ] && [ -d "$DENO_GEN_DIR" ]; then
  rm -rf "$DENO_GEN_DIR"
fi
echo "✅ Caches cleared successfully."
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
configure_branding

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
  PATH="$BIN_DIR:$PATH" DATABASE_URL="$DATABASE_URL" SEED_MARKETS="$MARKETS" SHOP_NAME="$SHOP_NAME" MEDUSA_SKIP_PGLITE_DB_EXISTS_CHECK="$USE_PGLITE" MEDUSA_SKIP_PGLITE_MIGRATION_LOCK="$USE_PGLITE" "$DENO" run -A npm:@medusajs/cli db:migrate
)
echo ""

echo "🔑 Syncing storefront publishable API key..."
PATH="$BIN_DIR:$PATH" DATABASE_URL="$DATABASE_URL" STOREFRONT_ENV_FILE="$STOREFRONT_ENV_FILE" "$DENO" run --allow-env --allow-net --allow-read --allow-write --allow-sys "$BACKEND_DIR/scripts/sync-storefront-publishable-key.ts"
echo ""

if [ -n "$ADMIN_USER" ]; then
  echo "👤 Creating admin user..."
  (
    cd "$BACKEND_DIR"
    PATH="$BIN_DIR:$PATH" DATABASE_URL="$DATABASE_URL" PGHOST="$PGLITE_HOST" PGPORT="$PGLITE_PORT" PGLITE_MAX_CONNECTIONS="$PGLITE_MAX_CONNECTIONS" "$DENO" run --allow-all scripts/run-medusa-cli-with-db.ts user -e "$ADMIN_USER" -p "$ADMIN_PASS"
  )
  echo ""
fi

# --- Print usage instructions ---
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Run any of these commands from the repo root:"
echo ""
echo "The storefront env file is already created at apps/storefront/.env.local."
echo "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is already set from the default publishable API key."
echo "Update it manually only if you want to use a different key."
echo "Seeded markets: $MARKETS"
echo "Shop name: $SHOP_NAME"
if [ -n "$LOGO_PATH" ]; then
  echo "Logo copied from: $LOGO_PATH"
fi
if [ -n "$FAVICON_PATH" ]; then
  echo "Favicon copied from: $FAVICON_PATH"
fi
if [ -n "$ADMIN_USER" ]; then
  echo "Admin user: $ADMIN_USER"
else
  echo 'Create an admin user later with: cd apps/backend && PATH=$(pwd)/../../bin:$PATH deno run --allow-all scripts/run-medusa-cli-with-db.ts user -e admin@test.com -p supersecret'
fi
echo ""
echo "  deno task dev              # Start all apps"
echo "  deno task backend:dev      # Start backend only"
echo "  deno task storefront:dev   # Start storefront only"
echo "  deno task build            # Build all apps"
echo ""
