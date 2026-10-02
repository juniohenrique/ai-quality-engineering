import { describe, expect, it, vi } from "vitest";
import type { PaymentRepository } from "../../../src/repositories/payment.repository.js";
import { PaymentService, PAYMENT_EVENTS_QUEUE } from "../../../src/services/payment.service.js";
import { Payment, InvalidStatusTransitionError } from "../../../src/domain/payment.js";
import type { RabbitMqProducer } from "../../../src/queue/producer.js";

function createRepository(): PaymentRepository {
  return {
    findById: vi.fn(),
    findByIdempotencyKey: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    countByStatus: vi.fn(),
  };
}

describe("PaymentService", () => {
  it("creates a payment when idempotency key is unique", async () => {
    const repo = createRepository();
    vi.mocked(repo.findByIdempotencyKey).mockResolvedValue(undefined);
    vi.mocked(repo.create).mockResolvedValue(undefined);
    const service = new PaymentService(repo);

    const input = {
      idempotencyKey: "  key-123  ",
      userId: "  user-1  ",
      amount: 150,
      currency: "  USD  ",
      status: "pending" as const,
    };

    const payment = await service.createPayment(input);

    expect(payment).toMatchObject({
      id: expect.any(String),
      idempotencyKey: "key-123",
      userId: "user-1",
      amount: 150,
      currency: "USD",
      status: "pending",
    });
    expect(repo.findByIdempotencyKey).toHaveBeenCalledWith("key-123");
    expect(repo.create).toHaveBeenCalledWith(payment);
  });

  it("returns existing payment when idempotency key already exists", async () => {
    const repo = createRepository();
    const existing = new Payment({
      id: "pay-1",
      idempotencyKey: "key-dup",
      userId: "user-1",
      amount: 100,
      currency: "USD",
      status: "pending",
      createdAt: new Date(),
    });
    vi.mocked(repo.findByIdempotencyKey).mockResolvedValue(existing);
    const service = new PaymentService(repo);

    const result = await service.createPayment({
      idempotencyKey: "key-dup",
      userId: "user-2",
      amount: 200,
      currency: "EUR",
      status: "completed" as const,
    });

    expect(result).toBe(existing);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("returns existing payment when create throws a unique violation (race condition)", async () => {
    const repo = createRepository();
    const existing = new Payment({
      id: "pay-1",
      idempotencyKey: "key-race",
      userId: "user-1",
      amount: 100,
      currency: "USD",
      status: "pending",
      createdAt: new Date(),
    });

    // Layer 1 — no existing payment found (race: both requests pass this check)
    vi.mocked(repo.findByIdempotencyKey).mockResolvedValueOnce(undefined);
    // Repository throws a unique-violation error (SQLSTATE 23505)
    vi.mocked(repo.create).mockRejectedValueOnce({ code: "23505" });
    // Layer 2 — after catching the violation, the winning request's payment exists
    vi.mocked(repo.findByIdempotencyKey).mockResolvedValueOnce(existing);

    const service = new PaymentService(repo);

    const result = await service.createPayment({
      idempotencyKey: "key-race",
      userId: "user-2",
      amount: 200,
      currency: "EUR",
      status: "completed" as const,
    });

    expect(result).toBe(existing);
    // findByIdempotencyKey called twice: once before create, once in the catch
    expect(repo.findByIdempotencyKey).toHaveBeenCalledTimes(2);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it("re-throws when create fails with a non-unique error", async () => {
    const repo = createRepository();
    vi.mocked(repo.findByIdempotencyKey).mockResolvedValue(undefined);
    const dbError = new Error("connection refused");
    vi.mocked(repo.create).mockRejectedValue(dbError);

    const service = new PaymentService(repo);

    await expect(
      service.createPayment({
        idempotencyKey: "key-fail",
        userId: "user-1",
        amount: 100,
        currency: "BRL",
        status: "pending" as const,
      }),
    ).rejects.toThrow("connection refused");
  });

  it("finds a payment by id via repository", async () => {
    const repo = createRepository();
    const payment = new Payment({
      id: "pay-2",
      idempotencyKey: "key-2",
      userId: "user-2",
      amount: 250,
      currency: "BRL",
      status: "completed",
      createdAt: new Date(),
    });
    vi.mocked(repo.findById).mockResolvedValue(payment);
    const service = new PaymentService(repo);

    await expect(service.findPaymentById("pay-2")).resolves.toBe(payment);
    expect(repo.findById).toHaveBeenCalledWith("pay-2");
  });
});

describe("transitionStatus", () => {
  it("returns undefined when payment does not exist", async () => {
    const repo = createRepository();
    vi.mocked(repo.findById).mockResolvedValue(undefined);
    const service = new PaymentService(repo);

    const result = await service.transitionStatus("non-existent-id", "processing");

    expect(result).toBeUndefined();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("transitions pending → processing and persists", async () => {
    const repo = createRepository();
    const payment = new Payment({
      id: "pay-1",
      idempotencyKey: "key-1",
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
      createdAt: new Date(),
    });
    vi.mocked(repo.findById).mockResolvedValue(payment);
    vi.mocked(repo.update).mockResolvedValue(undefined);
    const service = new PaymentService(repo);

    const result = await service.transitionStatus("pay-1", "processing");

    expect(result).toBeDefined();
    expect(result!.id).toBe("pay-1");
    expect(result!.status).toBe("processing");
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pay-1", status: "processing" }),
    );
  });

  it("throws InvalidStatusTransitionError on invalid transition", async () => {
    const repo = createRepository();
    const payment = new Payment({
      id: "pay-1",
      idempotencyKey: "key-1",
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
      createdAt: new Date(),
    });
    vi.mocked(repo.findById).mockResolvedValue(payment);
    const service = new PaymentService(repo);

    await expect(service.transitionStatus("pay-1", "completed")).rejects.toThrow(
      InvalidStatusTransitionError,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("publishes payment-events on successful transition", async () => {
    const repo = createRepository();
    const payment = new Payment({
      id: "pay-1",
      idempotencyKey: "key-1",
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
      createdAt: new Date(),
    });
    vi.mocked(repo.findById).mockResolvedValue(payment);
    vi.mocked(repo.update).mockResolvedValue(undefined);

    const producer: Pick<RabbitMqProducer, "publish"> = {
      publish: vi.fn().mockResolvedValue("correlation-id-123"),
    };
    const service = new PaymentService(repo, producer as unknown as RabbitMqProducer);

    const result = await service.transitionStatus("pay-1", "processing", {
      correlationId: "correlation-id-123",
    });

    expect(result).toBeDefined();
    expect(result!.status).toBe("processing");
    expect(producer.publish).toHaveBeenCalledTimes(1);
    expect(producer.publish).toHaveBeenCalledWith(
      PAYMENT_EVENTS_QUEUE,
      expect.objectContaining({
        type: "payment.status-changed",
        paymentId: "pay-1",
        fromStatus: "pending",
        toStatus: "processing",
        correlationId: "correlation-id-123",
      }),
    );
  });

  it("does not publish when producer is undefined", async () => {
    const repo = createRepository();
    const payment = new Payment({
      id: "pay-1",
      idempotencyKey: "key-1",
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
      createdAt: new Date(),
    });
    vi.mocked(repo.findById).mockResolvedValue(payment);
    vi.mocked(repo.update).mockResolvedValue(undefined);
    const service = new PaymentService(repo);

    const result = await service.transitionStatus("pay-1", "processing");

    expect(result).toBeDefined();
    expect(result!.status).toBe("processing");
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pay-1", status: "processing" }),
    );
  });
});

describe("listPayments", () => {
  it("admin sees all — no userId filter applied", async () => {
    const repo = createRepository();
    vi.mocked(repo.findMany).mockResolvedValue({ items: [], total: 0 });
    const service = new PaymentService(repo);

    await service.listPayments({}, { userId: "admin-1", role: "admin" });

    expect(repo.findMany).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
    });
  });

  it("admin can filter by userId", async () => {
    const repo = createRepository();
    vi.mocked(repo.findMany).mockResolvedValue({ items: [], total: 0 });
    const service = new PaymentService(repo);

    await service.listPayments({ userId: "u1" }, { userId: "admin-1", role: "admin" });

    expect(repo.findMany).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      userId: "u1",
    });
  });

  it("user role forces own userId ignoring query", async () => {
    const repo = createRepository();
    vi.mocked(repo.findMany).mockResolvedValue({ items: [], total: 0 });
    const service = new PaymentService(repo);

    await service.listPayments({ userId: "u2" }, { userId: "u1", role: "user" });

    expect(repo.findMany).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      userId: "u1",
    });
  });

  it("applies default limit 20 and offset 0", async () => {
    const repo = createRepository();
    vi.mocked(repo.findMany).mockResolvedValue({ items: [], total: 0 });
    const service = new PaymentService(repo);

    await service.listPayments({}, { userId: "admin-1", role: "admin" });

    expect(repo.findMany).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
    });
  });

  it("caps limit at 100", async () => {
    const repo = createRepository();
    vi.mocked(repo.findMany).mockResolvedValue({ items: [], total: 0 });
    const service = new PaymentService(repo);

    await service.listPayments({ limit: 500 }, { userId: "admin-1", role: "admin" });

    expect(repo.findMany).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
    });
  });

  it("rejects negative offset via Math.max → 0", async () => {
    const repo = createRepository();
    vi.mocked(repo.findMany).mockResolvedValue({ items: [], total: 0 });
    const service = new PaymentService(repo);

    await service.listPayments({ offset: -5 }, { userId: "admin-1", role: "admin" });

    expect(repo.findMany).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
    });
  });
});

describe("getPaymentStats", () => {
  it("returns total as sum of all statuses", async () => {
    const repo = createRepository();
    vi.mocked(repo.countByStatus).mockResolvedValue({
      pending: 5,
      processing: 3,
      completed: 10,
      failed: 2,
      refunded: 1,
    });
    const service = new PaymentService(repo);

    const stats = await service.getPaymentStats();

    expect(stats).toEqual({
      total: 21,
      byStatus: {
        pending: 5,
        processing: 3,
        completed: 10,
        failed: 2,
        refunded: 1,
      },
    });
    expect(repo.countByStatus).toHaveBeenCalledOnce();
  });

  it("includes zero for statuses without payments", async () => {
    const repo = createRepository();
    vi.mocked(repo.countByStatus).mockResolvedValue({
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      refunded: 0,
    });
    const service = new PaymentService(repo);

    const stats = await service.getPaymentStats();

    expect(stats).toEqual({
      total: 0,
      byStatus: {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        refunded: 0,
      },
    });
  });
});
