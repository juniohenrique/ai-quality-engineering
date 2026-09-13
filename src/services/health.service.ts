export interface HealthStatus {
  status: "ok" | "degraded";
  database: "connected" | "unavailable";
}

export interface HealthServiceDependencies {
  checkDatabaseHealth(): Promise<boolean>;
}

export class HealthService {
  constructor(private readonly repository: HealthServiceDependencies) {}

  async getHealth(): Promise<HealthStatus> {
    const isHealthy = await this.repository.checkDatabaseHealth();

    return isHealthy
      ? { status: "ok", database: "connected" }
      : { status: "degraded", database: "unavailable" };
  }
}
