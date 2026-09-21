import { describe, expect, it, vi } from 'vitest';
import type { PaymentRepository } from '../../../src/repositories/payment.repository.js';
import { PaymentService } from '../../../src/services/payment.service.js';
import { Payment } from '../../../src/domain/payment.js';

function createRepository(): PaymentRepository {
  return {
    findById: vi.fn(),
    findByIdempotencyKey: vi.fn(),
    create: vi.fn(),
  };
}

describe('PaymentService', () => {
  it('creates a payment when idempotency key is unique', async () => {
    const repo = createRepository();
    vi.mocked(repo.findByIdempotencyKey).mockResolvedValue(undefined);
    vi.mocked(repo.create).mockResolvedValue(undefined);
    const service = new PaymentService(repo);

    const input = {
      idempotencyKey: '  key-123  ',
      userId: '  user-1  ',
      amount: 150,
      currency: '  USD  ',
      status: 'pending' as const,
    };

    const payment = await service.createPayment(input);

    expect(payment).toMatchObject({
      id: expect.any(String),
      idempotencyKey: 'key-123',
      userId: 'user-1',
      amount: 150,
      currency: 'USD',
      status: 'pending',
    });
    expect(repo.findByIdempotencyKey).toHaveBeenCalledWith('key-123');
    expect(repo.create).toHaveBeenCalledWith(payment);
  });

  it('rejects creation when idempotency key already exists', async () => {
    const repo = createRepository();
    const existing = new Payment({
      id: 'pay-1',
      idempotencyKey: 'key-dup',
      userId: 'user-1',
      amount: 100,
      currency: 'USD',
      status: 'pending',
      createdAt: new Date(),
    });
    vi.mocked(repo.findByIdempotencyKey).mockResolvedValue(existing);
    const service = new PaymentService(repo);

    await expect(
      service.createPayment({
        idempotencyKey: 'key-dup',
        userId: 'user-2',
        amount: 200,
        currency: 'EUR',
        status: 'completed' as const,
      }),
    ).rejects.toThrow('Payment with this idempotency key already exists');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('finds a payment by id via repository', async () => {
    const repo = createRepository();
    const payment = new Payment({
      id: 'pay-2',
      idempotencyKey: 'key-2',
      userId: 'user-2',
      amount: 250,
      currency: 'BRL',
      status: 'completed',
      createdAt: new Date(),
    });
    vi.mocked(repo.findById).mockResolvedValue(payment);
    const service = new PaymentService(repo);

    await expect(service.findPaymentById('pay-2')).resolves.toBe(payment);
    expect(repo.findById).toHaveBeenCalledWith('pay-2');
  });
});
