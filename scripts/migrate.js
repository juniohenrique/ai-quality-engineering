import "dotenv/config";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}

async function getMigrations(direction) {
  const files = await readdir(migrationsDirectory);

  return files
    .filter((file) => file.endsWith(`.${direction}.sql`))
    .sort()
    .map((file) => ({ file, name: file.slice(0, -`.${direction}.sql`.length) }));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function migrateUp(client) {
  const migrations = await getMigrations("up");
  const applied = await client.query("SELECT name FROM _migrations");
  const appliedNames = new Set(applied.rows.map(({ name }) => name));

  for (const migration of migrations) {
    if (appliedNames.has(migration.name)) {
      continue;
    }

    const sql = await readFile(join(migrationsDirectory, migration.file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [migration.name]);
      await client.query("COMMIT");
      console.log(`Applied migration ${migration.name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

async function migrateDown(client) {
  const applied = await client.query(
    "SELECT name FROM _migrations ORDER BY applied_at DESC, name DESC LIMIT 1",
  );
  const migration = applied.rows[0];

  if (!migration) {
    console.log("No migrations to rollback");
    return;
  }

  const downFile = `${migration.name}.down.sql`;
  const sql = await readFile(join(migrationsDirectory, downFile), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("DELETE FROM _migrations WHERE name = $1", [migration.name]);
    await client.query("COMMIT");
    console.log(`Rolled back migration ${migration.name}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function createMigration(name) {
  const normalizedName = name
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  if (!normalizedName) {
    throw new Error("Migration name is required");
  }

  const existing = await readdir(migrationsDirectory);
  const nextNumber =
    Math.max(
      0,
      ...existing
        .map((file) => Number.parseInt(file.split("_")[0] ?? "", 10))
        .filter(Number.isInteger),
    ) + 1;
  const prefix = String(nextNumber).padStart(3, "0");
  const baseName = `${prefix}_${normalizedName}`;

  await writeFile(join(migrationsDirectory, `${baseName}.up.sql`), "\n");
  await writeFile(join(migrationsDirectory, `${baseName}.down.sql`), "\n");
  console.log(`Created migration ${baseName}`);
}

async function main() {
  const command = process.argv[2] ?? "up";

  if (command === "create") {
    await createMigration(process.argv.slice(3).join(" "));
    return;
  }

  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    if (command === "up") {
      await migrateUp(client);
    } else if (command === "down") {
      await migrateDown(client);
    } else {
      throw new Error(`Unknown migration command: ${command}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
