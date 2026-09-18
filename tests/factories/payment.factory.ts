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
  static create(overrides: Partial<PaymentProperties> = {}): PaymentProperties {
    return { ...defaultPayment, ...overrides };
  }
}
