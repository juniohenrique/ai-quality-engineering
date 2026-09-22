export interface PaymentProperties {
  id: string;
  idempotencyKey: string;
  userId: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed";
  createdAt: Date;
}

export class Payment {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly userId: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: "pending" | "completed" | "failed";
  readonly createdAt: Date;

  constructor(props: PaymentProperties) {
    const id = props.id.trim();
    const idempotencyKey = props.idempotencyKey.trim();
    const userId = props.userId.trim();
    const amount = props.amount;
    const currency = props.currency.trim();
    const status = props.status;
    const createdAt = props.createdAt instanceof Date ? props.createdAt : new Date(props.createdAt);

    if (!id) {
      throw new Error("Payment id is required");
    }
    if (!idempotencyKey) {
      throw new Error("Payment idempotencyKey is required");
    }
    if (!userId) {
      throw new Error("Payment userId is required");
    }
    if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
      throw new Error("Payment amount must be a positive number");
    }
    if (!currency) {
      throw new Error("Payment currency is required");
    }
    if (!["pending", "completed", "failed"].includes(status)) {
      throw new Error("Payment status is invalid");
    }

    this.id = id;
    this.idempotencyKey = idempotencyKey;
    this.userId = userId;
    this.amount = amount;
    this.currency = currency;
    this.status = status as "pending" | "completed" | "failed";
    this.createdAt = createdAt;
  }
}
