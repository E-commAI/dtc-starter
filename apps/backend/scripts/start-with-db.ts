import { PGlite } from "npm:@electric-sql/pglite";
import { PGLiteSocketServer } from "npm:@electric-sql/pglite-socket";

const PGDATA_DIR = new URL("../.pgdata", import.meta.url).pathname;
const PG_HOST = "127.0.0.1";
const PG_PORT = 5432;

async function start() {
  console.log("Starting local PGlite database...");

  // Boot the WASM database (persists to the .pgdata folder next to this script)
  const db = new PGlite(PGDATA_DIR);
  await db.waitReady;

  // Start the TCP socket server on the standard Postgres port
  const server = new PGLiteSocketServer({ db, port: PG_PORT, host: PG_HOST });
  await server.listen();
  console.log(`PGlite running on postgresql://${PG_HOST}:${PG_PORT}/postgres`);

  // Set DATABASE_URL so Medusa picks it up automatically
  Deno.env.set(
    "DATABASE_URL",
    `postgresql://${PG_HOST}:${PG_PORT}/postgres`
  );

  // Spawn the Medusa dev server as a child process
  console.log("Starting Medusa dev server...");
  const command = new Deno.Command("npx", {
    args: ["medusa", "develop"],
    cwd: new URL("..", import.meta.url).pathname,
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
