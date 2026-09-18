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
});
