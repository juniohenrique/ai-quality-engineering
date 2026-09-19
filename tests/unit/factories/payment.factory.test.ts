import { describe, expect, it } from "vitest";
import { PaymentFactory } from "../../factories/payment.factory.js";

describe("PaymentFactory", () => {
  it("creates deterministic payments with valid defaults", () => {
    expect(PaymentFactory.create()).toEqual(PaymentFactory.create());
    expect(PaymentFactory.create()).toEqual({
      id: "payment-1",
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
    });
  });

  it("allows overriding selected properties", () => {
    expect(
      PaymentFactory.create({
        id: "payment-2",
        amount: 250,
        status: "completed",
      }),
    ).toEqual({
      id: "payment-2",
      userId: "user-1",
      amount: 250,
      currency: "BRL",
      status: "completed",
    });
  });

  it("creates a deterministic batch with isolated IDs", () => {
    expect(PaymentFactory.createMany(3)).toEqual([
      PaymentFactory.create({ id: "payment-1" }),
      PaymentFactory.create({ id: "payment-2" }),
      PaymentFactory.create({ id: "payment-3" }),
    ]);
  });

  it.each([-1, 1.5])("rejects an invalid count: %s", (count) => {
    expect(() => PaymentFactory.createMany(count)).toThrow(
      "Payment count must be a non-negative integer",
    );
  });
});
