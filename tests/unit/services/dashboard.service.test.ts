import { describe, expect, it, vi } from "vitest";
import type { UserService, UserStats } from "../../../src/services/user.service.js";
import type { PaymentService, PaymentStats } from "../../../src/services/payment.service.js";
import type { PaymentPage } from "../../../src/repositories/payment.repository.js";
import type { Payment } from "../../../src/domain/payment.js";
import { DashboardService } from "../../../src/services/dashboard.service.js";

describe("DashboardService", () => {
  it("orchestrates user and payment stats with recent payments", async () => {
    // Arrange
    const userService: Pick<UserService, "getUserStats"> = {
      getUserStats: vi.fn(),
    };
    const paymentService: Pick<PaymentService, "getPaymentStats" | "listPayments"> = {
      getPaymentStats: vi.fn(),
      listPayments: vi.fn(),
    };

    const mockUserStats: UserStats = { total: 3, byRole: { admin: 1, user: 2 } };
    const mockPaymentStats: PaymentStats = {
      total: 5,
      byStatus: { pending: 0, processing: 0, completed: 0, failed: 0, refunded: 0 },
    };
    const mockPaymentPage: PaymentPage = {
      items: [
        {
          id: "pay-1",
          userId: "user-1",
          amount: 100,
          currency: "BRL",
          status: "completed",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        } as unknown as Payment,
        {
          id: "pay-2",
          userId: "user-1",
          amount: 200,
          currency: "BRL",
          status: "pending",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        } as unknown as Payment,
      ],
      total: 2,
    };

    const service = new DashboardService(userService, paymentService);

    vi.mocked(userService.getUserStats).mockResolvedValue(mockUserStats);
    vi.mocked(paymentService.getPaymentStats).mockResolvedValue(mockPaymentStats);
    vi.mocked(paymentService.listPayments).mockResolvedValue(mockPaymentPage);

    // Act
    const result = await service.getStats();

    // Assert
    expect(result.users).toEqual(mockUserStats);
    expect(result.payments).toEqual(mockPaymentStats);
    expect(result.recentPayments).toHaveLength(2);
    expect(result.recentPayments).toEqual([
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
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
  });

  it("runs stats calls in parallel", async () => {
    // Arrange
    const startTimes: number[] = [];

    const mockUserStats: UserStats = { total: 1, byRole: { admin: 1, user: 0 } };
    const mockPaymentStats: PaymentStats = {
      total: 1,
      byStatus: { pending: 0, processing: 0, completed: 0, failed: 0, refunded: 0 },
    };

    const userService: Pick<UserService, "getUserStats"> = {
      getUserStats: vi.fn().mockImplementation(async () => {
        startTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 10));
        return mockUserStats;
      }),
    };

    const paymentService: Pick<PaymentService, "getPaymentStats" | "listPayments"> = {
      getPaymentStats: vi.fn().mockImplementation(async () => {
        startTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 10));
        return mockPaymentStats;
      }),
      listPayments: vi.fn().mockImplementation(async () => {
        startTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { items: [], total: 0 };
      }),
    };

    const service = new DashboardService(userService, paymentService);

    // Act
    const beforeCall = Date.now();
    await service.getStats();
    const afterCall = Date.now();

    // Assert - total time should be < 30ms (all 3 calls run in ~10ms parallel)
    const totalTime = afterCall - beforeCall;
    expect(totalTime).toBeLessThan(30);
    expect(startTimes.length).toBe(3);
  });

  it("returns empty recentPayments when listPayments returns empty", async () => {
    // Arrange
    const userService: Pick<UserService, "getUserStats"> = { getUserStats: vi.fn() };
    const paymentService: Pick<PaymentService, "getPaymentStats" | "listPayments"> = {
      getPaymentStats: vi.fn(),
      listPayments: vi.fn(),
    };

    const mockUserStats: UserStats = { total: 0, byRole: { admin: 0, user: 0 } };
    const mockPaymentStats: PaymentStats = {
      total: 0,
      byStatus: { pending: 0, processing: 0, completed: 0, failed: 0, refunded: 0 },
    };

    const service = new DashboardService(userService, paymentService);
    vi.mocked(userService.getUserStats).mockResolvedValue(mockUserStats);
    vi.mocked(paymentService.getPaymentStats).mockResolvedValue(mockPaymentStats);
    vi.mocked(paymentService.listPayments).mockResolvedValue({ items: [], total: 0 });

    // Act
    const result = await service.getStats();

    // Assert
    expect(result.recentPayments).toHaveLength(0);
  });
});
