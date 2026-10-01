export type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "refunded";

export const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ["processing"],
  processing: ["completed", "failed"],
  completed: ["refunded"],
  failed: [],
  refunded: [],
};

export class InvalidStatusTransitionError extends Error {
  constructor(from: PaymentStatus, to: PaymentStatus) {
    super(`Cannot transition payment from "${from}" to "${to}"`);
    this.name = "InvalidStatusTransitionError";
  }
}

export const MAX_PAYMENT_AMOUNT = 999_999_999;

export interface PaymentProperties {
  id: string;
  idempotencyKey: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: Date;
}

export class Payment {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly userId: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: PaymentStatus;
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
    if (amount > MAX_PAYMENT_AMOUNT) {
      throw new Error("Payment amount exceeds maximum allowed value");
    }
    if (!currency) {
      throw new Error("Payment currency is required");
    }
    const validStatuses: PaymentStatus[] = [
      "pending",
      "processing",
      "completed",
      "failed",
      "refunded",
    ];
    if (!validStatuses.includes(status)) {
      throw new Error("Payment status is invalid");
    }

    this.id = id;
    this.idempotencyKey = idempotencyKey;
    this.userId = userId;
    this.amount = amount;
    this.currency = currency;
    this.status = status;
    this.createdAt = createdAt;
  }

  canTransitionTo(next: PaymentStatus): boolean {
    return ALLOWED_TRANSITIONS[this.status].includes(next);
  }

  transitionTo(next: PaymentStatus): Payment {
    if (!this.canTransitionTo(next)) {
      throw new InvalidStatusTransitionError(this.status, next);
    }
    return new Payment({
      id: this.id,
      idempotencyKey: this.idempotencyKey,
      userId: this.userId,
      amount: this.amount,
      currency: this.currency,
      status: next,
      createdAt: this.createdAt,
    });
  }
}
