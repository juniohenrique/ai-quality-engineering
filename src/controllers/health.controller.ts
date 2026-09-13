import type { ServerResponse } from "node:http";

export interface HealthControllerDependencies {
  getHealth(): Promise<{
    status: "ok" | "degraded";
    database: "connected" | "unavailable";
  }>;
}

export class HealthController {
  constructor(private readonly service: HealthControllerDependencies) {}

  async handleHealth(response: ServerResponse): Promise<void> {
    const payload = await this.service.getHealth();

    const isHealthy = payload.database === "connected";
    response.writeHead(isHealthy ? 200 : 503, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(payload));
  }
}
