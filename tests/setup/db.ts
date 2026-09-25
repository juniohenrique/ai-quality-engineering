import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL_TEST ?? "postgres://postgres:postgres@localhost:5433/quality_test";

export const testDatabase = new Pool({ connectionString: databaseUrl });

export async function resetDatabase(): Promise<void> {
  await testDatabase.query(
    "TRUNCATE TABLE users, payments, password_reset_tokens RESTART IDENTITY CASCADE",
  );
}

export async function closeDatabase(): Promise<void> {
  await testDatabase.end();
}
