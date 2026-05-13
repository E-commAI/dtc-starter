import { PGlite } from "npm:@electric-sql/pglite";
import { PGLiteSocketServer } from "npm:@electric-sql/pglite-socket";
import { fileURLToPath } from "node:url";

const PGDATA_DIR = fileURLToPath(new URL("../.pgdata", import.meta.url));
const BACKEND_DIR = fileURLToPath(new URL("..", import.meta.url));
const PG_HOST = Deno.env.get("PGHOST") ?? "127.0.0.1";
const PG_PORT = Number(Deno.env.get("PGPORT") ?? "5444");
const PG_USERNAME = Deno.env.get("PGUSER") ?? "postgres";
const PG_PASSWORD = Deno.env.get("PGPASSWORD") ?? "postgres";
const PG_MAX_CONNECTIONS = Number(
  Deno.env.get("PGLITE_MAX_CONNECTIONS") ?? "25"
);

async function start() {
  console.log("Starting local PGlite database...");

  // Boot the WASM database (persists to the .pgdata folder next to this script)
  const db = new PGlite(PGDATA_DIR);
  await db.waitReady;

  // Start the TCP socket server on the standard Postgres port
  const server = new PGLiteSocketServer({
    db,
    port: PG_PORT,
    host: PG_HOST,
    maxConnections: PG_MAX_CONNECTIONS,
  });
  await server.start();
  console.log(
    `PGlite running on postgresql://${PG_USERNAME}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/postgres`
  );

  // Set DATABASE_URL so Medusa picks it up automatically
  Deno.env.set(
    "DATABASE_URL",
    `postgresql://${PG_USERNAME}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/postgres`
  );

  // Spawn the Medusa dev server as a child process
  console.log("Starting Medusa dev server...");
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "npm:@medusajs/cli", "develop"],
    cwd: BACKEND_DIR,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...Deno.env.toObject() },
  });

  const child = command.spawn();

  // Forward SIGINT / SIGTERM so Medusa shuts down cleanly
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    Deno.addSignalListener(sig, () => {
      child.kill(sig);
    });
  }

  const { code } = await child.status;
  Deno.exit(code);
}

start();
