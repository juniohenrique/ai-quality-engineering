export interface PaymentProperties {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed";
}

const defaultPayment: PaymentProperties = {
  id: "payment-1",
  userId: "user-1",
  amount: 100,
  currency: "BRL",
  status: "pending",
};

export class PaymentFactory {
  /** Creates one deterministic payment, optionally replacing defaults. */
  static create(overrides: Partial<PaymentProperties> = {}): PaymentProperties {
    return { ...defaultPayment, ...overrides };
  }

  /** Creates deterministic payments with distinct IDs for batch scenarios. */
  static createMany(
    count: number,
    overrides: Partial<PaymentProperties> = {},
  ): PaymentProperties[] {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Payment count must be a non-negative integer");
    }

    return Array.from({ length: count }, (_, index) =>
      PaymentFactory.create({
        ...overrides,
        id: overrides.id ?? `payment-${index + 1}`,
      }),
    );
  }
}
