import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { resolve } from "node:path";

const getDefaultDataDir = () => {
  const cwd = process.cwd();

  if (cwd.replace(/\\/g, "/").endsWith("/apps/backend")) {
    return resolve(cwd, ".pgdata");
  }

  return resolve(cwd, "apps/backend/.pgdata");
};

const main = async () => {
  const dataDir = process.env.PGLITE_DATA_DIR
    ? resolve(process.env.PGLITE_DATA_DIR)
    : getDefaultDataDir();
  const host = process.env.PGHOST ?? "127.0.0.1";
  const port = Number(process.env.PGPORT ?? "5444");
  const username = process.env.PGUSER ?? "postgres";
  const password = process.env.PGPASSWORD ?? "postgres";
  const maxConnections = Number(process.env.PGLITE_MAX_CONNECTIONS ?? "25");

  console.log("Starting local PGlite database...");

  const db = new PGlite(dataDir);
  await db.waitReady;

  const server = new PGLiteSocketServer({
    db,
    port,
    host,
    maxConnections,
  });
  await server.start();

  console.log(
    `PGlite running on postgresql://${username}:${password}@${host}:${port}/postgres`
  );

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      process.exit(0);
    });
  }

  await new Promise(() => {});
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});