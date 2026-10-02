import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../../../src/middlewares/auth.middleware.js";
import type { ServerResponse } from "node:http";
import { DashboardController } from "../../../src/controllers/dashboard.controller.js";

describe("DashboardController", () => {
  const createMockResponse = () => {
    let _statusCode = 200;
    let _headers: Record<string, string> = {};
    let _body = "";

    const res = {
      get statusCode() {
        return _statusCode;
      },
      set statusCode(v: number) {
        _statusCode = v;
      },
      get headers() {
        return _headers;
      },
      get body() {
        return _body;
      },
      writeHead: vi.fn((code: number, headers: Record<string, string>) => {
        _statusCode = code;
        _headers = headers;
      }),
      end: vi.fn((data?: string) => {
        _body = data ?? "";
      }),
    } as unknown as ServerResponse & {
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    };

    return res;
  };

  const createMockStats = () => ({
    users: { total: 3, byRole: { admin: 1, user: 2 } },
    payments: {
      total: 5,
      byStatus: { pending: 1, processing: 1, completed: 3, failed: 0, refunded: 0 },
    },
    recentPayments: [
      {
        id: "pay-1",
        userId: "user-1",
        amount: 100,
        currency: "BRL",
        status: "completed",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "pay-2",
        userId: "user-1",
        amount: 200,
        currency: "BRL",
        status: "pending",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ],
  });

  it("returns 401 when context is null", async () => {
    // Arrange
    const service = { getStats: vi.fn() };
    const controller = new DashboardController(service);
    const response = createMockResponse();

    // Act
    await controller.handleGet(null, response);

    // Assert
    expect(response.statusCode).toBe(401);
    expect(response.body).toContain("unauthorized");
    expect(service.getStats).not.toHaveBeenCalled();
  });

  it("returns 403 when caller role is not admin", async () => {
    // Arrange
    const service = { getStats: vi.fn() };
    const controller = new DashboardController(service);
    const response = createMockResponse();
    const userCtx: AuthContext = { userId: "user-1", role: "user", jti: "jti-1" };

    // Act
    await controller.handleGet(userCtx, response);

    // Assert
    expect(response.statusCode).toBe(403);
    expect(response.body).toContain("forbidden");
    expect(service.getStats).not.toHaveBeenCalled();
  });

  it("returns 200 with dashboard stats", async () => {
    // Arrange
    const mockStats = createMockStats();
    const service = { getStats: vi.fn().mockResolvedValue(mockStats) };
    const controller = new DashboardController(service);
    const response = createMockResponse();
    const adminCtx: AuthContext = { userId: "admin-1", role: "admin", jti: "jti-admin" };

    // Act
    await controller.handleGet(adminCtx, response);

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(response.body);
    expect(body.users).toEqual(mockStats.users);
    expect(body.payments).toEqual(mockStats.payments);
    expect(body.recentPayments).toHaveLength(2);
    expect(body.recentPayments[0]).toEqual({
      id: "pay-1",
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("serializes createdAt as ISO string", async () => {
    // Arrange
    const mockStats = createMockStats();
    const service = { getStats: vi.fn().mockResolvedValue(mockStats) };
    const controller = new DashboardController(service);
    const response = createMockResponse();
    const adminCtx: AuthContext = { userId: "admin-1", role: "admin", jti: "jti-admin" };

    // Act
    await controller.handleGet(adminCtx, response);

    // Assert
    const body = JSON.parse(response.body);
    expect(typeof body.recentPayments[0].createdAt).toBe("string");
    expect(body.recentPayments[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(body.recentPayments[1].createdAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("returns 500 when service throws", async () => {
    // Arrange
    const service = {
      getStats: vi.fn().mockRejectedValue(new Error("Database connection failed")),
    };
    const controller = new DashboardController(service);
    const response = createMockResponse();
    const adminCtx: AuthContext = { userId: "admin-1", role: "admin", jti: "jti-admin" };

    // Act
    await controller.handleGet(adminCtx, response);

    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain("internal_error");
    expect(response.body).toContain("Database connection failed");
  });
});
