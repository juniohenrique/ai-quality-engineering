import type { ServerResponse } from "node:http";
import type { PaymentService } from "../services/payment.service.js";
import type { CreatePaymentDTO } from "../dto/create-payment.dto.js";
import { writeErrorResponse } from "../http/error-response.js";

export class PaymentController {
  constructor(private readonly service: Pick<PaymentService, "createPayment">) {}

  private isValidCurrency(currency: string): boolean {
    const allowed = ["BRL", "USD", "EUR"];
    return allowed.includes(currency);
  }

  private isCreatePaymentInput(input: unknown): input is CreatePaymentDTO {
    if (typeof input !== "object" || input === null) return false;
    const candidate = input as Record<string, unknown>;
    if (
      typeof candidate.amount !== "number" ||
      candidate.amount <= 0 ||
      typeof candidate.currency !== "string" ||
      !this.isValidCurrency((candidate.currency as string).trim()) ||
      typeof candidate.idempotencyKey !== "string" ||
      (candidate.idempotencyKey as string).trim().length === 0 ||
      typeof candidate.userId !== "string" ||
      (candidate.userId as string).trim().length === 0 ||
      typeof candidate.status !== "string"
    ) {
      return false;
    }
    return true;
  }

  async handleCreate(input: unknown, response: ServerResponse): Promise<void> {
    if (!this.isCreatePaymentInput(input)) {
      writeErrorResponse(response, 400, "invalid_request", "Invalid payment request");
      return;
    }

    try {
      const payment = await this.service.createPayment(input);
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: payment.id, status: payment.status }));
    } catch (error) {
      const statusCode =
        error instanceof Error && error.message.includes("already exists") ? 409 : 400;
      writeErrorResponse(
        response,
        statusCode,
        statusCode === 409 ? "duplicate_payment" : "invalid_request",
        error instanceof Error ? error.message : "Invalid request",
      );
    }
  }
}
