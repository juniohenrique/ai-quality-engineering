import type { Pool } from "pg";

export interface HealthRepositoryPort {
  checkDatabaseHealth(): Promise<boolean>;
}

export class HealthRepository implements HealthRepositoryPort {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async checkDatabaseHealth(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
}
