import type { UserService, UserStats } from "./user.service.js";
import type { PaymentService, PaymentStats } from "./payment.service.js";
import type { Payment } from "../domain/payment.js";

export interface DashboardStats {
  users: UserStats;
  payments: PaymentStats;
  recentPayments: Payment[];
}

export class DashboardService {
  constructor(
    private readonly userService: Pick<UserService, "getUserStats">,
    private readonly paymentService: Pick<PaymentService, "getPaymentStats" | "listPayments">,
  ) {}

  async getStats(): Promise<DashboardStats> {
    const [users, payments, recentPage] = await Promise.all([
      this.userService.getUserStats(),
      this.paymentService.getPaymentStats(),
      this.paymentService.listPayments({ limit: 10, offset: 0 }, { userId: "", role: "admin" }),
    ]);
    return { users, payments, recentPayments: recentPage.items };
  }
}
