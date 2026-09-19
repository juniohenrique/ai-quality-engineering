import { describe, expect, it } from "vitest";
import { TransactionFactory } from "../../factories/transaction.factory.js";

describe("TransactionFactory", () => {
  it("creates deterministic transactions with valid defaults", () => {
    expect(TransactionFactory.create()).toEqual(TransactionFactory.create());
    expect(TransactionFactory.create()).toEqual({
      id: "transaction-1",
      paymentId: "payment-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
    });
  });

  it("allows overriding selected properties", () => {
    expect(TransactionFactory.create({ amount: 500, status: "completed" })).toEqual({
      id: "transaction-1",
      paymentId: "payment-1",
      amount: 500,
      currency: "BRL",
      status: "completed",
    });
  });

  it("creates a deterministic batch with isolated IDs", () => {
    expect(TransactionFactory.createMany(3)).toEqual([
      TransactionFactory.create({ id: "transaction-1" }),
      TransactionFactory.create({ id: "transaction-2" }),
      TransactionFactory.create({ id: "transaction-3" }),
    ]);
  });

  it.each([-1, 1.5])("rejects an invalid count: %s", (count) => {
    expect(() => TransactionFactory.createMany(count)).toThrow(
      "Transaction count must be a non-negative integer",
    );
  });
});
