export interface TransactionProperties {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed";
}

const defaultTransaction: TransactionProperties = {
  id: "transaction-1",
  paymentId: "payment-1",
  amount: 100,
  currency: "BRL",
  status: "pending",
};

export class TransactionFactory {
  /** Creates one deterministic transaction, optionally replacing defaults. */
  static create(overrides: Partial<TransactionProperties> = {}): TransactionProperties {
    return { ...defaultTransaction, ...overrides };
  }

  /** Creates deterministic transactions with distinct IDs for batch scenarios. */
  static createMany(
    count: number,
    overrides: Partial<TransactionProperties> = {},
  ): TransactionProperties[] {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Transaction count must be a non-negative integer");
    }

    return Array.from({ length: count }, (_, index) =>
      TransactionFactory.create({
        ...overrides,
        id: overrides.id ?? `transaction-${index + 1}`,
      }),
    );
  }
}
