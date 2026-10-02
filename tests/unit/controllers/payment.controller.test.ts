import { describe, expect, it, vi } from "vitest";
import { PaymentController } from "../../../src/controllers/payment.controller.js";
import type { AuthContext } from "../../../src/middlewares/auth.middleware.js";
import type { Payment } from "../../../src/domain/payment.js";
import type { ServerResponse } from "node:http";

const adminCtx: AuthContext = {
  userId: "admin-1",
  role: "admin",
  jti: "test-jti-admin",
};

const userCtx: AuthContext = {
  userId: "user-1",
  role: "user",
  jti: "test-jti-user",
};

function createOutput() {
  let statusCode: number | undefined;
  let body = "";

  return {
    response: {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (responseBody: string) => {
        body = responseBody;
      },
    } as unknown as ServerResponse,
    getStatusCode: () => statusCode,
    getBody: () => body,
  };
}

function createPayment(id: string, overrides: Partial<Payment> = {}): Payment {
  return {
    id,
    userId: "user-1",
    amount: 100,
    currency: "USD",
    status: "pending",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  } as Payment;
}

describe("PaymentController", () => {
  describe("handleList", () => {
    it("returns 401 when context is null", async () => {
      const listPayments = vi.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(null, new URLSearchParams(), output.response);

      expect(output.getStatusCode()).toBe(401);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "unauthorized",
        message: "Unauthorized",
      });
      expect(listPayments).not.toHaveBeenCalled();
    });

    it("parses an empty query and calls service with requester", async () => {
      const listPayments = vi.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(adminCtx, new URLSearchParams(), output.response);

      expect(listPayments).toHaveBeenCalledWith({}, { userId: "admin-1", role: "admin" });
    });

    it("passes userId when admin supplies it", async () => {
      const listPayments = vi.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(adminCtx, new URLSearchParams("userId=u1"), output.response);

      expect(listPayments).toHaveBeenCalledWith(
        { userId: "u1" },
        { userId: "admin-1", role: "admin" },
      );
    });

    it("passes undefined userId when admin omits it", async () => {
      const listPayments = vi.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(adminCtx, new URLSearchParams(), output.response);

      expect(listPayments).toHaveBeenCalledWith({}, { userId: "admin-1", role: "admin" });
    });

    it("forces requester userId when role is user (anti-IDOR)", async () => {
      const listPayments = vi.fn().mockResolvedValue({ items: [], total: 0 });
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(userCtx, new URLSearchParams("userId=u2"), output.response);

      expect(listPayments).toHaveBeenCalledWith(
        { userId: "u2" },
        { userId: "user-1", role: "user" },
      );
    });

    it("returns 400 for invalid status (flying)", async () => {
      const listPayments = vi.fn();
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(adminCtx, new URLSearchParams("status=flying"), output.response);

      expect(output.getStatusCode()).toBe(400);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "invalid_request",
        message: "Invalid status: flying",
      });
      expect(listPayments).not.toHaveBeenCalled();
    });

    it("returns 400 for negative minAmount", async () => {
      const listPayments = vi.fn();
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(adminCtx, new URLSearchParams("minAmount=-10"), output.response);

      expect(output.getStatusCode()).toBe(400);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "invalid_request",
        message: "Invalid minAmount",
      });
      expect(listPayments).not.toHaveBeenCalled();
    });

    it("returns 400 for non-numeric maxAmount", async () => {
      const listPayments = vi.fn();
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(adminCtx, new URLSearchParams("maxAmount=abc"), output.response);

      expect(output.getStatusCode()).toBe(400);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "invalid_request",
        message: "Invalid maxAmount",
      });
      expect(listPayments).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid from date", async () => {
      const listPayments = vi.fn();
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(
        adminCtx,
        new URLSearchParams("from=not-a-date"),
        output.response,
      );

      expect(output.getStatusCode()).toBe(400);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "invalid_request",
        message: "Invalid from date",
      });
      expect(listPayments).not.toHaveBeenCalled();
    });

    it("returns 400 for limit > 100", async () => {
      const listPayments = vi.fn();
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(adminCtx, new URLSearchParams("limit=200"), output.response);

      expect(output.getStatusCode()).toBe(400);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "invalid_request",
        message: "Invalid limit (1-100)",
      });
      expect(listPayments).not.toHaveBeenCalled();
    });

    it("returns 400 for negative offset", async () => {
      const listPayments = vi.fn();
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(adminCtx, new URLSearchParams("offset=-5"), output.response);

      expect(output.getStatusCode()).toBe(400);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "invalid_request",
        message: "Invalid offset",
      });
      expect(listPayments).not.toHaveBeenCalled();
    });

    it("returns 200 with items, total, limit and offset", async () => {
      const listPayments = vi.fn().mockResolvedValue({
        items: [
          createPayment("pay-1"),
          createPayment("pay-2", { userId: "user-2", status: "completed" }),
        ],
        total: 2,
      });
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(
        adminCtx,
        new URLSearchParams("limit=10&offset=5"),
        output.response,
      );

      expect(output.getStatusCode()).toBe(200);
      const body = JSON.parse(output.getBody());
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(5);
    });

    it("returns 500 when service throws", async () => {
      const listPayments = vi.fn().mockRejectedValue(new Error("db down"));
      const controller = new PaymentController({
        createPayment: vi.fn(),
        transitionStatus: vi.fn(),
        listPayments,
      });
      const output = createOutput();

      await controller.handleList(adminCtx, new URLSearchParams(), output.response);

      expect(output.getStatusCode()).toBe(500);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "internal_error",
        message: "db down",
      });
    });
  });
});
