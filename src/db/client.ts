import { Pool } from "pg";

type Queryable = Pick<Pool, "query">;

export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
}

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

export async function waitForDatabase(
  pool: Queryable,
  { attempts = 3, delayMs = 100 }: RetryOptions = {},
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return true;
    } catch {
      if (attempt === attempts) {
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}
