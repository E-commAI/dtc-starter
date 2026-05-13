import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const BACKEND_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const BIN_DIR = resolve(REPO_ROOT, "bin");
const BACKEND_ENV_FILE = resolve(BACKEND_DIR, ".env");
const START_PGLITE_SCRIPT = resolve(SCRIPT_DIR, "start-pglite.ts");
const PATCH_MIGRATOR_SCRIPT = resolve(SCRIPT_DIR, "patch-mikro-orm-migrator.ts");

const PGLITE_HOST = Deno.env.get("PGHOST") ?? "127.0.0.1";
const PGLITE_PORT = Deno.env.get("PGPORT") ?? "5444";
const PGLITE_USERNAME = Deno.env.get("PGUSER") ?? "postgres";
const PGLITE_PASSWORD = Deno.env.get("PGPASSWORD") ?? "postgres";
const PGLITE_MAX_CONNECTIONS = Deno.env.get("PGLITE_MAX_CONNECTIONS") ?? "25";

const DEFAULT_PGLITE_DATABASE_URL = `postgres://${PGLITE_USERNAME}:${PGLITE_PASSWORD}@${PGLITE_HOST}:${PGLITE_PORT}/postgres`;
const OLD_DEFAULT_PGLITE_DATABASE_URL = "postgres://postgres:@127.0.0.1:5432/postgres";
const CURRENT_DEFAULT_PGLITE_DATABASE_URL_NO_PASSWORD = `postgres://postgres:@${PGLITE_HOST}:${PGLITE_PORT}/postgres`;
const LEGACY_DATABASE_URL = "postgres://postgres:@localhost:5432/medusa-dtc-starter";

const pathExists = async (path: string) => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const delay = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

const prependPath = (pathValue?: string | null) => {
  if (!pathValue) {
    return BIN_DIR;
  }

  return `${BIN_DIR}${delimiter}${pathValue}`;
};

const getEnvValue = async (key: string) => {
  const envValue = Deno.env.get(key);

  if (envValue) {
    return envValue;
  }

  if (!(await pathExists(BACKEND_ENV_FILE))) {
    return undefined;
  }

  const contents = await readFile(BACKEND_ENV_FILE, "utf8");

  for (const line of contents.split(/\r?\n/u)) {
    if (line.startsWith(`${key}=`)) {
      return line.slice(key.length + 1);
    }
  }

  return undefined;
};

const resolveDatabaseConfig = async () => {
  const configuredDatabaseUrl = await getEnvValue("DATABASE_URL");

  if (
    !configuredDatabaseUrl ||
    configuredDatabaseUrl === LEGACY_DATABASE_URL ||
    configuredDatabaseUrl === OLD_DEFAULT_PGLITE_DATABASE_URL ||
    configuredDatabaseUrl === CURRENT_DEFAULT_PGLITE_DATABASE_URL_NO_PASSWORD
  ) {
    return {
      databaseUrl: DEFAULT_PGLITE_DATABASE_URL,
      usePglite: true,
    };
  }

  return {
    databaseUrl: configuredDatabaseUrl,
    usePglite: configuredDatabaseUrl === DEFAULT_PGLITE_DATABASE_URL,
  };
};

const waitForPglite = async (child: Deno.ChildProcess) => {
  let exited = false;

  child.status.then(() => {
    exited = true;
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (exited) {
      throw new Error("PGlite exited before it was ready");
    }

    try {
      const connection = await Deno.connect({
        hostname: PGLITE_HOST,
        port: Number(PGLITE_PORT),
      });

      connection.close();
      return;
    } catch {
      await delay(1000);
    }
  }

  throw new Error(`Timed out waiting for PGlite on ${PGLITE_HOST}:${PGLITE_PORT}`);
};

const runCheckedCommand = async (
  label: string,
  args: string[],
  env: Record<string, string>
) => {
  const child = new Deno.Command(Deno.execPath(), {
    args,
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env,
  }).spawn();

  const { code } = await child.status;

  if (code !== 0) {
    throw new Error(`${label} failed with exit code ${code}`);
  }
};

const main = async (): Promise<number> => {
  if (!Deno.args.length) {
    console.error(
      "Usage: deno run --allow-all scripts/run-medusa-cli-with-db.ts <medusa-cli-command> [...args]"
    );
    return 1;
  }

  const { databaseUrl, usePglite } = await resolveDatabaseConfig();
  const baseEnv: Record<string, string> = {
    ...Deno.env.toObject(),
    PATH: prependPath(Deno.env.get("PATH")),
    DATABASE_URL: databaseUrl,
  };

  let pgliteChild: Deno.ChildProcess | undefined;
  let medusaChild: Deno.ChildProcess | undefined;
  const signalHandlers = new Map<Deno.Signal, () => void>();

  try {
    if (usePglite) {
      const pgliteEnv = {
        ...baseEnv,
        PGHOST: PGLITE_HOST,
        PGPORT: PGLITE_PORT,
        PGUSER: PGLITE_USERNAME,
        PGPASSWORD: PGLITE_PASSWORD,
        PGLITE_MAX_CONNECTIONS,
      };

      console.log("Starting local PGlite database...");
      pgliteChild = new Deno.Command(Deno.execPath(), {
        args: ["run", "--allow-all", START_PGLITE_SCRIPT],
        cwd: REPO_ROOT,
        stdout: "inherit",
        stderr: "inherit",
        env: pgliteEnv,
      }).spawn();

      await waitForPglite(pgliteChild);

      console.log("Patching migration internals for local PGlite...");
      await runCheckedCommand(
        "patch-mikro-orm-migrator",
        ["run", "--allow-all", PATCH_MIGRATOR_SCRIPT],
        pgliteEnv
      );

      baseEnv.MEDUSA_SKIP_PGLITE_DB_EXISTS_CHECK = "1";
      baseEnv.MEDUSA_SKIP_PGLITE_MIGRATION_LOCK = "1";
    }

    medusaChild = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "npm:@medusajs/cli", ...Deno.args],
      cwd: BACKEND_DIR,
      stdout: "inherit",
      stderr: "inherit",
      env: baseEnv,
    }).spawn();

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      const handler = () => {
        try {
          medusaChild?.kill(signal);
        } catch {
          // Ignore shutdown race conditions.
        }

        try {
          pgliteChild?.kill(signal);
        } catch {
          // Ignore shutdown race conditions.
        }
      };

      signalHandlers.set(signal, handler);
      Deno.addSignalListener(signal, handler);
    }

    const { code } = await medusaChild.status;
    return code;
  } finally {
    for (const [signal, handler] of signalHandlers) {
      Deno.removeSignalListener(signal, handler);
    }

    if (pgliteChild) {
      try {
        pgliteChild.kill("SIGTERM");
      } catch {
        // Ignore shutdown race conditions.
      }

      await pgliteChild.status.catch(() => undefined);
    }
  }
};

main()
  .then((code) => {
    Deno.exit(code);
  })
  .catch((error) => {
    console.error(error);
    Deno.exit(1);
  });