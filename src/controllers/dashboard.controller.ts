import type { ServerResponse } from "node:http";
import type { DashboardService } from "../services/dashboard.service.js";
import type { AuthContext } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/authz.middleware.js";
import { writeErrorResponse } from "../http/error-response.js";

export class DashboardController {
  constructor(private readonly service: Pick<DashboardService, "getStats">) {}

  private authorize(context: AuthContext | null, response: ServerResponse): context is AuthContext {
    if (context === null) {
      writeErrorResponse(response, 401, "unauthorized", "Unauthorized");
      return false;
    }
    if (!requireRole(context, "admin")) {
      writeErrorResponse(response, 403, "forbidden", "Forbidden");
      return false;
    }
    return true;
  }

  async handleGet(context: AuthContext | null, response: ServerResponse): Promise<void> {
    if (!this.authorize(context, response)) return;

    try {
      const stats = await this.service.getStats();

      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          users: stats.users,
          payments: stats.payments,
          recentPayments: stats.recentPayments.map((p) => ({
            id: p.id,
            userId: p.userId,
            amount: p.amount,
            currency: p.currency,
            status: p.status,
            createdAt: p.createdAt.toISOString(),
          })),
        }),
      );
    } catch (error) {
      writeErrorResponse(
        response,
        500,
        "internal_error",
        error instanceof Error ? error.message : "Unexpected error",
      );
    }
  }
}
