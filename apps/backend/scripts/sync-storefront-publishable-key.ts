import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "npm:pg";

const DEFAULT_STOREFRONT_ENV_FILE = fileURLToPath(
  new URL("../../storefront/.env.local", import.meta.url)
);
const DEFAULT_STOREFRONT_ENV_TEMPLATE = fileURLToPath(
  new URL("../../storefront/.env.template", import.meta.url)
);
const DEFAULT_PUBLISHABLE_KEY_TITLE = "Default Publishable API Key";

const fileExists = async (path: string) => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const upsertEnvValue = (source: string, key: string, value: string) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = `${key}=${value}`;
  const matcher = new RegExp(`^${escapedKey}=.*$`, "m");

  if (matcher.test(source)) {
    return source.replace(matcher, line);
  }

  if (!source.length) {
    return `${line}\n`;
  }

  return source.endsWith("\n") ? `${source}${line}\n` : `${source}\n${line}\n`;
};

const ensureStorefrontEnvFile = async (envFilePath: string) => {
  if (await fileExists(envFilePath)) {
    return;
  }

  await copyFile(DEFAULT_STOREFRONT_ENV_TEMPLATE, envFilePath);
};

const getPublishableKeyToken = async (databaseUrl: string) => {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    const result = await client.query<{ token: string }>(
      `
        SELECT token
        FROM api_key
        WHERE type = $1
          AND revoked_at IS NULL
          AND deleted_at IS NULL
        ORDER BY
          CASE WHEN title = $2 THEN 0 ELSE 1 END,
          created_at ASC
        LIMIT 1
      `,
      ["publishable", DEFAULT_PUBLISHABLE_KEY_TITLE]
    );

    const token = result.rows[0]?.token;

    if (!token) {
      throw new Error("No publishable API key found in api_key");
    }

    return token;
  } finally {
    await client.end();
  }
};

const main = async () => {
  const databaseUrl = Deno.env.get("DATABASE_URL");

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const storefrontEnvFile = resolve(
    Deno.env.get("STOREFRONT_ENV_FILE") ?? DEFAULT_STOREFRONT_ENV_FILE
  );

  await ensureStorefrontEnvFile(storefrontEnvFile);

  const publishableKeyToken = await getPublishableKeyToken(databaseUrl);
  const currentContents = await readFile(storefrontEnvFile, "utf8");
  const nextContents = upsertEnvValue(
    currentContents,
    "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY",
    publishableKeyToken
  );

  if (nextContents !== currentContents) {
    await writeFile(storefrontEnvFile, nextContents);
  }

  console.log(
    `Synced NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY in ${storefrontEnvFile}`
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});