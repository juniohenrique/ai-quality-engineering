import type { ServerResponse } from "node:http";
import type { ListPaymentsQuery, PaymentService } from "../services/payment.service.js";
import type { CreatePaymentDTO } from "../dto/create-payment.dto.js";
import { writeErrorResponse } from "../http/error-response.js";
import type { AuthContext } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/authz.middleware.js";
import type { PaymentStatus } from "../domain/payment.js";
import { InvalidStatusTransitionError } from "../domain/payment.js";

const VALID_STATUSES: PaymentStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
  "refunded",
];

function isTransitionInput(input: unknown): input is { status: PaymentStatus } {
  if (typeof input !== "object" || input === null) return false;
  const c = input as Record<string, unknown>;
  return typeof c.status === "string" && (VALID_STATUSES as string[]).includes(c.status);
}

const VALID_PAYMENT_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "refunded",
] as const;

function parseListQuery(
  params: URLSearchParams,
): { ok: true; value: ListPaymentsQuery } | { ok: false; error: string } {
  const value: ListPaymentsQuery = {};

  const userId = params.get("userId");
  if (userId !== null && userId.trim().length > 0) {
    value.userId = userId.trim();
  }

  const status = params.get("status");
  if (status !== null) {
    if (!(VALID_PAYMENT_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: `Invalid status: ${status}` };
    }
    value.status = status as PaymentStatus;
  }

  for (const key of ["minAmount", "maxAmount"] as const) {
    const raw = params.get(key);
    if (raw !== null) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, error: `Invalid ${key}` };
      }
      value[key] = n;
    }
  }

  for (const key of ["from", "to"] as const) {
    const raw = params.get(key);
    if (raw !== null) {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, error: `Invalid ${key} date` };
      }
      value[key] = d;
    }
  }

  const limit = params.get("limit");
  if (limit !== null) {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return { ok: false, error: "Invalid limit (1-100)" };
    }
    value.limit = n;
  }

  const offset = params.get("offset");
  if (offset !== null) {
    const n = Number(offset);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: "Invalid offset" };
    }
    value.offset = n;
  }

  return { ok: true, value };
}

export class PaymentController {
  constructor(
    private readonly service: Pick<
      PaymentService,
      "createPayment" | "transitionStatus" | "listPayments"
    >,
  ) {}

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

  private authorize(context: AuthContext | null, response: ServerResponse): context is AuthContext {
    if (context === null) {
      writeErrorResponse(response, 401, "unauthorized", "Unauthorized");
      return false;
    }
    if (!requireRole(context, "admin")) {
      writeErrorResponse(response, 403, "forbidden", "Forbidden");
      return false;
    }
    return true;
  }

  private authenticate(
    context: AuthContext | null,
    response: ServerResponse,
  ): context is AuthContext {
    if (context === null) {
      writeErrorResponse(response, 401, "unauthorized", "Unauthorized");
      return false;
    }
    return true;
  }

  async handleCreate(
    context: AuthContext | null,
    input: unknown,
    response: ServerResponse,
  ): Promise<void> {
    if (!this.authorize(context, response)) return;
    if (!this.isCreatePaymentInput(input)) {
      writeErrorResponse(response, 400, "invalid_request", "Invalid payment request");
      return;
    }

    try {
      const payment = await this.service.createPayment(input);
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: payment.id, status: payment.status }));
    } catch (error) {
      writeErrorResponse(
        response,
        400,
        "invalid_request",
        error instanceof Error ? error.message : "Invalid request",
      );
    }
  }

  async handleTransitionStatus(
    context: AuthContext | null,
    id: string,
    input: unknown,
    response: ServerResponse,
  ): Promise<void> {
    if (!this.authorize(context, response)) return;

    if (!isTransitionInput(input)) {
      writeErrorResponse(response, 400, "invalid_request", "Invalid transition request");
      return;
    }

    try {
      const payment = await this.service.transitionStatus(id, input.status);
      if (!payment) {
        writeErrorResponse(response, 404, "not_found", "Payment not found");
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: payment.id,
          status: payment.status,
        }),
      );
    } catch (error) {
      if (error instanceof InvalidStatusTransitionError) {
        writeErrorResponse(response, 400, "invalid_transition", error.message);
        return;
      }
      writeErrorResponse(
        response,
        500,
        "internal_error",
        error instanceof Error ? error.message : "Unexpected error",
      );
    }
  }

  async handleList(
    context: AuthContext | null,
    query: URLSearchParams,
    response: ServerResponse,
  ): Promise<void> {
    if (!this.authenticate(context, response)) return;

    const parsed = parseListQuery(query);
    if (!parsed.ok) {
      writeErrorResponse(response, 400, "invalid_request", parsed.error);
      return;
    }

    const page = await this.service.listPayments(parsed.value, {
      userId: context.userId,
      role: context.role,
    });

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        items: page.items.map((p) => ({
          id: p.id,
          userId: p.userId,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
        })),
        total: page.total,
        limit: parsed.value.limit ?? 20,
        offset: parsed.value.offset ?? 0,
      }),
    );
  }
}
