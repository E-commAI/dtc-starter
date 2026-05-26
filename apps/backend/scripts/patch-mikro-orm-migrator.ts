import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const pathExists = async (path: string) => {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
};

const getRepoRoot = async () => {
    let currentDir = resolve(process.cwd());

    for (let index = 0; index < 5; index += 1) {
        if (await pathExists(join(currentDir, "node_modules/.deno"))) {
            return currentDir;
        }

        const parentDir = resolve(currentDir, "..");

        if (parentDir === currentDir) {
            break;
        }

        currentDir = parentDir;
    }

    throw new Error(
        `Unable to locate node_modules/.deno from ${process.cwd()}`
    );
};

const MIGRATOR_ORIGINAL_SNIPPET = `async ensureDatabase() {
        await this.ensureMigrationsDirExists();
        const created = await this.schemaGenerator.ensureDatabase();
        /* istanbul ignore next */
        if (created) {
            this.createUmzug();
        }
        await this.storage.ensureTable();
    }`;

const MIGRATOR_PATCHED_SNIPPET = `async ensureDatabase() {
        await this.ensureMigrationsDirExists();
        if (process.env.MEDUSA_SKIP_PGLITE_DB_EXISTS_CHECK === "1") {
            await this.storage.ensureTable();
            return;
        }
        const created = await this.schemaGenerator.ensureDatabase();
        /* istanbul ignore next */
        if (created) {
            this.createUmzug();
        }
        await this.storage.ensureTable();
    }`;

const MODULE_LOCK_ORIGINAL_SNIPPET = `const lockKey = \`db-module-migration:\${migrationOptions.moduleKey}\`;
            await lockKnex.transaction(async (trx) => {
                await trx.raw(\`SELECT pg_advisory_xact_lock(hashtext(?))\`, [lockKey]);
                if (action === "revert") {
                    await medusa_module_1.MedusaModule.migrateDown(migrationOptions, migrationNames);
                }
                else if (action === "run") {
                    const ranMigrationsResult = await medusa_module_1.MedusaModule.migrateUp(migrationOptions);
                    // Store for revert if anything goes wrong later
                    executedResolutions.push([
                        moduleResolution,
                        ranMigrationsResult?.map((r) => r.name) ?? [],
                    ]);
                }
                else {
                    await medusa_module_1.MedusaModule.migrateGenerate(migrationOptions);
                }
            });`;

const MODULE_LOCK_PATCHED_SNIPPET = `const lockKey = \`db-module-migration:\${migrationOptions.moduleKey}\`;
            const runMigration = async () => {
                if (action === "revert") {
                    await medusa_module_1.MedusaModule.migrateDown(migrationOptions, migrationNames);
                }
                else if (action === "run") {
                    const ranMigrationsResult = await medusa_module_1.MedusaModule.migrateUp(migrationOptions);
                    // Store for revert if anything goes wrong later
                    executedResolutions.push([
                        moduleResolution,
                        ranMigrationsResult?.map((r) => r.name) ?? [],
                    ]);
                }
                else {
                    await medusa_module_1.MedusaModule.migrateGenerate(migrationOptions);
                }
            };
            if (process.env.MEDUSA_SKIP_PGLITE_MIGRATION_LOCK === "1") {
                await runMigration();
            }
            else {
                await lockKnex.transaction(async (trx) => {
                    await trx.raw(\`SELECT pg_advisory_xact_lock(hashtext(?))\`, [lockKey]);
                    await runMigration();
                });
            }`;

const LINK_LOCK_ORIGINAL_SNIPPET = `                    const lockKey = \`db-link-migration:\${action.tableName}\`;
                    await lockConn.execute("BEGIN");
                    await lockConn.execute(\`SELECT pg_advisory_xact_lock(hashtext('\${lockKey}'))\`);
                    try {
                        switch (action.action) {
                            case "delete":
                                await this.dropLinkTable(orm, action.tableName);
                                break;
                            case "create":
                                await this.createLinkTable(orm, action);
                                break;
                            case "update":
                                const sql = \`SET LOCAL search_path TO "\${__classPrivateFieldGet(this, _MigrationsExecutionPlanner_schema, "f")}"; \\n\\n\${action.sql}\`;
                                await orm.em.getDriver().getConnection().execute(sql);
                                break;
                            default:
                                break;
                        }
                    }
                    finally {
                        await lockConn.execute("COMMIT");
                    }`;

const LINK_LOCK_PATCHED_SNIPPET = `                    const runAction = async () => {
                        switch (action.action) {
                            case "delete":
                                await this.dropLinkTable(orm, action.tableName);
                                break;
                            case "create":
                                await this.createLinkTable(orm, action);
                                break;
                            case "update":
                                const sql = \`SET LOCAL search_path TO "\${__classPrivateFieldGet(this, _MigrationsExecutionPlanner_schema, "f")}"; \\n\\n\${action.sql}\`;
                                await orm.em.getDriver().getConnection().execute(sql);
                                break;
                            default:
                                break;
                        }
                    };
                    const lockKey = \`db-link-migration:\${action.tableName}\`;
                    if (process.env.MEDUSA_SKIP_PGLITE_MIGRATION_LOCK === "1") {
                        await runAction();
                    }
                    else {
                        await lockConn.execute("BEGIN");
                        await lockConn.execute(\`SELECT pg_advisory_xact_lock(hashtext('\${lockKey}'))\`);
                        try {
                            await runAction();
                        }
                        finally {
                            await lockConn.execute("COMMIT");
                        }
                    }`;

const CUSTOM_DB_MIGRATOR_ORIGINAL_SNIPPET = `                instance.up = async function (...args) {
                    await this.driver.execute(\`SET LOCAL search_path TO \${customSchema}\`);
                    return up.bind(this)(...args);
                };
                instance.down = async function (...args) {
                    await this.driver.execute(\`SET LOCAL search_path TO \${customSchema}\`);
                    return down.bind(this)(...args);
                };`;

const CUSTOM_DB_MIGRATOR_PATCHED_SNIPPET = `                instance.up = async function (...args) {
                    await this.execute(\`SET LOCAL search_path TO \${customSchema}\`);
                    return up.bind(this)(...args);
                };
                instance.down = async function (...args) {
                    await this.execute(\`SET LOCAL search_path TO \${customSchema}\`);
                    return down.bind(this)(...args);
                };`;

const PATCH_TARGETS = [
  {
      label: "MikroORM migrator copies",
      relativePath: "node_modules/@mikro-orm/migrations/Migrator.js",
      originalSnippet: MIGRATOR_ORIGINAL_SNIPPET,
      patchedSnippet: MIGRATOR_PATCHED_SNIPPET,
  },
  {
      label: "Medusa module migration lock wrappers",
      relativePath: "node_modules/@medusajs/modules-sdk/dist/medusa-app.js",
      originalSnippet: MODULE_LOCK_ORIGINAL_SNIPPET,
      patchedSnippet: MODULE_LOCK_PATCHED_SNIPPET,
  },
  {
      label: "Medusa custom DB migrator search_path wrappers",
      relativePath: "node_modules/@medusajs/utils/dist/dal/mikro-orm/custom-db-migrator.js",
      originalSnippet: CUSTOM_DB_MIGRATOR_ORIGINAL_SNIPPET,
      patchedSnippet: CUSTOM_DB_MIGRATOR_PATCHED_SNIPPET,
  },
  {
      label: "Link sync lock wrappers",
      relativePath: "node_modules/@medusajs/link-modules/dist/migration/index.js",
      originalSnippet: LINK_LOCK_ORIGINAL_SNIPPET,
      patchedSnippet: LINK_LOCK_PATCHED_SNIPPET,
  },
] as const;

const getCandidatePaths = async (denoModulesDir: string, relativePath: string) => {
    const paths = [join(denoModulesDir, relativePath)];

    for (const entry of await readdir(denoModulesDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === "node_modules") {
      continue;
    }

        paths.push(join(denoModulesDir, entry.name, relativePath));
  }

  return [...new Set(paths)];
};

const main = async () => {
    const repoRoot = await getRepoRoot();
    const denoModulesDir = join(repoRoot, "node_modules/.deno");

    for (const target of PATCH_TARGETS) {
        let patchedCount = 0;

        for (const filePath of await getCandidatePaths(
            denoModulesDir,
            target.relativePath
        )) {
            if (!(await pathExists(filePath))) {
                continue;
            }

            const source = await readFile(filePath, "utf8");

            if (source.includes(target.patchedSnippet)) {
                continue;
            }

            if (!source.includes(target.originalSnippet)) {
                continue;
            }

            await writeFile(
                filePath,
                source.replace(target.originalSnippet, target.patchedSnippet)
            );
            patchedCount += 1;
        }

        console.log(`Patched ${target.label}: ${patchedCount}`);
    }
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});